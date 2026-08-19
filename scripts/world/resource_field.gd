extends Node3D
class_name ResourceField

## Repartition des gisements sur le fond.
##
## Rien n'est stocke a l'avance : la position de chaque gisement est deduite
## des coordonnees de sa cellule par un generateur pseudo-aleatoire seme avec
## ces coordonnees. Le monde est donc infini, stable d'une session a l'autre,
## et seules les cellules proches du joueur existent reellement en memoire.

const CELL := 22.0

## Configuration des types de gisement.
const TYPES := {
	&"limestone": {
		"name": "affleurement calcaire",
		"loot": {&"titanium": 0.62, &"copper": 0.38},
		"min": 1, "max": 2,
		"rock": Color(0.62, 0.60, 0.53), "vein": Color(0.85, 0.86, 0.9),
		"vein_amount": 0.22, "glow": 0.3, "metallic": 0.2,
	},
	&"sandstone": {
		"name": "affleurement de gres",
		"loot": {&"silver": 0.34, &"gold": 0.24, &"lead": 0.42},
		"min": 1, "max": 2,
		"rock": Color(0.55, 0.44, 0.30), "vein": Color(0.95, 0.8, 0.35),
		"vein_amount": 0.3, "glow": 0.7, "metallic": 0.5,
	},
	&"shale": {
		"name": "affleurement de schiste",
		"loot": {&"diamond": 0.14, &"lithium": 0.34, &"gold": 0.2, &"lead": 0.32},
		"min": 1, "max": 2,
		"rock": Color(0.24, 0.25, 0.28), "vein": Color(0.7, 0.95, 1.0),
		"vein_amount": 0.4, "glow": 2.4, "metallic": 0.35,
	},
	&"quartz": {
		"name": "cristal de quartz",
		"loot": {&"quartz": 1.0}, "min": 1, "max": 2,
		"rock": Color(0.62, 0.72, 0.78), "vein": Color(0.85, 0.95, 1.0),
		"vein_amount": 0.75, "glow": 2.0, "metallic": 0.1,
	},
	&"salt": {
		"name": "cristal de sel",
		"loot": {&"salt": 1.0}, "min": 1, "max": 1,
		"rock": Color(0.85, 0.86, 0.82), "vein": Color(1.0, 1.0, 0.95),
		"vein_amount": 0.55, "glow": 0.9, "metallic": 0.0,
	},
	&"coral": {
		"name": "corail en table",
		"loot": {&"coral": 1.0}, "min": 1, "max": 2, "knife": true,
		"rock": Color(0.85, 0.45, 0.35), "vein": Color(1.0, 0.72, 0.5),
		"vein_amount": 0.35, "glow": 0.8, "metallic": 0.0,
	},
	&"acid_mushroom": {
		"name": "champignon acide",
		"loot": {&"acid_mushroom": 1.0}, "min": 1, "max": 2,
		"rock": Color(0.45, 0.25, 0.55), "vein": Color(0.85, 0.45, 1.0),
		"vein_amount": 0.6, "glow": 2.6, "metallic": 0.0,
	},
	&"ribbon_plant": {
		"name": "plante-ruban",
		"loot": {&"ribbon_plant": 1.0}, "min": 1, "max": 2, "knife": true,
		"rock": Color(0.25, 0.45, 0.38), "vein": Color(0.5, 0.95, 0.8),
		"vein_amount": 0.5, "glow": 1.6, "metallic": 0.0,
	},
	&"creepvine_seed": {
		"name": "grappe de spores",
		"loot": {&"creepvine_seed": 1.0}, "min": 1, "max": 2, "knife": true,
		"rock": Color(0.5, 0.45, 0.2), "vein": Color(1.0, 0.92, 0.4),
		"vein_amount": 0.85, "glow": 3.2, "metallic": 0.0,
	},
}

@export var spawn_radius: float = 130.0
@export var max_spawns_per_frame: int = 4

var camera: Camera3D
var harvested: Dictionary = {}
var _cells: Dictionary = {}          # Vector2i -> Array[Node]
var _queue: Array[Vector2i] = []
var _last_center := Vector2i(99999, 99999)

func set_camera(cam: Camera3D) -> void:
	camera = cam

func _process(_delta: float) -> void:
	if camera == null or not is_instance_valid(camera):
		return
	var pos := camera.global_position
	var center := Vector2i(floori(pos.x / CELL), floori(pos.z / CELL))
	if center != _last_center:
		_last_center = center
		_refresh(center)
	_drain_queue()

func _refresh(center: Vector2i) -> void:
	var radius := int(ceil(spawn_radius / CELL))
	var wanted: Dictionary = {}
	for dz in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			if Vector2(dx, dz).length() > radius:
				continue
			wanted[center + Vector2i(dx, dz)] = true
	for coord in _cells.keys():
		if not wanted.has(coord):
			for n in _cells[coord]:
				if is_instance_valid(n):
					n.queue_free()
			_cells.erase(coord)
	_queue.clear()
	for coord in wanted:
		if not _cells.has(coord):
			_queue.append(coord)
	# les cellules les plus proches d'abord
	_queue.sort_custom(func(a, b):
		return (a - center).length_squared() < (b - center).length_squared())

func _drain_queue() -> void:
	var spawned := 0
	while spawned < max_spawns_per_frame and not _queue.is_empty():
		var coord: Vector2i = _queue.pop_front()
		if _cells.has(coord):
			continue
		_populate(coord)
		spawned += 1

func _populate(coord: Vector2i) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(Vector2i(coord.x * 73856093, coord.y * 19349663))
	var nodes: Array[Node] = []

	var count := rng.randi_range(0, 3)
	for i in count:
		var x := (coord.x + rng.randf()) * CELL
		var z := (coord.y + rng.randf()) * CELL
		var h := Biome.height(x, z)
		if h > -1.5:
			continue                          # hors de l'eau : rien a recolter
		var nrm := Biome.normal(x, z)
		if nrm.y < 0.55:
			continue                          # paroi trop raide
		var kind := Biome.kind_at(x, z, h)
		var type := _pick_type(kind, h, rng)
		if type == &"":
			continue
		var key := "%d_%d_%d" % [coord.x, coord.y, i]
		if harvested.has(key):
			continue

		var node := ResourceNode.new()
		node.name = "Node_%s" % key
		add_child(node)
		node.global_position = Vector3(x, h + 0.05, z)
		node.rotation.y = rng.randf() * TAU
		node.setup(type, TYPES[type], rng.randi_range(0, 5),
			rng.randf_range(0.55, 1.15), self, key)
		nodes.append(node)
	_cells[coord] = nodes

func _pick_type(kind: int, h: float, rng: RandomNumberGenerator) -> StringName:
	var pool: Array[StringName] = []
	match kind:
		Biome.Kind.SHALLOWS:
			pool = [&"limestone", &"limestone", &"quartz", &"salt", &"coral"]
		Biome.Kind.KELP:
			pool = [&"limestone", &"quartz", &"creepvine_seed", &"acid_mushroom",
				&"coral"]
		Biome.Kind.PLATEAU:
			pool = [&"limestone", &"sandstone", &"quartz", &"acid_mushroom",
				&"ribbon_plant"]
		Biome.Kind.REEF:
			pool = [&"sandstone", &"sandstone", &"shale", &"quartz", &"ribbon_plant"]
		Biome.Kind.DEEP:
			pool = [&"shale", &"shale", &"sandstone", &"quartz"]
		_:
			pool = [&"limestone", &"salt"]
	if h < -160.0:
		pool.append(&"shale")
	if pool.is_empty():
		return &""
	return pool[rng.randi_range(0, pool.size() - 1)]

func mark_harvested(key: String) -> void:
	harvested[key] = true

func serialize() -> Array:
	return harvested.keys()

func deserialize(keys: Array) -> void:
	harvested.clear()
	for k in keys:
		harvested[String(k)] = true
