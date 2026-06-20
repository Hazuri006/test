class_name LevelDoor
extends Interactable
## A transition that loads another level at a named spawn point. May require a flag
## or key, and can advance a quest on use.

@export var target_level: String = ""
@export var target_spawn: String = "start"
@export var required_flag: String = ""
@export var required_flag2: String = ""
@export var required_item: String = ""
@export var locked_message: String = "It will not open from here yet."
@export var quest_id: String = ""
@export var quest_step: String = ""
@export var transition_label: String = "Enter"

func _setup() -> void:
	blocks_movement = true
	prompt_verb = transition_label
	# A dark doorway frame so the transition reads as a threshold.
	var mat: StandardMaterial3D = MaterialLibrary.rusted_metal()
	_add_box(Vector3(0.15, 2.2, 0.2), mat, Vector3(-0.6, 1.1, 0))
	_add_box(Vector3(0.15, 2.2, 0.2), mat, Vector3(0.6, 1.1, 0))
	_add_box(Vector3(1.35, 0.18, 0.2), mat, Vector3(0, 2.2, 0))
	var dark: StandardMaterial3D = MaterialLibrary.get_material("threshold", Color(0.01, 0.01, 0.015), 1.0, 0.0, false)
	_add_box(Vector3(1.1, 2.1, 0.05), dark, Vector3(0, 1.05, -0.05))
	_add_box_collision(Vector3(1.1, 2.1, 0.2), Vector3(0, 1.05, 0))

func can_interact(_player: Node) -> bool:
	if not enabled:
		return false
	if required_flag != "" and not GameManager.get_flag_bool(required_flag):
		return false
	if required_flag2 != "" and not GameManager.get_flag_bool(required_flag2):
		return false
	if required_item != "" and not GameManager.inventory.has_item(required_item):
		return false
	return true

func get_prompt() -> String:
	if not can_interact(null):
		return locked_message
	return "E — %s" % transition_label

func _on_interact(_player: Node) -> void:
	if quest_id != "" and quest_step != "":
		QuestManager.complete_step(quest_id, quest_step)
	if target_level != "":
		GameManager.load_level(target_level, target_spawn)

func _on_interact_blocked(_player: Node) -> void:
	GameManager.notify(locked_message)
	AudioManager.play_at("deny", global_position, -6.0)
