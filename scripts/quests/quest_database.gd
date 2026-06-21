class_name QuestDatabase
extends RefCounted
## Builds the five main quests (section 4 of the design brief) as QuestData
## resources. Code is the source of truth; the structure mirrors the in-world
## progression so level scripts can call QuestManager.complete_step() with these ids.

static var _quests: Dictionary = {}
static var _order: Array[String] = []
static var _initialised: bool = false

static func _ensure_initialised() -> void:
	if _initialised:
		return
	_initialised = true
	_build()

static func _build() -> void:
	# Backrooms escape (the default campaign after the no-clip).
	_add("qb_escape", "Escape the Backrooms",
		"You no-clipped through a wall and fell out of reality into the yellow rooms. The hum never stops. Something else is in here with you. Find a way out.",
		[
			["no_clip", "Get your bearings in the rooms", false],
			["find_sigils", "Find the three exit sigils", false],
			["reach_exit", "Reach the exit and no-clip back out", false],
		], "")

	_add("q1_enter", "Enter the Hospital",
		"The storm sealed the road behind you. Find a way inside Saint Veyra before the night does.",
		[
			["cross_forest", "Cross the forest to the hospital gate", false],
			["reach_gate", "Find a way past the locked main gate", false],
			["enter_maintenance", "Enter through the maintenance building", false],
			["get_flashlight", "Find a working flashlight", false],
			["reach_reception", "Reach the reception hall", false],
		], "q2_power")

	_add("q2_power", "Restore Emergency Power",
		"The hospital is dead and dark. Bring the emergency generator back online.",
		[
			["find_map", "Find the electrical map", false],
			["find_fuse_a", "Recover Generator Fuse A", false],
			["find_fuse_b", "Recover Generator Fuse B", false],
			["collect_fuel", "Collect a can of fuel", false],
			["repair_generator", "Repair the basement generator", false],
			["activate_power", "Activate emergency power", false],
		], "q3_records")

	_add("q3_records", "Find Lena's Records",
		"Lena was here. The archive will know who she became a patient — and why.",
		[
			["reach_archive", "Reach the archive room", false],
			["find_archive_key", "Find the archive key", false],
			["search_records", "Search the patient records", false],
			["decode_file", "Decode Lena's file number on the keypad", false],
			["play_recording", "Play Lena's audio recording", false],
		], "q4_lower")

	_add("q4_lower", "Open the Lower Ward",
		"Everything Lena feared is below. The lower ward is sealed for a reason — open it anyway.",
		[
			["find_seals", "Collect the three security access seals", false],
			["disable_lockdown", "Disable the security lockdown", false],
			["explore_morgue", "Search the morgue for the lower-ward route", false],
			["survive_encounter", "Survive the Hollow Attendant", false],
			["enter_underground", "Enter the underground section", false],
		], "q5_stop")

	_add("q5_stop", "Stop the Experiment",
		"Doctor Voss never finished. You will. One way or another.",
		[
			["find_lab", "Find Doctor Voss's laboratory", false],
			["recover_final", "Recover Lena's final recording", false],
			["prepare_containment", "Prepare the containment device", false],
			["make_choice", "Decide the fate of the experiment", false],
			["resolve_ending", "Escape, or confront the truth", false],
		], "")

static func _add(id: String, title: String, summary: String, steps: Array, next_id: String) -> void:
	var quest: QuestData = QuestData.new()
	quest.id = id
	quest.title = title
	quest.summary = summary
	quest.next_quest_id = next_id
	for entry: Array in steps:
		var step: QuestStepData = QuestStepData.new()
		step.id = str(entry[0])
		step.description = str(entry[1])
		step.optional = bool(entry[2])
		quest.steps.append(step)
	_quests[id] = quest
	_order.append(id)

static func get_quest(id: String) -> QuestData:
	_ensure_initialised()
	if _quests.has(id):
		return _quests[id] as QuestData
	return null

static func has(id: String) -> bool:
	_ensure_initialised()
	return _quests.has(id)

static func first_quest_id() -> String:
	_ensure_initialised()
	return _order[0] if not _order.is_empty() else ""

static func ordered_ids() -> Array[String]:
	_ensure_initialised()
	return _order.duplicate()
