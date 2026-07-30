class_name SwingChallenge
extends Node3D
## SwingChallenge -- the "traverse the rings" side activity.
##
## Lays a chain of glowing rings through the air between rooftops. The hero has
## to fly through them in order before the clock runs out, which is the purest
## test of the swing system in the game.
##
## Scene requirements: created in code by side_activities.gd.

signal ring_passed(index: int, total: int)
signal challenge_completed(time_taken: float)
signal challenge_failed

@export var ring_count: int = 8
@export var ring_radius: float = 4.5
@export var time_limit: float = 60.0

var rings: Array[Area3D] = []
var current_index: int = 0
var running: bool = false
var time_left: float = 0.0

var _rng := RandomNumberGenerator.new()

## Builds a course starting near `start`, wandering through the skyline.
func build_course(start: Vector3, seed_value: int, count: int = 8) -> void:
	_rng.seed = seed_value
	ring_count = count
	var position := start + Vector3(0, 18.0, 0)
	var heading: float = _rng.randf() * TAU
	for i in ring_count:
		heading += _rng.randf_range(-0.5, 0.5)
		var step: float = _rng.randf_range(42.0, 62.0)
		position += Vector3(cos(heading), 0.0, sin(heading)) * step
		position.y = clampf(position.y + _rng.randf_range(-8.0, 10.0), 22.0, 95.0)
		_make_ring(position, heading, i)

func _make_ring(at: Vector3, heading: float, index: int) -> void:
	var ring := Area3D.new()
	ring.name = "Ring%d" % index
	ring.collision_layer = BrickKit.L_TRIGGER
	ring.collision_mask = BrickKit.L_PLAYER
	ring.position = at
	ring.rotation.y = heading + PI * 0.5
	add_child(ring)

	var shape := CollisionShape3D.new()
	var cylinder := CylinderShape3D.new()
	cylinder.radius = ring_radius * 0.9
	cylinder.height = 1.4
	shape.shape = cylinder
	shape.rotation.x = PI * 0.5     # ring opening faces along the course
	ring.add_child(shape)

	var mesh := MeshInstance3D.new()
	mesh.mesh = BrickKit.unit_torus(28, 8)
	mesh.scale = Vector3.ONE * ring_radius * 2.0
	mesh.rotation.x = PI * 0.5
	mesh.material_override = BrickKit.neon(Color(0.3, 0.9, 1.0), 2.4)
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ring.add_child(mesh)

	var light := OmniLight3D.new()
	light.light_color = Color(0.3, 0.9, 1.0)
	light.light_energy = 2.0
	light.omni_range = 12.0
	light.shadow_enabled = false
	ring.add_child(light)

	ring.body_entered.connect(_on_ring_entered.bind(index))
	ring.visible = index == 0        # only the next ring is lit
	rings.append(ring)

func start() -> void:
	running = true
	current_index = 0
	time_left = time_limit
	for i in rings.size():
		rings[i].visible = i == 0
	set_process(true)
	AudioManager.play("mission_start", 1.1)

func _on_ring_entered(body: Node3D, index: int) -> void:
	if not running or index != current_index:
		return
	if body != GameState.get_player():
		return
	rings[index].visible = false
	current_index += 1
	AudioManager.play("ring_pass", 1.0 + float(index) * 0.03)
	GameState.add_score(75)
	ring_passed.emit(current_index, rings.size())
	if current_index >= rings.size():
		running = false
		set_process(false)
		challenge_completed.emit(time_limit - time_left)
		return
	rings[current_index].visible = true
	# Nudge the player towards the next ring.
	Events.mission_marker_changed.emit(rings[current_index].global_position, true)

func _process(delta: float) -> void:
	if not running:
		return
	time_left -= delta
	if time_left <= 0.0:
		running = false
		set_process(false)
		challenge_failed.emit()

func next_ring_position() -> Vector3:
	if current_index < rings.size():
		return rings[current_index].global_position
	return global_position

func cleanup() -> void:
	running = false
	queue_free()
