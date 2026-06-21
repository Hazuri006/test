extends Control
## Main menu: New Game (with difficulty select), Continue, Load, Settings, Credits
## and Quit (with confirmation). Built entirely in code on top of UITheme.

const SETTINGS_MENU: String = "res://scenes/menus/SettingsMenu.tscn"

var _content: VBoxContainer
var _title: Label

func _ready() -> void:
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP

	var bg: ColorRect = ColorRect.new()
	bg.color = Color(0.02, 0.025, 0.03, 1.0)
	UITheme.full_rect(bg)
	add_child(bg)

	var vignette: ColorRect = ColorRect.new()
	UITheme.full_rect(vignette)
	vignette.material = _make_vignette_material()
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vignette)

	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)

	_content = VBoxContainer.new()
	_content.custom_minimum_size = Vector2(360, 0)
	_content.add_theme_constant_override("separation", 12)
	center.add_child(_content)

	_title = UITheme.title("THE LAST WARD")
	var subtitle: Label = UITheme.label("no-clip · the backrooms", 18, UITheme.TEXT_DIM)
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	var header: VBoxContainer = VBoxContainer.new()
	header.add_child(_title)
	header.add_child(subtitle)
	header.add_child(UITheme.hsep(24))
	_content.add_child(header)

	_show_root()

func _clear_buttons() -> void:
	# Keep first child (header), remove the rest.
	for i: int in range(_content.get_child_count() - 1, 0, -1):
		_content.get_child(i).queue_free()

func _wire(text: String, callback: Callable, disabled: bool = false) -> Button:
	var b: Button = UITheme.button(text)
	b.disabled = disabled
	b.pressed.connect(func() -> void:
		AudioManager.play_ui("click")
		callback.call())
	_content.add_child(b)
	return b

func _show_root() -> void:
	_clear_buttons()
	_wire("New Game", _show_difficulty)
	_wire("Continue", _on_continue, not SaveManager.has_any_save())
	_wire("Load Game", _show_load, not SaveManager.has_any_save())
	_wire("Settings", _on_settings)
	_wire("Credits", _show_credits)
	_wire("Quit", _show_quit_confirm)

func _show_difficulty() -> void:
	_clear_buttons()
	_content.add_child(UITheme.label("Choose your difficulty:", 18, UITheme.TEXT_DIM))
	_wire("Story  —  gentle, hints on", func() -> void: GameManager.new_game(GameTypes.Difficulty.STORY))
	_wire("Normal  —  the intended experience", func() -> void: GameManager.new_game(GameTypes.Difficulty.NORMAL))
	_wire("Hard  —  sharper senses, scarce power", func() -> void: GameManager.new_game(GameTypes.Difficulty.HARD))
	_wire("Nightmare  —  no indicators, no mercy", func() -> void: GameManager.new_game(GameTypes.Difficulty.NIGHTMARE))
	_content.add_child(UITheme.hsep())
	_wire("Back", _show_root)

func _on_continue() -> void:
	var slot: int = SaveManager.latest_slot()
	if slot >= 0:
		SaveManager.load_game(slot)

func _show_load() -> void:
	_clear_buttons()
	_content.add_child(UITheme.label("Load a save:", 18, UITheme.TEXT_DIM))
	var any: bool = false
	for slot: int in range(0, SaveManager.MAX_SLOTS + 1):
		if not SaveManager.has_save(slot):
			continue
		any = true
		var meta: Dictionary = SaveManager.get_metadata(slot)
		var label_name: String = "Autosave" if slot == SaveManager.AUTOSAVE_SLOT else "Slot %d" % slot
		var text: String = "%s — %s\n%s" % [label_name, str(meta.get("quest_title", "—")), str(meta.get("datetime", ""))]
		var captured_slot: int = slot
		_wire(text, func() -> void: SaveManager.load_game(captured_slot))
	if not any:
		_content.add_child(UITheme.label("No saved games found.", 16, UITheme.TEXT_DIM))
	_content.add_child(UITheme.hsep())
	_wire("Back", _show_root)

func _on_settings() -> void:
	if not ResourceLoader.exists(SETTINGS_MENU):
		return
	var packed: PackedScene = ResourceLoader.load(SETTINGS_MENU) as PackedScene
	var settings: Control = packed.instantiate() as Control
	add_child(settings)

func _show_credits() -> void:
	_clear_buttons()
	var panel: PanelContainer = UITheme.panel()
	panel.custom_minimum_size = Vector2(360, 0)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	panel.add_child(vb)
	vb.add_child(UITheme.label("THE LAST WARD", 22, UITheme.ACCENT))
	vb.add_child(UITheme.label("A prototype horror project built in Godot 4.6.", 16, UITheme.TEXT_DIM))
	vb.add_child(UITheme.hsep())
	vb.add_child(UITheme.label("Design, code & writing: generated project", 15))
	vb.add_child(UITheme.label("Engine: Godot 4.6.x (MIT)", 15))
	vb.add_child(UITheme.label("Audio: procedurally synthesised placeholders", 15))
	vb.add_child(UITheme.label("Art: procedural fallback geometry — see ATTRIBUTION.md", 15))
	_content.add_child(panel)
	_content.add_child(UITheme.hsep())
	_wire("Back", _show_root)

func _show_quit_confirm() -> void:
	_clear_buttons()
	_content.add_child(UITheme.label("Leave Saint Veyra?", 20))
	_wire("Quit to Desktop", func() -> void: get_tree().quit())
	_content.add_child(UITheme.hsep())
	_wire("Stay", _show_root)

func _make_vignette_material() -> ShaderMaterial:
	var shader: Shader = Shader.new()
	shader.code = """
shader_type canvas_item;
void fragment() {
	float d = distance(UV, vec2(0.5));
	float v = smoothstep(0.35, 0.85, d);
	COLOR = vec4(0.0, 0.0, 0.0, v * 0.75);
}
"""
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = shader
	return mat
