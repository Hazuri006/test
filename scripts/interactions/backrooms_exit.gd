class_name BackroomsExit
extends Interactable
## A configurable way-out. Sealed until `required_flag` is set. Using it completes a
## quest step and then either transitions to another level or rolls a custom ending.

@export var required_flag: String = "exit_open"
@export var quest_id: String = "qb_escape"
@export var quest_step: String = "reach_exit"
@export var sealed_message: String = "Sealed. Find the markers."
## If set, stepping through loads this level; otherwise it rolls the ending below.
@export var target_level: String = ""
@export var target_spawn: String = "start"
@export var ending_title: String = "YOU FOUND THE WAY OUT"
@export_multiline var ending_body: String = ""

func _setup() -> void:
	blocks_movement = true
	prompt_verb = "Step through"
	var frame: StandardMaterial3D = MaterialLibrary.get_material("exit_frame", Color(0.05, 0.05, 0.05), 0.6, 0.2, false)
	_add_box(Vector3(0.2, 2.4, 0.3), frame, Vector3(-0.9, 1.2, 0))
	_add_box(Vector3(0.2, 2.4, 0.3), frame, Vector3(0.9, 1.2, 0))
	_add_box(Vector3(2.0, 0.2, 0.3), frame, Vector3(0, 2.4, 0))
	_add_box(Vector3(1.7, 2.3, 0.1), MaterialLibrary.get_material("exit_void2", Color(0.01, 0.01, 0.02), 1.0, 0.0, false), Vector3(0, 1.2, -0.1))
	_add_box_collision(Vector3(1.9, 2.4, 0.3), Vector3(0, 1.2, 0))

func can_interact(_player: Node) -> bool:
	return enabled and (required_flag == "" or GameManager.get_flag_bool(required_flag))

func get_prompt() -> String:
	if not can_interact(null):
		return sealed_message
	return "E — Step through the exit"

func _on_interact(_player: Node) -> void:
	if quest_id != "" and quest_step != "":
		QuestManager.complete_step(quest_id, quest_step)
	AudioManager.play_2d("sting", -4.0)
	if target_level != "":
		GameManager.load_level(target_level, target_spawn)
	else:
		GameManager.show_custom_ending(ending_title, ending_body)

func _on_interact_blocked(_player: Node) -> void:
	GameManager.notify(sealed_message)
	AudioManager.play_at("deny", global_position, -6.0)
