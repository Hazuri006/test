class_name KeypadDoor
extends Interactable
## Puzzle 2 — a wall keypad. Opens the keypad UI; on the correct code it sets a flag,
## advances a quest and announces success (used to unlock the archive cabinet / doors).

@export var code: String = "0000"
@export var hint: String = ""
@export var success_flag: String = ""
@export var quest_id: String = ""
@export var quest_step: String = ""
@export var success_message: String = "A lock clicks open."
@export var already_message: String = "Already unlocked."

var _solved: bool = false

func _setup() -> void:
	prompt_verb = "Enter code"
	var mat: StandardMaterial3D = MaterialLibrary.painted_metal()
	_add_box(Vector3(0.34, 0.46, 0.1), mat, Vector3(0, 0, 0))
	_add_box(Vector3(0.26, 0.14, 0.04), MaterialLibrary.monitor_screen(), Vector3(0, 0.13, 0.06))
	_add_box_collision(Vector3(0.4, 0.5, 0.2), Vector3(0, 0, 0.05))

func can_interact(_player: Node) -> bool:
	return enabled and not _solved

func get_prompt() -> String:
	if _solved:
		return already_message
	return "E — Enter code"

func _on_interact(_player: Node) -> void:
	GameManager.open_keypad(code, _on_success, hint)

func _on_success() -> void:
	_solved = true
	if success_flag != "":
		GameManager.set_flag(success_flag, true)
	if quest_id != "" and quest_step != "":
		QuestManager.complete_step(quest_id, quest_step)
	if success_message != "":
		GameManager.notify(success_message)
	_save_state()

func _capture_state() -> Variant:
	return _solved

func _restore_state(data: Variant) -> void:
	if data is bool:
		_solved = data as bool
