class_name BossMechanix
extends CharacterBody3D
## Docteur Mecanix -- the final boss.
##
## ORIGINAL CHARACTER: a criminal engineer welded into a powered harness with
## four independent industrial arms. The design is deliberately its own thing --
## angular armour plates, an exposed spine reactor, amber goggles, a segmented
## back-pack -- and the fight is built around his arms rather than his body.
##
## Three phases, exactly as designed:
##   PHASE 1 (100-66%) -- he anchors himself and attacks with single arms:
##       ground slams and grab attempts. Only the ARM COUPLINGS take damage.
##   PHASE 2 (66-33%)  -- he stalks the arena, uses two arms at once, sweeps,
##       hurls debris and tears chunks out of the arena.
##   PHASE 3 (33-0%)   -- the arms go unstable, he unleashes a radial shockwave
##       that forces the hero to swing, and his SPINE REACTOR opens: hitting it
##       is the only way to finish him.
##
## Scene requirements: scenes/bosses/mechanix.tscn -- a CharacterBody3D with a
## CollisionShape3D. Arms, reactor and visuals are built here.
##
## Inspector parameters: max_health, phase thresholds, move_speed,
## attack_interval_*, shockwave_*.

signal phase_changed(phase: int)
signal defeated

enum Stance { DORMANT, INTRO, FIGHT, STAGGERED, DEFEATED }

@export_group("Stats")
@export var max_health: float = 1400.0
@export var phase2_at: float = 0.66
@export var phase3_at: float = 0.33
@export var move_speed: float = 5.0
@export var arm_damage_to_boss: float = 1.0     ## multiplier: arm damage -> boss HP

@export_group("Rhythm")
@export var attack_interval_p1: float = 2.6
@export var attack_interval_p2: float = 1.7
@export var attack_interval_p3: float = 1.3
@export var stagger_time: float = 3.2

@export_group("Phase 3")
@export var shockwave_interval: float = 6.0
@export var shockwave_damage: float = 24.0
@export var shockwave_speed: float = 26.0

const ENERGY := Color(0.30, 0.90, 1.0)
const ENERGY_HOT := Color(1.0, 0.45, 0.20)

var health: float = 1400.0
var phase: int = 1
var stance: Stance = Stance.DORMANT
var arms: Array[RoboticArm] = []
var arena_center: Vector3 = Vector3.ZERO
var arena_radius: float = 34.0

var _attack_timer: float = 0.0
var _shockwave_timer: float = 0.0
var _stagger_timer: float = 0.0
var _move_target: Vector3 = Vector3.ZERO
var _reactor: BossWeakPoint
var _reactor_mesh: MeshInstance3D
var _reactor_mat: ShaderMaterial
var _reactor_light: OmniLight3D
var _rig: Node3D
var _head: Node3D
var _torso: Node3D
var _phase_timer: float = 0.0
var _shockwave_rings: Array[Dictionary] = []
var _walk_phase: float = 0.0
var _harness: Node3D

func _ready() -> void:
	health = max_health
	collision_layer = BrickKit.L_BOSS
	collision_mask = BrickKit.L_WORLD
	add_to_group("boss")
	_build_visual()
	_build_arms()
	set_physics_process(false)

# =============================================================================
#  CONSTRUCTION
# =============================================================================

func _build_visual() -> void:
	_rig = Node3D.new()
	_rig.name = "Rig"
	add_child(_rig)

	var coat := BrickKit.brick(Color(0.16, 0.20, 0.28), true, 0.35)
	var plate := BrickKit.metal(Color(0.40, 0.43, 0.50), 0.3)
	var plate_dark := BrickKit.metal(Color(0.22, 0.24, 0.30), 0.35)
	var skin := BrickKit.brick(Color(0.88, 0.74, 0.56), false, 0.3)
	var glow := BrickKit.neon(ENERGY, 3.0)
	var goggle := BrickKit.neon(Color(1.0, 0.72, 0.2), 2.6)

	# legs (short, braced -- most of his weight rides on the harness)
	for s in [-1.0, 1.0]:
		BrickKit.add_shape(_rig, BrickKit.unit_cylinder(10), Vector3(0.55, 1.5, 0.55),
				Vector3(s * 0.55, 0.75, 0), plate_dark, "Leg")
		BrickKit.add_box(_rig, Vector3(0.7, 0.3, 1.1), Vector3(s * 0.55, 0.15, 0.15), plate, "Foot")

	_torso = Node3D.new()
	_torso.name = "Torso"
	_torso.position = Vector3(0, 1.5, 0)
	_rig.add_child(_torso)
	BrickKit.add_box(_torso, Vector3(1.7, 1.7, 1.1), Vector3(0, 0.85, 0), coat, "Body")
	BrickKit.add_box(_torso, Vector3(1.9, 0.5, 1.25), Vector3(0, 1.55, 0), plate, "Collar")
	# chest control panel
	BrickKit.add_box(_torso, Vector3(1.0, 0.7, 0.15), Vector3(0, 0.95, 0.6), plate_dark, "Panel")
	BrickKit.add_box(_torso, Vector3(0.7, 0.4, 0.08), Vector3(0, 0.95, 0.69), glow, "PanelLight")

	# harness / backpack -- the arms mount here
	_harness = Node3D.new()
	_harness.name = "Harness"
	_harness.position = Vector3(0, 0.9, -0.7)
	_torso.add_child(_harness)
	BrickKit.add_box(_harness, Vector3(2.6, 2.4, 1.4), Vector3.ZERO, plate, "Pack")
	BrickKit.add_box(_harness, Vector3(2.9, 0.4, 1.6), Vector3(0, 1.0, 0), plate_dark, "PackTop")
	BrickKit.add_box(_harness, Vector3(2.9, 0.4, 1.6), Vector3(0, -1.0, 0), plate_dark, "PackBottom")
	for s in [-1.0, 1.0]:
		BrickKit.add_box(_harness, Vector3(0.3, 2.0, 1.5), Vector3(s * 1.35, 0, 0), glow, "PackVein")

	# spine reactor (phase 3 weak point)
	_reactor_mat = BrickKit.neon(ENERGY, 1.2).duplicate() as ShaderMaterial
	_reactor_mesh = MeshInstance3D.new()
	_reactor_mesh.mesh = BrickKit.unit_sphere(10, 16)
	_reactor_mesh.scale = Vector3(1.5, 1.5, 1.5)
	_reactor_mesh.position = Vector3(0, 0, -0.9)
	_reactor_mesh.material_override = _reactor_mat
	_harness.add_child(_reactor_mesh)
	BrickKit.add_shape(_harness, BrickKit.unit_torus(20, 8), Vector3(2.2, 2.2, 2.2),
			Vector3(0, 0, -0.9), plate_dark, "ReactorRing").rotation.x = PI * 0.5

	_reactor = BossWeakPoint.new()
	_reactor.name = "Reactor"
	_reactor.collision_layer = BrickKit.L_BOSS
	_reactor.collision_mask = 0
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 1.5
	shape.shape = sphere
	_reactor.add_child(shape)
	_reactor.position = Vector3(0, 0, -0.9)
	_harness.add_child(_reactor)
	_reactor.bind(self, 2.0)
	_reactor.vulnerable = false          # sealed until phase 3

	_reactor_light = OmniLight3D.new()
	_reactor_light.light_color = ENERGY
	_reactor_light.light_energy = 2.0
	_reactor_light.omni_range = 14.0
	_reactor_light.shadow_enabled = false
	_reactor_light.position = Vector3(0, 0, -1.4)
	_harness.add_child(_reactor_light)

	# head: bald, goggles, breathing rig
	_head = Node3D.new()
	_head.name = "Head"
	_head.position = Vector3(0, 1.95, 0)
	_torso.add_child(_head)
	BrickKit.add_box(_head, Vector3(0.85, 0.85, 0.85), Vector3.ZERO, skin, "Skull")
	BrickKit.add_box(_head, Vector3(0.95, 0.28, 0.9), Vector3(0, 0.12, 0.02), plate_dark, "GoggleStrap")
	for s in [-1.0, 1.0]:
		BrickKit.add_shape(_head, BrickKit.unit_cylinder(10), Vector3(0.34, 0.16, 0.34),
				Vector3(s * 0.22, 0.12, 0.44), goggle, "Lens").rotation.x = PI * 0.5
	BrickKit.add_box(_head, Vector3(0.5, 0.3, 0.3), Vector3(0, -0.3, 0.35), plate, "Respirator")
	for s in [-1.0, 1.0]:
		BrickKit.add_box(_head, Vector3(0.14, 0.14, 0.5), Vector3(s * 0.3, -0.25, -0.1), glow, "Tube")

func _build_arms() -> void:
	# Four arms in a fan around the harness, angled outwards so they never
	# intersect the body while idling.
	var mounts := [
		{"pos": Vector3(-1.5, 1.0, -0.6), "yaw": 0.5},
		{"pos": Vector3(1.5, 1.0, -0.6), "yaw": -0.5},
		{"pos": Vector3(-1.3, -0.4, -0.6), "yaw": 0.9},
		{"pos": Vector3(1.3, -0.4, -0.6), "yaw": -0.9},
	]
	for i in mounts.size():
		var arm := RoboticArm.new()
		arm.name = "Arm%d" % i
		_harness.add_child(arm)
		arm.position = mounts[i]["pos"]
		arm.rotation.y = float(mounts[i]["yaw"])
		arm.build(i, ENERGY)
		arm.weak_point_destroyed.connect(_on_arm_destroyed)
		arms.append(arm)

# =============================================================================
#  FIGHT FLOW
# =============================================================================

## Called by the boss mission once the intro cutscene is done.
func begin_fight(center: Vector3, radius: float) -> void:
	arena_center = center
	arena_radius = radius
	_move_target = center
	stance = Stance.FIGHT
	phase = 1
	set_physics_process(true)
	Events.boss_health_changed.emit(health, max_health, phase)
	AudioManager.play_music("boss")
	AudioManager.play("boss_roar", 1.0)

func _physics_process(delta: float) -> void:
	if stance == Stance.DEFEATED:
		_process_defeated(delta)
		return
	if stance != Stance.FIGHT and stance != Stance.STAGGERED:
		return

	_phase_timer += delta
	_update_shockwaves(delta)

	if stance == Stance.STAGGERED:
		_stagger_timer -= delta
		_face_player(delta * 0.5)
		if _stagger_timer <= 0.0:
			stance = Stance.FIGHT
			for arm in arms:
				if not arm.broken:
					arm.set_mode(RoboticArm.Mode.IDLE)
		_apply_motion(delta, 0.2)
		return

	_face_player(delta)
	match phase:
		1:
			_phase1(delta)
		2:
			_phase2(delta)
		_:
			_phase3(delta)

	_animate(delta)

# --- phases -------------------------------------------------------------------

func _phase1(delta: float) -> void:
	# Anchored: he plants himself and lets the arms do the work.
	_apply_motion(delta, 0.25)
	_attack_timer -= delta
	if _attack_timer <= 0.0:
		_attack_timer = attack_interval_p1
		var arm := _pick_arm()
		if arm == null:
			return
		var player := GameState.get_player()
		if player == null:
			return
		arm.target_point = player.global_position
		if randf() < 0.65:
			arm.set_mode(RoboticArm.Mode.SLAM)
		else:
			arm.set_mode(RoboticArm.Mode.GRAB)

func _phase2(delta: float) -> void:
	# Stalking: repositions constantly, two arms at a time, throws debris.
	_apply_motion(delta, 1.0)
	_attack_timer -= delta
	if _attack_timer <= 0.0:
		_attack_timer = attack_interval_p2
		var player := GameState.get_player()
		if player == null:
			return
		var roll := randf()
		if roll < 0.4:
			for arm in _pick_arms(2):
				arm.target_point = player.global_position
				arm.set_mode(RoboticArm.Mode.SLAM)
		elif roll < 0.7:
			for arm in _pick_arms(2):
				arm.set_mode(RoboticArm.Mode.SWEEP)
		else:
			var arm := _pick_arm()
			if arm != null:
				arm.set_mode(RoboticArm.Mode.THROW)
			_tear_up_arena()
	if _phase_timer > 4.0:
		_phase_timer = 0.0
		_pick_new_position()

func _phase3(delta: float) -> void:
	# Unstable: erratic movement, constant arm pressure, radial shockwaves, and
	# the reactor is finally open.
	_apply_motion(delta, 1.3)
	_attack_timer -= delta
	if _attack_timer <= 0.0:
		_attack_timer = attack_interval_p3
		var player := GameState.get_player()
		if player != null:
			for arm in _pick_arms(3):
				arm.target_point = player.global_position
				arm.set_mode(RoboticArm.Mode.SLAM if randf() < 0.5 else RoboticArm.Mode.SWEEP)
	_shockwave_timer -= delta
	if _shockwave_timer <= 0.0:
		_shockwave_timer = shockwave_interval
		_fire_shockwave()
	if _phase_timer > 3.0:
		_phase_timer = 0.0
		_pick_new_position()

# --- movement -----------------------------------------------------------------

func _apply_motion(delta: float, speed_scale: float) -> void:
	var to_target: Vector3 = _move_target - global_position
	to_target.y = 0.0
	if to_target.length() > 1.5:
		var desired: Vector3 = to_target.normalized() * move_speed * speed_scale
		velocity.x = move_toward(velocity.x, desired.x, 14.0 * delta)
		velocity.z = move_toward(velocity.z, desired.z, 14.0 * delta)
		_walk_phase += delta * 6.0 * speed_scale
	else:
		velocity.x = move_toward(velocity.x, 0.0, 20.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 20.0 * delta)
	if not is_on_floor():
		velocity.y -= 24.0 * delta
	else:
		velocity.y = 0.0
	move_and_slide()

func _pick_new_position() -> void:
	var player := GameState.get_player()
	var angle: float = randf() * TAU
	var radius: float = arena_radius * randf_range(0.25, 0.7)
	_move_target = arena_center + Vector3(cos(angle), 0.0, sin(angle)) * radius
	# Never wander so far that the hero loses him.
	if player != null and _move_target.distance_to(player.global_position) > arena_radius:
		_move_target = arena_center

func _face_player(delta: float) -> void:
	var player := GameState.get_player()
	if player == null:
		return
	var to_player: Vector3 = player.global_position - global_position
	to_player.y = 0.0
	if to_player.length() < 0.1:
		return
	var want: float = atan2(-to_player.x, -to_player.z)
	rotation.y = lerp_angle(rotation.y, want, clampf(2.5 * delta, 0.0, 1.0))

func _animate(delta: float) -> void:
	if _torso != null:
		_torso.rotation.z = sin(_walk_phase) * 0.05
		_torso.position.y = 1.5 + absf(sin(_walk_phase)) * 0.06
	if _head != null:
		var player := GameState.get_player()
		if player != null:
			var local: Vector3 = _head.to_local(player.global_position + Vector3.UP)
			_head.rotation.y = lerpf(_head.rotation.y,
					clampf(atan2(local.x, local.z) * 0.3, -0.6, 0.6), 3.0 * delta)
	if _reactor_mat != null:
		var pulse: float = 1.0 + sin(_phase_timer * 6.0) * 0.5
		_reactor_mat.set_shader_parameter("emission_energy",
				(4.0 * pulse) if phase >= 3 else 1.2)
		_reactor_light.light_energy = 6.0 if phase >= 3 else 2.0

# --- arm helpers --------------------------------------------------------------

func _pick_arm() -> RoboticArm:
	var candidates: Array[RoboticArm] = []
	for arm in arms:
		if not arm.broken and arm.mode == RoboticArm.Mode.IDLE:
			candidates.append(arm)
	if candidates.is_empty():
		return null
	return candidates[randi() % candidates.size()]

func _pick_arms(count: int) -> Array[RoboticArm]:
	var out: Array[RoboticArm] = []
	for i in count:
		var arm := _pick_arm()
		if arm == null:
			break
		# Mark it busy immediately so the next pick chooses a different one.
		arm.set_mode(RoboticArm.Mode.RECOVER)
		out.append(arm)
	return out

func living_arms() -> int:
	var count: int = 0
	for arm in arms:
		if not arm.broken:
			count += 1
	return count

# =============================================================================
#  ATTACKS
# =============================================================================

## Radial energy wave along the floor: the hero has to leave the ground, which
## is exactly what phase 3 is testing.
func _fire_shockwave() -> void:
	AudioManager.play_at("explosion", global_position, 0.7, 120.0)
	GameState.shake_camera(0.4, 0.5)
	Events.toast_requested.emit("Onde de choc ! Quitte le sol !")
	var ring := MeshInstance3D.new()
	ring.mesh = BrickKit.unit_torus(28, 8)
	ring.material_override = BrickKit.neon(ENERGY_HOT, 4.0)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var host: Node = GameState.world if GameState.world != null else get_parent()
	host.add_child(ring)
	ring.global_position = Vector3(global_position.x, 0.8, global_position.z)
	ring.scale = Vector3(2.0, 2.0, 2.0)
	_shockwave_rings.append({"node": ring, "radius": 1.0, "hit": false,
			"origin": ring.global_position})

func _update_shockwaves(delta: float) -> void:
	var finished: Array[Dictionary] = []
	for wave in _shockwave_rings:
		wave["radius"] = float(wave["radius"]) + shockwave_speed * delta
		var radius: float = wave["radius"]
		var node: MeshInstance3D = wave["node"]
		if not is_instance_valid(node):
			finished.append(wave)
			continue
		node.scale = Vector3(radius, radius * 0.4, radius)
		var mat := node.material_override as ShaderMaterial
		if mat != null:
			mat.set_shader_parameter("emission_energy", maxf(4.0 * (1.0 - radius / 45.0), 0.0))
		# Damage the hero only while they are on the ground inside the ring band.
		if not bool(wave["hit"]):
			var player := GameState.get_player()
			if player != null and player is CharacterBody3D:
				var flat_dist: float = Vector2(player.global_position.x - (wave["origin"] as Vector3).x,
						player.global_position.z - (wave["origin"] as Vector3).z).length()
				if absf(flat_dist - radius) < 2.6 and player.global_position.y < 3.0 \
						and (player as CharacterBody3D).is_on_floor():
					wave["hit"] = true
					if player.has_method("take_damage"):
						player.call("take_damage", shockwave_damage, wave["origin"])
					if player.has_method("add_impulse"):
						player.call("add_impulse", Vector3.UP * 9.0)
		if radius > 46.0:
			node.queue_free()
			finished.append(wave)
	for wave in finished:
		_shockwave_rings.erase(wave)

## Phase 2: rip pieces out of the arena and hurl them around.
func _tear_up_arena() -> void:
	if not ObjectPool.is_registered("debris"):
		return
	var host: Node = GameState.world if GameState.world != null else get_parent()
	for i in 3:
		var chunk: Node = ObjectPool.acquire("debris", host)
		if chunk == null:
			continue
		var angle: float = randf() * TAU
		var from: Vector3 = global_position + Vector3(cos(angle), 6.0, sin(angle)) * 6.0
		var to: Vector3 = arena_center + Vector3(cos(angle + 1.2), 0.0, sin(angle + 1.2)) \
				* randf_range(6.0, arena_radius * 0.8)
		if chunk.has_method("launch_at"):
			chunk.call("launch_at", from, to, 16.0)
	GameState.shake_camera(0.25, 0.4)
	AudioManager.play_at("metal_clang", global_position, 0.6)

# =============================================================================
#  DAMAGE
# =============================================================================

## Called by the arms' weak points AND by the reactor (via BossWeakPoint).
func damage_weak_point(amount: float, from_position: Vector3) -> void:
	if stance == Stance.DEFEATED:
		return
	# In phases 1-2 only arm couplings feed damage into the health pool; in
	# phase 3 the reactor is what actually matters (it has a x2 multiplier).
	health = maxf(health - amount * arm_damage_to_boss, 0.0)
	Events.boss_health_changed.emit(health, max_health, phase)
	_check_phase()
	if health <= 0.0:
		_defeat()

func _on_arm_destroyed(arm: RoboticArm) -> void:
	Events.toast_requested.emit("Bras neutralise ! (%d/4)" % (4 - living_arms()))
	GameState.add_score(400)
	# Losing an arm staggers him: the hero's window to press the attack.
	stance = Stance.STAGGERED
	_stagger_timer = stagger_time
	AudioManager.play("boss_roar", 1.15)
	# Damage bleeds through when a limb goes down.
	health = maxf(health - max_health * 0.06, 0.0)
	Events.boss_health_changed.emit(health, max_health, phase)
	_check_phase()
	if living_arms() == 0 and phase < 3:
		# All arms down early -> jump straight to the reactor phase.
		_enter_phase(3)

func _check_phase() -> void:
	var ratio: float = health / max_health
	if ratio <= phase3_at and phase < 3:
		_enter_phase(3)
	elif ratio <= phase2_at and phase < 2:
		_enter_phase(2)

func _enter_phase(new_phase: int) -> void:
	phase = new_phase
	_phase_timer = 0.0
	_attack_timer = 0.4
	MissionManager.boss_phase_reached = maxi(MissionManager.boss_phase_reached, phase)
	Events.boss_health_changed.emit(health, max_health, phase)
	GameState.shake_camera(0.5, 0.7)
	AudioManager.play("boss_roar", 0.9)
	Transition.flash(Color(1, 0.6, 0.2, 0.35), 0.5)

	match phase:
		2:
			Events.dialogue_requested.emit("Docteur Mecanix",
					"Tu abimes mes bras ? J'en ai trois de rechange dans l'atelier !", 4.0)
			Events.toast_requested.emit("PHASE 2 - Il se deplace !")
			for arm in arms:
				arm.speed = 4.4
		3:
			Events.dialogue_requested.emit("Docteur Mecanix",
					"Le reacteur est instable... TANT MIEUX !", 4.0)
			Events.toast_requested.emit("PHASE 3 - Frappe le reacteur dorsal !")
			_reactor.vulnerable = true
			_reactor_mat.set_shader_parameter("base_color", ENERGY_HOT)
			_reactor_mat.set_shader_parameter("emission_tint", ENERGY_HOT)
			_reactor_light.light_color = ENERGY_HOT
			for arm in arms:
				arm.speed = 5.4
				if arm.broken:
					continue
				arm.set_mode(RoboticArm.Mode.IDLE)
	phase_changed.emit(phase)

func _defeat() -> void:
	stance = Stance.DEFEATED
	health = 0.0
	_reactor.vulnerable = false
	Events.boss_health_changed.emit(0.0, max_health, phase)
	Events.boss_defeated.emit()
	for arm in arms:
		if not arm.broken:
			arm.call("_break_arm")
	AudioManager.play("boss_roar", 0.7)
	AudioManager.play("explosion", 0.8)
	GameState.shake_camera(0.8, 1.2)
	GameState.add_score(5000)
	defeated.emit()

func _process_defeated(delta: float) -> void:
	# Collapses forward, reactor venting.
	if _rig != null:
		_rig.rotation.x = lerpf(_rig.rotation.x, deg_to_rad(-55.0), 1.2 * delta)
		_rig.position.y = lerpf(_rig.position.y, -0.6, 1.5 * delta)
	if _reactor_light != null:
		_reactor_light.light_energy = maxf(_reactor_light.light_energy - delta * 2.0, 0.0)
	velocity.y -= 24.0 * delta
	move_and_slide()

func health_ratio() -> float:
	return clampf(health / maxf(max_health, 1.0), 0.0, 1.0)

func is_defeated() -> bool:
	return stance == Stance.DEFEATED

## The body itself shrugs off hits -- the message teaches the fight.
func take_damage(_amount: float, _from_position: Vector3 = Vector3.ZERO,
		_knockback: Vector3 = Vector3.ZERO) -> void:
	AudioManager.play_at("metal_clang", global_position, 1.5, 40.0)
	if phase >= 3:
		Events.toast_requested.emit("Vise le reacteur dans son dos !")
	else:
		Events.toast_requested.emit("Vise les articulations lumineuses des bras !")

func apply_web(_duration: float) -> void:
	pass
