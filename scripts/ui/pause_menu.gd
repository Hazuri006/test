extends CanvasLayer
## PauseMenu -- scenes/ui/pause_menu.tscn, instanced by the world scene.
##
## Escape opens it, the tree pauses, the mouse is released. Offers Resume, Save,
## Settings, Mission list and Quit to menu. Also owns the death screen prompt.
##
## Scene requirements: CanvasLayer with this script and process_mode = ALWAYS
## (set in _ready so it keeps running while the tree is paused).

var _root: Control
var _menu_box: VBoxContainer
var _settings_panel: PanelContainer
var _settings: SettingsPanel
var _mission_panel: PanelContainer
var _mission_text: Label

func _ready() -> void:
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build()
	visible = false

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		get_viewport().set_input_as_handled()
		if visible:
			_resume()
		else:
			_open()
	elif event.is_action_pressed("quick_save") and not visible:
		SaveManager.save_game(SaveManager.current_slot, false)
	elif event.is_action_pressed("quick_load") and not visible:
		if SaveManager.queue_load(SaveManager.current_slot):
			SaveManager.apply_pending_save()
			Events.toast_requested.emit("Partie rechargee")
	elif event.is_action_pressed("toggle_map") and not visible:
		_toggle_missions()

func _build() -> void:
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_root)

	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.07, 0.72)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(dim)

	var column := VBoxContainer.new()
	column.set_anchors_preset(Control.PRESET_CENTER)
	column.position = Vector2(-160, -190)
	column.add_theme_constant_override("separation", 12)
	_root.add_child(column)

	var title := Label.new()
	title.text = "PAUSE"
	title.add_theme_font_size_override("font_size", 46)
	title.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.custom_minimum_size = Vector2(320, 0)
	column.add_child(title)

	_menu_box = VBoxContainer.new()
	_menu_box.add_theme_constant_override("separation", 10)
	column.add_child(_menu_box)

	_button("Reprendre", _resume)
	_button("Sauvegarder", func() -> void: SaveManager.save_game(SaveManager.current_slot, false))
	_button("Missions", _toggle_missions)
	_button("Parametres", _open_settings)
	_button("Menu principal", _quit_to_menu)

	_build_settings()
	_build_missions()

func _button(text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(320, 44)
	button.add_theme_font_size_override("font_size", 19)
	button.pressed.connect(func() -> void:
		AudioManager.play("ui_click")
		callback.call())
	_menu_box.add_child(button)
	return button

func _build_settings() -> void:
	_settings_panel = PanelContainer.new()
	_settings_panel.set_anchors_preset(Control.PRESET_CENTER)
	_settings_panel.position = Vector2(-300, -260)
	_settings_panel.custom_minimum_size = Vector2(600, 0)
	_settings_panel.visible = false
	_root.add_child(_settings_panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 20)
	margin.add_theme_constant_override("margin_bottom", 20)
	_settings_panel.add_child(margin)

	_settings = SettingsPanel.new()
	margin.add_child(_settings)
	_settings.build()
	_settings.closed.connect(func() -> void:
		_settings_panel.visible = false
		_menu_box.get_parent().visible = true)

func _build_missions() -> void:
	_mission_panel = PanelContainer.new()
	_mission_panel.set_anchors_preset(Control.PRESET_CENTER)
	_mission_panel.position = Vector2(-320, -220)
	_mission_panel.custom_minimum_size = Vector2(640, 0)
	_mission_panel.visible = false
	_root.add_child(_mission_panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	_mission_panel.add_child(column)

	var title := Label.new()
	title.text = "JOURNAL DES MISSIONS"
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	column.add_child(title)

	_mission_text = Label.new()
	_mission_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_mission_text.custom_minimum_size = Vector2(600, 260)
	_mission_text.add_theme_font_size_override("font_size", 15)
	column.add_child(_mission_text)

	var close := Button.new()
	close.text = "Fermer"
	close.custom_minimum_size = Vector2(200, 40)
	close.pressed.connect(func() -> void:
		AudioManager.play("ui_back")
		_mission_panel.visible = false
		if not visible:
			return
		_menu_box.get_parent().visible = true)
	column.add_child(close)

func _refresh_missions() -> void:
	var lines: Array[String] = []
	for id in MissionManager.missions.keys():
		var mission: Mission = MissionManager.missions[id]
		if mission.is_side_activity and mission.state == Mission.State.NOT_STARTED:
			continue
		var status := "A FAIRE"
		match mission.state:
			Mission.State.ACTIVE: status = "EN COURS"
			Mission.State.COMPLETED: status = "TERMINEE"
			Mission.State.FAILED: status = "ECHOUEE"
		var line := "[%s] %s" % [status, mission.title]
		if mission.state == Mission.State.ACTIVE:
			line += "\n    -> %s" % mission.progress_text()
		lines.append(line)
	if lines.is_empty():
		lines.append("Aucune mission enregistree.")
	lines.append("")
	lines.append("Score total : %d pts" % GameState.score)
	lines.append("Recompenses : %d pts" % MissionManager.rewards_total)
	_mission_text.text = "\n".join(lines)

# =============================================================================
#  ACTIONS
# =============================================================================

func _open() -> void:
	if GameState.in_cutscene:
		return
	visible = true
	_menu_box.get_parent().visible = true
	_settings_panel.visible = false
	_mission_panel.visible = false
	GameState.set_paused(true)
	AudioManager.play("ui_click", 0.8)

func _resume() -> void:
	visible = false
	GameState.set_paused(false)

func _open_settings() -> void:
	_settings_panel.visible = true
	_menu_box.get_parent().visible = false

func _toggle_missions() -> void:
	_refresh_missions()
	if not visible:
		# Opened straight from gameplay with M: show just the journal.
		visible = true
		_menu_box.get_parent().visible = false
		GameState.set_paused(true)
	_mission_panel.visible = not _mission_panel.visible
	if not _mission_panel.visible:
		_resume()

func _quit_to_menu() -> void:
	SaveManager.save_game(SaveManager.current_slot, true)
	SaveManager.set_autosave(false)
	GameState.set_paused(false)
	get_tree().paused = false
	Engine.time_scale = 1.0
	AudioManager.stop_music()
	MissionManager.reset_session()
	ObjectPool.clear_all()
	GameState.world = null
	GameState.player = null
	GameState.city = null
	Transition.change_scene("res://scenes/ui/main_menu.tscn", "Retour au menu...")
