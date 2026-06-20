extends Node
## Bootstrap root (run_main_scene). Builds the persistent layer structure in code
## — world host, HUD/menu/debug/transition CanvasLayers and the fade rect — then
## hands references to GameManager which drives everything else. Also owns the few
## truly global inputs (pause toggle, debug overlay) so they work in any state.

const DEBUG_OVERLAY_SCENE: String = "res://scenes/UI/DebugOverlay.tscn"

var _world_host: Node3D
var _hud_layer: CanvasLayer
var _menu_layer: CanvasLayer
var _debug_layer: CanvasLayer
var _fade: ColorRect
var _loading_label: Label
var _debug_overlay: Control
var _debug_console: Control

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

	_world_host = Node3D.new()
	_world_host.name = "WorldHost"
	add_child(_world_host)

	_hud_layer = CanvasLayer.new()
	_hud_layer.name = "HUDLayer"
	_hud_layer.layer = 2
	add_child(_hud_layer)

	_menu_layer = CanvasLayer.new()
	_menu_layer.name = "MenuLayer"
	_menu_layer.layer = 5
	add_child(_menu_layer)

	_debug_layer = CanvasLayer.new()
	_debug_layer.name = "DebugLayer"
	_debug_layer.layer = 8
	add_child(_debug_layer)

	var transition_layer: CanvasLayer = CanvasLayer.new()
	transition_layer.name = "TransitionLayer"
	transition_layer.layer = 12
	add_child(transition_layer)

	_fade = ColorRect.new()
	_fade.name = "Fade"
	_fade.color = Color(0, 0, 0, 0)
	_fade.anchor_right = 1.0
	_fade.anchor_bottom = 1.0
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.visible = false
	transition_layer.add_child(_fade)

	# Minimal loading indicator, shown only while a level is streaming in.
	_loading_label = Label.new()
	_loading_label.text = "ENTERING…"
	_loading_label.add_theme_font_size_override("font_size", 28)
	_loading_label.add_theme_color_override("font_color", Color(0.74, 0.62, 0.36))
	_loading_label.set_anchors_preset(Control.PRESET_CENTER)
	_loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading_label.visible = false
	transition_layer.add_child(_loading_label)
	GameManager.state_changed.connect(_on_game_state_changed)

	_setup_debug_overlay()
	_setup_debug_console()
	GameManager.bind_main(_world_host, _menu_layer, _hud_layer, _fade)
	_maybe_run_test_hooks()

## Headless QA hooks (used only when launched with --test-* flags). They drive the
## game without a GUI so the load path can be validated. No effect in normal play.
func _maybe_run_test_hooks() -> void:
	var args: PackedStringArray = OS.get_cmdline_args()
	if args.has("--test-newgame"):
		await get_tree().process_frame
		GameManager.new_game(GameTypes.Difficulty.NORMAL)
	elif args.has("--test-flow"):
		await get_tree().process_frame
		_run_flow_test()
	elif args.has("--test-save"):
		await get_tree().process_frame
		_run_save_test()
	elif args.has("--test-monster"):
		await get_tree().process_frame
		_run_monster_test()
	else:
		for arg: String in args:
			if arg.begins_with("--test-level="):
				await get_tree().process_frame
				_load_level_test(arg.split("=")[1])
				break

## Verifies the save/load round-trip preserves quest, inventory and world state.
func _run_save_test() -> void:
	GameManager.new_game(GameTypes.Difficulty.NORMAL)
	await get_tree().create_timer(1.2).timeout
	GameManager.inventory.add_item("generator_fuse_a", 1)
	GameManager.inventory.add_item("security_access_seal", 2)
	QuestManager.complete_step("q1_enter", "cross_forest")
	GameManager.set_flag("power_on", true)
	GameManager.add_evidence("voss_journal")
	var saved: bool = SaveManager.save_game(1)
	GameLog.info("SAVE TEST: save_game(1) = %s" % str(saved))
	# Mutate state, then load to confirm it is restored.
	GameManager.inventory.add_item("generator_fuse_b", 1)
	QuestManager.reset()
	await SaveManager.load_game(1)
	await get_tree().create_timer(1.0).timeout
	var ok_inv: bool = GameManager.inventory.get_count("security_access_seal") == 2 and GameManager.inventory.get_count("generator_fuse_b") == 0
	var ok_quest: bool = QuestManager.is_step_complete("q1_enter", "cross_forest")
	var ok_flag: bool = GameManager.get_flag_bool("power_on")
	var ok_ev: bool = GameManager.has_evidence("voss_journal")
	GameLog.info("SAVE TEST RESULT: inventory=%s quest=%s flag=%s evidence=%s level=%s" % [str(ok_inv), str(ok_quest), str(ok_flag), str(ok_ev), GameManager.current_level_id])

## Confirms the monster actually navigates: measures how far it moves while active.
func _run_monster_test() -> void:
	GameManager.new_game(GameTypes.Difficulty.NORMAL)
	await get_tree().create_timer(1.2).timeout
	GameManager.set_flag("power_on", true)
	GameManager.set_flag("lockdown_cleared", true)
	GameManager.set_flag("ritual_solved", true)
	await GameManager.load_level("lower", "start")
	await get_tree().create_timer(2.0).timeout
	var monsters: Array[Node] = get_tree().get_nodes_in_group("monster")
	if monsters.is_empty():
		GameLog.info("MONSTER TEST: no monster spawned!")
		return
	var m: Node3D = monsters[0] as Node3D
	var p0: Vector3 = m.global_position
	await get_tree().create_timer(3.0).timeout
	var p1: Vector3 = m.global_position
	GameLog.info("MONSTER TEST: moved %.2f m over 3s — %s" % [p0.distance_to(p1), str(m.call("get_debug_summary"))])

## Loads a named level in isolation (sets common gating flags) to validate it builds.
func _load_level_test(level_id: String) -> void:
	GameManager.new_game(GameTypes.Difficulty.NORMAL)
	await get_tree().create_timer(1.2).timeout
	GameManager.set_flag("power_on", true)
	GameManager.set_flag("lockdown_cleared", true)
	GameManager.set_flag("ritual_solved", true)
	await GameManager.load_level(level_id, "start")
	GameLog.info("LEVEL TEST '%s' loaded." % level_id)

## Auto-completes every main-quest step in order to prove the quest chain and level
## transitions are wired correctly, then quits.
func _run_flow_test() -> void:
	GameManager.new_game(GameTypes.Difficulty.NORMAL)
	await get_tree().create_timer(1.0).timeout
	for quest_id: String in QuestDatabase.ordered_ids():
		var quest: QuestData = QuestDatabase.get_quest(quest_id)
		for step: QuestStepData in quest.steps:
			QuestManager.complete_step(quest_id, step.id)
			await get_tree().process_frame
	GameLog.info("FLOW TEST complete. Active quest: %s  Endings reachable via resolve_ending()." % QuestManager.active_quest_id)
	GameManager.resolve_ending("contain")
	await get_tree().create_timer(0.5).timeout
	GameLog.info("FLOW TEST ending: %s" % GameTypes.ending_name(GameManager.chosen_ending))

func _on_game_state_changed(new_state: int) -> void:
	if is_instance_valid(_loading_label):
		_loading_label.visible = new_state == GameTypes.GameState.LOADING

func _setup_debug_overlay() -> void:
	if not ResourceLoader.exists(DEBUG_OVERLAY_SCENE):
		return
	var packed: PackedScene = ResourceLoader.load(DEBUG_OVERLAY_SCENE) as PackedScene
	_debug_overlay = packed.instantiate() as Control
	_debug_overlay.visible = false
	_debug_layer.add_child(_debug_overlay)

func _setup_debug_console() -> void:
	if not OS.is_debug_build():
		return
	var console_script: GDScript = load("res://scripts/ui/debug_console.gd") as GDScript
	_debug_console = console_script.new() as Control
	_debug_layer.add_child(_debug_console)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if GameManager.state == GameTypes.GameState.PLAYING or GameManager.state == GameTypes.GameState.PAUSED:
			GameManager.toggle_pause()
			get_viewport().set_input_as_handled()
	elif event.is_action_pressed("debug_overlay"):
		if is_instance_valid(_debug_overlay):
			_debug_overlay.visible = not _debug_overlay.visible
			GameLog.debug_enabled = _debug_overlay.visible
	elif event.is_action_pressed("debug_ai"):
		_toggle_ai_debug()
	elif event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_F2:
		if is_instance_valid(_debug_console):
			_debug_console.call("toggle")

func _toggle_ai_debug() -> void:
	var monsters: Array[Node] = get_tree().get_nodes_in_group("monster")
	for m: Node in monsters:
		if m.has_method("toggle_debug"):
			m.call("toggle_debug")
