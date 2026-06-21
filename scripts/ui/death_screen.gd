extends Control
## Shown when the player dies. Offers checkpoint retry, loading the last save, or
## quitting to the menu.

var _cause_label: Label

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg: ColorRect = ColorRect.new()
	bg.color = Color(0.05, 0.0, 0.0, 0.92)
	UITheme.full_rect(bg)
	add_child(bg)

	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.custom_minimum_size = Vector2(420, 0)
	vb.add_theme_constant_override("separation", 14)
	center.add_child(vb)

	var title: Label = UITheme.title("YOU DIED", 56)
	title.add_theme_color_override("font_color", UITheme.DANGER)
	vb.add_child(title)
	_cause_label = UITheme.label("", 18, UITheme.TEXT_DIM)
	_cause_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(_cause_label)
	vb.add_child(UITheme.hsep(20))

	_button(vb, "Retry from Checkpoint", func() -> void: GameManager.respawn_at_checkpoint())
	if SaveManager.has_any_save():
		_button(vb, "Load Last Save", func() -> void: SaveManager.load_game(SaveManager.latest_slot()))
	_button(vb, "Main Menu", func() -> void: GameManager.goto_main_menu())

func _button(parent: VBoxContainer, text: String, cb: Callable) -> void:
	var b: Button = UITheme.button(text)
	b.pressed.connect(func() -> void:
		AudioManager.play_ui("click")
		cb.call())
	parent.add_child(b)

func set_cause(cause: String) -> void:
	_cause_label.text = cause
