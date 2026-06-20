extends Control
## Modal numeric keypad. Configured via setup(code, on_success, hint). Calls the
## success callback when the correct code is entered, then closes.

var _code: String = ""
var _entered: String = ""
var _on_success: Callable = Callable()
var _display: Label
var _hint_label: Label

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(UITheme.dim_background(0.85))

	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)
	var panel: PanelContainer = UITheme.panel()
	center.add_child(panel)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 10)
	panel.add_child(vb)

	vb.add_child(UITheme.label("KEYPAD", 22, UITheme.ACCENT))
	_hint_label = UITheme.label("", 14, UITheme.TEXT_DIM)
	_hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(_hint_label)

	_display = UITheme.label("____", 30, UITheme.TEXT)
	_display.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_display.custom_minimum_size = Vector2(240, 48)
	vb.add_child(_display)

	var grid: GridContainer = GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	vb.add_child(grid)
	for n: int in range(1, 10):
		grid.add_child(_digit_button(str(n)))
	grid.add_child(_action_button("CLR", _clear))
	grid.add_child(_digit_button("0"))
	grid.add_child(_action_button("OK", _submit))

	var cancel: Button = UITheme.button("Cancel  (Esc)", 200)
	cancel.pressed.connect(_close)
	vb.add_child(cancel)

func setup(code: String, on_success: Callable, hint: String = "") -> void:
	_code = code
	_on_success = on_success
	_hint_label.text = hint
	_entered = ""
	_update_display()

func _digit_button(digit: String) -> Button:
	var b: Button = UITheme.button(digit, 70)
	b.custom_minimum_size = Vector2(70, 60)
	b.pressed.connect(func() -> void: _press(digit))
	return b

func _action_button(text: String, cb: Callable) -> Button:
	var b: Button = UITheme.button(text, 70)
	b.custom_minimum_size = Vector2(70, 60)
	b.pressed.connect(cb)
	return b

func _press(digit: String) -> void:
	if _entered.length() >= _code.length():
		return
	_entered += digit
	AudioManager.play_ui("click")
	_update_display()
	if _entered.length() == _code.length():
		_submit()

func _clear() -> void:
	_entered = ""
	AudioManager.play_ui("back")
	_update_display()

func _submit() -> void:
	if _entered == _code:
		AudioManager.play_ui("confirm")
		var cb: Callable = _on_success
		GameManager.close_overlay()
		if cb.is_valid():
			cb.call()
	else:
		AudioManager.play_ui("deny")
		GameManager.notify("Incorrect code.")
		_entered = ""
		_update_display()

func _update_display() -> void:
	var shown: String = _entered
	while shown.length() < _code.length():
		shown += "_"
	var spaced: PackedStringArray = PackedStringArray()
	for i: int in range(shown.length()):
		spaced.append(shown[i])
	_display.text = "  ".join(spaced)

func _close() -> void:
	AudioManager.play_ui("back")
	GameManager.close_overlay()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		_close()
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and (event as InputEventKey).pressed:
		var kc: int = (event as InputEventKey).keycode
		if kc >= KEY_0 and kc <= KEY_9:
			_press(str(kc - KEY_0))
		elif kc == KEY_ENTER or kc == KEY_KP_ENTER:
			_submit()
		elif kc == KEY_BACKSPACE:
			_clear()
