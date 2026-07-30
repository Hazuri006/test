class_name RoboticArm
extends Node3D
## RoboticArm -- one of Docteur Mecanix's four mechanical limbs.
##
## Original design: a heavy shoulder mount, two long armoured segments joined by
## exposed energy couplings, and a three-finger industrial claw. Each joint glows
## with the harness's power, and the ELBOW COUPLING is the weak point the hero
## has to hit.
##
## Motion is two-bone IK: the shoulder points at the target, then the law of
## cosines bends shoulder and elbow so the claw lands exactly where it was aimed.
## That gives real mechanical reach instead of canned animation, so the arms can
## chase the player anywhere in the arena.
##
## Behaviours: IDLE sway, SLAM (raise + strike the floor), SWEEP (horizontal
## sweep at hero height), GRAB (extend and snap), THROW (hurl debris), BROKEN.
##
## Scene requirements: created by mechanix.gd. Contains one AnimatableBody3D on
## the weak point (layer 512 = boss) so the hero's attacks can hit it.

signal weak_point_destroyed(arm: RoboticArm)
signal slam_landed(position: Vector3)

enum Mode { IDLE, SLAM, SWEEP, GRAB, THROW, RECOVER, BROKEN }

const UPPER_LENGTH := 7.0
const FORE_LENGTH := 6.0
const CLAW_LENGTH := 1.6

@export var weak_point_health: float = 130.0
@export var slam_damage: float = 20.0
@export var grab_damage: float = 14.0
@export var slam_radius: float = 6.0
@export var speed: float = 3.2                ## IK tracking speed
@export var arm_index: int = 0

var mode: Mode = Mode.IDLE
var health: float = 130.0
var broken: bool = false
var target_point: Vector3 = Vector3.ZERO

var _shoulder: Node3D
var _elbow: Node3D
var _wrist: Node3D
var _claw_fingers: Array[Node3D] = []
var _weak_body: AnimatableBody3D
var _weak_mesh: MeshInstance3D
var _weak_mat: ShaderMaterial
var _light: OmniLight3D
var _mode_timer: float = 0.0
var _idle_phase: float = 0.0
var _impact_done: bool = false
var _current_target: Vector3 = Vector3.ZERO
var _sparks: GPUParticles3D
var _energy := Color(0.3, 0.9, 1.0)

func build(index: int, energy_color: Color) -> void:
	arm_index = index
	_energy = energy_color
	health = weak_point_health
	_idle_phase = float(index) * 1.7

	var armour := BrickKit.metal(Color(0.42, 0.45, 0.52), 0.32)
	var armour_dark := BrickKit.metal(Color(0.25, 0.27, 0.32), 0.4)
	var glow := BrickKit.neon(energy_color, 3.0)

	# --- shoulder mount -----------------------------------------------------
	BrickKit.add_box(self, Vector3(2.2, 1.8, 2.2), Vector3.ZERO, armour_dark, "Mount")
	BrickKit.add_shape(self, BrickKit.unit_sphere(8, 12), Vector3(1.9, 1.9, 1.9),
			Vector3.ZERO, armour, "ShoulderBall")

	_shoulder = Node3D.new()
	_shoulder.name = "Shoulder"
	add_child(_shoulder)
	# Segments extend along -Z so Node3D.look_at() aims them directly.
	BrickKit.add_box(_shoulder, Vector3(1.5, 1.5, UPPER_LENGTH),
			Vector3(0, 0, -UPPER_LENGTH * 0.5), armour, "UpperArm")
	for i in 3:
		BrickKit.add_box(_shoulder, Vector3(1.8, 1.8, 0.5),
				Vector3(0, 0, -UPPER_LENGTH * (0.25 + 0.22 * float(i))), armour_dark, "Rib%d" % i)
	BrickKit.add_box(_shoulder, Vector3(0.4, 1.7, UPPER_LENGTH * 0.7),
			Vector3(0.85, 0, -UPPER_LENGTH * 0.5), glow, "PowerLineL")
	BrickKit.add_box(_shoulder, Vector3(0.4, 1.7, UPPER_LENGTH * 0.7),
			Vector3(-0.85, 0, -UPPER_LENGTH * 0.5), glow, "PowerLineR")

	# --- elbow (the weak point) --------------------------------------------
	_elbow = Node3D.new()
	_elbow.name = "Elbow"
	_elbow.position = Vector3(0, 0, -UPPER_LENGTH)
	_shoulder.add_child(_elbow)

	_weak_mat = BrickKit.neon(energy_color, 3.6).duplicate() as ShaderMaterial
	_weak_mesh = MeshInstance3D.new()
	_weak_mesh.mesh = BrickKit.unit_sphere(8, 12)
	_weak_mesh.scale = Vector3(1.9, 1.9, 1.9)
	_weak_mesh.material_override = _weak_mat
	_elbow.add_child(_weak_mesh)
	BrickKit.add_shape(_elbow, BrickKit.unit_torus(16, 6), Vector3(2.6, 2.6, 2.6),
			Vector3.ZERO, armour_dark, "ElbowRing")

	_weak_body = AnimatableBody3D.new()
	_weak_body.name = "WeakPoint"
	_weak_body.collision_layer = BrickKit.L_BOSS
	_weak_body.collision_mask = 0
	_weak_body.sync_to_physics = false
	_weak_body.set_script(load("res://scripts/bosses/weak_point.gd"))
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 1.5
	shape.shape = sphere
	_weak_body.add_child(shape)
	_elbow.add_child(_weak_body)
	_weak_body.call("bind", self)

	_light = OmniLight3D.new()
	_light.light_color = energy_color
	_light.light_energy = 3.0
	_light.omni_range = 12.0
	_light.shadow_enabled = false
	_elbow.add_child(_light)

	# --- forearm + claw -----------------------------------------------------
	BrickKit.add_box(_elbow, Vector3(1.3, 1.3, FORE_LENGTH),
			Vector3(0, 0, -FORE_LENGTH * 0.5), armour, "Forearm")
	BrickKit.add_box(_elbow, Vector3(1.6, 0.35, FORE_LENGTH * 0.8),
			Vector3(0, 0.75, -FORE_LENGTH * 0.5), glow, "ForearmVein")

	_wrist = Node3D.new()
	_wrist.name = "Wrist"
	_wrist.position = Vector3(0, 0, -FORE_LENGTH)
	_elbow.add_child(_wrist)
	BrickKit.add_shape(_wrist, BrickKit.unit_cylinder(10), Vector3(1.6, 0.8, 1.6),
			Vector3.ZERO, armour_dark, "WristHub").rotation.x = PI * 0.5
	for f in 3:
		var angle: float = TAU * float(f) / 3.0
		var finger := Node3D.new()
		finger.name = "Finger%d" % f
		finger.position = Vector3(cos(angle) * 0.55, sin(angle) * 0.55, -0.4)
		finger.rotation.z = angle
		_wrist.add_child(finger)
		BrickKit.add_box(finger, Vector3(0.42, 0.42, CLAW_LENGTH),
				Vector3(0, 0, -CLAW_LENGTH * 0.5), armour, "Phalanx")
		BrickKit.add_box(finger, Vector3(0.32, 0.32, 0.7),
				Vector3(0, 0.18, -CLAW_LENGTH - 0.3), armour_dark, "Tip")
		_claw_fingers.append(finger)

	# sparks for when the arm breaks
	_sparks = GPUParticles3D.new()
	_sparks.emitting = false
	_sparks.amount = 16
	_sparks.lifetime = 0.6
	_sparks.local_coords = false
	var spark_mesh := BoxMesh.new()
	spark_mesh.size = Vector3(0.09, 0.09, 0.32)
	var spark_mat := StandardMaterial3D.new()
	spark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spark_mat.albedo_color = energy_color
	spark_mat.emission_enabled = true
	spark_mat.emission = energy_color
	spark_mesh.material = spark_mat
	_sparks.draw_pass_1 = spark_mesh
	var pm := ParticleProcessMaterial.new()
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 70.0
	pm.initial_velocity_min = 3.0
	pm.initial_velocity_max = 9.0
	pm.gravity = Vector3(0, -18.0, 0)
	_sparks.process_material = pm
	_elbow.add_child(_sparks)

	_current_target = global_position + Vector3(0, -4.0, -8.0)

# =============================================================================
#  BEHAVIOUR
# =============================================================================

func _process(delta: float) -> void:
	_idle_phase += delta
	_mode_timer += delta

	if broken:
		_update_broken(delta)
		return

	match mode:
		Mode.IDLE:
			_update_idle(delta)
		Mode.SLAM:
			_update_slam(delta)
		Mode.SWEEP:
			_update_sweep(delta)
		Mode.GRAB:
			_update_grab(delta)
		Mode.THROW:
			_update_throw(delta)
		Mode.RECOVER:
			if _mode_timer > 0.8:
				set_mode(Mode.IDLE)

	_solve_ik(delta)
	_animate_claw(delta)

func set_mode(new_mode: Mode) -> void:
	if broken:
		return
	mode = new_mode
	_mode_timer = 0.0
	_impact_done = false

## Slow hovering menace, arms drifting like they are breathing.
func _update_idle(_delta: float) -> void:
	var base: Vector3 = global_position
	var sway := Vector3(sin(_idle_phase * 0.7 + float(arm_index)) * 5.0,
			-3.0 + sin(_idle_phase * 0.9) * 1.4,
			cos(_idle_phase * 0.6 + float(arm_index)) * 5.0)
	_current_target = base + sway - global_transform.basis.z * 6.0

func _update_slam(delta: float) -> void:
	# 0.0-0.5 s: rear up. 0.5-0.75 s: strike. then hold.
	if _mode_timer < 0.5:
		_current_target = _current_target.lerp(target_point + Vector3(0, 12.0, 0), 8.0 * delta)
	else:
		_current_target = _current_target.lerp(target_point, 18.0 * delta)
		if not _impact_done and _mode_timer > 0.62:
			_impact_done = true
			_do_slam_impact()
	if _mode_timer > 1.3:
		set_mode(Mode.RECOVER)

func _update_sweep(delta: float) -> void:
	# Horizontal arc through the arena at chest height.
	var t: float = clampf(_mode_timer / 1.4, 0.0, 1.0)
	var angle: float = lerpf(-1.2, 1.2, t) + float(arm_index) * 0.3
	var centre: Vector3 = get_parent_node_3d().global_position if get_parent_node_3d() != null else global_position
	var radius: float = 13.0
	_current_target = centre + Vector3(cos(angle) * radius, 2.2, sin(angle) * radius)
	if not _impact_done and t > 0.2:
		_check_hit(_wrist.global_position, 3.4, slam_damage * 0.7, 12.0)
	if _mode_timer > 1.6:
		set_mode(Mode.RECOVER)

func _update_grab(delta: float) -> void:
	var player := GameState.get_player()
	if player != null:
		target_point = player.global_position + Vector3(0, 0.9, 0)
	_current_target = _current_target.lerp(target_point, 6.0 * delta)
	if not _impact_done and _mode_timer > 0.9:
		_impact_done = true
		if _check_hit(_wrist.global_position, 3.0, grab_damage, 14.0):
			Events.toast_requested.emit("Esquive avec Ctrl !")
	if _mode_timer > 1.6:
		set_mode(Mode.RECOVER)

func _update_throw(delta: float) -> void:
	if _mode_timer < 0.6:
		_current_target = _current_target.lerp(global_position + Vector3(0, -2.0, 0)
				- global_transform.basis.z * 8.0, 6.0 * delta)
	elif not _impact_done:
		_impact_done = true
		_launch_debris()
	if _mode_timer > 1.4:
		set_mode(Mode.RECOVER)

func _update_broken(delta: float) -> void:
	# Hangs limp and twitches.
	_current_target = _current_target.lerp(global_position + Vector3(
			sin(_idle_phase * 2.0) * 1.5, -9.0, 0.0), 2.0 * delta)
	_solve_ik(delta * 0.5)

# =============================================================================
#  IK
# =============================================================================

## Two-bone IK: aim the shoulder at the target, then bend both joints so the
## claw reaches it exactly (law of cosines).
func _solve_ik(delta: float) -> void:
	if _shoulder == null:
		return
	var local_target: Vector3 = to_local(_current_target)
	var dist: float = clampf(local_target.length(), 1.0, UPPER_LENGTH + FORE_LENGTH - 0.2)
	if local_target.length() < 0.01:
		return

	# Aim: look_at points -Z at the target, which is how the segments are built.
	var aim_basis := _basis_looking_at(local_target.normalized())
	var target_quat := aim_basis.get_rotation_quaternion()

	# Bend angles.
	var l1: float = UPPER_LENGTH
	var l2: float = FORE_LENGTH
	var cos_a: float = clampf((l1 * l1 + dist * dist - l2 * l2) / (2.0 * l1 * dist), -1.0, 1.0)
	var cos_b: float = clampf((l1 * l1 + l2 * l2 - dist * dist) / (2.0 * l1 * l2), -1.0, 1.0)
	var shoulder_bend: float = acos(cos_a)
	var elbow_bend: float = PI - acos(cos_b)

	var bend := Quaternion(Vector3.RIGHT, -shoulder_bend)
	var k: float = clampf(speed * delta, 0.0, 1.0)
	_shoulder.quaternion = _shoulder.quaternion.slerp(target_quat * bend, k)
	_elbow.quaternion = _elbow.quaternion.slerp(Quaternion(Vector3.RIGHT, elbow_bend), k)

func _basis_looking_at(dir: Vector3) -> Basis:
	var z: Vector3 = -dir.normalized()
	var up: Vector3 = Vector3.UP
	if absf(z.dot(up)) > 0.99:
		up = Vector3.FORWARD
	var x: Vector3 = up.cross(z).normalized()
	var y: Vector3 = z.cross(x).normalized()
	return Basis(x, y, z)

func _animate_claw(delta: float) -> void:
	var open: float = 0.5
	match mode:
		Mode.GRAB:
			open = 1.0 if _mode_timer < 0.9 else 0.05
		Mode.SLAM:
			open = 0.15
		Mode.THROW:
			open = 0.2 if _mode_timer > 0.6 else 0.9
		_:
			open = 0.45 + sin(_idle_phase * 1.4) * 0.12
	for finger in _claw_fingers:
		finger.rotation.x = lerpf(finger.rotation.x, deg_to_rad(-40.0 * open), 8.0 * delta)

# =============================================================================
#  ATTACKS
# =============================================================================

func _do_slam_impact() -> void:
	var point: Vector3 = _wrist.global_position
	slam_landed.emit(point)
	GameState.shake_camera(0.45, 0.45)
	AudioManager.play_at("land_hard", point, 0.6)
	AudioManager.play_at("metal_clang", point, 0.7)
	if ObjectPool.is_registered("impact_fx"):
		var host: Node = GameState.world if GameState.world != null else get_parent()
		var fx: Node = ObjectPool.acquire("impact_fx", host)
		if fx != null:
			(fx as Node3D).global_position = point
			if fx.has_method("burst"):
				fx.call("burst", Vector3.UP, _energy, 2.2)
	_check_hit(point, slam_radius, slam_damage, 16.0)

## Damages the hero if they are inside `radius` of `point`.
func _check_hit(point: Vector3, radius: float, damage: float, knockback: float) -> bool:
	var player := GameState.get_player()
	if player == null:
		return false
	if player.global_position.distance_to(point) > radius:
		return false
	if player.has_method("take_damage"):
		player.call("take_damage", damage, point)
	if player.has_method("add_impulse"):
		var push: Vector3 = player.global_position - point
		push.y = 0.0
		if push.length() > 0.01:
			player.call("add_impulse", push.normalized() * knockback + Vector3.UP * 6.0)
	return true

func _launch_debris() -> void:
	if not ObjectPool.is_registered("debris"):
		return
	var player := GameState.get_player()
	if player == null:
		return
	var host: Node = GameState.world if GameState.world != null else get_parent()
	var chunk: Node = ObjectPool.acquire("debris", host)
	if chunk == null:
		return
	var from: Vector3 = _wrist.global_position
	var to: Vector3 = player.global_position + player.get("velocity") * 0.4
	if chunk.has_method("launch_at"):
		chunk.call("launch_at", from, to, 18.0)
	AudioManager.play_at("dodge", from, 0.6)

# =============================================================================
#  DAMAGE
# =============================================================================

## Called by the weak point body when the hero hits the elbow coupling.
func damage_weak_point(amount: float, from_position: Vector3) -> void:
	if broken:
		return
	health -= amount
	_weak_mat.set_shader_parameter("emission_energy", 1.2 + 3.0 * (health / weak_point_health))
	AudioManager.play_at("metal_clang", _elbow.global_position, randf_range(1.0, 1.2))
	GameState.shake_camera(0.12, 0.18)
	if ObjectPool.is_registered("impact_fx"):
		var host: Node = GameState.world if GameState.world != null else get_parent()
		var fx: Node = ObjectPool.acquire("impact_fx", host)
		if fx != null:
			(fx as Node3D).global_position = _elbow.global_position
			if fx.has_method("burst"):
				fx.call("burst", (_elbow.global_position - from_position).normalized(), _energy, 1.1)
	if health <= 0.0:
		_break_arm()

func _break_arm() -> void:
	broken = true
	mode = Mode.BROKEN
	health = 0.0
	_weak_mat.set_shader_parameter("emission_energy", 0.2)
	_weak_mat.set_shader_parameter("base_color", Color(0.25, 0.25, 0.28))
	_light.light_energy = 0.0
	_sparks.emitting = true
	_weak_body.collision_layer = 0
	AudioManager.play_at("explosion", _elbow.global_position, 1.2)
	GameState.shake_camera(0.35, 0.4)
	weak_point_destroyed.emit(self)

func repair() -> void:
	broken = false
	health = weak_point_health
	mode = Mode.IDLE
	_sparks.emitting = false
	_weak_body.collision_layer = BrickKit.L_BOSS
	_light.light_energy = 3.0
	_weak_mat.set_shader_parameter("emission_energy", 3.6)
	_weak_mat.set_shader_parameter("base_color", _energy)

func health_ratio() -> float:
	return clampf(health / maxf(weak_point_health, 1.0), 0.0, 1.0)
