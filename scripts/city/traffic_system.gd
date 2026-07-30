extends Node3D
## TrafficSystem -- keeps a small fleet of vehicles alive around the player.
##
## Traffic is a "budget" system, not a simulation: a fixed number of vehicles
## exists at all times, and any vehicle that drifts too far from the hero is
## recycled to a road just outside their view. That keeps the city looking busy
## everywhere for a constant, tiny cost.
##
## Scene requirements: created by CityGenerator. Vehicles come from ObjectPool.
##
## Inspector parameters: vehicle_count, active_radius, recycle_radius,
## spawn_min_distance.

@export var vehicle_count: int = 26
@export var active_radius: float = 220.0      ## beyond this, vehicles stop updating
@export var recycle_radius: float = 340.0     ## beyond this, they are moved
@export var spawn_min_distance: float = 70.0

var vehicles: Array[Vehicle] = []
var _rng := RandomNumberGenerator.new()
var _recycle_timer: float = 0.0

func start(world_seed: int) -> void:
	_rng.seed = world_seed + 4242
	if not ObjectPool.is_registered("vehicle"):
		ObjectPool.register("vehicle", func() -> Node: return Vehicle.new(), 0)
	for i in vehicle_count:
		var v := ObjectPool.acquire("vehicle", self) as Vehicle
		if v == null:
			continue
		var kind := _random_kind()
		v.setup(kind, _rng.randi())
		v.base_speed = _speed_for(kind)
		_place_random(v, false)
		vehicles.append(v)

func _random_kind() -> Vehicle.Kind:
	var roll := _rng.randf()
	if roll < 0.42:
		return Vehicle.Kind.CAR
	elif roll < 0.72:
		return Vehicle.Kind.TAXI
	elif roll < 0.9:
		return Vehicle.Kind.VAN
	return Vehicle.Kind.BUS

func _speed_for(kind: Vehicle.Kind) -> float:
	match kind:
		Vehicle.Kind.BUS: return _rng.randf_range(7.0, 10.0)
		Vehicle.Kind.VAN: return _rng.randf_range(9.0, 13.0)
		_: return _rng.randf_range(11.0, 16.0)

func _physics_process(delta: float) -> void:
	var player_pos := GameState.player_position()
	for v in vehicles:
		if not is_instance_valid(v):
			continue
		var dist: float = v.global_position.distance_to(player_pos)
		if dist > active_radius:
			continue           # far traffic freezes: nobody can tell
		v.drive(delta)

	# Recycling is staggered so we never move the whole fleet in one frame.
	_recycle_timer -= delta
	if _recycle_timer <= 0.0:
		_recycle_timer = 0.75
		_recycle_far_vehicles(player_pos)

func _recycle_far_vehicles(player_pos: Vector3) -> void:
	for v in vehicles:
		if not is_instance_valid(v):
			continue
		if v.is_special:
			continue
		if v.global_position.distance_to(player_pos) > recycle_radius:
			_place_random(v, true)

## Puts a vehicle on a random road, optionally biased to stay near the hero but
## out of sight.
func _place_random(v: Vehicle, near_player: bool) -> void:
	var attempts := 0
	while attempts < 12:
		attempts += 1
		var i: int = _rng.randi_range(0, CityLayout.GRID)
		var j: int = _rng.randi_range(0, CityLayout.GRID)
		var dir_choices: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
		var dir: Vector2i = dir_choices[_rng.randi_range(0, 3)]
		var candidate := CityLayout.intersection_center(i, j)
		if near_player:
			var d: float = candidate.distance_to(GameState.player_position())
			if d < spawn_min_distance or d > recycle_radius * 0.8:
				continue
		v.place(Vector2i(i, j), dir)
		v.webbed_timer = 0.0
		return
	v.place(Vector2i(_rng.randi_range(0, CityLayout.GRID), _rng.randi_range(0, CityLayout.GRID)),
			Vector2i(1, 0))

# =============================================================================
#  MISSION SUPPORT
# =============================================================================

## Spawns a scripted getaway vehicle at `where`, driving away from the hero.
## Returns the vehicle so the mission can track it.
func spawn_getaway(where: Vector3, speed: float = 20.0) -> Vehicle:
	var v := ObjectPool.acquire("vehicle", self) as Vehicle
	if v == null:
		return null
	v.setup(Vehicle.Kind.VAN, _rng.randi())
	v.is_special = true
	v.base_speed = speed
	var nearest := CityLayout.nearest_street_point(where)
	var i: int = clampi(int(roundf((nearest.x - CityLayout.origin_offset()) / CityLayout.pitch())),
			0, CityLayout.GRID)
	var j: int = clampi(int(roundf((nearest.z - CityLayout.origin_offset()) / CityLayout.pitch())),
			0, CityLayout.GRID)
	v.place(Vector2i(i, j), Vector2i(1, 0))
	vehicles.append(v)
	return v

func despawn(v: Vehicle) -> void:
	vehicles.erase(v)
	ObjectPool.release(v)

func vehicles_near(position: Vector3, radius: float) -> Array[Vehicle]:
	var out: Array[Vehicle] = []
	for v in vehicles:
		if is_instance_valid(v) and v.global_position.distance_to(position) <= radius:
			out.append(v)
	return out
