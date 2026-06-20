class_name GeneratorPuzzle
extends Interactable
## Puzzle 1 — the basement generator. Two stages: install both fuses + fuel, then
## start it. Starting it sets the power flag that lights the hospital and wakes the
## Hollow Attendant. Incorrect/incomplete attempts flicker the lights.

@export var quest_id: String = "q2_power"
@export var install_step: String = "repair_generator"
@export var start_step: String = "activate_power"
@export var power_flag: String = "power_on"

const REQUIRED: PackedStringArray = ["generator_fuse_a", "generator_fuse_b", "fuel_can"]

var _installed: bool = false
var _started: bool = false

func _setup() -> void:
	blocks_movement = true
	prompt_verb = "Install"
	persistent_id = "basement_generator"
	var mat: StandardMaterial3D = MaterialLibrary.painted_metal()
	_add_box(Vector3(1.8, 1.4, 1.0), mat, Vector3(0, 0.7, 0))
	_add_box(Vector3(0.4, 0.5, 0.4), MaterialLibrary.rusted_metal(), Vector3(0.7, 1.6, 0))
	# Two fuse slots.
	_add_box(Vector3(0.18, 0.18, 0.1), MaterialLibrary.rusted_metal(), Vector3(-0.4, 1.0, 0.52))
	_add_box(Vector3(0.18, 0.18, 0.1), MaterialLibrary.rusted_metal(), Vector3(0.0, 1.0, 0.52))
	_add_box_collision(Vector3(1.9, 1.5, 1.1), Vector3(0, 0.75, 0))

func can_interact(_player: Node) -> bool:
	return enabled and not _started

func get_prompt() -> String:
	if _started:
		return "Generator running"
	if not _installed:
		var missing: Array[String] = _missing_items()
		if not missing.is_empty():
			return "Requires: %s" % ", ".join(missing)
		return "E — Install fuses and fuel"
	return "E — Start generator"

func _missing_items() -> Array[String]:
	var missing: Array[String] = []
	for id: String in REQUIRED:
		if not GameManager.inventory.has_item(id):
			var data: ItemData = ItemDatabase.get_item(id)
			missing.append(data.display_name if data != null else id)
	return missing

func _on_interact(_player: Node) -> void:
	if not _installed:
		if not _missing_items().is_empty():
			_fail_flicker()
			return
		for id: String in REQUIRED:
			GameManager.inventory.remove_item(id, 1)
		_installed = true
		GameManager.set_flag("generator_installed", true)
		QuestManager.complete_step(quest_id, install_step)
		GameManager.notify("Fuses seated. Fuel in. Just need to start it.")
		AudioManager.play_at("metal", global_position, -3.0)
		prompt_verb = "Start"
		_save_state()
		return
	# Start it.
	_started = true
	GameManager.set_flag(power_flag, true)
	QuestManager.complete_step(quest_id, start_step)
	AudioManager.play_at("door", global_position, -1.0)
	AudioManager.play_2d("hum", -10.0)
	GameManager.notify("Power restored. The hospital hums back to life.")
	EventManager.trigger_event("power_restored", {"position": global_position}, 1.0, true)
	enabled = false
	_save_state()

func _fail_flicker() -> void:
	AudioManager.play_at("deny", global_position, -4.0)
	EventManager.trigger_event("light_flicker", {}, 1.0, false)

func _capture_state() -> Variant:
	return {"installed": _installed, "started": _started}

func _restore_state(data: Variant) -> void:
	if data is Dictionary:
		var d: Dictionary = data as Dictionary
		_installed = bool(d.get("installed", false))
		_started = bool(d.get("started", false))
		if _started:
			enabled = false
		elif _installed:
			prompt_verb = "Start"
