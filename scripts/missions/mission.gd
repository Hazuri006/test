class_name Mission
extends Resource
## A mission: identifier, presentation text, ordered objectives, state, reward.
##
## Missions are pure data + progress. The scripted behaviour lives in a
## controller node (see scripts/missions/mission_*.gd) that reacts to
## MissionManager signals. That split means a mission can be restarted, saved,
## or replayed without the data and the staging getting out of sync.

enum State { NOT_STARTED, ACTIVE, COMPLETED, FAILED }

@export var id: String = ""
@export var title: String = ""
@export var description: String = ""
@export var reward: int = 250
@export var state: State = State.NOT_STARTED
@export var objectives: Array[MissionObjective] = []
@export var current_index: int = 0
## Optional world position that triggers the mission when the hero gets close.
@export var trigger_position: Vector3 = Vector3.ZERO
@export var trigger_radius: float = 0.0
@export var is_side_activity: bool = false
@export var district: String = ""

func _init(mission_id: String = "", mission_title: String = "",
		mission_description: String = "", mission_reward: int = 250) -> void:
	id = mission_id
	title = mission_title
	description = mission_description
	reward = mission_reward

func add_objective(objective: MissionObjective) -> Mission:
	objectives.append(objective)
	return self

func current_objective() -> MissionObjective:
	if current_index >= 0 and current_index < objectives.size():
		return objectives[current_index]
	return null

func objective_count() -> int:
	return objectives.size()

func is_active() -> bool:
	return state == State.ACTIVE

func is_completed() -> bool:
	return state == State.COMPLETED

## Advances to the next unfinished objective. Returns true when the whole
## mission is finished.
func advance() -> bool:
	while current_index < objectives.size() and objectives[current_index].completed:
		current_index += 1
	return current_index >= objectives.size()

func reset() -> void:
	state = State.NOT_STARTED
	current_index = 0
	for objective in objectives:
		objective.reset()

func has_marker() -> bool:
	var objective := current_objective()
	return objective != null and objective.has_marker

func marker_position() -> Vector3:
	var objective := current_objective()
	return objective.marker_position if objective != null else Vector3.ZERO

func progress_text() -> String:
	var objective := current_objective()
	if objective == null:
		return title
	return objective.display_text()
