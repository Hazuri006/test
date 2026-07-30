extends Node3D
## WebSystem -- node name "WebSystem", child of Player.
##
## THE core mechanic. Handles anchor finding, the strand visuals, pendulum
## physics, zip-lines and the one-shot strands used by web attacks.
##
## Design rules that make it feel good rather than fighting the player:
##   * The hero is NEVER teleported. Attaching only changes velocity and rope
##     length; the constraint is solved by removing outward velocity plus a
##     soft positional correction.
##   * Anchors are found with a primary camera ray and, if that misses, an
##     upward-biased assist cone. If nothing valid is found, no web is created
##     (the shot simply fails, with a dry click).
##   * Momentum is conserved on release, with a bonus when releasing on the
##     upswing -- that is what lets skilled players gain height across a city.
##   * Rope length never grows: slack is taken in automatically, and holding
##     sprint reels in for a tighter, faster arc.
##
## Scene requirements: none beyond being a child of the Player (creates its own
## strand meshes at runtime).
##
## Inspector parameters: max_web_distance, min_rope_length, swing_gravity,
## pump_acceleration, steer_acceleration, reel_speed, release_boost,
## assist_angle_degrees, max_swing_speed.

signal attached(point: Vector3)
signal released

@export_group("Reach")
@export var max_web_distance: float = 58.0
@export var min_rope_length: float = 5.0
@export var assist_angle_degrees: float = 26.0
@export var assist_samples: int = 14
@export var min_anchor_height: float = 2.5   ## anchor must be this far above the hero

@export_group("Swing physics")
@export var swing_gravity: float = 30.0       ## heavier than walking gravity: speed!
@export var pump_acceleration: float = 34.0
@export var steer_acceleration: float = 26.0
@export var reel_speed: float = 9.0
@export var rope_stiffness: float = 22.0
@export var max_correction: float = 26.0
@export var max_swing_speed: float = 62.0
@export var release_boost: float = 5.5
@export var attach_pull: float = 8.0
@export var ground_launch_speed: float = 8.5   ## upward kick when starting on foot

@export_group("Zip line")
@export var zip_speed: float = 46.0
@export var zip_arrive_distance: float = 3.0

@export_group("Look")
@export var strand_thickness: float = 0.09

var attach_point: Vector3 = Vector3.ZERO
var rope_length: float = 0.0
var is_attached: bool = false
var aim_valid: bool = false
var aim_point: Vector3 = Vector3.ZERO
var aim_normal: Vector3 = Vector3.UP
var zip_target: Vector3 = Vector3.ZERO
var is_zipping: bool = false

var _player: CharacterBody3D
var _camera_rig: Node3D
var _animator: Node3D
var _strand: MeshInstance3D
var _strand_mat: ShaderMaterial
var _shoot_progress: float = 0.0
var _tension: float = 0.0
var _ray: RayCast3D
var _indicator: MeshInstance3D
var _indicator_pulse: float = 0.0

func _ready() -> void:
	_player = get_parent() as CharacterBody3D
	_camera_rig = _player.get_node_or_null("CameraRig")
	_animator = _player.get_node_or_null("Visual")

	# Reusable ray for anchor probing (cheaper and more predictable than
	# allocating PhysicsRayQueryParameters every frame).
	_ray = RayCast3D.new()
	_ray.name = "AnchorProbe"
	_ray.enabled = false
	_ray.collision_mask = BrickKit.MASK_WEB_TARGETS
	_ray.collide_with_areas = false
	_ray.collide_with_bodies = true
	add_child(_ray)

	# Anchor indicator: a small ring drawn on the surface the hero would web to.
	# The HUD reticle says "a target exists"; this says exactly WHERE, which is
	# what makes long-distance swinging aimable.
	_indicator = MeshInstance3D.new()
	_indicator.name = "AnchorIndicator"
	_indicator.mesh = BrickKit.unit_torus(20, 6)
	_indicator.material_override = BrickKit.neon(Color(0.55, 0.95, 1.0), 3.0)
	_indicator.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_indicator.top_level = true
	_indicator.visible = false
	add_child(_indicator)

	_strand = MeshInstance3D.new()
	_strand.name = "Strand"
	_strand.mesh = BrickKit.unit_cylinder(6)
	_strand_mat = BrickKit.web_material().duplicate() as ShaderMaterial
	_strand.material_override = _strand_mat
	_strand.top_level = true
	_strand.visible = false
	_strand.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_strand)

# =============================================================================
#  AIMING
# =============================================================================

## Refreshes `aim_valid` / `aim_point`. Called by the player every frame; the
## HUD reticle and the "can I web that?" indicator both read the result.
func update_aim() -> void:
	var previous := aim_valid
	var found := _find_anchor(true)
	aim_valid = not found.is_empty()
	if aim_valid:
		aim_point = found["point"]
		aim_normal = found["normal"]
	if aim_valid != previous:
		Events.web_target_available.emit(aim_valid)
	_update_indicator()

## Places the anchor ring flat against the surface the ray hit.
func _update_indicator() -> void:
	if _indicator == null:
		return
	var show: bool = aim_valid and not is_attached and not is_zipping
	_indicator.visible = show
	if not show:
		return
	var normal: Vector3 = aim_normal if aim_normal.length() > 0.01 else Vector3.UP
	var up: Vector3 = normal.normalized()
	var reference: Vector3 = Vector3.FORWARD
	if absf(up.dot(reference)) > 0.95:
		reference = Vector3.RIGHT
	var x_axis: Vector3 = reference.cross(up).normalized()
	var z_axis: Vector3 = x_axis.cross(up).normalized()
	# Scale with distance so the ring keeps a constant size on screen.
	var distance: float = _player.global_position.distance_to(aim_point)
	var ring: float = clampf(0.5 + distance * 0.035, 0.5, 2.6) * (1.0 + sin(_indicator_pulse) * 0.07)
	_indicator.global_transform = Transform3D(
			Basis(x_axis, up, z_axis).scaled(Vector3(ring, ring * 0.35, ring)),
			aim_point + up * 0.12)

## Searches for a usable anchor.
## `for_swing` requires the anchor to be above the hero so the pendulum works.
## Returns {} or {point: Vector3, normal: Vector3, body: Object}.
func _find_anchor(for_swing: bool) -> Dictionary:
	if _camera_rig == null:
		return {}
	var origin: Vector3 = _camera_rig.aim_ray_origin()
	var forward: Vector3 = _camera_rig.aim_ray_direction()
	var best: Dictionary = {}
	var best_score: float = -1.0

	# 1. straight down the crosshair
	var hit := _probe(origin, forward, for_swing)
	if not hit.is_empty():
		return hit

	# 2. assist cone -- sample a spiral around the aim direction, biased upward,
	#    so looking roughly at a skyline still connects.
	var up: Vector3 = Vector3.UP
	var right: Vector3 = forward.cross(up).normalized()
	if right.length_squared() < 0.001:
		right = Vector3.RIGHT
	var real_up: Vector3 = right.cross(forward).normalized()
	var max_angle: float = deg_to_rad(assist_angle_degrees)
	for i in assist_samples:
		var t: float = float(i) / float(maxi(assist_samples - 1, 1))
		var angle: float = max_angle * (0.35 + 0.65 * t)
		var spiral: float = t * TAU * 2.4
		# Bias the vertical component upward: swinging works from above.
		var dir: Vector3 = (forward
				+ right * sin(spiral) * angle
				+ real_up * (cos(spiral) * angle + angle * 0.55)).normalized()
		var probe := _probe(origin, dir, for_swing)
		if probe.is_empty():
			continue
		# Prefer anchors close to where the player is actually looking.
		var score: float = forward.dot((probe["point"] - origin).normalized())
		if score > best_score:
			best_score = score
			best = probe
	return best

func _probe(origin: Vector3, direction: Vector3, for_swing: bool) -> Dictionary:
	_ray.global_position = origin
	_ray.target_position = _ray.to_local(origin + direction * max_web_distance)
	_ray.force_raycast_update()
	if not _ray.is_colliding():
		return {}
	var point: Vector3 = _ray.get_collision_point()
	var normal: Vector3 = _ray.get_collision_normal()
	if for_swing:
		if point.y < _player.global_position.y + min_anchor_height:
			return {}
		# Reject near-horizontal ceilings pointing away and floor hits.
		if normal.y < -0.5:
			return {}
	if point.distance_to(_player.global_position) > max_web_distance:
		return {}
	return {"point": point, "normal": normal, "body": _ray.get_collider()}

# =============================================================================
#  ATTACH / RELEASE
# =============================================================================

func try_attach() -> bool:
	var found := _find_anchor(true)
	if found.is_empty():
		AudioManager.play("ui_back", 1.6, -12.0)
		return false
	attach_point = found["point"]
	is_attached = true
	is_zipping = false
	_shoot_progress = 0.0
	if _indicator != null:
		_indicator.visible = false
	rope_length = clampf(_player.global_position.distance_to(attach_point),
			min_rope_length, max_web_distance)
	_strand.visible = true

	# Snappy start: a nudge along the rope tangent so the swing begins with
	# intent instead of hanging limp.
	var to_anchor: Vector3 = (attach_point - _player.global_position).normalized()
	var tangent: Vector3 = _player.velocity - to_anchor * _player.velocity.dot(to_anchor)
	if tangent.length() < 3.0:
		var flat: Vector3 = Vector3(to_anchor.x, 0.0, to_anchor.z).normalized()
		tangent = flat * 6.0
	_player.velocity += tangent.normalized() * attach_pull
	# Starting from a standstill on the pavement must still launch the hero:
	# without this kick the rope goes taut against the floor and nothing happens,
	# which reads as the web having failed.
	if _player.is_on_floor():
		_player.velocity.y = maxf(_player.velocity.y, ground_launch_speed)

	AudioManager.play("web_shoot", randf_range(0.94, 1.08))
	AudioManager.play("web_attach", randf_range(0.95, 1.1), -6.0)
	Events.web_attached.emit(attach_point)
	attached.emit(attach_point)
	return true

func release(with_boost: bool = true) -> void:
	if not is_attached:
		return
	is_attached = false
	_strand.visible = false
	_tension = 0.0
	if with_boost:
		# Releasing while rising converts rope tension into height. Releasing at
		# the bottom of the arc keeps raw speed. Both are useful, on purpose.
		var v: Vector3 = _player.velocity
		if v.y > 1.0:
			_player.velocity.y += release_boost
		else:
			_player.velocity += v.normalized() * (release_boost * 0.45)
		_player.velocity = _player.velocity.limit_length(max_swing_speed)
	AudioManager.play("web_release", randf_range(0.9, 1.1), -8.0)
	Events.web_released.emit()
	released.emit()

# =============================================================================
#  SWING PHYSICS  (called from Player._physics_process, before move_and_slide)
# =============================================================================

## Returns false when the rope should break (anchor lost / behind a wall).
func apply_swing_physics(delta: float, input_forward: float, input_side: float,
		reel_in: bool) -> bool:
	if not is_attached:
		return false

	var pos: Vector3 = _player.global_position
	var to_anchor: Vector3 = attach_point - pos
	var dist: float = to_anchor.length()
	if dist < 0.05:
		return false
	var dir: Vector3 = to_anchor / dist        # unit vector hero -> anchor

	# Rope too long (anchor destroyed, hero blasted away) -> snap.
	if dist > max_web_distance * 1.25:
		return false

	# --- gravity (stronger than on foot: swings should feel fast) ------------
	_player.velocity.y -= swing_gravity * delta

	# --- rope length management ---------------------------------------------
	# Never let slack accumulate; optionally reel in for a tighter arc.
	rope_length = minf(rope_length, maxf(dist, min_rope_length))
	if reel_in:
		rope_length = maxf(rope_length - reel_speed * delta, min_rope_length)

	# --- player-driven pumping ----------------------------------------------
	var radial: float = _player.velocity.dot(dir)
	var tangent: Vector3 = _player.velocity - dir * radial
	if tangent.length() > 0.5:
		var tan_dir: Vector3 = tangent.normalized()
		_player.velocity += tan_dir * pump_acceleration * input_forward * delta
		var side_dir: Vector3 = tan_dir.cross(dir).normalized()
		_player.velocity += side_dir * steer_acceleration * input_side * delta
		# Automatic pump: gain a little on the downswing like a real pendulum
		# being driven. Keeps long chains of swings flowing without spam.
		if _player.velocity.y < 0.0:
			_player.velocity += tan_dir * pump_acceleration * 0.28 * delta

	# --- constraint ---------------------------------------------------------
	if dist >= rope_length:
		# 1. remove the outward (away-from-anchor) velocity component
		var outward: float = -_player.velocity.dot(dir)
		if outward > 0.0:
			_player.velocity += dir * outward
		# 2. soft positional correction pulls the hero back onto the sphere
		var error: float = dist - rope_length
		_player.velocity += dir * minf(error * rope_stiffness, max_correction)
		_tension = clampf(error * 2.0 + absf(outward) / 20.0, 0.0, 1.0)
	else:
		_tension = lerpf(_tension, 0.0, 6.0 * delta)

	_player.velocity = _player.velocity.limit_length(max_swing_speed)
	return true

# =============================================================================
#  ZIP LINE
# =============================================================================

## Instant pull towards a surface -- great for gaining height or reaching a roof.
func try_zip() -> bool:
	var found := _find_anchor(false)
	if found.is_empty():
		AudioManager.play("ui_back", 1.6, -12.0)
		return false
	zip_target = found["point"]
	is_zipping = true
	is_attached = false
	attach_point = zip_target
	_shoot_progress = 0.0
	_strand.visible = true
	AudioManager.play("web_shoot", 0.85)
	AudioManager.play("zip", 1.0, -4.0)
	return true

## Returns false once the hero has arrived (or the pull is impossible).
func apply_zip_physics(delta: float) -> bool:
	if not is_zipping:
		return false
	var to_target: Vector3 = zip_target - _player.global_position
	var dist: float = to_target.length()
	if dist <= zip_arrive_distance:
		end_zip(true)
		return false
	var dir: Vector3 = to_target / dist
	# Blend towards pure pull so the hero curves instead of snapping.
	_player.velocity = _player.velocity.lerp(dir * zip_speed, clampf(10.0 * delta, 0.0, 1.0))
	return true

func end_zip(arrived: bool) -> void:
	if not is_zipping:
		return
	is_zipping = false
	_strand.visible = false
	if arrived:
		# Small pop upwards so the hero lands on the ledge instead of into it.
		_player.velocity = _player.velocity * 0.35 + Vector3.UP * 7.0

# =============================================================================
#  ONE-SHOT STRANDS (web attacks, web-pull, tying up a getaway car)
# =============================================================================

## Fires a purely cosmetic strand between two points for `duration` seconds.
func spawn_strand(from: Vector3, to: Vector3, duration: float = 0.22) -> void:
	var line := MeshInstance3D.new()
	line.mesh = BrickKit.unit_cylinder(6)
	var mat := BrickKit.web_material().duplicate() as ShaderMaterial
	mat.set_shader_parameter("progress", 0.0)
	line.material_override = mat
	line.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var host: Node = GameState.world if GameState.world != null else get_tree().current_scene
	if host == null:
		return
	host.add_child(line)
	_orient_strand(line, from, to, strand_thickness * 0.8)
	var tw := line.create_tween()
	tw.tween_method(func(v: float) -> void: mat.set_shader_parameter("progress", v), 0.0, 1.0, 0.06)
	tw.tween_interval(duration)
	tw.tween_method(func(v: float) -> void: mat.set_shader_parameter("progress", v), 1.0, 0.0, 0.1)
	tw.tween_callback(line.queue_free)

# =============================================================================
#  VISUALS
# =============================================================================

func _process(delta: float) -> void:
	_indicator_pulse += delta * 4.0
	if not _strand.visible:
		return
	_shoot_progress = minf(_shoot_progress + delta * 14.0, 1.0)
	_strand_mat.set_shader_parameter("progress", _shoot_progress)
	_strand_mat.set_shader_parameter("tension", _tension)

	var from: Vector3 = _hand_position()
	var to: Vector3 = attach_point
	_orient_strand(_strand, from, to, strand_thickness * (1.0 - _tension * 0.25))

	# Point the shooting arm at the anchor, and look where we are going.
	if _animator != null and _animator.has_method("aim_arm_at"):
		_animator.aim_arm_at(to, true, 1.0)

func _hand_position() -> Vector3:
	if _animator != null and _animator.has_method("web_origin"):
		var origin: Node3D = _animator.web_origin(true)
		if origin != null:
			return origin.global_position
	return _player.global_position + Vector3.UP * 1.4

## Stretches a unit cylinder (Y axis) between two world points.
func _orient_strand(node: MeshInstance3D, from: Vector3, to: Vector3, thickness: float) -> void:
	var delta_v: Vector3 = to - from
	var length: float = delta_v.length()
	if length < 0.01:
		node.visible = false
		return
	var up: Vector3 = delta_v / length
	var reference: Vector3 = Vector3.FORWARD
	if absf(up.dot(reference)) > 0.95:
		reference = Vector3.RIGHT
	var x_axis: Vector3 = reference.cross(up).normalized()
	var z_axis: Vector3 = x_axis.cross(up).normalized()
	var basis := Basis(x_axis, up, z_axis).scaled(Vector3(thickness, length, thickness))
	node.global_transform = Transform3D(basis, from + delta_v * 0.5)

func tension() -> float:
	return _tension
