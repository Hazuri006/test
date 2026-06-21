extends Control
## Title screen: host or join a co-op session, then load the level.

@onready var name_edit: LineEdit = %NameEdit
@onready var ip_edit: LineEdit = %IpEdit
@onready var status: Label = %Status

func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	name_edit.text = Net.local_name
	if not Net.connection_succeeded.is_connected(_on_connected):
		Net.connection_succeeded.connect(_on_connected)
		Net.connection_failed.connect(_on_failed)

func _start_play() -> void:
	get_tree().change_scene_to_file("res://scenes/World.tscn")

func _on_host_pressed() -> void:
	Net.local_name = name_edit.text.strip_edges() if name_edit.text.strip_edges() != "" else "Host"
	var err := Net.host_game()
	if err != OK:
		status.text = "Could not host (port busy?)"
		return
	_start_play()

func _on_solo_pressed() -> void:
	# Pure single-player: no peer, world spawns one survivor locally.
	Net.leave()
	_start_play()

func _on_join_pressed() -> void:
	Net.local_name = name_edit.text.strip_edges() if name_edit.text.strip_edges() != "" else "Survivor"
	var ip := ip_edit.text.strip_edges()
	if ip == "":
		ip = "127.0.0.1"
	var err := Net.join_game(ip)
	if err != OK:
		status.text = "Bad address."
		return
	status.text = "Connecting to %s ..." % ip

func _on_connected() -> void:
	status.text = "Connected!"
	_start_play()

func _on_failed() -> void:
	status.text = "Connection failed."

func _on_quit_pressed() -> void:
	get_tree().quit()
