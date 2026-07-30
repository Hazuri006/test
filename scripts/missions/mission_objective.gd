class_name MissionObjective
extends Resource
## One step of a mission.
##
## Objectives are deliberately dumb data + a counter. The mission controller
## scripts (mission_tutorial.gd, mission_bank_heist.gd, ...) decide when to
## increment them, which keeps mission logic readable and objectives reusable.
##
## Kinds:
##   REACH    -> walk/swing into a marked spot
##   DEFEAT   -> take out N enemies
##   ACTION   -> perform an input or interaction N times (tutorial steps)
##   SURVIVE  -> stay alive / hold out for `target` seconds
##   ESCORT   -> keep something alive
##   CUSTOM   -> anything scripted

enum Kind { REACH, DEFEAT, ACTION, SURVIVE, ESCORT, CUSTOM }

@export var text: String = ""
@export var kind: Kind = Kind.CUSTOM
@export var target: int = 1
@export var progress: int = 0
@export var marker_position: Vector3 = Vector3.ZERO
@export var has_marker: bool = false
@export var optional: bool = false
@export var completed: bool = false

func _init(objective_text: String = "", objective_kind: Kind = Kind.CUSTOM,
		objective_target: int = 1, marker: Variant = null) -> void:
	text = objective_text
	kind = objective_kind
	target = maxi(objective_target, 1)
	if marker != null and typeof(marker) == TYPE_VECTOR3:
		marker_position = marker
		has_marker = true

## Returns true when this call completed the objective.
func add_progress(amount: int = 1) -> bool:
	if completed:
		return false
	progress = clampi(progress + amount, 0, target)
	if progress >= target:
		completed = true
		return true
	return false

func force_complete() -> void:
	progress = target
	completed = true

func reset() -> void:
	progress = 0
	completed = false

## Text shown in the HUD, with a counter when there is more than one step.
func display_text() -> String:
	if target > 1:
		return "%s  (%d/%d)" % [text, progress, target]
	return text
