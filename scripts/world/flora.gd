extends Node3D
class_name Flora

## Forets d'algues geantes.
##
## Chaque cellule de terrain proche du joueur recoit un MultiMesh d'algues :
## une seule primitive dessinee des centaines de fois, l'ondulation etant
## calculee dans le shader a partir de la position monde de chaque instance.
## Le cout CPU est donc quasi nul, meme avec plusieurs milliers de lames.

const KelpShader := preload("res://shaders/kelp.gdshader")
const CELL := 32.0

@export var view_distance: float = 170.0
@export var per_cell: int = 38

var camera: Camera3D
var material: ShaderMaterial
var _kelp_mesh: ArrayMesh
var _cells: Dictionary = {}
var _last_center := Vector2i(99999, 99999)
var _density_scale: float = 1.0

func _ready() -> void:
	_density_scale = float(Settings.get_p(&"kelp_density", 1.0))
	_build_material()
	_kelp_mesh = _build_kelp_mesh()

func set_camera(cam: Camera3D) -> void:
	camera = cam

func _build_material() -> void:
	material = ShaderMaterial.new()
	material.shader = KelpShader
	material.set_shader_parameter("blade_noise",
		ProcTextures.gray(256, 0.05, 4, 314))
	material.set_shader_parameter("sway_amplitude", 0.55)
	material.set_shader_parameter("glow_amount", 0.9)

## Une lame d'algue : ruban vertical vrille, ouvert des deux cotes.
func _build_kelp_mesh() -> ArrayMesh:
	var segments := 14
	var height := 1.0                     # mis a l'echelle par instance
	var width := 0.26
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()

	for i in segments + 1:
		var t := float(i) / float(segments)
		var y := t * height
		# la lame s'affine et se vrille vers la pointe
		var w: float = width * (1.0 - pow(t, 2.4) * 0.75)
		var twist: float = t * 1.6
		var dir := Vector3(cos(twist), 0.0, sin(twist))
		var nrm := Vector3(-sin(twist), 0.0, cos(twist))
		verts.append(Vector3(0, y, 0) - dir * w)
		verts.append(Vector3(0, y, 0) + dir * w)
		normals.append(nrm)
		normals.append(nrm)
		uvs.append(Vector2(0.0, t))
		uvs.append(Vector2(1.0, t))

	for i in segments:
		var a := i * 2
		indices.append_array([a, a + 2, a + 1, a + 1, a + 2, a + 3])

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.surface_set_material(0, material)
	return mesh

func _process(_delta: float) -> void:
	if camera == null or not is_instance_valid(camera):
		return
	var pos := camera.global_position
	var center := Vector2i(floori(pos.x / CELL), floori(pos.z / CELL))
	if center == _last_center:
		return
	_last_center = center
	var radius := int(ceil(view_distance / CELL))
	var wanted: Dictionary = {}
	for dz in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			var coord := center + Vector2i(dx, dz)
			if Vector2(dx, dz).length() <= radius:
				wanted[coord] = true
	for coord in _cells.keys():
		if not wanted.has(coord):
			_cells[coord].queue_free()
			_cells.erase(coord)
	for coord in wanted:
		if not _cells.has(coord):
			_build_cell(coord)

func _build_cell(coord: Vector2i) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(Vector2i(coord.x * 6151, coord.y * 3121))

	var transforms: Array[Transform3D] = []
	var attempts := int(per_cell * _density_scale)
	for i in attempts:
		var x := (coord.x + rng.randf()) * CELL
		var z := (coord.y + rng.randf()) * CELL
		var density := Biome.kelp_density(x, z)
		if density <= 0.05 or rng.randf() > density:
			continue
		var h := Biome.height(x, z)
		var nrm := Biome.normal(x, z)
		if nrm.y < 0.5:
			continue
		# une plante = un bouquet de lames partant du meme pied
		var blades := rng.randi_range(3, 6)
		var plant_height: float = rng.randf_range(9.0, 17.0) \
			* clampf(-h / 30.0, 0.45, 1.4)
		plant_height = minf(plant_height, maxf(-h - 1.5, 1.0))
		for b in blades:
			var a := rng.randf() * TAU
			var off := Vector3(cos(a), 0.0, sin(a)) * rng.randf_range(0.05, 0.45)
			var basis := Basis(Vector3.UP, rng.randf() * TAU)
			basis = basis.scaled(Vector3(rng.randf_range(0.8, 1.4), plant_height,
				rng.randf_range(0.8, 1.4)))
			transforms.append(Transform3D(basis, Vector3(x, h - 0.2, z) + off))

	if transforms.is_empty():
		_cells[coord] = Node3D.new()
		add_child(_cells[coord])
		return

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = _kelp_mesh
	mm.instance_count = transforms.size()
	for i in transforms.size():
		mm.set_instance_transform(i, transforms[i])

	var node := MultiMeshInstance3D.new()
	node.name = "Kelp_%d_%d" % [coord.x, coord.y]
	node.multimesh = mm
	node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.custom_aabb = AABB(
		Vector3(coord.x * CELL, -400.0, coord.y * CELL),
		Vector3(CELL, 460.0, CELL))
	add_child(node)
	_cells[coord] = node
