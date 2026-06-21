extends Node
## Game autoload — tracks the run state (objective, who is alive, win/lose) and
## broadcasts events the HUD and post-process listen to.

signal state_changed(state: int)
signal message(text: String, seconds: float)
signal fear_changed(amount: float)

enum State { MENU, PLAYING, ESCAPED, CAUGHT }

var state: State = State.MENU
var fear: float = 0.0          ## 0..1 proximity dread, drives post FX + audio
var alive_players: int = 0
var total_players: int = 0

func reset() -> void:
	set_state(State.PLAYING)
	fear = 0.0
	fear_changed.emit(fear)

func set_state(s: State) -> void:
	state = s
	state_changed.emit(s)

func set_fear(v: float) -> void:
	v = clampf(v, 0.0, 1.0)
	if absf(v - fear) > 0.001:
		fear = v
		fear_changed.emit(fear)

func notify(text: String, seconds: float = 3.0) -> void:
	message.emit(text, seconds)

# Called on the server when the entity reaches a survivor.
func on_player_caught(_player: Node) -> void:
	if state != State.PLAYING:
		return
	set_state(State.CAUGHT)
	notify("The entity found you...", 6.0)

# Called when any survivor reaches the exit.
func on_escape(_player: Node) -> void:
	if state != State.PLAYING:
		return
	set_state(State.ESCAPED)
	notify("You escaped the backrooms!", 6.0)

func to_menu() -> void:
	set_state(State.MENU)
	Net.leave()
	get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")
