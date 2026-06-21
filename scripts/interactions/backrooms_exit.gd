class_name BackroomsExit
extends Interactable
## The way out of the Backrooms. Sealed until all three exit sigils are found
## (flag "exit_open"); using it completes the quest and rolls the escape ending.

func _setup() -> void:
	blocks_movement = true
	prompt_verb = "Step through"
	# A dark doorway cut into the yellow — wrong, and the only thing that is.
	var frame: StandardMaterial3D = MaterialLibrary.get_material("exit_frame", Color(0.05, 0.05, 0.05), 0.6, 0.2, false)
	_add_box(Vector3(0.2, 2.4, 0.3), frame, Vector3(-0.9, 1.2, 0))
	_add_box(Vector3(0.2, 2.4, 0.3), frame, Vector3(0.9, 1.2, 0))
	_add_box(Vector3(2.0, 0.2, 0.3), frame, Vector3(0, 2.4, 0))
	_add_box(Vector3(1.7, 2.3, 0.1), MaterialLibrary.get_material("exit_void2", Color(0.01, 0.01, 0.02), 1.0, 0.0, false), Vector3(0, 1.2, -0.1))
	_add_box_collision(Vector3(1.9, 2.4, 0.3), Vector3(0, 1.2, 0))

func can_interact(_player: Node) -> bool:
	return enabled and GameManager.get_flag_bool("exit_open")

func get_prompt() -> String:
	if not can_interact(null):
		return "Sealed. Find the three sigils."
	return "E — Step through the exit"

func _on_interact(_player: Node) -> void:
	QuestManager.complete_step("qb_escape", "reach_exit")
	AudioManager.play_2d("sting", -4.0)
	GameManager.show_custom_ending(
		"YOU FOUND THE WAY OUT",
		"You step through the dark doorway and the hum stops — all at once, like a held breath let go.\n\nCarpet becomes concrete. Yellow becomes grey. You are standing in a stairwell that should not exist, and through the window there is a sky.\n\nThe camcorder in your hands has filled its tape. When you play it back later, the rooms are there, and the long pale thing at the end of every corridor is there, and in the last thirty seconds — just before the exit — it is very, very close.\n\nYou got out. Most people don't.")

func _on_interact_blocked(_player: Node) -> void:
	GameManager.notify("The exit is sealed. Find the three sigils.")
	AudioManager.play_at("deny", global_position, -6.0)
