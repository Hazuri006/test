extends Node
## Etat global : pause, curseur, notifications, sauvegarde.

signal notify(text: String, kind: int)
signal player_died()
signal player_respawned()
signal ui_mode_changed(ui_open: bool)
signal item_collected(id: StringName, amount: int)
signal biome_changed(biome: String)
## Demandes d'ouverture d'ecran emises par le monde vers l'interface.
signal request_fabricator(fabricator: Node)
signal request_storage(container: Node)
signal request_close_ui()

enum Notice { INFO, WARNING, DANGER, SUCCESS }

const SAVE_PATH := "user://savegame.json"

var player: Node3D = null
var lifepod: Node3D = null
var world: Node = null
var ui_open: bool = false
var paused: bool = false
var time_of_day: float = 0.32          # 0..1, 0.25 = lever du soleil
var play_time: float = 0.0
var discovered: Dictionary = {}        # StringName -> true (scans effectues)

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	capture_mouse()

func _process(delta: float) -> void:
	if not paused:
		play_time += delta

func capture_mouse() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	ui_open = false
	ui_mode_changed.emit(false)

func release_mouse() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	ui_open = true
	ui_mode_changed.emit(true)

func set_paused(value: bool) -> void:
	paused = value
	get_tree().paused = value
	if value:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif not ui_open:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func notify_info(text: String) -> void:
	notify.emit(text, Notice.INFO)

func notify_warning(text: String) -> void:
	notify.emit(text, Notice.WARNING)

func notify_danger(text: String) -> void:
	notify.emit(text, Notice.DANGER)

func notify_success(text: String) -> void:
	notify.emit(text, Notice.SUCCESS)

func mark_discovered(id: StringName) -> bool:
	if discovered.has(id):
		return false
	discovered[id] = true
	return true

# ---------------------------------------------------------------- sauvegarde --
func save_game() -> void:
	if player == null:
		return
	var data := {
		"version": 1,
		"time_of_day": time_of_day,
		"play_time": play_time,
		"position": [player.global_position.x, player.global_position.y,
			player.global_position.z],
		"discovered": discovered.keys().map(func(k): return String(k)),
	}
	if player.has_method("serialize"):
		data["player"] = player.serialize()
	# les gisements deja casses ne doivent pas reapparaitre au rechargement
	if world != null and world.get("resources") != null:
		data["harvested"] = world.resources.serialize()
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		notify_danger("Sauvegarde impossible")
		return
	f.store_string(JSON.stringify(data, "\t"))
	f.close()
	notify_success("Partie sauvegardee")

func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return false
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	var data: Dictionary = parsed
	time_of_day = data.get("time_of_day", time_of_day)
	play_time = data.get("play_time", 0.0)
	discovered.clear()
	for k in data.get("discovered", []):
		discovered[StringName(k)] = true
	if world != null and world.get("resources") != null:
		world.resources.deserialize(data.get("harvested", []))
	if player != null:
		var pos: Array = data.get("position", [])
		if pos.size() == 3:
			player.global_position = Vector3(pos[0], pos[1], pos[2])
		if player.has_method("deserialize") and data.has("player"):
			player.deserialize(data["player"])
	notify_success("Partie chargee")
	return true
