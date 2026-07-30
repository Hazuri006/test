extends Node3D
## PlayerAnimator -- node name "Visual", child of Player.
##
## Builds the hero rig, AUTHORS EVERY ANIMATION IN CODE (there are no imported
## animation files), registers them on an AnimationPlayer and drives them through
## an AnimationTree state machine so all transitions cross-fade.
##
## Why a code-built AnimationTree: the project ships zero binary assets, and a
## generated state machine with all-pairs transitions means `travel()` always has
## a one-step blend available -- no pops, no missing-transition warnings.
##
## After the tree has evaluated each frame (process_priority 50 puts us last) we
## apply light procedural overrides on top: arm aiming at the web anchor, body
## lean from velocity, and head look. That is the cheap version of a look-at
## rig and it makes the hero feel alive during swings.
##
## Scene requirements (created by this script, nothing to author by hand):
##   Visual (this node)
##     Rig (built by PlayerRig)
##     AnimationPlayer   root_node = ".." -> Visual
##     AnimationTree     anim_player = AnimationPlayer, active = true
##
## Inspector parameters: lean_strength, aim_blend_speed, extra_smoothing.

@export var lean_strength: float = 9.0
@export var aim_blend_speed: float = 12.0
@export var head_look_strength: float = 0.55

var rig: PlayerRig
var anim_player: AnimationPlayer
var anim_tree: AnimationTree
var playback: AnimationNodeStateMachinePlayback

var _state: String = "idle"
var _aim_weight: float = 0.0
var _aim_target: Vector3 = Vector3.ZERO
var _aim_hand_right: bool = true
var _lean: Vector2 = Vector2.ZERO      ## x = pitch lean, y = roll lean
var _look_target: Vector3 = Vector3.ZERO
var _look_weight: float = 0.0

## Cross-fade duration per destination state. Snappy for attacks, smooth for
## locomotion -- this single dictionary is the whole "animation feel" tuning.
const XFADE := {
	"idle": 0.18, "walk": 0.16, "run": 0.16, "jump": 0.08, "double_jump": 0.06,
	"fall": 0.14, "land": 0.07, "swing": 0.14, "trick": 0.06, "wall_climb": 0.12,
	"wall_run": 0.10, "zip": 0.08, "attack_a": 0.05, "attack_b": 0.05,
	"attack_c": 0.06, "attack_heavy": 0.07, "air_attack": 0.06, "web_shoot": 0.05,
	"dodge": 0.06, "hurt": 0.05, "victory": 0.2, "defeat": 0.15,
}

func _ready() -> void:
	process_priority = 50
	rig = PlayerRig.new().build(self)
	_build_animation_player()
	_build_animation_tree()

# =============================================================================
#  PUBLIC API (called by Player / PlayerCombat / WebSystem)
# =============================================================================

## Requests a state; ignored if already there. Always cross-fades.
func play_state(state_name: String) -> void:
	if _state == state_name or playback == null:
		return
	if not XFADE.has(state_name):
		return
	_state = state_name
	playback.travel(state_name)

func current_state() -> String:
	return _state

## Restarts a one-shot state (needed for repeated jabs of the same combo step).
func restart_state(state_name: String) -> void:
	if playback == null:
		return
	_state = state_name
	playback.start(state_name)

func set_speed_scale(scale: float) -> void:
	if anim_tree != null:
		anim_tree.set("parameters/TimeScale/scale", clampf(scale, 0.2, 2.5))

## Point one arm at a world position (web shots, swinging, boss grapples).
func aim_arm_at(world_pos: Vector3, right_hand: bool = true, weight: float = 1.0) -> void:
	_aim_target = world_pos
	_aim_hand_right = right_hand
	_aim_weight = clampf(weight, 0.0, 1.0)

func clear_arm_aim() -> void:
	_aim_weight = 0.0

## Body lean, fed from the player's horizontal velocity in local space.
func set_lean(forward_amount: float, side_amount: float) -> void:
	_lean = Vector2(forward_amount, side_amount)

func look_at_point(world_pos: Vector3, weight: float = 1.0) -> void:
	_look_target = world_pos
	_look_weight = clampf(weight, 0.0, 1.0)

func web_origin(right_hand: bool = true) -> Node3D:
	return rig.web_origin(right_hand)

# =============================================================================
#  PROCEDURAL OVERRIDES (run after the AnimationTree has written its pose)
# =============================================================================

func _process(delta: float) -> void:
	var chest: Node3D = rig.bone("Chest")
	var head: Node3D = rig.bone("Head")

	# --- body lean ----------------------------------------------------------
	if chest != null:
		var target_pitch := deg_to_rad(-_lean.x * lean_strength)
		var target_roll := deg_to_rad(-_lean.y * lean_strength)
		chest.rotation.x = lerpf(chest.rotation.x, chest.rotation.x + target_pitch, 0.5)
		chest.rotation.z = lerpf(chest.rotation.z, chest.rotation.z + target_roll, 0.5)

	# --- arm aiming ---------------------------------------------------------
	var tag := "R" if _aim_hand_right else "L"
	var arm: Node3D = rig.bone("Arm%s" % tag)
	var fore: Node3D = rig.bone("Forearm%s" % tag)
	if arm != null and _aim_weight > 0.001:
		# Build the shoulder->target direction in the arm parent's space, then
		# rotate the "down" axis of the limb onto it.
		var parent := arm.get_parent() as Node3D
		var local_dir: Vector3 = (parent.global_transform.affine_inverse()
				* _aim_target - arm.position).normalized()
		var wanted := _basis_pointing_down(local_dir)
		arm.quaternion = arm.quaternion.slerp(wanted.get_rotation_quaternion(),
				clampf(aim_blend_speed * delta, 0.0, 1.0) * _aim_weight)
		if fore != null:
			# Straighten the elbow while aiming.
			fore.quaternion = fore.quaternion.slerp(Quaternion.IDENTITY,
					clampf(aim_blend_speed * delta, 0.0, 1.0) * _aim_weight)

	# --- head look ----------------------------------------------------------
	if head != null and _look_weight > 0.001:
		var hp := head.get_parent() as Node3D
		var d: Vector3 = (hp.global_transform.affine_inverse() * _look_target - head.position)
		if d.length() > 0.01:
			d = d.normalized()
			var yaw: float = clampf(atan2(d.x, d.z), -1.0, 1.0)
			var pitch: float = clampf(-asin(clampf(d.y, -1.0, 1.0)), -0.7, 0.7)
			head.rotation.y = lerpf(head.rotation.y, yaw * head_look_strength, 0.25 * _look_weight)
			head.rotation.x = lerpf(head.rotation.x, pitch * head_look_strength, 0.25 * _look_weight)

## Basis whose -Y axis points along `dir` (limbs hang downwards in the rig).
func _basis_pointing_down(dir: Vector3) -> Basis:
	var down := dir.normalized()
	var reference := Vector3.FORWARD
	if absf(down.dot(reference)) > 0.95:
		reference = Vector3.RIGHT
	var x_axis := reference.cross(down).normalized()
	var z_axis := down.cross(x_axis).normalized()
	return Basis(x_axis, -down, z_axis)

# =============================================================================
#  ANIMATION AUTHORING
# =============================================================================

func _build_animation_player() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "AnimationPlayer"
	add_child(anim_player)
	anim_player.root_node = NodePath("..")   # -> this Visual node

	var lib := AnimationLibrary.new()
	for entry in _animation_set():
		lib.add_animation(entry[0], entry[1])
	anim_player.add_animation_library("", lib)

## Returns [[name, Animation], ...]. Every clip is generated from keyframes in
## degrees for readability, converted to radians when the track is written.
func _animation_set() -> Array:
	var out: Array = []

	# ---------------------------------------------------------------- idle ---
	out.append(["idle", _clip(2.6, true, {
		"Hips:position": [[0.0, Vector3(0, 0.92, 0)], [1.3, Vector3(0, 0.905, 0)], [2.6, Vector3(0, 0.92, 0)]],
		"Hips:rotation": [[0.0, _d(0, 3, 0)], [1.3, _d(0, -3, 0)], [2.6, _d(0, 3, 0)]],
		"Chest:rotation": [[0.0, _d(-2, -2, 0)], [1.3, _d(1, 2, 0)], [2.6, _d(-2, -2, 0)]],
		"Head:rotation": [[0.0, _d(2, 6, 0)], [1.3, _d(-1, -5, 0)], [2.6, _d(2, 6, 0)]],
		"ArmL:rotation": [[0.0, _d(4, 0, -7)], [1.3, _d(-3, 0, -10)], [2.6, _d(4, 0, -7)]],
		"ArmR:rotation": [[0.0, _d(-3, 0, 7)], [1.3, _d(4, 0, 10)], [2.6, _d(-3, 0, 7)]],
		"ForearmL:rotation": [[0.0, _d(-12, 0, 0)], [1.3, _d(-18, 0, 0)], [2.6, _d(-12, 0, 0)]],
		"ForearmR:rotation": [[0.0, _d(-15, 0, 0)], [1.3, _d(-10, 0, 0)], [2.6, _d(-15, 0, 0)]],
		"LegL:rotation": [[0.0, _d(0, 0, 2)], [2.6, _d(0, 0, 2)]],
		"LegR:rotation": [[0.0, _d(0, 0, -2)], [2.6, _d(0, 0, -2)]],
	})])

	# ---------------------------------------------------------------- walk ---
	out.append(["walk", _clip(1.0, true, {
		"Hips:position": [[0.0, Vector3(0, 0.92, 0)], [0.25, Vector3(0, 0.95, 0)],
			[0.5, Vector3(0, 0.92, 0)], [0.75, Vector3(0, 0.95, 0)], [1.0, Vector3(0, 0.92, 0)]],
		"Hips:rotation": [[0.0, _d(0, 8, 0)], [0.5, _d(0, -8, 0)], [1.0, _d(0, 8, 0)]],
		"Chest:rotation": [[0.0, _d(4, -8, 0)], [0.5, _d(4, 8, 0)], [1.0, _d(4, -8, 0)]],
		"LegL:rotation": [[0.0, _d(26, 0, 0)], [0.5, _d(-22, 0, 0)], [1.0, _d(26, 0, 0)]],
		"LegR:rotation": [[0.0, _d(-22, 0, 0)], [0.5, _d(26, 0, 0)], [1.0, _d(-22, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-8, 0, 0)], [0.25, _d(-40, 0, 0)], [0.5, _d(-4, 0, 0)], [1.0, _d(-8, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-4, 0, 0)], [0.5, _d(-8, 0, 0)], [0.75, _d(-40, 0, 0)], [1.0, _d(-4, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-26, 0, -6)], [0.5, _d(24, 0, -6)], [1.0, _d(-26, 0, -6)]],
		"ArmR:rotation": [[0.0, _d(24, 0, 6)], [0.5, _d(-26, 0, 6)], [1.0, _d(24, 0, 6)]],
		"ForearmL:rotation": [[0.0, _d(-14, 0, 0)], [0.5, _d(-26, 0, 0)], [1.0, _d(-14, 0, 0)]],
		"ForearmR:rotation": [[0.0, _d(-26, 0, 0)], [0.5, _d(-14, 0, 0)], [1.0, _d(-26, 0, 0)]],
	})])

	# ----------------------------------------------------------------- run ---
	out.append(["run", _clip(0.66, true, {
		"Hips:position": [[0.0, Vector3(0, 0.90, 0)], [0.165, Vector3(0, 0.97, 0)],
			[0.33, Vector3(0, 0.90, 0)], [0.495, Vector3(0, 0.97, 0)], [0.66, Vector3(0, 0.90, 0)]],
		"Hips:rotation": [[0.0, _d(0, 12, 0)], [0.33, _d(0, -12, 0)], [0.66, _d(0, 12, 0)]],
		"Chest:rotation": [[0.0, _d(16, -12, 0)], [0.33, _d(16, 12, 0)], [0.66, _d(16, -12, 0)]],
		"Head:rotation": [[0.0, _d(-12, 0, 0)], [0.66, _d(-12, 0, 0)]],
		"LegL:rotation": [[0.0, _d(48, 0, 0)], [0.33, _d(-38, 0, 0)], [0.66, _d(48, 0, 0)]],
		"LegR:rotation": [[0.0, _d(-38, 0, 0)], [0.33, _d(48, 0, 0)], [0.66, _d(-38, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-20, 0, 0)], [0.16, _d(-78, 0, 0)], [0.33, _d(-6, 0, 0)], [0.66, _d(-20, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-6, 0, 0)], [0.33, _d(-20, 0, 0)], [0.49, _d(-78, 0, 0)], [0.66, _d(-6, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-58, 0, -10)], [0.33, _d(44, 0, -10)], [0.66, _d(-58, 0, -10)]],
		"ArmR:rotation": [[0.0, _d(44, 0, 10)], [0.33, _d(-58, 0, 10)], [0.66, _d(44, 0, 10)]],
		"ForearmL:rotation": [[0.0, _d(-62, 0, 0)], [0.33, _d(-34, 0, 0)], [0.66, _d(-62, 0, 0)]],
		"ForearmR:rotation": [[0.0, _d(-34, 0, 0)], [0.33, _d(-62, 0, 0)], [0.66, _d(-34, 0, 0)]],
	})])

	# ---------------------------------------------------------------- jump ---
	out.append(["jump", _clip(0.5, false, {
		"Hips:position": [[0.0, Vector3(0, 0.80, 0)], [0.1, Vector3(0, 0.96, 0)], [0.5, Vector3(0, 0.93, 0)]],
		"Chest:rotation": [[0.0, _d(14, 0, 0)], [0.14, _d(-8, 0, 0)], [0.5, _d(-2, 0, 0)]],
		"LegL:rotation": [[0.0, _d(40, 0, 0)], [0.16, _d(-16, 0, 0)], [0.5, _d(10, 0, 0)]],
		"LegR:rotation": [[0.0, _d(40, 0, 0)], [0.16, _d(-10, 0, 0)], [0.5, _d(-14, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-70, 0, 0)], [0.2, _d(-10, 0, 0)], [0.5, _d(-30, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-70, 0, 0)], [0.2, _d(-6, 0, 0)], [0.5, _d(-14, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(30, 0, -20)], [0.16, _d(-140, 0, -30)], [0.5, _d(-100, 0, -26)]],
		"ArmR:rotation": [[0.0, _d(30, 0, 20)], [0.16, _d(-140, 0, 30)], [0.5, _d(-100, 0, 26)]],
		"ForearmL:rotation": [[0.0, _d(-40, 0, 0)], [0.5, _d(-20, 0, 0)]],
		"ForearmR:rotation": [[0.0, _d(-40, 0, 0)], [0.5, _d(-20, 0, 0)]],
	})])

	# --------------------------------------------------------- double jump ---
	# A full forward flip: the signature "I meant to do that" move.
	out.append(["double_jump", _clip(0.62, false, {
		"Hips:rotation": [[0.0, _d(0, 0, 0)], [0.5, _d(-320, 0, 0)], [0.62, _d(-360, 0, 0)]],
		"Chest:rotation": [[0.0, _d(20, 0, 0)], [0.3, _d(34, 0, 0)], [0.62, _d(0, 0, 0)]],
		"LegL:rotation": [[0.0, _d(50, 0, 0)], [0.3, _d(70, 0, 0)], [0.62, _d(6, 0, 0)]],
		"LegR:rotation": [[0.0, _d(50, 0, 0)], [0.3, _d(60, 0, 0)], [0.62, _d(-6, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-80, 0, 0)], [0.3, _d(-110, 0, 0)], [0.62, _d(-16, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-80, 0, 0)], [0.3, _d(-110, 0, 0)], [0.62, _d(-16, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-120, 0, -40)], [0.3, _d(-40, 0, -70)], [0.62, _d(-90, 0, -30)]],
		"ArmR:rotation": [[0.0, _d(-120, 0, 40)], [0.3, _d(-40, 0, 70)], [0.62, _d(-90, 0, 30)]],
	})])

	# ---------------------------------------------------------------- fall ---
	out.append(["fall", _clip(1.2, true, {
		"Hips:rotation": [[0.0, _d(-6, 4, 0)], [0.6, _d(-3, -4, 0)], [1.2, _d(-6, 4, 0)]],
		"Chest:rotation": [[0.0, _d(-10, 0, 0)], [0.6, _d(-16, 0, 0)], [1.2, _d(-10, 0, 0)]],
		"Head:rotation": [[0.0, _d(12, 0, 0)], [1.2, _d(12, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-150, 0, -34)], [0.6, _d(-160, 0, -44)], [1.2, _d(-150, 0, -34)]],
		"ArmR:rotation": [[0.0, _d(-150, 0, 34)], [0.6, _d(-160, 0, 44)], [1.2, _d(-150, 0, 34)]],
		"ForearmL:rotation": [[0.0, _d(-30, 0, 0)], [1.2, _d(-30, 0, 0)]],
		"ForearmR:rotation": [[0.0, _d(-30, 0, 0)], [1.2, _d(-30, 0, 0)]],
		"LegL:rotation": [[0.0, _d(-16, 0, 0)], [0.6, _d(-6, 0, 0)], [1.2, _d(-16, 0, 0)]],
		"LegR:rotation": [[0.0, _d(18, 0, 0)], [0.6, _d(8, 0, 0)], [1.2, _d(18, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-24, 0, 0)], [1.2, _d(-24, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-40, 0, 0)], [1.2, _d(-40, 0, 0)]],
	})])

	# ---------------------------------------------------------------- land ---
	out.append(["land", _clip(0.42, false, {
		"Hips:position": [[0.0, Vector3(0, 0.86, 0)], [0.1, Vector3(0, 0.66, 0)], [0.42, Vector3(0, 0.92, 0)]],
		"Chest:rotation": [[0.0, _d(6, 0, 0)], [0.1, _d(26, 0, 0)], [0.42, _d(0, 0, 0)]],
		"LegL:rotation": [[0.0, _d(20, 0, 0)], [0.1, _d(52, 0, 0)], [0.42, _d(0, 0, 0)]],
		"LegR:rotation": [[0.0, _d(20, 0, 0)], [0.1, _d(52, 0, 0)], [0.42, _d(0, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-30, 0, 0)], [0.1, _d(-96, 0, 0)], [0.42, _d(0, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-30, 0, 0)], [0.1, _d(-96, 0, 0)], [0.42, _d(0, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-90, 0, -30)], [0.1, _d(30, 0, -50)], [0.42, _d(0, 0, -8)]],
		"ArmR:rotation": [[0.0, _d(-90, 0, 30)], [0.1, _d(30, 0, 50)], [0.42, _d(0, 0, 8)]],
	})])

	# --------------------------------------------------------------- swing ---
	# Right arm holds the line overhead, body arched, legs trailing and drifting.
	out.append(["swing", _clip(1.8, true, {
		"Hips:rotation": [[0.0, _d(-16, 6, 4)], [0.9, _d(-10, -6, -4)], [1.8, _d(-16, 6, 4)]],
		"Chest:rotation": [[0.0, _d(-14, -6, 0)], [0.9, _d(-20, 6, 0)], [1.8, _d(-14, -6, 0)]],
		"Head:rotation": [[0.0, _d(16, 0, 0)], [0.9, _d(20, 0, 0)], [1.8, _d(16, 0, 0)]],
		"ArmR:rotation": [[0.0, _d(172, 0, 8)], [0.9, _d(176, 0, 14)], [1.8, _d(172, 0, 8)]],
		"ForearmR:rotation": [[0.0, _d(-6, 0, 0)], [1.8, _d(-6, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-40, 0, -56)], [0.9, _d(-60, 0, -40)], [1.8, _d(-40, 0, -56)]],
		"ForearmL:rotation": [[0.0, _d(-50, 0, 0)], [0.9, _d(-30, 0, 0)], [1.8, _d(-50, 0, 0)]],
		"LegL:rotation": [[0.0, _d(-30, 0, 6)], [0.9, _d(-14, 0, 10)], [1.8, _d(-30, 0, 6)]],
		"LegR:rotation": [[0.0, _d(-6, 0, -6)], [0.9, _d(-26, 0, -10)], [1.8, _d(-6, 0, -6)]],
		"ShinL:rotation": [[0.0, _d(-56, 0, 0)], [0.9, _d(-30, 0, 0)], [1.8, _d(-56, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-24, 0, 0)], [0.9, _d(-60, 0, 0)], [1.8, _d(-24, 0, 0)]],
	})])

	# --------------------------------------------------------------- trick ---
	# Air acrobatics: barrel roll with a tuck.
	out.append(["trick", _clip(0.8, false, {
		"Hips:rotation": [[0.0, _d(0, 0, 0)], [0.4, _d(-20, 180, 190)], [0.8, _d(0, 360, 360)]],
		"Chest:rotation": [[0.0, _d(10, 0, 0)], [0.4, _d(30, 0, 0)], [0.8, _d(0, 0, 0)]],
		"LegL:rotation": [[0.0, _d(30, 0, 0)], [0.4, _d(76, 0, 0)], [0.8, _d(0, 0, 0)]],
		"LegR:rotation": [[0.0, _d(30, 0, 0)], [0.4, _d(64, 0, 0)], [0.8, _d(0, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-40, 0, 0)], [0.4, _d(-120, 0, 0)], [0.8, _d(-10, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-40, 0, 0)], [0.4, _d(-120, 0, 0)], [0.8, _d(-10, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-80, 0, -50)], [0.4, _d(-20, 0, -90)], [0.8, _d(-90, 0, -30)]],
		"ArmR:rotation": [[0.0, _d(-80, 0, 50)], [0.4, _d(-20, 0, 90)], [0.8, _d(-90, 0, 30)]],
	})])

	# ---------------------------------------------------------- wall climb ---
	out.append(["wall_climb", _clip(0.9, true, {
		"Hips:rotation": [[0.0, _d(10, 4, 0)], [0.45, _d(10, -4, 0)], [0.9, _d(10, 4, 0)]],
		"Chest:rotation": [[0.0, _d(8, -8, 0)], [0.45, _d(8, 8, 0)], [0.9, _d(8, -8, 0)]],
		"Head:rotation": [[0.0, _d(-24, 0, 0)], [0.9, _d(-24, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(168, 0, -12)], [0.45, _d(96, 0, -22)], [0.9, _d(168, 0, -12)]],
		"ArmR:rotation": [[0.0, _d(96, 0, 22)], [0.45, _d(168, 0, 12)], [0.9, _d(96, 0, 22)]],
		"ForearmL:rotation": [[0.0, _d(-14, 0, 0)], [0.45, _d(-56, 0, 0)], [0.9, _d(-14, 0, 0)]],
		"ForearmR:rotation": [[0.0, _d(-56, 0, 0)], [0.45, _d(-14, 0, 0)], [0.9, _d(-56, 0, 0)]],
		"LegL:rotation": [[0.0, _d(-8, 0, 0)], [0.45, _d(44, 0, 0)], [0.9, _d(-8, 0, 0)]],
		"LegR:rotation": [[0.0, _d(44, 0, 0)], [0.45, _d(-8, 0, 0)], [0.9, _d(44, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-10, 0, 0)], [0.45, _d(-72, 0, 0)], [0.9, _d(-10, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-72, 0, 0)], [0.45, _d(-10, 0, 0)], [0.9, _d(-72, 0, 0)]],
	})])

	# ------------------------------------------------------------ wall run ---
	out.append(["wall_run", _clip(0.5, true, {
		"Hips:rotation": [[0.0, _d(0, 0, 22)], [0.25, _d(0, 0, 26)], [0.5, _d(0, 0, 22)]],
		"Chest:rotation": [[0.0, _d(12, -10, 6)], [0.25, _d(12, 10, 6)], [0.5, _d(12, -10, 6)]],
		"LegL:rotation": [[0.0, _d(56, 0, 0)], [0.25, _d(-40, 0, 0)], [0.5, _d(56, 0, 0)]],
		"LegR:rotation": [[0.0, _d(-40, 0, 0)], [0.25, _d(56, 0, 0)], [0.5, _d(-40, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-24, 0, 0)], [0.12, _d(-86, 0, 0)], [0.5, _d(-24, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-10, 0, 0)], [0.37, _d(-86, 0, 0)], [0.5, _d(-10, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-70, 0, -30)], [0.25, _d(40, 0, -20)], [0.5, _d(-70, 0, -30)]],
		"ArmR:rotation": [[0.0, _d(40, 0, 20)], [0.25, _d(-70, 0, 30)], [0.5, _d(40, 0, 20)]],
	})])

	# ----------------------------------------------------------------- zip ---
	out.append(["zip", _clip(0.6, true, {
		"Hips:rotation": [[0.0, _d(-24, 0, 0)], [0.3, _d(-20, 0, 0)], [0.6, _d(-24, 0, 0)]],
		"Chest:rotation": [[0.0, _d(-18, 0, 0)], [0.6, _d(-18, 0, 0)]],
		"ArmR:rotation": [[0.0, _d(176, 0, 4)], [0.6, _d(176, 0, 4)]],
		"ArmL:rotation": [[0.0, _d(160, 0, -10)], [0.6, _d(160, 0, -10)]],
		"LegL:rotation": [[0.0, _d(-26, 0, 0)], [0.3, _d(-18, 0, 0)], [0.6, _d(-26, 0, 0)]],
		"LegR:rotation": [[0.0, _d(-18, 0, 0)], [0.3, _d(-26, 0, 0)], [0.6, _d(-18, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-40, 0, 0)], [0.6, _d(-40, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-30, 0, 0)], [0.6, _d(-30, 0, 0)]],
	})])

	# ------------------------------------------------------------- attacks ---
	# A: right straight punch
	out.append(["attack_a", _clip(0.34, false, {
		"Hips:rotation": [[0.0, _d(0, 18, 0)], [0.12, _d(0, -22, 0)], [0.34, _d(0, 0, 0)]],
		"Chest:rotation": [[0.0, _d(4, 22, 0)], [0.12, _d(8, -26, 0)], [0.34, _d(0, 0, 0)]],
		"ArmR:rotation": [[0.0, _d(-40, 0, 34)], [0.12, _d(86, 0, 6)], [0.34, _d(16, 0, 12)]],
		"ForearmR:rotation": [[0.0, _d(-100, 0, 0)], [0.12, _d(-4, 0, 0)], [0.34, _d(-24, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(20, 0, -30)], [0.12, _d(-24, 0, -46)], [0.34, _d(0, 0, -12)]],
		"ForearmL:rotation": [[0.0, _d(-50, 0, 0)], [0.34, _d(-40, 0, 0)]],
		"LegL:rotation": [[0.0, _d(12, 0, 0)], [0.34, _d(4, 0, 0)]],
		"LegR:rotation": [[0.0, _d(-12, 0, 0)], [0.34, _d(-4, 0, 0)]],
	})])
	# B: left hook
	out.append(["attack_b", _clip(0.34, false, {
		"Hips:rotation": [[0.0, _d(0, -18, 0)], [0.12, _d(0, 24, 0)], [0.34, _d(0, 0, 0)]],
		"Chest:rotation": [[0.0, _d(4, -24, 0)], [0.12, _d(8, 28, 0)], [0.34, _d(0, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-30, 0, -56)], [0.12, _d(74, 34, -22)], [0.34, _d(14, 0, -12)]],
		"ForearmL:rotation": [[0.0, _d(-104, 0, 0)], [0.12, _d(-26, 0, 0)], [0.34, _d(-32, 0, 0)]],
		"ArmR:rotation": [[0.0, _d(16, 0, 34)], [0.12, _d(-18, 0, 50)], [0.34, _d(0, 0, 12)]],
		"LegL:rotation": [[0.0, _d(-10, 0, 0)], [0.34, _d(-4, 0, 0)]],
		"LegR:rotation": [[0.0, _d(14, 0, 0)], [0.34, _d(4, 0, 0)]],
	})])
	# C: spinning kick finisher
	out.append(["attack_c", _clip(0.55, false, {
		"Hips:rotation": [[0.0, _d(0, 0, 0)], [0.22, _d(0, -200, 0)], [0.55, _d(0, -360, 0)]],
		"Chest:rotation": [[0.0, _d(10, 0, 0)], [0.22, _d(-6, 0, 14)], [0.55, _d(0, 0, 0)]],
		"LegR:rotation": [[0.0, _d(10, 0, 0)], [0.22, _d(78, 0, -26)], [0.55, _d(0, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-40, 0, 0)], [0.22, _d(-6, 0, 0)], [0.55, _d(-8, 0, 0)]],
		"LegL:rotation": [[0.0, _d(-6, 0, 0)], [0.22, _d(-20, 0, 0)], [0.55, _d(0, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-20, 0, -70)], [0.22, _d(-40, 0, -90)], [0.55, _d(0, 0, -10)]],
		"ArmR:rotation": [[0.0, _d(-20, 0, 70)], [0.22, _d(-30, 0, 84)], [0.55, _d(0, 0, 10)]],
	})])
	# Heavy: leaping double-fist slam
	out.append(["attack_heavy", _clip(0.78, false, {
		"Hips:position": [[0.0, Vector3(0, 0.92, 0)], [0.3, Vector3(0, 1.12, 0)],
			[0.5, Vector3(0, 0.72, 0)], [0.78, Vector3(0, 0.92, 0)]],
		"Hips:rotation": [[0.0, _d(-10, 0, 0)], [0.3, _d(-26, 0, 0)], [0.5, _d(24, 0, 0)], [0.78, _d(0, 0, 0)]],
		"Chest:rotation": [[0.0, _d(-14, 0, 0)], [0.3, _d(-30, 0, 0)], [0.5, _d(34, 0, 0)], [0.78, _d(0, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-40, 0, -30)], [0.3, _d(-186, 0, -16)], [0.5, _d(64, 0, -10)], [0.78, _d(0, 0, -10)]],
		"ArmR:rotation": [[0.0, _d(-40, 0, 30)], [0.3, _d(-186, 0, 16)], [0.5, _d(64, 0, 10)], [0.78, _d(0, 0, 10)]],
		"ForearmL:rotation": [[0.0, _d(-40, 0, 0)], [0.3, _d(-10, 0, 0)], [0.5, _d(-4, 0, 0)], [0.78, _d(-30, 0, 0)]],
		"ForearmR:rotation": [[0.0, _d(-40, 0, 0)], [0.3, _d(-10, 0, 0)], [0.5, _d(-4, 0, 0)], [0.78, _d(-30, 0, 0)]],
		"LegL:rotation": [[0.0, _d(16, 0, 0)], [0.3, _d(44, 0, 0)], [0.5, _d(30, 0, 0)], [0.78, _d(0, 0, 0)]],
		"LegR:rotation": [[0.0, _d(16, 0, 0)], [0.3, _d(40, 0, 0)], [0.5, _d(26, 0, 0)], [0.78, _d(0, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-40, 0, 0)], [0.3, _d(-90, 0, 0)], [0.5, _d(-60, 0, 0)], [0.78, _d(0, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-40, 0, 0)], [0.3, _d(-90, 0, 0)], [0.5, _d(-60, 0, 0)], [0.78, _d(0, 0, 0)]],
	})])
	# Aerial dive kick
	out.append(["air_attack", _clip(0.5, false, {
		"Hips:rotation": [[0.0, _d(-20, 0, 0)], [0.2, _d(18, 0, 0)], [0.5, _d(-6, 0, 0)]],
		"Chest:rotation": [[0.0, _d(-16, 0, 0)], [0.2, _d(26, 0, 0)], [0.5, _d(0, 0, 0)]],
		"LegR:rotation": [[0.0, _d(30, 0, 0)], [0.2, _d(66, 0, 0)], [0.5, _d(10, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-90, 0, 0)], [0.2, _d(-4, 0, 0)], [0.5, _d(-20, 0, 0)]],
		"LegL:rotation": [[0.0, _d(-16, 0, 0)], [0.2, _d(-46, 0, 0)], [0.5, _d(-8, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-60, 0, 0)], [0.2, _d(-104, 0, 0)], [0.5, _d(-30, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-120, 0, -40)], [0.5, _d(-90, 0, -30)]],
		"ArmR:rotation": [[0.0, _d(-120, 0, 40)], [0.5, _d(-90, 0, 30)]],
	})])

	# ----------------------------------------------------------- web shoot ---
	out.append(["web_shoot", _clip(0.36, false, {
		"Chest:rotation": [[0.0, _d(0, -10, 0)], [0.1, _d(-6, 6, 0)], [0.36, _d(0, 0, 0)]],
		"ArmR:rotation": [[0.0, _d(-26, 0, 26)], [0.1, _d(92, 0, 6)], [0.36, _d(24, 0, 12)]],
		"ForearmR:rotation": [[0.0, _d(-84, 0, 0)], [0.1, _d(-6, 0, 0)], [0.36, _d(-36, 0, 0)]],
		"HandR:rotation": [[0.0, _d(0, 0, 0)], [0.1, _d(34, 0, 0)], [0.36, _d(0, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(10, 0, -20)], [0.36, _d(0, 0, -10)]],
	})])

	# --------------------------------------------------------------- dodge ---
	out.append(["dodge", _clip(0.42, false, {
		"Hips:position": [[0.0, Vector3(0, 0.92, 0)], [0.2, Vector3(0, 0.62, 0)], [0.42, Vector3(0, 0.92, 0)]],
		"Hips:rotation": [[0.0, _d(0, 0, 0)], [0.2, _d(-220, 0, 0)], [0.42, _d(-360, 0, 0)]],
		"Chest:rotation": [[0.0, _d(24, 0, 0)], [0.2, _d(40, 0, 0)], [0.42, _d(0, 0, 0)]],
		"LegL:rotation": [[0.0, _d(40, 0, 0)], [0.2, _d(84, 0, 0)], [0.42, _d(0, 0, 0)]],
		"LegR:rotation": [[0.0, _d(40, 0, 0)], [0.2, _d(84, 0, 0)], [0.42, _d(0, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(-90, 0, 0)], [0.2, _d(-130, 0, 0)], [0.42, _d(0, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(-90, 0, 0)], [0.2, _d(-130, 0, 0)], [0.42, _d(0, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-40, 0, -50)], [0.42, _d(0, 0, -10)]],
		"ArmR:rotation": [[0.0, _d(-40, 0, 50)], [0.42, _d(0, 0, 10)]],
	})])

	# ---------------------------------------------------------------- hurt ---
	out.append(["hurt", _clip(0.36, false, {
		"Hips:rotation": [[0.0, _d(0, 0, 0)], [0.1, _d(-16, 10, 0)], [0.36, _d(0, 0, 0)]],
		"Chest:rotation": [[0.0, _d(0, 0, 0)], [0.1, _d(-24, 14, 0)], [0.36, _d(0, 0, 0)]],
		"Head:rotation": [[0.0, _d(0, 0, 0)], [0.1, _d(-20, 0, 0)], [0.36, _d(0, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(0, 0, -10)], [0.1, _d(30, 0, -60)], [0.36, _d(0, 0, -10)]],
		"ArmR:rotation": [[0.0, _d(0, 0, 10)], [0.1, _d(30, 0, 60)], [0.36, _d(0, 0, 10)]],
	})])

	# ------------------------------------------------------------- victory ---
	out.append(["victory", _clip(2.0, true, {
		"Hips:position": [[0.0, Vector3(0, 0.92, 0)], [0.5, Vector3(0, 0.99, 0)],
			[1.0, Vector3(0, 0.92, 0)], [1.5, Vector3(0, 0.99, 0)], [2.0, Vector3(0, 0.92, 0)]],
		"Chest:rotation": [[0.0, _d(-6, 0, 0)], [1.0, _d(-2, 0, 0)], [2.0, _d(-6, 0, 0)]],
		"ArmR:rotation": [[0.0, _d(-176, 0, 10)], [0.5, _d(-150, 0, 20)], [1.0, _d(-176, 0, 10)],
			[1.5, _d(-150, 0, 20)], [2.0, _d(-176, 0, 10)]],
		"ForearmR:rotation": [[0.0, _d(-20, 0, 0)], [0.5, _d(-60, 0, 0)], [1.0, _d(-20, 0, 0)],
			[1.5, _d(-60, 0, 0)], [2.0, _d(-20, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(-10, 0, -40)], [1.0, _d(-16, 0, -50)], [2.0, _d(-10, 0, -40)]],
		"Head:rotation": [[0.0, _d(-10, 0, 0)], [1.0, _d(-6, 0, 0)], [2.0, _d(-10, 0, 0)]],
	})])

	# -------------------------------------------------------------- defeat ---
	out.append(["defeat", _clip(1.1, false, {
		"Hips:position": [[0.0, Vector3(0, 0.92, 0)], [0.6, Vector3(0, 0.34, 0)], [1.1, Vector3(0, 0.26, 0)]],
		"Hips:rotation": [[0.0, _d(0, 0, 0)], [1.1, _d(-70, 0, 10)]],
		"Chest:rotation": [[0.0, _d(0, 0, 0)], [1.1, _d(30, 0, 0)]],
		"LegL:rotation": [[0.0, _d(0, 0, 0)], [1.1, _d(70, 0, 0)]],
		"LegR:rotation": [[0.0, _d(0, 0, 0)], [1.1, _d(60, 0, 0)]],
		"ShinL:rotation": [[0.0, _d(0, 0, 0)], [1.1, _d(-100, 0, 0)]],
		"ShinR:rotation": [[0.0, _d(0, 0, 0)], [1.1, _d(-90, 0, 0)]],
		"ArmL:rotation": [[0.0, _d(0, 0, -10)], [1.1, _d(-60, 0, -70)]],
		"ArmR:rotation": [[0.0, _d(0, 0, 10)], [1.1, _d(-60, 0, 70)]],
	})])

	return out

## Builds one Animation from a {"<Bone>:<property>": [[time, value], ...]} map.
func _clip(length: float, loop: bool, tracks: Dictionary) -> Animation:
	var anim := Animation.new()
	anim.length = length
	anim.loop_mode = Animation.LOOP_LINEAR if loop else Animation.LOOP_NONE
	for key in tracks.keys():
		var parts: PackedStringArray = (key as String).split(":")
		var bone_name: String = parts[0]
		var prop: String = parts[1]
		var bone_path: String = rig.path(bone_name)
		if bone_path == "":
			push_warning("PlayerAnimator: unknown bone '%s'" % bone_name)
			continue
		var idx := anim.add_track(Animation.TYPE_VALUE)
		anim.track_set_path(idx, NodePath("%s:%s" % [bone_path, prop]))
		anim.track_set_interpolation_type(idx, Animation.INTERPOLATION_CUBIC)
		anim.value_track_set_update_mode(idx, Animation.UPDATE_CONTINUOUS)
		for pair in tracks[key]:
			anim.track_insert_key(idx, float(pair[0]), pair[1])
	return anim

## Degrees -> radians Vector3 helper, so the keyframe tables above stay readable.
func _d(x: float, y: float, z: float) -> Vector3:
	return Vector3(deg_to_rad(x), deg_to_rad(y), deg_to_rad(z))

# =============================================================================
#  STATE MACHINE
# =============================================================================

func _build_animation_tree() -> void:
	var sm := AnimationNodeStateMachine.new()
	var names: Array = XFADE.keys()

	var x := 0.0
	var y := 0.0
	for state_name in names:
		var node := AnimationNodeAnimation.new()
		node.animation = state_name
		sm.add_node(state_name, node, Vector2(x, y))
		x += 200.0
		if x > 1000.0:
			x = 0.0
			y += 140.0

	# All-pairs transitions: travel() then always has a direct, blended route.
	for from_state in names:
		for to_state in names:
			if from_state == to_state:
				continue
			var tr := AnimationNodeStateMachineTransition.new()
			tr.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
			tr.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED
			tr.xfade_time = float(XFADE[to_state])
			sm.add_transition(from_state, to_state, tr)

	# Entry point.
	var start := AnimationNodeStateMachineTransition.new()
	start.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
	start.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO
	sm.add_transition("Start", "idle", start)

	# A TimeScale node on top lets gameplay speed the whole rig up when running.
	var scale_node := AnimationNodeTimeScale.new()
	var blend := AnimationNodeBlendTree.new()
	blend.add_node("StateMachine", sm, Vector2(0, 0))
	blend.add_node("TimeScale", scale_node, Vector2(300, 0))
	blend.connect_node("TimeScale", 0, "StateMachine")
	blend.connect_node("output", 0, "TimeScale")

	anim_tree = AnimationTree.new()
	anim_tree.name = "AnimationTree"
	add_child(anim_tree)
	anim_tree.anim_player = anim_tree.get_path_to(anim_player)
	anim_tree.tree_root = blend
	anim_tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_IDLE
	anim_tree.active = true
	playback = anim_tree.get("parameters/StateMachine/playback")
