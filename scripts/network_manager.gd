extends Node
## Net autoload — thin wrapper around Godot high-level multiplayer so the menu can
## host or join a co-op session. The World scene owns the actual player spawning.

signal players_changed
signal connection_failed
signal connection_succeeded
signal server_disconnected

const DEFAULT_PORT := 7777
const MAX_PLAYERS := 8

var peer_port := DEFAULT_PORT
var local_name := "Survivor"
var players: Dictionary = {}   ## peer_id -> { "name": String }

func _ready() -> void:
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)

func is_networked() -> bool:
	return multiplayer.has_multiplayer_peer() and multiplayer.multiplayer_peer.get_connection_status() != MultiplayerPeer.CONNECTION_DISCONNECTED

func host_game(port: int = DEFAULT_PORT) -> Error:
	peer_port = port
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_PLAYERS)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	players.clear()
	players[1] = {"name": local_name}
	players_changed.emit()
	return OK

func join_game(address: String, port: int = DEFAULT_PORT) -> Error:
	peer_port = port
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	return OK

func leave() -> void:
	if multiplayer.multiplayer_peer:
		multiplayer.multiplayer_peer.close()
	multiplayer.multiplayer_peer = null
	players.clear()
	players_changed.emit()

# --- callbacks -------------------------------------------------------------

func _on_peer_connected(id: int) -> void:
	# Server tells the newcomer who is already here, and vice-versa.
	if multiplayer.is_server():
		_register_player.rpc_id(id, local_name) # not strictly needed for self
	_register_player.rpc_id(id, local_name)

func _on_peer_disconnected(id: int) -> void:
	players.erase(id)
	players_changed.emit()

func _on_connected_to_server() -> void:
	_register_player.rpc_id(1, local_name)
	connection_succeeded.emit()

func _on_connection_failed() -> void:
	multiplayer.multiplayer_peer = null
	connection_failed.emit()

func _on_server_disconnected() -> void:
	multiplayer.multiplayer_peer = null
	players.clear()
	server_disconnected.emit()

@rpc("any_peer", "reliable")
func _register_player(player_name: String) -> void:
	var id := multiplayer.get_remote_sender_id()
	if id == 0:
		id = multiplayer.get_unique_id()
	players[id] = {"name": player_name}
	players_changed.emit()
