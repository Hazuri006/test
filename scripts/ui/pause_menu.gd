extends Control
## Pause menu (process_mode ALWAYS so it runs while the tree is paused). Resume,
## Save, Load, Settings, return to Main Menu and Quit.

const SETTINGS_MENU: String = "res://scenes/menus/SettingsMenu.tscn"

var _content: VBoxContainer

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(UITheme.dim_background(0.8))

	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)
	_content = VBoxContainer.new()
	_content.custom_minimum_size = Vector2(340, 0)
	_content.add_theme_constant_override("separation", 12)
	center.add_child(_content)
	_content.add_child(UITheme.title("PAUSED", 36))
	_content.add_child(UITheme.hsep(16))
	_show_root()

func _clear() -> void:
	for i: int in range(_content.get_child_count() - 1, 1, -1):
		_content.get_child(i).queue_free()

func _wire(text: String, cb: Callable) -> void:
	var b: Button = UITheme.button(text)
	b.pressed.connect(func() -> void:
		AudioManager.play_ui("click")
		cb.call())
	_content.add_child(b)

func _show_root() -> void:
	_clear()
	_wire("Resume", GameManager.resume_game)
	_wire("Save Game", _show_save)
	_wire("Load Game", _show_load)
	_wire("Settings", _open_settings)
	_wire("Main Menu", _confirm_menu)

func _show_save() -> void:
	_clear()
	_content.add_child(UITheme.label("Save to slot:", 16, UITheme.TEXT_DIM))
	for slot: int in range(1, SaveManager.MAX_SLOTS + 1):
		var meta: Dictionary = SaveManager.get_metadata(slot)
		var info: String = str(meta.get("datetime", "empty")) if not meta.is_empty() else "empty"
		var captured: int = slot
		_wire("Slot %d — %s" % [slot, info], func() -> void:
			if SaveManager.save_game(captured):
				GameManager.notify("Saved to slot %d" % captured)
			_show_root())
	_content.add_child(UITheme.hsep())
	_wire("Back", _show_root)

func _show_load() -> void:
	_clear()
	_content.add_child(UITheme.label("Load slot:", 16, UITheme.TEXT_DIM))
	var any: bool = false
	for slot: int in range(0, SaveManager.MAX_SLOTS + 1):
		if not SaveManager.has_save(slot):
			continue
		any = true
		var meta: Dictionary = SaveManager.get_metadata(slot)
		var label_name: String = "Autosave" if slot == 0 else "Slot %d" % slot
		var captured: int = slot
		_wire("%s — %s" % [label_name, str(meta.get("datetime", ""))], func() -> void: SaveManager.load_game(captured))
	if not any:
		_content.add_child(UITheme.label("No saves.", 16, UITheme.TEXT_DIM))
	_content.add_child(UITheme.hsep())
	_wire("Back", _show_root)

func _open_settings() -> void:
	if not ResourceLoader.exists(SETTINGS_MENU):
		return
	var packed: PackedScene = ResourceLoader.load(SETTINGS_MENU) as PackedScene
	add_child(packed.instantiate())

func _confirm_menu() -> void:
	_clear()
	_content.add_child(UITheme.label("Return to the main menu?\nUnsaved progress will be lost.", 18))
	_wire("Yes, quit to menu", func() -> void: GameManager.goto_main_menu())
	_content.add_child(UITheme.hsep())
	_wire("Back", _show_root)
