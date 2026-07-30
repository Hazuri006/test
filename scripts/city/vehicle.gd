class_name Vehicle
extends AnimatableBody3D
## Vehicle -- a brick car, taxi, van or bus driving the street grid.
##
## AnimatableBody3D (not CharacterBody3D): traffic is on rails, but it still has
## to push and carry a CharacterBody3D, so the hero can land on a moving bus and
## ride it. `sync_to_physics` is on by default, which is exactly what we want.
##
## Vehicles are pooled and are valid web-attack targets: sticking one with a web
## stops it, which is how the hero ends the bank-heist getaway.
##
## Collision: layer 128 (vehicle), mask 0 -- traffic never pushes back on the
## world, it just carries what stands on it.

enum Kind { CAR, TAXI, VAN, BUS }

const LANE_OFFSET := 4.2      ## distance right of the street centre line

var kind: Kind = Kind.CAR
var speed: float = 12.0
var base_speed: float = 12.0
var grid_pos: Vector2i = Vector2i.ZERO      ## last intersection reached
var direction: Vector2i = Vector2i(1, 0)
var target_point: Vector3 = Vector3.ZERO
var stopped_timer: float = 0.0
var webbed_timer: float = 0.0
var is_special: bool = false                 ## mission getaway vehicles

var _rng := RandomNumberGenerator.new()
var _visual: Node3D
var _probe: RayCast3D
var _honk_cooldown: float = 0.0
var _web_marks: Node3D

func _ready() -> void:
	collision_layer = BrickKit.L_VEHICLE
	collision_mask = 0
	sync_to_physics = true
	add_to_group("vehicles")

func setup(vehicle_kind: Kind, rng_seed: int) -> void:
	kind = vehicle_kind
	_rng.seed = rng_seed
	if _visual != null:
		_visual.queue_free()
	_visual = Node3D.new()
	_visual.name = "Body"
	add_child(_visual)
	_build_body()
	if _probe == null:
		_probe = RayCast3D.new()
		_probe.collision_mask = BrickKit.L_VEHICLE
		_probe.enabled = true
		add_child(_probe)
	_probe.position = Vector3(0, 0.8, 0)
	_probe.target_position = Vector3(0, 0, -_length() - 5.0)

func _length() -> float:
	match kind:
		Kind.BUS: return 11.0
		Kind.VAN: return 6.4
		_: return 4.6

func _build_body() -> void:
	var body_color := BrickKit.pick_accent()
	var glass := BrickKit.glass(false)
	var dark := BrickKit.brick(Color(0.12, 0.13, 0.15), false, 0.4)
	var tyre := BrickKit.brick(Color(0.09, 0.09, 0.10), false, 0.75)
	var chrome := BrickKit.metal(Color(0.75, 0.77, 0.8), 0.2)
	var head := BrickKit.neon(Color(1.0, 0.96, 0.85), 2.6)
	var tail := BrickKit.neon(Color(1.0, 0.2, 0.15), 2.2)

	match kind:
		Kind.TAXI:
			body_color = Color(0.98, 0.78, 0.08)
		Kind.BUS:
			body_color = Color(0.15, 0.45, 0.75)
		Kind.VAN:
			body_color = Color(0.9, 0.9, 0.88)

	var mat := BrickKit.brick(body_color, true, 0.18)
	var l := _length()
	var w := 2.5 if kind != Kind.BUS else 2.9
	var h := 1.25 if kind != Kind.BUS else 2.0

	# chassis
	BrickKit.add_box(_visual, Vector3(w, h, l), Vector3(0, h * 0.5 + 0.45, 0), mat, "Chassis")
	# cabin / roof
	if kind == Kind.BUS:
		BrickKit.add_box(_visual, Vector3(w * 0.98, 0.35, l * 0.98),
				Vector3(0, h + 0.62, 0), BrickKit.brick(body_color.lightened(0.2), true, 0.2), "Roof")
		for i in 5:
			var z: float = -l * 0.4 + float(i) * (l * 0.2)
			for s in [-1.0, 1.0]:
				BrickKit.add_box(_visual, Vector3(0.12, 0.9, l * 0.15),
						Vector3(s * w * 0.5, h * 0.5 + 0.75, z), glass, "Win%d" % i)
	else:
		var cab_l: float = l * 0.42
		BrickKit.add_box(_visual, Vector3(w * 0.86, 0.85, cab_l),
				Vector3(0, h + 0.85, -l * 0.05), mat, "Cabin")
		BrickKit.add_box(_visual, Vector3(w * 0.8, 0.6, 0.14),
				Vector3(0, h + 0.9, -l * 0.05 - cab_l * 0.5), glass, "Windshield")
		BrickKit.add_box(_visual, Vector3(w * 0.8, 0.6, 0.14),
				Vector3(0, h + 0.9, -l * 0.05 + cab_l * 0.5), glass, "RearGlass")
		for s in [-1.0, 1.0]:
			BrickKit.add_box(_visual, Vector3(0.14, 0.55, cab_l * 0.8),
					Vector3(s * w * 0.43, h + 0.9, -l * 0.05), glass, "SideGlass")
	# bumpers + lights
	BrickKit.add_box(_visual, Vector3(w * 1.02, 0.35, 0.3), Vector3(0, 0.75, -l * 0.5), chrome, "BumperF")
	BrickKit.add_box(_visual, Vector3(w * 1.02, 0.35, 0.3), Vector3(0, 0.75, l * 0.5), chrome, "BumperR")
	for s in [-1.0, 1.0]:
		BrickKit.add_box(_visual, Vector3(0.5, 0.28, 0.16),
				Vector3(s * w * 0.32, 1.05, -l * 0.5 - 0.05), head, "Head")
		BrickKit.add_box(_visual, Vector3(0.45, 0.25, 0.16),
				Vector3(s * w * 0.32, 1.05, l * 0.5 + 0.05), tail, "Tail")
	# wheels
	var axles: Array[float] = [-l * 0.32, l * 0.32]
	if kind == Kind.BUS:
		axles = [-l * 0.34, l * 0.05, l * 0.34]
	for az in axles:
		for s in [-1.0, 1.0]:
			var wheel := BrickKit.add_shape(_visual, BrickKit.unit_cylinder(10),
					Vector3(0.9, 0.34, 0.9), Vector3(s * w * 0.5, 0.45, az), tyre, "Wheel")
			wheel.rotation.z = PI * 0.5
	# taxi sign / roof detail
	if kind == Kind.TAXI:
		BrickKit.add_box(_visual, Vector3(1.0, 0.3, 0.5), Vector3(0, h + 1.4, -l * 0.05),
				BrickKit.neon(Color(1.0, 0.85, 0.3), 2.0), "TaxiSign")
		for s in [-1.0, 1.0]:
			BrickKit.add_box(_visual, Vector3(0.06, 0.5, 1.6), Vector3(s * w * 0.51, 1.2, 0),
					BrickKit.brick(Color(0.1, 0.1, 0.12), false, 0.3), "Stripe")

	# collision shape sized to the body
	for child in get_children():
		if child is CollisionShape3D:
			child.queue_free()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(w, h + 1.2, l)
	shape.shape = box
	shape.position = Vector3(0, (h + 1.2) * 0.5 + 0.3, 0)
	add_child(shape)

# =============================================================================
#  DRIVING  (the traffic system calls drive() from its _physics_process)
# =============================================================================

func drive(delta: float) -> void:
	if webbed_timer > 0.0:
		webbed_timer -= delta
		speed = move_toward(speed, 0.0, 40.0 * delta)
	else:
		var blocked: bool = _probe != null and _probe.is_colliding()
		var wanted: float = 0.0 if blocked else base_speed
		speed = move_toward(speed, wanted, (26.0 if blocked else 9.0) * delta)
		if blocked and _honk_cooldown <= 0.0:
			_honk_cooldown = _rng.randf_range(2.5, 6.0)
			AudioManager.play_at("ui_back", global_position, _rng.randf_range(0.5, 0.8), 70.0)
	_honk_cooldown = maxf(_honk_cooldown - delta, 0.0)

	var to_target: Vector3 = target_point - global_position
	to_target.y = 0.0
	var dist: float = to_target.length()
	if dist < 2.5:
		_pick_next_target()
		return
	var dir: Vector3 = to_target / dist
	global_position += dir * speed * delta
	global_position.y = 0.0
	# Smooth heading so turns are not instant snaps.
	var want_yaw: float = atan2(-dir.x, -dir.z)
	rotation.y = lerp_angle(rotation.y, want_yaw, clampf(6.0 * delta, 0.0, 1.0))

func _pick_next_target() -> void:
	grid_pos += direction
	# Bounce back inside the grid when leaving it.
	if grid_pos.x < 0 or grid_pos.x > CityLayout.GRID or grid_pos.y < 0 or grid_pos.y > CityLayout.GRID:
		grid_pos = grid_pos.clamp(Vector2i.ZERO, Vector2i(CityLayout.GRID, CityLayout.GRID))
		direction = -direction
	elif _rng.randf() < 0.32:
		# turn left or right at the crossing
		var turn: int = 1 if _rng.randf() < 0.5 else -1
		direction = Vector2i(-direction.y * turn, direction.x * turn)
	target_point = _lane_point(grid_pos + direction)

func _lane_point(intersection: Vector2i) -> Vector3:
	var c := CityLayout.intersection_center(
			clampi(intersection.x, 0, CityLayout.GRID),
			clampi(intersection.y, 0, CityLayout.GRID))
	# Right-hand traffic: offset perpendicular to the direction of travel.
	var right := Vector3(-float(direction.y), 0.0, float(direction.x))
	return c + right * LANE_OFFSET

## Places the vehicle at an intersection and points it somewhere sensible.
func place(intersection: Vector2i, dir: Vector2i) -> void:
	grid_pos = intersection
	direction = dir
	global_position = _lane_point(intersection)
	global_position.y = 0.0
	target_point = _lane_point(intersection + direction)
	rotation.y = atan2(-float(direction.x), -float(direction.y))
	speed = base_speed

# =============================================================================
#  REACTIONS
# =============================================================================

## Web attacks stick the wheels to the road.
func apply_web(duration: float) -> void:
	webbed_timer = maxf(webbed_timer, duration)
	AudioManager.play_at("web_attach", global_position, 0.8)
	if _web_marks == null:
		_web_marks = Node3D.new()
		add_child(_web_marks)
		var mat := BrickKit.brick(Color(0.94, 0.96, 1.0), false, 0.5)
		for i in 5:
			var b := BrickKit.add_box(_web_marks, Vector3(2.6, 0.12, 0.5),
					Vector3(0, 0.9 + float(i) * 0.25, _rng.randf_range(-1.6, 1.6)), mat, "Web%d" % i)
			b.rotation.z = _rng.randf_range(-0.5, 0.5)
	_web_marks.visible = true

func take_damage(amount: float, from_position: Vector3 = Vector3.ZERO,
		_knockback: Vector3 = Vector3.ZERO) -> void:
	# Traffic does not have hit points; a solid hit just stops it dead.
	apply_web(3.0)
	AudioManager.play_at("metal_clang", global_position, 1.0)
	GameState.shake_camera(0.1, 0.2)
	if is_special:
		# Mission vehicles report the hit so the chase can end.
		Events.enemy_damaged.emit(self, amount)

func is_stopped() -> bool:
	return speed < 0.5

func pool_acquired() -> void:
	webbed_timer = 0.0
	speed = base_speed
	if _web_marks != null:
		_web_marks.visible = false

func pool_released() -> void:
	webbed_timer = 0.0
	speed = 0.0
