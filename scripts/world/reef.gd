extends Node3D
class_name Reef

## Peuplement du recif : dalles rocheuses, massifs coralliens, coraux en
## eventail et en table, coraux tubulaires et tapis d'anemones.
##
## Meme principe que les gisements : la composition de chaque cellule se
## deduit de ses coordonnees, donc le decor est infini, identique d'une
## session a l'autre, et rien n'est stocke. Seules les cellules proches du
## joueur existent reellement.

const CoralShader := preload("res://shaders/coral.gdshader")
const CELL := 26.0
const VARIANTS := 6

## Une espece : maillage, teintes, taille, et si elle arrete le joueur.
const SPECIES := {
	&"slab": {
		"scale": [2.4, 5.6], "solid": "cylinder", "align": 0.85,
		"base": Color(0.80, 0.75, 0.60), "patch": Color(0.66, 0.63, 0.50),
		"tip": Color(0.90, 0.87, 0.74), "patch_amount": 0.30,
		"rough": 0.85, "pore": 1.1, "glow": 0.0, "sway": 0.0,
	},
	&"mound": {
		"scale": [1.6, 4.4], "solid": "sphere", "align": 0.4,
		"base": Color(0.62, 0.29, 0.13), "patch": Color(0.09, 0.50, 0.44),
		"tip": Color(0.82, 0.50, 0.22), "patch_amount": 0.50,
		"rough": 0.70, "pore": 1.0, "glow": 0.0, "sway": 0.0,
	},
	&"mound_pale": {
		"scale": [1.4, 3.4], "solid": "sphere", "align": 0.4,
		"base": Color(0.74, 0.46, 0.22), "patch": Color(0.16, 0.56, 0.42),
		"tip": Color(0.92, 0.70, 0.34), "patch_amount": 0.42,
		"rough": 0.66, "pore": 0.9, "glow": 0.0, "sway": 0.0,
	},
	&"boulder": {
		"scale": [1.2, 3.0], "solid": "sphere", "align": 0.5,
		"base": Color(0.52, 0.50, 0.43), "patch": Color(0.26, 0.42, 0.34),
		"tip": Color(0.66, 0.64, 0.56), "patch_amount": 0.35,
		"rough": 0.88, "pore": 1.2, "glow": 0.0, "sway": 0.0,
	},
	&"flower": {
		"scale": [0.9, 2.1], "solid": "", "align": 0.2,
		"base": Color(0.90, 0.46, 0.12), "patch": Color(0.96, 0.74, 0.22),
		"tip": Color(1.00, 0.86, 0.38), "patch_amount": 0.55,
		"rough": 0.55, "pore": 2.4, "glow": 0.9, "sway": 0.35,
	},
	&"table": {
		"scale": [0.7, 1.6], "solid": "", "align": 0.3,
		"base": Color(0.86, 0.52, 0.34), "patch": Color(0.32, 0.62, 0.55),
		"tip": Color(0.96, 0.72, 0.48), "patch_amount": 0.48,
		"rough": 0.62, "pore": 2.0, "glow": 0.0, "sway": 0.15,
	},
	&"tube": {
		"scale": [0.7, 1.7], "solid": "", "align": 0.25,
		"base": Color(0.56, 0.17, 0.13), "patch": Color(0.72, 0.30, 0.18),
		"tip": Color(0.80, 0.40, 0.28), "patch_amount": 0.40,
		"rough": 0.58, "pore": 3.0, "glow": 0.0, "sway": 0.9,
	},
	&"anemone": {
		"scale": [0.45, 0.95], "solid": "", "align": 0.6,
		"base": Color(0.92, 0.52, 0.11), "patch": Color(0.20, 0.68, 0.60),
		"tip": Color(1.00, 0.80, 0.28), "patch_amount": 0.30,
		"rough": 0.45, "pore": 3.5, "glow": 2.2, "sway": 0.7,
	},
}

@export var view_distance: float = 130.0
@export var max_cells_per_frame: int = 2

var camera: Camera3D
var density: float = 1.0

var _meshes: Dictionary = {}          # espece -> Array[ArrayMesh]
var _materials: Dictionary = {}       # espece -> ShaderMaterial
var _cells: Dictionary = {}           # Vector2i -> Node3D
var _queue: Array[Vector2i] = []
var _last_center := Vector2i(99999, 99999)
var _noise_tex: Texture2D

func _ready() -> void:
	density = clampf(float(Settings.get_p(&"kelp_density", 1.0)), 0.4, 1.6)
	view_distance = float(Settings.get_p(&"terrain_view_distance", 520.0)) * 0.32
	_noise_tex = ProcTextures.gray(512, 0.05, 4, 6161)
	for key in SPECIES:
		_materials[key] = _make_material(SPECIES[key])

func set_camera(cam: Camera3D) -> void:
	camera = cam

func _make_material(cfg: Dictionary) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = CoralShader
	m.set_shader_parameter("base_color", cfg["base"])
	m.set_shader_parameter("patch_color", cfg["patch"])
	m.set_shader_parameter("tip_color", cfg["tip"])
	m.set_shader_parameter("translucency", (cfg["base"] as Color).lightened(0.1))
	m.set_shader_parameter("patch_amount", cfg["patch_amount"])
	m.set_shader_parameter("roughness_amount", cfg["rough"])
	m.set_shader_parameter("pore_scale", cfg["pore"] * 6.0)
	m.set_shader_parameter("tip_amount", 0.45)
	m.set_shader_parameter("glow", cfg["glow"])
	m.set_shader_parameter("glow_color", cfg["tip"])
	m.set_shader_parameter("sway", cfg["sway"])
	m.set_shader_parameter("coral_noise", _noise_tex)
	return m

func _mesh_for(species: StringName, variant: int) -> ArrayMesh:
	if not _meshes.has(species):
		var list: Array[ArrayMesh] = []
		for i in VARIANTS:
			var seed_value := int(hash(species)) + i * 977
			match species:
				&"slab": list.append(ReefMeshes.rock_slab(seed_value))
				&"mound", &"mound_pale":
					list.append(ReefMeshes.coral_mound(seed_value))
				&"boulder": list.append(ReefMeshes.boulder(seed_value))
				&"flower": list.append(ReefMeshes.sea_flower(seed_value))
				&"table": list.append(ReefMeshes.table_coral(seed_value))
				&"tube": list.append(ReefMeshes.tube_coral(seed_value))
				&"anemone": list.append(ReefMeshes.anemone(seed_value))
				_: list.append(ReefMeshes.boulder(seed_value))
		_meshes[species] = list
	var arr: Array = _meshes[species]
	return arr[variant % arr.size()]

# =============================================================================
#  Streaming
# =============================================================================
func _process(_delta: float) -> void:
	if camera == null or not is_instance_valid(camera):
		return
	var pos := camera.global_position
	var center := Vector2i(floori(pos.x / CELL), floori(pos.z / CELL))
	if center != _last_center:
		_last_center = center
		_refresh(center)
	var built := 0
	while built < max_cells_per_frame and not _queue.is_empty():
		var coord: Vector2i = _queue.pop_front()
		if not _cells.has(coord):
			_populate(coord)
			built += 1

func _refresh(center: Vector2i) -> void:
	var radius := int(ceil(view_distance / CELL))
	var wanted: Dictionary = {}
	for dz in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			if Vector2(dx, dz).length() <= radius:
				wanted[center + Vector2i(dx, dz)] = true
	for coord in _cells.keys():
		if not wanted.has(coord):
			_cells[coord].queue_free()
			_cells.erase(coord)
	_queue.clear()
	for coord in wanted:
		if not _cells.has(coord):
			_queue.append(coord)
	_queue.sort_custom(func(a, b):
		return (a - center).length_squared() < (b - center).length_squared())

## Especes possibles selon le biome et la profondeur.
func _palette(kind: int, h: float) -> Array:
	match kind:
		Biome.Kind.SHALLOWS:
			return [&"slab", &"slab", &"mound", &"mound_pale", &"table",
				&"anemone", &"anemone", &"tube", &"flower"]
		Biome.Kind.KELP:
			return [&"slab", &"mound", &"boulder", &"table", &"anemone",
				&"tube"]
		Biome.Kind.PLATEAU:
			return [&"slab", &"mound", &"mound_pale", &"boulder", &"flower",
				&"anemone", &"table"]
		Biome.Kind.REEF:
			return [&"mound", &"boulder", &"boulder", &"slab", &"flower",
				&"tube"]
		Biome.Kind.DEEP:
			return [&"boulder", &"boulder", &"mound"] if h > -260.0 else [&"boulder"]
		Biome.Kind.BEACH:
			return [&"slab", &"boulder"]
	return [&"boulder"]

func _populate(coord: Vector2i) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(Vector2i(coord.x * 40503, coord.y * 23557))
	var cell := Node3D.new()
	cell.name = "Reef_%d_%d" % [coord.x, coord.y]
	add_child(cell)
	_cells[coord] = cell

	var attempts := int(rng.randi_range(2, 6) * density)
	for i in attempts:
		var x := (coord.x + rng.randf()) * CELL
		var z := (coord.y + rng.randf()) * CELL
		var h := Biome.height(x, z)
		if h > -1.0:
			continue
		var nrm := Biome.normal(x, z)
		if nrm.y < 0.45:
			continue                       # paroi trop raide pour s'y fixer
		var kind := Biome.kind_at(x, z, h)
		var pool: Array = _palette(kind, h)
		var species: StringName = pool[rng.randi_range(0, pool.size() - 1)]
		_place(cell, species, Vector3(x, h, z), nrm, rng)

	# tapis d'anemones : beaucoup de petites colonies sur une meme dalle
	if rng.randf() < 0.45 * density:
		_carpet(cell, coord, rng)

func _place(parent: Node3D, species: StringName, pos: Vector3, nrm: Vector3,
		rng: RandomNumberGenerator) -> void:
	var cfg: Dictionary = SPECIES[species]
	var range_v: Array = cfg["scale"]
	var s: float = rng.randf_range(range_v[0], range_v[1])

	var node := MeshInstance3D.new()
	node.mesh = _mesh_for(species, rng.randi_range(0, VARIANTS - 1))
	node.material_override = _materials[species]
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON

	# assise : la colonie epouse partiellement la pente du fond
	var align: float = cfg["align"]
	var up: Vector3 = Vector3.UP.lerp(nrm, align).normalized()
	var basis := Basis()
	if up.distance_to(Vector3.UP) > 0.001:
		var axis: Vector3 = Vector3.UP.cross(up)
		if axis.length() > 0.0001:
			basis = Basis(axis.normalized(), Vector3.UP.angle_to(up))
	basis = basis * Basis(Vector3.UP, rng.randf() * TAU)
	# leger ecrasement aleatoire : aucune colonie n'est parfaitement ronde
	basis = basis.scaled(Vector3(s * rng.randf_range(0.85, 1.15), s,
		s * rng.randf_range(0.85, 1.15)))

	parent.add_child(node)
	# on enfonce legerement la base dans le sable
	node.global_transform = Transform3D(basis, pos - Vector3(0, s * 0.16, 0))

	var solid: String = cfg["solid"]
	if solid != "":
		var body := StaticBody3D.new()
		body.collision_layer = 1
		body.collision_mask = 0
		var cs := CollisionShape3D.new()
		if solid == "cylinder":
			var cyl := CylinderShape3D.new()
			cyl.radius = 0.82
			cyl.height = 0.62
			cs.shape = cyl
			cs.position = Vector3(0, 0.1, 0)
		else:
			var sph := SphereShape3D.new()
			sph.radius = 0.78
			cs.shape = sph
			cs.position = Vector3(0, 0.15, 0)
		body.add_child(cs)
		node.add_child(body)

## Tapis dense d'anemones, dessine en un seul MultiMesh.
func _carpet(parent: Node3D, coord: Vector2i, rng: RandomNumberGenerator) -> void:
	var transforms: Array[Transform3D] = []
	var cx := (coord.x + rng.randf()) * CELL
	var cz := (coord.y + rng.randf()) * CELL
	var spread := rng.randf_range(3.0, 7.0)
	var count := int(rng.randi_range(18, 46) * density)
	for i in count:
		var a := rng.randf() * TAU
		var r := sqrt(rng.randf()) * spread
		var x := cx + cos(a) * r
		var z := cz + sin(a) * r
		var h := Biome.height(x, z)
		if h > -1.5:
			continue
		var nrm := Biome.normal(x, z)
		if nrm.y < 0.72:
			continue                       # les anemones veulent du plat
		var s := rng.randf_range(0.28, 0.62)
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * s)
		transforms.append(Transform3D(b, Vector3(x, h - s * 0.1, z)))
	if transforms.size() < 4:
		return

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = _mesh_for(&"anemone", rng.randi_range(0, VARIANTS - 1))
	mm.instance_count = transforms.size()
	for i in transforms.size():
		mm.set_instance_transform(i, transforms[i])

	var node := MultiMeshInstance3D.new()
	node.name = "Anemones"
	node.multimesh = mm
	node.material_override = _materials[&"anemone"]
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.custom_aabb = AABB(
		Vector3(cx - spread - 1.0, -400.0, cz - spread - 1.0),
		Vector3(spread * 2.0 + 2.0, 460.0, spread * 2.0 + 2.0))
	parent.add_child(node)
