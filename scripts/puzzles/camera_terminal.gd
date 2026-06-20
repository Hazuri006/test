class_name CameraTerminal
extends Interactable
## Puzzle 3 — the CCTV terminal. Opens the camera feed viewer. One feed hides a code
## the player can note; noting it sets a flag (used by a nearby keypad). Requires
## power to operate.

@export var requires_flag: String = "power_on"
@export var reveal_code: String = "0451"
@export var reveal_flag: String = "cctv_code_known"

func _setup() -> void:
	prompt_verb = "Use terminal"
	var mat: StandardMaterial3D = MaterialLibrary.painted_metal()
	_add_box(Vector3(1.2, 0.8, 0.6), mat, Vector3(0, 0.4, 0))
	_add_box(Vector3(0.9, 0.6, 0.05), MaterialLibrary.monitor_screen(), Vector3(0, 1.1, 0.25))
	_add_box(Vector3(1.0, 0.1, 0.6), mat, Vector3(0, 0.78, 0))
	_add_box_collision(Vector3(1.3, 1.5, 0.7), Vector3(0, 0.6, 0))

func can_interact(_player: Node) -> bool:
	return enabled and (requires_flag == "" or GameManager.get_flag_bool(requires_flag))

func get_prompt() -> String:
	if not can_interact(null):
		return "No power. The screens are dead."
	return "E — Use terminal"

func _on_interact(_player: Node) -> void:
	var monster_cam: int = randi() % 4 + 1
	var feeds: Array = [
		{"label": "Reception", "text": "Empty. The front doors are buried under rubble. Rain leaks across the tiles."},
		{"label": "East Corridor", "text": "A wheelchair sits in the middle of the hall. You don't remember it being there."},
		{"label": "Archive Approach", "text": "Filing cabinets. On the far wall, scrawled in grease pencil: [b]%s[/b]" % reveal_code, "has_code": true, "code": reveal_code},
		{"label": "Ward B", "text": _monster_feed(monster_cam)},
	]
	GameManager.open_camera_feed(feeds, _on_code_revealed)

func _monster_feed(_cam: int) -> String:
	if randf() < 0.6:
		return "Static. Then — a tall figure in attendant's whites at the end of the ward, facing the lens. The feed cuts to snow."
	return "Beds, stripped to the frame. Something drips, off-camera."

func _on_code_revealed(code: String) -> void:
	if reveal_flag != "":
		GameManager.set_flag(reveal_flag, true)
		GameManager.set_flag("cctv_code_value", code)
