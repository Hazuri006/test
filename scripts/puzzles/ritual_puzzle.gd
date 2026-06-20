class_name RitualPuzzle
extends Interactable
## Puzzle 4 — the ritual door. Builds three RitualDials and a confirm plinth. The
## correct combination (Eye, Spiral, Broken Circle — "watched, remembered, undone",
## from doc_ritual_notes) unlocks the final chamber.

@export var quest_id: String = "q4_lower"
@export var quest_step: String = ""
@export var success_flag: String = "ritual_solved"

const SOLUTION: Array[int] = [0, 1, 2]

var _dials: Array[RitualDial] = []
var _solved: bool = false

func _setup() -> void:
	prompt_verb = "Align"
	persistent_id = "ritual_puzzle"
	_add_box(Vector3(1.0, 1.0, 0.6), MaterialLibrary.rusted_metal(), Vector3(0, 0.5, 0))
	_add_box(Vector3(0.5, 0.3, 0.2), MaterialLibrary.monitor_screen(), Vector3(0, 0.9, 0.3))
	_add_box_collision(Vector3(1.1, 1.1, 0.7), Vector3(0, 0.5, 0))
	# Three dials in a row in front of the plinth.
	for i: int in range(3):
		var dial: RitualDial = RitualDial.new()
		dial.position = Vector3(-1.4 + i * 1.4, 0.0, 1.2)
		dial.puzzle = self
		add_child(dial)
		_dials.append(dial)

func get_prompt() -> String:
	if _solved:
		return "The seals are aligned."
	return "E — Press the seal"

func can_interact(_player: Node) -> bool:
	return enabled and not _solved

func _on_interact(_player: Node) -> void:
	var correct: bool = true
	for i: int in range(SOLUTION.size()):
		if i >= _dials.size() or _dials[i].value != SOLUTION[i]:
			correct = false
			break
	if correct:
		_solved = true
		GameManager.set_flag(success_flag, true)
		if quest_step != "":
			QuestManager.complete_step(quest_id, quest_step)
		GameManager.notify("The mechanism grinds open.")
		AudioManager.play_at("door", global_position, -2.0)
		_save_state()
	else:
		GameManager.notify("Nothing happens. The order is wrong.")
		AudioManager.play_at("deny", global_position, -4.0)
		EventManager.trigger_event("whisper", {"position": global_position}, 4.0, false)

func _capture_state() -> Variant:
	return _solved

func _restore_state(data: Variant) -> void:
	if data is bool:
		_solved = data as bool
		if _solved:
			GameManager.set_flag(success_flag, true)
