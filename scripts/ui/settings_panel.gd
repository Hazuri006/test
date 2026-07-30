class_name SettingsPanel
extends VBoxContainer
## SettingsPanel -- shared options UI for the main menu and the pause menu.
##
## Reads and writes GameState.settings and persists through SaveManager, so the
## same panel works in both places and the values survive a restart.
##
## Options: mouse sensitivity, invert Y, master/music/SFX volume, graphics
## quality preset, day-night cycle, minimap, camera shake.

signal closed

var _quality_button: OptionButton

func build() -> void:
	add_theme_constant_override("separation", 10)

	var title := Label.new()
	title.text = "PARAMETRES"
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	add_child(title)

	_slider("Sensibilite souris", "mouse_sensitivity", 0.0005, 0.010, 0.0001)
	_check("Inverser l'axe vertical", "invert_y")
	_slider("Volume general", "master_volume", 0.0, 1.0, 0.01)
	_slider("Volume musique", "music_volume", 0.0, 1.0, 0.01)
	_slider("Volume effets", "sfx_volume", 0.0, 1.0, 0.01)
	_slider("Tremblement camera", "camera_shake", 0.0, 1.5, 0.05)
	_quality()
	_check("Cycle jour / nuit", "day_night_enabled")
	_check("Afficher la mini-carte", "show_minimap")

	var close := Button.new()
	close.text = "Retour"
	close.custom_minimum_size = Vector2(200, 40)
	close.pressed.connect(func() -> void:
		AudioManager.play("ui_back")
		SaveManager.save_settings()
		closed.emit())
	add_child(close)

func _row(label_text: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var label := Label.new()
	label.text = label_text
	label.custom_minimum_size = Vector2(230, 0)
	label.add_theme_font_size_override("font_size", 15)
	row.add_child(label)
	add_child(row)
	return row

func _slider(label_text: String, key: String, min_value: float, max_value: float,
		step: float) -> void:
	var row := _row(label_text)
	var slider := HSlider.new()
	slider.min_value = min_value
	slider.max_value = max_value
	slider.step = step
	slider.value = float(GameState.get_setting(key))
	slider.custom_minimum_size = Vector2(260, 24)
	var value_label := Label.new()
	value_label.custom_minimum_size = Vector2(60, 0)
	value_label.text = _format(key, slider.value)
	slider.value_changed.connect(func(v: float) -> void:
		GameState.set_setting(key, v)
		value_label.text = _format(key, v))
	row.add_child(slider)
	row.add_child(value_label)

func _format(key: String, value: float) -> String:
	if key == "mouse_sensitivity":
		return "%.4f" % value
	return "%d%%" % roundi(value * 100.0)

func _check(label_text: String, key: String) -> void:
	var row := _row(label_text)
	var check := CheckBox.new()
	check.button_pressed = bool(GameState.get_setting(key))
	check.toggled.connect(func(pressed: bool) -> void:
		AudioManager.play("ui_click", 1.2, -8.0)
		GameState.set_setting(key, pressed))
	row.add_child(check)

func _quality() -> void:
	var row := _row("Qualite graphique")
	_quality_button = OptionButton.new()
	_quality_button.add_item("Basse", 0)
	_quality_button.add_item("Moyenne", 1)
	_quality_button.add_item("Haute", 2)
	_quality_button.add_item("Ultra", 3)
	_quality_button.selected = clampi(int(GameState.get_setting("graphics_quality")), 0, 3)
	_quality_button.custom_minimum_size = Vector2(180, 0)
	_quality_button.item_selected.connect(func(index: int) -> void:
		AudioManager.play("ui_click")
		GameState.set_setting("graphics_quality", index))
	row.add_child(_quality_button)
