extends Node
## Boot autoload — registers the input map at runtime so the project needs no
## hand-edited InputEvent serialization, and applies a couple of global tweaks.

func _ready() -> void:
	_setup_input()

func _key(code: Key) -> InputEventKey:
	var e := InputEventKey.new()
	e.physical_keycode = code
	return e

func _mouse(button: MouseButton) -> InputEventMouseButton:
	var e := InputEventMouseButton.new()
	e.button_index = button
	return e

func _add(action: StringName, events: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	for ev in events:
		InputMap.action_add_event(action, ev)

func _setup_input() -> void:
	_add(&"move_forward", [_key(KEY_W), _key(KEY_UP)])
	_add(&"move_back", [_key(KEY_S), _key(KEY_DOWN)])
	_add(&"move_left", [_key(KEY_A), _key(KEY_LEFT)])
	_add(&"move_right", [_key(KEY_D), _key(KEY_RIGHT)])
	_add(&"jump", [_key(KEY_SPACE)])
	_add(&"sprint", [_key(KEY_SHIFT)])
	_add(&"interact", [_key(KEY_E), _mouse(MOUSE_BUTTON_RIGHT)])
	_add(&"flashlight", [_key(KEY_F)])
	_add(&"pause", [_key(KEY_ESCAPE)])
