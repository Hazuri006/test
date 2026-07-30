extends Node3D
## ThirdPersonCamera -- node name "CameraRig", child of Player but `top_level`.
##
## Being top_level means the rig is NOT dragged rigidly by the hero: it chases
## the target position with exponential smoothing, which is what gives the
## camera its weight during swings and hard landings.
##
## Features
##   * mouse look with clamped pitch and per-user sensitivity
##   * SpringArm3D wall avoidance + automatic pull-in inside alleys
##   * speed-driven FOV (normal -> speed -> maximum)
##   * landing dip, attack nudge, swing roll, additive shake
##   * cinematic mode so cutscenes can drive it directly
##
## Node layout (built in _ready, nothing to author by hand):
##   CameraRig (this, top_level = true)
##     Yaw (Node3D)
##       Pitch (Node3D)
##         SpringArm3D  (collision_mask = world)
##           ShakeRoot (Node3D)   <- SpringArm moves this
##             Camera3D (current = true, carries the shake offset)
##
## Inspector parameters: camera_distance, camera_height, camera_smoothness,
## normal_fov, speed_fov, maximum_fov, pitch_min, pitch_max, shake_scale.

@export_group("Framing")
@export var camera_distance: float = 5.2
@export var camera_height: float = 1.55
@export var camera_smoothness: float = 12.0     ## higher = tighter follow
@export var rotation_smoothness: float = 18.0
@export var shoulder_offset: float = 0.55   ## over-the-shoulder shift, metres
@export var swing_distance_bonus: float = 2.2
@export var swing_roll_degrees: float = 9.0

@export_group("Field of view")
@export var normal_fov: float = 74.0
@export var speed_fov: float = 86.0             ## reached at speed_fov_at
@export var maximum_fov: float = 96.0           ## reached at maximum_fov_at
@export var speed_fov_at: float = 22.0
@export var maximum_fov_at: float = 45.0
@export var fov_smoothness: float = 4.0

@export_group("Look")
@export var pitch_min: float = -78.0
@export var pitch_max: float = 72.0
@export var shake_scale: float = 1.0

## Simulation guard rails (see the timestep note in _process).
const MAX_STEP := 0.05          ## never integrate more than 50 ms at once
const DIP_STIFFNESS := 90.0
const DIP_DAMPING := 14.0
const DIP_MAX := 0.9            ## metres the view may drop on a landing
const DIP_MAX_SPEED := 6.0

var yaw_node: Node3D
var pitch_node: Node3D
var spring: SpringArm3D
var shake_root: Node3D
var camera: Camera3D

var _target: Node3D
var _yaw: float = 0.0
var _pitch: float = -12.0
var _shake_time: float = 0.0
var _shake_strength: float = 0.0
var _shake_duration: float = 0.01
var _dip: float = 0.0              ## landing dip offset (metres)
var _dip_velocity: float = 0.0
var _nudge: Vector3 = Vector3.ZERO
var _extra_distance: float = 0.0
var _roll: float = 0.0
var _cinematic: bool = false
var _noise := FastNoiseLite.new()

func _ready() -> void:
	top_level = true
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_noise.frequency = 2.0

	yaw_node = Node3D.new()
	yaw_node.name = "Yaw"
	add_child(yaw_node)

	pitch_node = Node3D.new()
	pitch_node.name = "Pitch"
	yaw_node.add_child(pitch_node)

	spring = SpringArm3D.new()
	spring.name = "SpringArm3D"
	spring.spring_length = camera_distance
	spring.margin = 0.35
	# Only solid world geometry pushes the camera: enemies and props must never
	# yank the view around.
	spring.collision_mask = BrickKit.L_WORLD
	var probe := SphereShape3D.new()
	probe.radius = 0.32
	spring.shape = probe
	# Over-the-shoulder: without this the hero sits exactly under the crosshair
	# and hides whatever the player is trying to web.
	spring.position.x = shoulder_offset
	pitch_node.add_child(spring)

	# IMPORTANT: SpringArm3D positions its DIRECT children every frame. The shake
	# offset therefore lives on the camera one level deeper, otherwise it would
	# overwrite the arm's placement and park the camera inside the hero's head.
	shake_root = Node3D.new()
	shake_root.name = "ShakeRoot"
	spring.add_child(shake_root)

	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.fov = normal_fov
	camera.near = 0.08
	camera.far = 1400.0
	shake_root.add_child(camera)
	camera.current = true

	_target = get_parent() as Node3D
	if _target != null:
		_yaw = rad_to_deg(_target.rotation.y)
		global_position = _target.global_position + Vector3.UP * camera_height

	Events.camera_shake_requested.connect(_on_shake)
	Events.player_landed.connect(_on_landed)

func _unhandled_input(event: InputEvent) -> void:
	if _cinematic or not GameState.gameplay_active():
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm := event as InputEventMouseMotion
		var sens: float = float(GameState.get_setting("mouse_sensitivity")) * 57.3
		var invert: float = -1.0 if bool(GameState.get_setting("invert_y")) else 1.0
		_yaw -= mm.relative.x * sens
		_pitch -= mm.relative.y * sens * invert
		_pitch = clampf(_pitch, pitch_min, pitch_max)

func _process(delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		return
	if _cinematic:
		_apply_shake(delta)
		return

	# Clamp the timestep before ANY smoothing or spring integration. A loading
	# hitch or a slow frame produces a huge delta, and an explicit spring
	# integrated with it diverges instantly -- that is how a landing dip can
	# fling the camera a kilometre under the city.
	var dt: float = minf(delta, MAX_STEP)

	# --- follow -------------------------------------------------------------
	var focus: Vector3 = _target.global_position + Vector3.UP * (camera_height - _dip)
	var follow_k: float = 1.0 - exp(-camera_smoothness * dt)
	global_position = global_position.lerp(focus, follow_k)

	# --- orientation --------------------------------------------------------
	var rot_k: float = 1.0 - exp(-rotation_smoothness * dt)
	yaw_node.rotation.y = lerp_angle(yaw_node.rotation.y, deg_to_rad(_yaw), rot_k)
	pitch_node.rotation.x = lerpf(pitch_node.rotation.x, deg_to_rad(_pitch), rot_k)

	# --- distance -----------------------------------------------------------
	var swinging: bool = _target.has_method("is_airborne_traversal") and _target.is_airborne_traversal()
	var want_extra: float = swing_distance_bonus if swinging else 0.0
	_extra_distance = lerpf(_extra_distance, want_extra, 1.0 - exp(-3.0 * dt))
	spring.spring_length = camera_distance + _extra_distance

	# --- speed FOV ----------------------------------------------------------
	var speed: float = 0.0
	if _target is CharacterBody3D:
		speed = (_target as CharacterBody3D).velocity.length()
	var target_fov: float = normal_fov
	if speed > speed_fov_at:
		var t: float = clampf((speed - speed_fov_at) / maxf(maximum_fov_at - speed_fov_at, 0.001), 0.0, 1.0)
		target_fov = lerpf(speed_fov, maximum_fov, t)
	else:
		target_fov = lerpf(normal_fov, speed_fov, clampf(speed / maxf(speed_fov_at, 0.001), 0.0, 1.0))
	camera.fov = lerpf(camera.fov, target_fov, 1.0 - exp(-fov_smoothness * dt))

	# --- swing roll ---------------------------------------------------------
	var want_roll: float = 0.0
	if swinging and _target is CharacterBody3D:
		var v: Vector3 = (_target as CharacterBody3D).velocity
		var right: Vector3 = camera.global_transform.basis.x
		want_roll = -clampf(v.dot(right) / 24.0, -1.0, 1.0) * deg_to_rad(swing_roll_degrees)
	_roll = lerpf(_roll, want_roll, 1.0 - exp(-5.0 * dt))

	# --- landing dip spring -------------------------------------------------
	# Semi-implicit Euler + hard clamps: bounded no matter what the frame rate
	# does, and the clamps double as a limit on how far a landing can drop the
	# view.
	_dip_velocity += (-_dip * DIP_STIFFNESS - _dip_velocity * DIP_DAMPING) * dt
	_dip_velocity = clampf(_dip_velocity, -DIP_MAX_SPEED, DIP_MAX_SPEED)
	_dip = clampf(_dip + _dip_velocity * dt, -DIP_MAX, DIP_MAX)

	# --- attack nudge decay -------------------------------------------------
	_nudge = _nudge.lerp(Vector3.ZERO, 1.0 - exp(-9.0 * dt))

	_apply_shake(dt)

func _apply_shake(delta: float) -> void:
	delta = minf(delta, MAX_STEP)
	var offset := _nudge
	var extra_roll := _roll
	if _shake_strength > 0.001:
		_shake_time += delta
		var fade: float = clampf(1.0 - _shake_time / _shake_duration, 0.0, 1.0)
		var amp: float = _shake_strength * fade * fade * shake_scale
		offset += Vector3(
			_noise.get_noise_2d(_shake_time * 40.0, 0.0),
			_noise.get_noise_2d(0.0, _shake_time * 40.0),
			_noise.get_noise_2d(_shake_time * 33.0, 17.0)) * amp
		extra_roll += _noise.get_noise_2d(_shake_time * 25.0, 91.0) * amp * 0.25
		if fade <= 0.0:
			_shake_strength = 0.0
	camera.position = offset
	camera.rotation.z = extra_roll

# =============================================================================
#  PUBLIC API
# =============================================================================

## Yaw in radians -- the player uses this to move relative to the view.
func get_yaw() -> float:
	return yaw_node.rotation.y

func get_forward() -> Vector3:
	var f: Vector3 = -camera.global_transform.basis.z
	return f

func get_flat_forward() -> Vector3:
	var f := get_forward()
	f.y = 0.0
	return f.normalized() if f.length_squared() > 0.0001 else Vector3.FORWARD

func get_flat_right() -> Vector3:
	return get_flat_forward().cross(Vector3.DOWN).normalized()

func aim_ray_origin() -> Vector3:
	return camera.global_position

func aim_ray_direction() -> Vector3:
	return get_forward()

func snap_behind(yaw_degrees: float) -> void:
	_yaw = yaw_degrees
	yaw_node.rotation.y = deg_to_rad(_yaw)

## Directly sets the look angles (used by cutscenes, respawns and tests).
func set_look(yaw_degrees: float, pitch_degrees: float) -> void:
	_yaw = yaw_degrees
	_pitch = clampf(pitch_degrees, pitch_min, pitch_max)
	yaw_node.rotation.y = deg_to_rad(_yaw)
	pitch_node.rotation.x = deg_to_rad(_pitch)

## Small directional shove, used on every landed punch.
func punch_nudge(strength: float = 0.12) -> void:
	_nudge += Vector3(randf_range(-1.0, 1.0), randf_range(-0.4, 0.4), 0.6) * strength

func _on_shake(strength: float, duration: float) -> void:
	# Never let a small shake cancel a big one that is still playing.
	if strength * duration < _shake_strength * (_shake_duration - _shake_time):
		return
	_shake_strength = strength
	_shake_duration = maxf(duration, 0.05)
	_shake_time = 0.0

func _on_landed(fall_speed: float) -> void:
	var amount: float = clampf(fall_speed / 40.0, 0.0, 1.0)
	_dip_velocity = clampf(_dip_velocity + 2.4 * amount, -DIP_MAX_SPEED, DIP_MAX_SPEED)
	if amount > 0.35:
		_on_shake(0.18 * amount, 0.28)

## Cutscene control: the mission scripts park the camera and drive it directly.
func set_cinematic(active: bool) -> void:
	_cinematic = active

func cinematic_look(from: Vector3, at: Vector3, fov: float = 60.0) -> void:
	_cinematic = true
	global_position = from
	yaw_node.rotation = Vector3.ZERO
	pitch_node.rotation = Vector3.ZERO
	spring.spring_length = 0.0
	shake_root.position = Vector3.ZERO
	shake_root.rotation = Vector3.ZERO
	camera.position = Vector3.ZERO
	camera.rotation = Vector3.ZERO
	camera.fov = fov
	var dir: Vector3 = at - from
	if dir.length() > 0.01:
		look_at(at, Vector3.UP)

func restore_gameplay_camera() -> void:
	_cinematic = false
	spring.spring_length = camera_distance
	rotation = Vector3.ZERO
	camera.fov = normal_fov
