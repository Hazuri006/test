extends CanvasLayer
## In-game HUD: objective, stamina, timed messages, pause menu and end screens.

@onready var objective: Label = %Objective
@onready var message: Label = %Message
@onready var stamina: ProgressBar = %Stamina
@onready var end_screen: Control = %EndScreen
@onready var end_title: Label = %EndTitle
@onready var pause_menu: Control = %PauseMenu

var msg_timer := 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	end_screen.visible = false
	pause_menu.visible = false
	message.text = ""
	Game.state_changed.connect(_on_state_changed)
	Game.message.connect(_on_message)

func _process(delta: float) -> void:
	if msg_timer > 0.0:
		msg_timer -= delta
		if msg_timer <= 0.0:
			message.text = ""
	var p := _local_player()
	if p:
		stamina.value = p.stamina * 100.0

func _local_player() -> Node:
	for pl in get_tree().get_nodes_in_group("players"):
		if is_instance_valid(pl) and pl.is_multiplayer_authority():
			return pl
	return null

func _on_message(text: String, seconds: float) -> void:
	message.text = text
	msg_timer = seconds

func _on_state_changed(s: int) -> void:
	match s:
		Game.State.ESCAPED:
			_show_end("YOU ESCAPED", Color(0.45, 1.0, 0.55))
		Game.State.CAUGHT:
			_show_end("CAUGHT", Color(1.0, 0.32, 0.3))

func _show_end(title: String, col: Color) -> void:
	end_title.text = title
	end_title.modulate = col
	end_screen.visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") and Game.state == Game.State.PLAYING:
		_toggle_pause()

func _toggle_pause() -> void:
	var pausing := not pause_menu.visible
	pause_menu.visible = pausing
	get_tree().paused = pausing
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if pausing else Input.MOUSE_MODE_CAPTURED

func _on_resume_pressed() -> void:
	_toggle_pause()

func _on_menu_pressed() -> void:
	get_tree().paused = false
	Game.to_menu()

func _on_quit_pressed() -> void:
	get_tree().quit()
