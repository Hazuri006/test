extends Control
## The final decision at the containment device. Three choices; Containment is only
## available when all evidence has been gathered.

var _on_choice: Callable = Callable()

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(UITheme.dim_background(0.94))

func setup(can_contain: bool, on_choice: Callable) -> void:
	_on_choice = on_choice
	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)
	var panel: PanelContainer = UITheme.panel()
	panel.custom_minimum_size = Vector2(640, 0)
	center.add_child(panel)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 12)
	panel.add_child(vb)
	vb.add_child(UITheme.title("THE CONTAINMENT DEVICE", 28))
	vb.add_child(UITheme.label("The coil is primed. The lattice waits. Whatever you do now, you do for Lena.", 17, UITheme.TEXT_DIM))
	vb.add_child(UITheme.hsep(10))

	_choice(vb, "Destroy the machine", "Tear the coil free. Loose everything. Run.", "destroy")
	_choice(vb, "Activate the machine", "Pour the charge in. Believe she can still be saved.", "activate")
	var contain_label: String = "Perform the containment" if can_contain else "Perform the containment  (needs all evidence)"
	_choice(vb, contain_label, "Seal the lattice the way the notes describe. From the inside.", "contain", not can_contain)

func _choice(parent: VBoxContainer, title_text: String, desc: String, key: String, disabled: bool = false) -> void:
	var b: Button = UITheme.button(title_text, 560)
	b.custom_minimum_size = Vector2(560, 64)
	b.disabled = disabled
	b.tooltip_text = desc
	b.pressed.connect(func() -> void: _pick(key))
	parent.add_child(b)
	parent.add_child(UITheme.label("   " + desc, 14, UITheme.TEXT_DIM))

func _pick(key: String) -> void:
	AudioManager.play_ui("confirm")
	var cb: Callable = _on_choice
	GameManager.close_overlay()
	if cb.is_valid():
		cb.call(key)
