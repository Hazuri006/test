extends Control
## Modal security-camera viewer (Puzzle 3). Cycles between camera "feeds" rendered
## as stylised text panels. One feed hides a door code the player can note down; the
## monster may appear in another. Configured via setup().

var _feeds: Array = []
var _index: int = 0
var _on_reveal: Callable = Callable()
var _label: Label
var _feed_text: RichTextLabel
var _reveal_button: Button

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(UITheme.dim_background(0.92))

	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)
	var panel: PanelContainer = UITheme.panel()
	panel.custom_minimum_size = Vector2(720, 460)
	center.add_child(panel)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	panel.add_child(vb)

	vb.add_child(UITheme.label("SECURITY — CCTV", 22, UITheme.ACCENT))
	_label = UITheme.label("", 16, UITheme.TEXT_DIM)
	vb.add_child(_label)

	var screen: PanelContainer = PanelContainer.new()
	var screen_box: StyleBoxFlat = StyleBoxFlat.new()
	screen_box.bg_color = Color(0.04, 0.06, 0.05, 1.0)
	screen_box.set_corner_radius_all(2)
	screen_box.set_content_margin_all(14.0)
	screen.add_theme_stylebox_override("panel", screen_box)
	screen.custom_minimum_size = Vector2(680, 280)
	vb.add_child(screen)
	_feed_text = RichTextLabel.new()
	_feed_text.bbcode_enabled = true
	_feed_text.add_theme_color_override("default_color", Color(0.55, 0.85, 0.6))
	_feed_text.add_theme_font_size_override("normal_font_size", 18)
	screen.add_child(_feed_text)

	var controls: HBoxContainer = HBoxContainer.new()
	controls.add_theme_constant_override("separation", 10)
	vb.add_child(controls)
	var prev: Button = UITheme.button("◂ Prev", 140)
	prev.pressed.connect(func() -> void: _cycle(-1))
	controls.add_child(prev)
	var next: Button = UITheme.button("Next ▸", 140)
	next.pressed.connect(func() -> void: _cycle(1))
	controls.add_child(next)
	_reveal_button = UITheme.button("Note the code", 200)
	_reveal_button.pressed.connect(_reveal)
	controls.add_child(_reveal_button)
	var close: Button = UITheme.button("Close (Esc)", 160)
	close.pressed.connect(_close)
	controls.add_child(close)

func setup(feeds: Array, on_reveal: Callable) -> void:
	_feeds = feeds
	_on_reveal = on_reveal
	_index = 0
	_refresh()

func _cycle(dir: int) -> void:
	if _feeds.is_empty():
		return
	_index = (_index + dir + _feeds.size()) % _feeds.size()
	AudioManager.play_ui("click")
	AudioManager.play_2d("static", -18.0)
	_refresh()

func _refresh() -> void:
	if _feeds.is_empty():
		return
	var feed: Dictionary = _feeds[_index]
	_label.text = "CAM %d/%d — %s" % [_index + 1, _feeds.size(), str(feed.get("label", ""))]
	_feed_text.text = "[i]%s[/i]" % str(feed.get("text", ""))
	_reveal_button.visible = bool(feed.get("has_code", false))

func _reveal() -> void:
	var feed: Dictionary = _feeds[_index]
	if not bool(feed.get("has_code", false)):
		return
	var code: String = str(feed.get("code", ""))
	AudioManager.play_ui("confirm")
	GameManager.notify("Code noted: %s" % code)
	if _on_reveal.is_valid():
		_on_reveal.call(code)

func _close() -> void:
	AudioManager.play_ui("back")
	GameManager.close_overlay()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") or event.is_action_pressed("interact"):
		_close()
		get_viewport().set_input_as_handled()
