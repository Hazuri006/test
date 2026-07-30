class_name Civilian
extends Node3D
## Civilian -- a brick citizen of Brick City.
##
## Used as hostages in the bank heist and as rescue targets in side activities.
## No AI beyond three moods (calm / scared / cheering) driven procedurally, so a
## handful of them cost almost nothing.

enum Mood { CALM, SCARED, CHEERING }

var mood: Mood = Mood.CALM
var rig: EnemyRig
var _phase: float = 0.0

const PALETTES: Array[Dictionary] = [
	{"suit": Color(0.85, 0.55, 0.25), "trim": Color(0.30, 0.35, 0.55), "skin": Color(0.93, 0.79, 0.58), "accent": Color(0.95, 0.9, 0.85)},
	{"suit": Color(0.35, 0.65, 0.55), "trim": Color(0.25, 0.25, 0.30), "skin": Color(0.72, 0.53, 0.36), "accent": Color(0.9, 0.85, 0.6)},
	{"suit": Color(0.72, 0.32, 0.55), "trim": Color(0.20, 0.22, 0.32), "skin": Color(0.85, 0.68, 0.50), "accent": Color(0.95, 0.95, 0.95)},
	{"suit": Color(0.30, 0.45, 0.80), "trim": Color(0.22, 0.24, 0.28), "skin": Color(0.60, 0.42, 0.28), "accent": Color(0.9, 0.9, 0.9)},
]

func _ready() -> void:
	add_to_group("civilians")
	if rig == null:
		build(randi())

func build(seed_value: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var palette: Dictionary = PALETTES[rng.randi_range(0, PALETTES.size() - 1)]
	rig = EnemyRig.new().build(self, palette, rng.randf_range(0.9, 1.05))
	_phase = rng.randf() * TAU

func set_mood(new_mood: Mood) -> void:
	mood = new_mood
	if mood == Mood.CHEERING:
		AudioManager.play_at("reward", global_position, randf_range(1.0, 1.3), 30.0)

func _process(delta: float) -> void:
	if rig == null:
		return
	_phase += delta * (2.0 if mood == Mood.CALM else 6.0)
	var chest: Node3D = rig.bone("Chest")
	var arm_l: Node3D = rig.bone("ArmL")
	var arm_r: Node3D = rig.bone("ArmR")
	var hips: Node3D = rig.bone("Hips")

	match mood:
		Mood.CALM:
			if chest != null:
				chest.rotation.y = sin(_phase * 0.5) * 0.15
			if arm_l != null:
				arm_l.rotation.x = sin(_phase * 0.5) * 0.1
			if arm_r != null:
				arm_r.rotation.x = -sin(_phase * 0.5) * 0.1
		Mood.SCARED:
			# hands up, trembling
			if arm_l != null:
				arm_l.rotation.x = deg_to_rad(-165.0) + sin(_phase * 3.0) * 0.06
				arm_l.rotation.z = deg_to_rad(-25.0)
			if arm_r != null:
				arm_r.rotation.x = deg_to_rad(-165.0) + cos(_phase * 3.0) * 0.06
				arm_r.rotation.z = deg_to_rad(25.0)
			if chest != null:
				chest.rotation.z = sin(_phase * 5.0) * 0.05
		Mood.CHEERING:
			if arm_l != null:
				arm_l.rotation.x = deg_to_rad(-150.0) + sin(_phase) * 0.5
			if arm_r != null:
				arm_r.rotation.x = deg_to_rad(-150.0) + cos(_phase) * 0.5
			if hips != null:
				hips.position.y = 0.86 + absf(sin(_phase * 1.5)) * 0.12
			if chest != null:
				chest.rotation.z = 0.0

## Look at the hero -- used when a rescue completes.
func face(point: Vector3) -> void:
	var to_point: Vector3 = point - global_position
	to_point.y = 0.0
	if to_point.length() > 0.05:
		rotation.y = atan2(-to_point.x, -to_point.z)
