extends Control
## Settings screen used from the main menu and the pause menu. Builds tabbed
## controls bound to SettingsManager; changes apply live. Frees itself on Back.

const REBINDABLE: Array = [
	["move_forward", "Move Forward"],
	["move_back", "Move Back"],
	["move_left", "Move Left"],
	["move_right", "Move Right"],
	["sprint", "Sprint"],
	["crouch", "Crouch"],
	["interact", "Interact"],
	["flashlight", "Flashlight"],
]

var _listening_action: String = ""
var _listening_button: Button = null

func _ready() -> void:
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(UITheme.dim_background(0.92))

	var margin: MarginContainer = MarginContainer.new()
	UITheme.full_rect(margin)
	margin.add_theme_constant_override("margin_left", 120)
	margin.add_theme_constant_override("margin_right", 120)
	margin.add_theme_constant_override("margin_top", 60)
	margin.add_theme_constant_override("margin_bottom", 60)
	add_child(margin)

	var root: VBoxContainer = VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)
	root.add_child(UITheme.title("SETTINGS", 34))

	var tabs: TabContainer = TabContainer.new()
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	tabs.add_theme_constant_override("side_margin", 8)
	root.add_child(tabs)
	tabs.add_child(_build_gameplay_tab())
	tabs.add_child(_build_controls_tab())
	tabs.add_child(_build_audio_tab())
	tabs.add_child(_build_graphics_tab())

	var back: Button = UITheme.button("Back", 200)
	back.pressed.connect(func() -> void:
		AudioManager.play_ui("back")
		SettingsManager.save_settings()
		queue_free())
	root.add_child(back)

# --- Tabs --------------------------------------------------------------------

func _scroll(tab_name: String) -> VBoxContainer:
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.name = tab_name
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var vb: VBoxContainer = VBoxContainer.new()
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vb.add_theme_constant_override("separation", 8)
	scroll.add_child(vb)
	scroll.set_meta("vb", vb)
	return scroll

func _vb(scroll: ScrollContainer) -> VBoxContainer:
	return scroll.get_meta("vb") as VBoxContainer

func _build_gameplay_tab() -> ScrollContainer:
	var s: ScrollContainer = _scroll("Gameplay")
	var vb: VBoxContainer = _vb(s)
	_option(vb, "Difficulty", "gameplay", "difficulty", ["Story", "Normal", "Hard", "Nightmare"])
	_toggle(vb, "Subtitles", "gameplay", "subtitles")
	_option(vb, "Subtitle Size", "gameplay", "subtitle_size", ["Small", "Normal", "Large"])
	_toggle(vb, "Interaction Prompts", "gameplay", "interaction_prompts")
	_toggle(vb, "Detection Indicator", "gameplay", "detection_indicator")
	_toggle(vb, "Objective Hints", "gameplay", "objective_hints")
	return s

func _build_controls_tab() -> ScrollContainer:
	var s: ScrollContainer = _scroll("Controls")
	var vb: VBoxContainer = _vb(s)
	_slider(vb, "Mouse Sensitivity", "controls", "mouse_sensitivity", 0.1, 3.0, 0.05)
	_toggle(vb, "Invert Y Axis", "controls", "invert_y")
	_toggle(vb, "Hold to Sprint", "gameplay", "hold_to_sprint")
	_toggle(vb, "Hold to Crouch", "gameplay", "hold_to_crouch")
	vb.add_child(UITheme.hsep(10))
	vb.add_child(UITheme.label("Key Bindings (click, then press a key):", 16, UITheme.TEXT_DIM))
	for entry: Array in REBINDABLE:
		_rebind_row(vb, str(entry[0]), str(entry[1]))
	return s

func _build_audio_tab() -> ScrollContainer:
	var s: ScrollContainer = _scroll("Audio")
	var vb: VBoxContainer = _vb(s)
	_slider(vb, "Master Volume", "audio", "master_volume", 0.0, 1.0, 0.05)
	_slider(vb, "Music Volume", "audio", "music_volume", 0.0, 1.0, 0.05)
	_slider(vb, "Effects Volume", "audio", "effects_volume", 0.0, 1.0, 0.05)
	_slider(vb, "Voice Volume", "audio", "voice_volume", 0.0, 1.0, 0.05)
	_slider(vb, "Ambience Volume", "audio", "ambience_volume", 0.0, 1.0, 0.05)
	return s

func _build_graphics_tab() -> ScrollContainer:
	var s: ScrollContainer = _scroll("Graphics")
	var vb: VBoxContainer = _vb(s)
	var preset: OptionButton = _option_raw(vb, "Quality Preset", ["Low", "Medium", "High", "Ultra"], _preset_index())
	preset.item_selected.connect(func(idx: int) -> void:
		var names: Array[String] = ["low", "medium", "high", "ultra"]
		SettingsManager.apply_preset(names[idx]))
	_option(vb, "Display Mode", "graphics", "display_mode", ["Windowed", "Fullscreen", "Borderless"], func() -> void: SettingsManager.apply_window())
	_option(vb, "V-Sync", "graphics", "vsync", ["Off", "On", "Adaptive"], func() -> void: SettingsManager.apply_window())
	_option(vb, "Frame Limit", "graphics", "frame_limit", ["Unlimited", "30", "60", "120", "144"], func() -> void: SettingsManager.apply_window(), [0, 30, 60, 120, 144])
	_slider(vb, "Render Scale", "graphics", "render_scale", 0.5, 1.0, 0.05, func() -> void: SettingsManager.apply_graphics())
	_option(vb, "Shadow Quality", "graphics", "shadow_quality", ["Low", "Medium", "High", "Ultra"], func() -> void: SettingsManager.apply_graphics())
	_option(vb, "Fog Quality", "graphics", "fog_quality", ["Off", "Low", "Medium", "High"])
	_toggle(vb, "SSAO", "graphics", "ssao")
	_toggle(vb, "Screen-Space Reflections", "graphics", "reflections")
	_option(vb, "Anti-Aliasing", "graphics", "anti_aliasing", ["Off", "FXAA", "MSAA 2x", "MSAA 4x"], func() -> void: SettingsManager.apply_graphics())
	_option(vb, "Texture Filtering", "graphics", "texture_filter", ["Off", "2x", "4x", "8x", "16x"], func() -> void: SettingsManager.apply_graphics())
	return s

# --- Row builders ------------------------------------------------------------

func _row(parent: VBoxContainer, label_text: String) -> HBoxContainer:
	var hb: HBoxContainer = HBoxContainer.new()
	hb.add_theme_constant_override("separation", 12)
	var l: Label = UITheme.label(label_text, 17)
	l.custom_minimum_size = Vector2(280, 0)
	hb.add_child(l)
	parent.add_child(hb)
	return hb

func _toggle(parent: VBoxContainer, label_text: String, section: String, key: String) -> void:
	var hb: HBoxContainer = _row(parent, label_text)
	var cb: CheckButton = CheckButton.new()
	cb.button_pressed = SettingsManager.get_bool(section, key)
	cb.toggled.connect(func(pressed: bool) -> void:
		SettingsManager.set_value(section, key, pressed)
		AudioManager.play_ui("click"))
	hb.add_child(cb)

func _slider(parent: VBoxContainer, label_text: String, section: String, key: String, min_v: float, max_v: float, step: float, on_change: Callable = Callable()) -> void:
	var hb: HBoxContainer = _row(parent, label_text)
	var slider: HSlider = HSlider.new()
	slider.min_value = min_v
	slider.max_value = max_v
	slider.step = step
	slider.value = SettingsManager.get_float(section, key)
	slider.custom_minimum_size = Vector2(220, 0)
	var value_label: Label = UITheme.label("%.2f" % slider.value, 16, UITheme.TEXT_DIM)
	value_label.custom_minimum_size = Vector2(56, 0)
	slider.value_changed.connect(func(v: float) -> void:
		SettingsManager.set_value(section, key, v)
		value_label.text = "%.2f" % v
		if on_change.is_valid():
			on_change.call())
	hb.add_child(slider)
	hb.add_child(value_label)

func _option(parent: VBoxContainer, label_text: String, section: String, key: String, options: Array, on_change: Callable = Callable(), values: Array = []) -> void:
	var current: int = SettingsManager.get_int(section, key)
	var select_index: int = current
	if not values.is_empty():
		select_index = maxi(values.find(current), 0)
	var ob: OptionButton = _option_raw(parent, label_text, options, select_index)
	ob.item_selected.connect(func(idx: int) -> void:
		var stored: int = idx if values.is_empty() else int(values[idx])
		SettingsManager.set_value(section, key, stored)
		AudioManager.play_ui("click")
		if on_change.is_valid():
			on_change.call())

func _option_raw(parent: VBoxContainer, label_text: String, options: Array, select_index: int) -> OptionButton:
	var hb: HBoxContainer = _row(parent, label_text)
	var ob: OptionButton = OptionButton.new()
	ob.custom_minimum_size = Vector2(220, 0)
	for opt: Variant in options:
		ob.add_item(str(opt))
	ob.select(clampi(select_index, 0, options.size() - 1))
	hb.add_child(ob)
	return ob

func _preset_index() -> int:
	match SettingsManager.get_string("graphics", "preset"):
		"low": return 0
		"medium": return 1
		"high": return 2
		"ultra": return 3
		_: return 1

func _rebind_row(parent: VBoxContainer, action: String, label_text: String) -> void:
	var hb: HBoxContainer = _row(parent, label_text)
	var b: Button = UITheme.button(_binding_text(action), 200)
	b.pressed.connect(func() -> void:
		_listening_action = action
		_listening_button = b
		b.text = "Press a key…")
	hb.add_child(b)

func _binding_text(action: String) -> String:
	if not InputMap.has_action(action):
		return "—"
	for ev: InputEvent in InputMap.action_get_events(action):
		if ev is InputEventKey:
			return OS.get_keycode_string((ev as InputEventKey).physical_keycode)
		if ev is InputEventMouseButton:
			return "Mouse %d" % (ev as InputEventMouseButton).button_index
	return "—"

func _input(event: InputEvent) -> void:
	if _listening_action == "":
		return
	if event is InputEventKey and (event as InputEventKey).pressed:
		var key_event: InputEventKey = event as InputEventKey
		InputMap.action_erase_events(_listening_action)
		var new_event: InputEventKey = InputEventKey.new()
		new_event.physical_keycode = key_event.physical_keycode
		InputMap.action_add_event(_listening_action, new_event)
		SettingsManager.set_value("controls", "key_" + _listening_action, int(key_event.physical_keycode))
		if _listening_button != null:
			_listening_button.text = _binding_text(_listening_action)
		_listening_action = ""
		_listening_button = null
		AudioManager.play_ui("confirm")
		get_viewport().set_input_as_handled()
