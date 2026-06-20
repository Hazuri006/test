extends Node
## The spine of THE LAST WARD. Owns the high-level game state, the player's global
## inventory, persistent world state / flags / evidence / choices, and drives all
## scene transitions (menu <-> level <-> pause <-> death <-> ending). Registered as
## the `GameManager` autoload and bound to the Main scene via bind_main().

signal state_changed(new_state: int)
signal flag_changed(key: String, value: Variant)
signal evidence_added(evidence_id: String)
signal level_loaded(level_id: String)
signal player_spawned(player: Node)
signal toast_requested(text: String)
signal subtitle_requested(text: String, duration: float)
signal objective_banner_requested(text: String)

const PLAYER_SCENE: String = "res://scenes/player/Player.tscn"
const LEVEL_SCENES: Dictionary = {
	"exterior": "res://scenes/levels/HospitalExterior.tscn",
	"interior": "res://scenes/levels/HospitalInterior.tscn",
	"basement": "res://scenes/levels/HospitalBasement.tscn",
	"lower": "res://scenes/levels/LowerWard.tscn",
	"lab": "res://scenes/levels/FinalLaboratory.tscn",
}
const UI_MAIN_MENU: String = "res://scenes/menus/MainMenu.tscn"
const UI_PAUSE: String = "res://scenes/UI/PauseMenu.tscn"
const UI_HUD: String = "res://scenes/UI/HUD.tscn"
const UI_DEATH: String = "res://scenes/UI/DeathScreen.tscn"
const UI_ENDING: String = "res://scenes/UI/EndingScreen.tscn"

## Evidence required to unlock the Containment (Ending C) procedure.
const REQUIRED_EVIDENCE: PackedStringArray = [
	"voss_journal", "experiment_log", "lena_final", "ritual_notes", "patient_intake",
]

var state: int = GameTypes.GameState.BOOT
var inventory: Inventory = Inventory.new()

var current_level_id: String = ""
var checkpoint_level_id: String = "exterior"
var checkpoint_spawn_id: String = "start"

## Generic boolean/typed world flags (story beats, power on, etc.).
var world_flags: Dictionary = {}
## Per-object persistent state keyed by a unique id (doors, pickups, puzzles).
var world_state: Dictionary = {}
## Evidence ids the player has gathered (drives endings).
var collected_evidence: Array[String] = []
## Recorded player decisions.
var player_choices: Dictionary = {}
## Documents and audio logs the player has unlocked (for the journal/reader).
var unlocked_documents: Array[String] = []
var unlocked_audio_logs: Array[String] = []

var difficulty_config: DifficultyConfig
var chosen_ending: int = GameTypes.Ending.NONE

# Bound from Main.tscn.
var _world_host: Node3D
var _menu_layer: CanvasLayer
var _hud_layer: CanvasLayer
var _fade: ColorRect

var _current_level: Node3D
var _player: Node3D
var _hud: Control
var _active_menu: Control
var _saved_player_state: Dictionary = {}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	difficulty_config = _load_difficulty(GameTypes.Difficulty.NORMAL)

# --- Main scene binding ------------------------------------------------------

## Called by Main.gd once the bootstrap scene is ready.
func bind_main(world_host: Node3D, menu_layer: CanvasLayer, hud_layer: CanvasLayer, fade: ColorRect) -> void:
	_world_host = world_host
	_menu_layer = menu_layer
	_hud_layer = hud_layer
	_fade = fade
	SettingsManager.apply_all()
	goto_main_menu()

func get_player() -> Node3D:
	return _player

func get_current_level() -> Node3D:
	return _current_level

func is_playing() -> bool:
	return state == GameTypes.GameState.PLAYING

# --- State -------------------------------------------------------------------

func _set_state(new_state: int) -> void:
	state = new_state
	state_changed.emit(new_state)

# --- Flags / world state / evidence -----------------------------------------

func set_flag(key: String, value: Variant) -> void:
	world_flags[key] = value
	flag_changed.emit(key, value)

func get_flag(key: String, fallback: Variant = false) -> Variant:
	return world_flags.get(key, fallback)

func get_flag_bool(key: String) -> bool:
	return bool(world_flags.get(key, false))

func set_object_state(object_id: String, value: Variant) -> void:
	if object_id == "":
		return
	world_state[object_id] = value

func get_object_state(object_id: String, fallback: Variant = null) -> Variant:
	return world_state.get(object_id, fallback)

func add_evidence(evidence_id: String) -> void:
	if evidence_id == "" or collected_evidence.has(evidence_id):
		return
	collected_evidence.append(evidence_id)
	evidence_added.emit(evidence_id)
	toast_requested.emit("Evidence recorded")

func has_evidence(evidence_id: String) -> bool:
	return collected_evidence.has(evidence_id)

func can_contain() -> bool:
	for required: String in REQUIRED_EVIDENCE:
		if not collected_evidence.has(required):
			return false
	return true

func record_choice(key: String, value: Variant) -> void:
	player_choices[key] = value

func unlock_document(doc_id: String) -> void:
	if doc_id != "" and not unlocked_documents.has(doc_id):
		unlocked_documents.append(doc_id)

func unlock_audio_log(log_id: String) -> void:
	if log_id != "" and not unlocked_audio_logs.has(log_id):
		unlocked_audio_logs.append(log_id)

# --- New game / flow ---------------------------------------------------------

func new_game(difficulty: int) -> void:
	_reset_run_state()
	difficulty_config = _load_difficulty(difficulty)
	SettingsManager.set_value("gameplay", "difficulty", difficulty)
	QuestManager.reset()
	EventManager.reset()
	QuestManager.start_quest(QuestDatabase.first_quest_id())
	checkpoint_level_id = "exterior"
	checkpoint_spawn_id = "start"
	_close_menu()
	await load_level("exterior", "start")
	# Starting kit.
	inventory.add_item("flashlight", 1)
	if difficulty == GameTypes.Difficulty.STORY:
		inventory.add_item("flashlight_battery", 2)

func _reset_run_state() -> void:
	inventory.clear()
	world_flags.clear()
	world_state.clear()
	collected_evidence.clear()
	player_choices.clear()
	unlocked_documents.clear()
	unlocked_audio_logs.clear()
	chosen_ending = GameTypes.Ending.NONE
	_saved_player_state.clear()

func goto_main_menu() -> void:
	_set_state(GameTypes.GameState.MAIN_MENU)
	get_tree().paused = false
	_clear_world()
	_destroy_hud()
	set_mouse_captured(false)
	AudioManager.stop_ambience()
	AudioManager.play_music("drone", -14.0)
	_open_menu(UI_MAIN_MENU)

# --- Level loading -----------------------------------------------------------

func load_level(level_id: String, spawn_id: String) -> void:
	if not LEVEL_SCENES.has(level_id):
		GameLog.error("load_level: unknown level '%s'" % level_id)
		return
	var path: String = str(LEVEL_SCENES[level_id])
	if not ResourceLoader.exists(path):
		GameLog.error("load_level: missing scene '%s'" % path)
		return
	_set_state(GameTypes.GameState.LOADING)
	await _do_fade(1.0, 0.35)

	# Persist the outgoing player's state before tearing the level down.
	if _player != null and _player.has_method("get_state"):
		_saved_player_state = _player.call("get_state")
	_clear_world()

	var packed: PackedScene = ResourceLoader.load(path) as PackedScene
	var level: Node = packed.instantiate()
	_world_host.add_child(level)
	_current_level = level as Node3D
	current_level_id = level_id

	_spawn_player(level, spawn_id)
	_ensure_hud()
	if level.has_method("on_level_ready"):
		level.call("on_level_ready", spawn_id)

	_set_state(GameTypes.GameState.PLAYING)
	set_mouse_captured(true)
	level_loaded.emit(level_id)
	await _do_fade(0.0, 0.5)

func _spawn_player(level: Node, spawn_id: String) -> void:
	if not ResourceLoader.exists(PLAYER_SCENE):
		GameLog.error("Player scene missing: %s" % PLAYER_SCENE)
		return
	var packed: PackedScene = ResourceLoader.load(PLAYER_SCENE) as PackedScene
	var player: Node3D = packed.instantiate() as Node3D
	level.add_child(player)
	var spawn_xf: Transform3D = Transform3D.IDENTITY
	if level.has_method("get_spawn"):
		spawn_xf = level.call("get_spawn", spawn_id)
	player.global_transform = spawn_xf
	_player = player
	if not _saved_player_state.is_empty() and player.has_method("set_state"):
		player.call("set_state", _saved_player_state)
	player_spawned.emit(player)

func _clear_world() -> void:
	if is_instance_valid(_player):
		_player.queue_free()
	_player = null
	if is_instance_valid(_current_level):
		_current_level.queue_free()
	_current_level = null

# --- HUD / menu management ---------------------------------------------------

func _ensure_hud() -> void:
	if is_instance_valid(_hud):
		return
	if not ResourceLoader.exists(UI_HUD):
		return
	var packed: PackedScene = ResourceLoader.load(UI_HUD) as PackedScene
	_hud = packed.instantiate() as Control
	_hud_layer.add_child(_hud)

func _destroy_hud() -> void:
	if is_instance_valid(_hud):
		_hud.queue_free()
	_hud = null

func _open_menu(path: String) -> Control:
	_close_menu()
	if not ResourceLoader.exists(path):
		GameLog.error("Menu scene missing: %s" % path)
		return null
	var packed: PackedScene = ResourceLoader.load(path) as PackedScene
	var menu: Control = packed.instantiate() as Control
	_menu_layer.add_child(menu)
	_active_menu = menu
	return menu

func _close_menu() -> void:
	if is_instance_valid(_active_menu):
		_active_menu.queue_free()
	_active_menu = null

# --- Pause -------------------------------------------------------------------

func toggle_pause() -> void:
	if state == GameTypes.GameState.PLAYING:
		pause_game()
	elif state == GameTypes.GameState.PAUSED:
		resume_game()

func pause_game() -> void:
	if state != GameTypes.GameState.PLAYING:
		return
	_set_state(GameTypes.GameState.PAUSED)
	get_tree().paused = true
	set_mouse_captured(false)
	_open_menu(UI_PAUSE)

func resume_game() -> void:
	if state != GameTypes.GameState.PAUSED:
		return
	_close_menu()
	get_tree().paused = false
	_set_state(GameTypes.GameState.PLAYING)
	set_mouse_captured(true)

# --- Death / checkpoint ------------------------------------------------------

func set_checkpoint(level_id: String, spawn_id: String) -> void:
	checkpoint_level_id = level_id
	checkpoint_spawn_id = spawn_id
	SaveManager.autosave()
	toast_requested.emit("Checkpoint reached")

func player_died(cause: String = "") -> void:
	if state == GameTypes.GameState.DEAD:
		return
	_set_state(GameTypes.GameState.DEAD)
	set_mouse_captured(false)
	AudioManager.play_2d("sting", -3.0)
	var menu: Control = _open_menu(UI_DEATH)
	if menu != null and menu.has_method("set_cause"):
		menu.call("set_cause", cause)

func respawn_at_checkpoint() -> void:
	_close_menu()
	_saved_player_state.clear()
	get_tree().paused = false
	await load_level(checkpoint_level_id, checkpoint_spawn_id)

# --- Endings -----------------------------------------------------------------

## Resolves the final choice into an ending and shows the ending screen.
func resolve_ending(choice: String) -> void:
	record_choice("final_choice", choice)
	match choice:
		"destroy": chosen_ending = GameTypes.Ending.RELEASE
		"activate": chosen_ending = GameTypes.Ending.REUNION
		"contain": chosen_ending = GameTypes.Ending.CONTAINMENT
		_: chosen_ending = GameTypes.Ending.RELEASE
	trigger_ending(chosen_ending)

func trigger_ending(ending: int) -> void:
	chosen_ending = ending
	_set_state(GameTypes.GameState.ENDING)
	get_tree().paused = false
	set_mouse_captured(false)
	var menu: Control = _open_menu(UI_ENDING)
	if menu != null and menu.has_method("show_ending"):
		menu.call("show_ending", ending)

# --- Utility -----------------------------------------------------------------

func set_mouse_captured(captured: bool) -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if captured else Input.MOUSE_MODE_VISIBLE

func notify(text: String) -> void:
	toast_requested.emit(text)

func show_subtitle(text: String, duration: float = 4.0) -> void:
	subtitle_requested.emit(text, duration)

func show_objective_banner(text: String) -> void:
	objective_banner_requested.emit(text)

func _load_difficulty(difficulty: int) -> DifficultyConfig:
	var ids: Array[String] = ["story", "normal", "hard", "nightmare"]
	var id: String = ids[clampi(difficulty, 0, 3)]
	var path: String = "res://data/difficulty/%s.tres" % id
	if ResourceLoader.exists(path):
		var res: Resource = ResourceLoader.load(path)
		if res is DifficultyConfig:
			return res as DifficultyConfig
	# Code fallback so the game runs even before the .tres files exist.
	var cfg: DifficultyConfig = DifficultyConfig.new()
	cfg.id = id
	cfg.display_name = GameTypes.difficulty_name(difficulty)
	match difficulty:
		GameTypes.Difficulty.STORY:
			cfg.monster_aggression_mult = 0.7
			cfg.detection_speed_mult = 0.7
			cfg.player_damage_mult = 0.5
			cfg.starting_battery = 1.0
		GameTypes.Difficulty.HARD:
			cfg.monster_aggression_mult = 1.25
			cfg.detection_speed_mult = 1.2
			cfg.battery_drain_mult = 1.25
		GameTypes.Difficulty.NIGHTMARE:
			cfg.monster_aggression_mult = 1.6
			cfg.detection_speed_mult = 1.45
			cfg.battery_drain_mult = 1.5
			cfg.show_detection_indicator = false
			cfg.show_objective_hints = false
	return cfg

func _do_fade(target_alpha: float, duration: float) -> void:
	if not is_instance_valid(_fade):
		return
	_fade.visible = true
	var tween: Tween = create_tween()
	tween.tween_property(_fade, "color:a", target_alpha, duration)
	await tween.finished
	_fade.visible = target_alpha > 0.01

# --- Serialisation (used by SaveManager) ------------------------------------

func collect_save_data() -> Dictionary:
	var player_state: Dictionary = _saved_player_state
	if _player != null and _player.has_method("get_state"):
		player_state = _player.call("get_state")
	return {
		"level": current_level_id,
		"checkpoint_level": checkpoint_level_id,
		"checkpoint_spawn": checkpoint_spawn_id,
		"player_state": player_state,
		"flags": world_flags.duplicate(true),
		"world_state": world_state.duplicate(true),
		"evidence": collected_evidence.duplicate(),
		"choices": player_choices.duplicate(true),
		"documents": unlocked_documents.duplicate(),
		"audio_logs": unlocked_audio_logs.duplicate(),
		"inventory": inventory.to_dict(),
		"difficulty": SettingsManager.difficulty(),
		"ending": chosen_ending,
	}

func apply_save_data(data: Dictionary) -> void:
	_reset_run_state()
	current_level_id = str(data.get("level", "exterior"))
	checkpoint_level_id = str(data.get("checkpoint_level", current_level_id))
	checkpoint_spawn_id = str(data.get("checkpoint_spawn", "start"))
	difficulty_config = _load_difficulty(int(data.get("difficulty", GameTypes.Difficulty.NORMAL)))
	chosen_ending = int(data.get("ending", GameTypes.Ending.NONE))

	var flags_raw: Variant = data.get("flags", {})
	if flags_raw is Dictionary:
		world_flags = (flags_raw as Dictionary).duplicate(true)
	var ws_raw: Variant = data.get("world_state", {})
	if ws_raw is Dictionary:
		world_state = (ws_raw as Dictionary).duplicate(true)
	var ev_raw: Variant = data.get("evidence", [])
	if ev_raw is Array:
		collected_evidence.clear()
		for e: Variant in (ev_raw as Array):
			collected_evidence.append(str(e))
	var ch_raw: Variant = data.get("choices", {})
	if ch_raw is Dictionary:
		player_choices = (ch_raw as Dictionary).duplicate(true)
	var docs_raw: Variant = data.get("documents", [])
	if docs_raw is Array:
		for d: Variant in (docs_raw as Array):
			unlocked_documents.append(str(d))
	var logs_raw: Variant = data.get("audio_logs", [])
	if logs_raw is Array:
		for l: Variant in (logs_raw as Array):
			unlocked_audio_logs.append(str(l))
	var inv_raw: Variant = data.get("inventory", {})
	if inv_raw is Dictionary:
		inventory.from_dict(inv_raw as Dictionary)
	var ps_raw: Variant = data.get("player_state", {})
	if ps_raw is Dictionary:
		_saved_player_state = (ps_raw as Dictionary).duplicate(true)

## Loads a saved game and resumes play at the saved level.
func load_and_resume(data: Dictionary) -> void:
	apply_save_data(data)
	_close_menu()
	await load_level(current_level_id, checkpoint_spawn_id)
