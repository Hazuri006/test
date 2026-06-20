extends Node
## Tracks quest progression: active quest, completed steps, dynamic objective text
## and world events fired on quest milestones. Registered as the `QuestManager`
## autoload. Persists through SaveManager via to_dict()/from_dict().

signal quest_started(quest_id: String)
signal quest_completed(quest_id: String)
signal step_completed(quest_id: String, step_id: String)
signal objective_changed(quest_id: String, step_id: String, text: String)
signal journal_updated()

## quest_id -> { "completed_steps": Array[String], "completed": bool, "started": bool }
var _progress: Dictionary = {}
var active_quest_id: String = ""

func reset() -> void:
	_progress.clear()
	active_quest_id = ""
	journal_updated.emit()

## Begins a quest if it has not started yet. Side quests do not steal the active slot.
func start_quest(quest_id: String) -> void:
	if not QuestDatabase.has(quest_id):
		GameLog.warn("start_quest: unknown quest '%s'" % quest_id)
		return
	if _progress.has(quest_id) and bool((_progress[quest_id] as Dictionary).get("started", false)):
		return
	_progress[quest_id] = {"completed_steps": [] as Array, "completed": false, "started": true}
	var quest: QuestData = QuestDatabase.get_quest(quest_id)
	if not quest.is_side_quest:
		active_quest_id = quest_id
	GameLog.info("Quest started: %s" % quest.title)
	quest_started.emit(quest_id)
	journal_updated.emit()
	_emit_current_objective(quest_id)

## Marks a step complete; advances the objective and completes the quest when all
## required steps are done. Safe to call repeatedly (idempotent).
func complete_step(quest_id: String, step_id: String) -> void:
	if not QuestDatabase.has(quest_id):
		return
	if not _progress.has(quest_id):
		start_quest(quest_id)
	var entry: Dictionary = _progress[quest_id]
	if bool(entry.get("completed", false)):
		return
	var completed: Array = entry["completed_steps"]
	if completed.has(step_id):
		return
	var quest: QuestData = QuestDatabase.get_quest(quest_id)
	if quest.get_step(step_id) == null:
		GameLog.warn("complete_step: unknown step '%s' in '%s'" % [step_id, quest_id])
		return
	completed.append(step_id)
	GameLog.info("Objective complete: %s / %s" % [quest_id, step_id])
	step_completed.emit(quest_id, step_id)
	journal_updated.emit()
	if _all_required_complete(quest, completed):
		_complete_quest(quest_id)
	else:
		_emit_current_objective(quest_id)

func _complete_quest(quest_id: String) -> void:
	var entry: Dictionary = _progress[quest_id]
	entry["completed"] = true
	var quest: QuestData = QuestDatabase.get_quest(quest_id)
	GameLog.info("Quest complete: %s" % quest.title)
	quest_completed.emit(quest_id)
	journal_updated.emit()
	if quest.next_quest_id != "":
		start_quest(quest.next_quest_id)

func _all_required_complete(quest: QuestData, completed: Array) -> bool:
	for step: QuestStepData in quest.steps:
		if not step.optional and not completed.has(step.id):
			return false
	return true

func _emit_current_objective(quest_id: String) -> void:
	if quest_id != active_quest_id:
		return
	var step: QuestStepData = get_current_step(quest_id)
	if step != null:
		objective_changed.emit(quest_id, step.id, step.description)
	else:
		objective_changed.emit(quest_id, "", "")

# --- Queries -----------------------------------------------------------------

func is_step_complete(quest_id: String, step_id: String) -> bool:
	if not _progress.has(quest_id):
		return false
	return (_progress[quest_id] as Dictionary)["completed_steps"].has(step_id)

func is_quest_started(quest_id: String) -> bool:
	return _progress.has(quest_id) and bool((_progress[quest_id] as Dictionary).get("started", false))

func is_quest_complete(quest_id: String) -> bool:
	return _progress.has(quest_id) and bool((_progress[quest_id] as Dictionary).get("completed", false))

func get_active_quest() -> QuestData:
	if active_quest_id == "":
		return null
	return QuestDatabase.get_quest(active_quest_id)

## Returns the first incomplete required step of a quest (the live objective).
func get_current_step(quest_id: String) -> QuestStepData:
	var quest: QuestData = QuestDatabase.get_quest(quest_id)
	if quest == null or not _progress.has(quest_id):
		return null
	var completed: Array = (_progress[quest_id] as Dictionary)["completed_steps"]
	for step: QuestStepData in quest.steps:
		if not step.optional and not completed.has(step.id):
			return step
	return null

func get_current_objective_text() -> String:
	if active_quest_id == "":
		return ""
	var step: QuestStepData = get_current_step(active_quest_id)
	return step.description if step != null else ""

func get_completed_steps(quest_id: String) -> Array:
	if not _progress.has(quest_id):
		return []
	return ((_progress[quest_id] as Dictionary)["completed_steps"] as Array).duplicate()

## Returns ordered journal data for every started quest.
func get_journal() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for quest_id: String in QuestDatabase.ordered_ids():
		if not is_quest_started(quest_id):
			continue
		var quest: QuestData = QuestDatabase.get_quest(quest_id)
		var steps: Array[Dictionary] = []
		for step: QuestStepData in quest.steps:
			steps.append({
				"id": step.id,
				"description": step.description,
				"optional": step.optional,
				"complete": is_step_complete(quest_id, step.id),
			})
		out.append({
			"id": quest_id,
			"title": quest.title,
			"summary": quest.summary,
			"complete": is_quest_complete(quest_id),
			"active": quest_id == active_quest_id,
			"steps": steps,
		})
	return out

# --- Serialisation -----------------------------------------------------------

func to_dict() -> Dictionary:
	var progress_copy: Dictionary = {}
	for quest_id: Variant in _progress.keys():
		var entry: Dictionary = _progress[quest_id]
		progress_copy[quest_id] = {
			"completed_steps": (entry["completed_steps"] as Array).duplicate(),
			"completed": bool(entry.get("completed", false)),
			"started": bool(entry.get("started", false)),
		}
	return {"active": active_quest_id, "progress": progress_copy}

func from_dict(data: Dictionary) -> void:
	_progress.clear()
	active_quest_id = str(data.get("active", ""))
	var raw_progress: Variant = data.get("progress", {})
	if raw_progress is Dictionary:
		for quest_id: Variant in (raw_progress as Dictionary).keys():
			var entry: Variant = (raw_progress as Dictionary)[quest_id]
			if entry is Dictionary:
				var d: Dictionary = entry as Dictionary
				var steps_raw: Variant = d.get("completed_steps", [])
				var steps: Array = []
				if steps_raw is Array:
					for s: Variant in (steps_raw as Array):
						steps.append(str(s))
				_progress[str(quest_id)] = {
					"completed_steps": steps,
					"completed": bool(d.get("completed", false)),
					"started": bool(d.get("started", false)),
				}
	journal_updated.emit()
