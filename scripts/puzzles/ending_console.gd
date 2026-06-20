class_name EndingConsole
extends Interactable
## Doctor Voss's containment device. Stage 1: install the containment coil
## (prepare_containment). Stage 2: make the final choice, which resolves the ending.

@export var quest_id: String = "q5_stop"
@export var prepare_step: String = "prepare_containment"
@export var choice_step: String = "make_choice"
@export var resolve_step: String = "resolve_ending"

var _prepared: bool = false

func _setup() -> void:
	blocks_movement = true
	prompt_verb = "Prepare"
	var mat: StandardMaterial3D = MaterialLibrary.painted_metal()
	_add_box(Vector3(2.2, 1.2, 1.2), mat, Vector3(0, 0.6, 0))
	_add_box(Vector3(0.6, 1.6, 0.6), MaterialLibrary.rusted_metal(), Vector3(0, 1.6, 0))
	_add_box(Vector3(0.9, 0.5, 0.1), MaterialLibrary.monitor_screen(), Vector3(0, 1.0, 0.62))
	# A caged lattice core that glows once primed.
	_add_box(Vector3(0.5, 0.5, 0.5), MaterialLibrary.get_emissive("lattice_core", Color(0.5, 0.35, 0.15), 1.2), Vector3(0, 2.2, 0))
	_add_box_collision(Vector3(2.3, 1.3, 1.3), Vector3(0, 0.65, 0))

func get_prompt() -> String:
	if not _prepared:
		if GameManager.inventory.has_item("containment_coil"):
			return "E — Install containment coil"
		return "Needs a containment coil"
	return "E — Use the containment device"

func can_interact(_player: Node) -> bool:
	if not enabled:
		return false
	if not _prepared:
		return GameManager.inventory.has_item("containment_coil")
	return true

func _on_interact(_player: Node) -> void:
	if not _prepared:
		GameManager.inventory.remove_item("containment_coil", 1)
		_prepared = true
		GameManager.set_flag("containment_ready", true)
		QuestManager.complete_step(quest_id, prepare_step)
		GameManager.notify("The containment device hums. It is primed.")
		AudioManager.play_2d("hum", -8.0)
		return
	GameManager.open_ending_choice(_on_choice)

func _on_choice(choice: String) -> void:
	QuestManager.complete_step(quest_id, choice_step)
	QuestManager.complete_step(quest_id, resolve_step)
	GameManager.resolve_ending(choice)

func _on_interact_blocked(_player: Node) -> void:
	GameManager.notify("You need the containment coil from the lab.")
	AudioManager.play_at("deny", global_position, -6.0)
