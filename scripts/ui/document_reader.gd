extends Control
## Modal document reader. Shown via GameManager.show_document(). Closes on Esc /
## interact / the Close button.

var _title: Label
var _meta: Label
var _body: RichTextLabel

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(UITheme.dim_background(0.9))

	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)
	var panel: PanelContainer = UITheme.panel()
	panel.custom_minimum_size = Vector2(720, 560)
	center.add_child(panel)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	panel.add_child(vb)

	_title = UITheme.label("", 26, UITheme.ACCENT)
	_meta = UITheme.label("", 14, UITheme.TEXT_DIM)
	vb.add_child(_title)
	vb.add_child(_meta)
	vb.add_child(UITheme.hsep(8))
	_body = RichTextLabel.new()
	_body.bbcode_enabled = false
	_body.fit_content = false
	_body.scroll_active = true
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.custom_minimum_size = Vector2(680, 420)
	_body.add_theme_color_override("default_color", UITheme.TEXT)
	_body.add_theme_font_size_override("normal_font_size", 18)
	vb.add_child(_body)

	var close: Button = UITheme.button("Close  (E / Esc)", 200)
	close.pressed.connect(_close)
	vb.add_child(close)

func show_document(doc: DocumentData) -> void:
	_title.text = doc.title
	var meta_parts: Array[String] = []
	if doc.author != "":
		meta_parts.append(doc.author)
	if doc.date != "":
		meta_parts.append(doc.date)
	_meta.text = "  —  ".join(meta_parts)
	_body.text = doc.body

func _close() -> void:
	AudioManager.play_ui("back")
	GameManager.close_overlay()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") or event.is_action_pressed("interact") or event.is_action_pressed("journal"):
		_close()
		get_viewport().set_input_as_handled()
