class_name QuestData
extends Resource
## A main or side quest: an ordered list of objective steps.

@export var id: String = ""
@export var title: String = "Untitled Quest"
@export_multiline var summary: String = ""
@export var steps: Array[QuestStepData] = []
## Quest that automatically activates when this one completes ("" = none).
@export var next_quest_id: String = ""
## Side quests are listed separately in the journal and never block the ending.
@export var is_side_quest: bool = false

## Returns the step with the given id, or null if it does not exist.
func get_step(step_id: String) -> QuestStepData:
	for step: QuestStepData in steps:
		if step.id == step_id:
			return step
	return null

## Returns the index of a step id, or -1 if not found.
func index_of(step_id: String) -> int:
	for i: int in range(steps.size()):
		if steps[i].id == step_id:
			return i
	return -1
