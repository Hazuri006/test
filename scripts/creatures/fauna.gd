extends Node3D
class_name Fauna

## Peuplement : cree et recycle les bancs de poissons autour du joueur.

const SPECIES := [
	{"name": "Peeper", "tint": Color(0.32, 0.58, 0.88), "size": 16, "length": 0.34,
		"biomes": [Biome.Kind.SHALLOWS, Biome.Kind.KELP]},
	{"name": "Bladderfish", "tint": Color(0.85, 0.78, 0.45), "size": 9,
		"length": 0.3, "biomes": [Biome.Kind.SHALLOWS, Biome.Kind.PLATEAU]},
	{"name": "Hoopfish", "tint": Color(0.55, 0.75, 0.55), "size": 20,
		"length": 0.26, "biomes": [Biome.Kind.KELP, Biome.Kind.PLATEAU]},
	{"name": "Boomerang", "tint": Color(0.85, 0.45, 0.55), "size": 12,
		"length": 0.38, "biomes": [Biome.Kind.PLATEAU, Biome.Kind.REEF]},
	{"name": "Eyeye", "tint": Color(0.35, 0.85, 0.8), "size": 8, "length": 0.42,
		"biomes": [Biome.Kind.REEF, Biome.Kind.DEEP]},
]

@export var spawn_radius: float = 95.0
@export var despawn_radius: float = 140.0

var camera: Camera3D
var max_schools: int = 12
var _schools: Array[FishSchool] = []
var _timer := 0.0
var _rng := RandomNumberGenerator.new()

func _ready() -> void:
	max_schools = int(Settings.get_p(&"fish_schools", 12))
	_rng.randomize()

func set_camera(cam: Camera3D) -> void:
	camera = cam

func _process(delta: float) -> void:
	if camera == null or not is_instance_valid(camera):
		return
	var cam_pos := camera.global_position

	# recyclage des bancs trop lointains
	for i in range(_schools.size() - 1, -1, -1):
		var s := _schools[i]
		if not is_instance_valid(s):
			_schools.remove_at(i)
			continue
		var d := s.home.distance_to(cam_pos)
		if d > despawn_radius:
			s.queue_free()
			_schools.remove_at(i)
		else:
			# les bancs lointains cessent de calculer leurs boids
			s.set_active(d < spawn_radius * 1.25)

	_timer -= delta
	if _timer > 0.0 or _schools.size() >= max_schools:
		return
	_timer = 0.6
	_try_spawn(cam_pos)

func _try_spawn(cam_pos: Vector3) -> void:
	var a := _rng.randf() * TAU
	var r := _rng.randf_range(spawn_radius * 0.45, spawn_radius)
	var x := cam_pos.x + cos(a) * r
	var z := cam_pos.z + sin(a) * r
	var floor_y := Biome.height(x, z)
	if floor_y > -6.0:
		return
	var kind := Biome.kind_at(x, z, floor_y)

	var candidates: Array = SPECIES.filter(func(s): return kind in s["biomes"])
	if candidates.is_empty():
		return
	var spec: Dictionary = candidates[_rng.randi_range(0, candidates.size() - 1)]

	var y: float = clampf(floor_y + _rng.randf_range(2.0, 14.0), floor_y + 1.5, -2.0)
	var school := FishSchool.new()
	school.name = "School_%s" % spec["name"]
	add_child(school)
	school.setup(Vector3(x, y, z), spec["size"], spec["tint"], spec["length"])
	_schools.append(school)
