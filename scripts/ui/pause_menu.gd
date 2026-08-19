extends Control
class_name PauseMenu

## Menu pause : reprise, reglages graphiques, sauvegarde, quitter.

signal resume_requested()

var _quality_label: Label

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build()

func _build() -> void:
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = UITheme.BG_SOLID
	add_child(bg)

	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.offset_left = -220
	box.offset_right = 220
	box.offset_top = -240
	box.offset_bottom = 240
	box.add_theme_constant_override("separation", 12)
	add_child(box)

	box.add_child(UITheme.label("ABYSSAL", 42, UITheme.CYAN))
	box.add_child(UITheme.label("Systeme de survie — pause", 14, UITheme.TEXT_DIM))
	box.add_child(UITheme.label("", 10))

	var resume := UITheme.button("Reprendre", 18)
	resume.pressed.connect(func(): resume_requested.emit())
	box.add_child(resume)

	_quality_label = UITheme.label("", 14, UITheme.TEXT_DIM)
	var quality := UITheme.button("Qualite graphique", 16)
	quality.pressed.connect(func():
		Settings.cycle_quality()
		_update_labels()
		GameState.notify_info("Qualite : %s (redemarrez pour la densite du monde)"
			% Settings.quality_name()))
	box.add_child(quality)
	box.add_child(_quality_label)

	box.add_child(_slider_row("Sensibilite souris", 0.0004, 0.006,
		Settings.mouse_sensitivity,
		func(v): Settings.set_value(&"mouse_sensitivity", v)))
	box.add_child(_slider_row("Champ de vision", 60.0, 110.0, Settings.fov,
		func(v): Settings.set_value(&"fov", v)))
	box.add_child(_slider_row("Oscillation de tete", 0.0, 2.0, Settings.head_bob,
		func(v): Settings.set_value(&"head_bob", v)))
	box.add_child(_slider_row("Volume", 0.0, 1.0, Settings.master_volume,
		func(v): Settings.set_value(&"master_volume", v)))

	var save := UITheme.button("Sauvegarder", 16)
	save.pressed.connect(func(): GameState.save_game())
	box.add_child(save)

	var load_btn := UITheme.button("Charger", 16)
	load_btn.pressed.connect(func():
		if not GameState.load_game():
			GameState.notify_warning("Aucune sauvegarde"))
	box.add_child(load_btn)

	var quit := UITheme.button("Quitter", 16)
	quit.pressed.connect(func(): get_tree().quit())
	box.add_child(quit)

	_update_labels()

func _slider_row(text: String, min_v: float, max_v: float, value: float,
		on_change: Callable) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var l := UITheme.label(text, 14, UITheme.TEXT_DIM)
	l.custom_minimum_size = Vector2(180, 0)
	row.add_child(l)
	var slider := HSlider.new()
	slider.min_value = min_v
	slider.max_value = max_v
	slider.step = (max_v - min_v) / 100.0
	slider.value = value
	slider.custom_minimum_size = Vector2(200, 20)
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.value_changed.connect(func(v): on_change.call(v))
	row.add_child(slider)
	return row

func _update_labels() -> void:
	_quality_label.text = "Profil actuel : %s" % Settings.quality_name()

func open() -> void:
	visible = true
	_update_labels()

func close() -> void:
	visible = false
