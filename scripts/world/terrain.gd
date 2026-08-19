extends Node3D
class_name Terrain

## Fond marin procedural, decoupe en chunks et genere en threads.
##
## Chaque chunk est maille a une resolution dependant de sa distance a la
## camera (4 niveaux de detail). Les sommets portent une couleur qui encode
## la nature du sol : rocher, biome, bioluminescence et occlusion ambiante.
## Le shader de terrain s'en sert pour melanger sable et roche sans aucune
## texture de masque.

signal chunk_ready(coord: Vector2i)
signal initial_load_finished()

const TerrainShader := preload("res://shaders/terrain.gdshader")

@export var chunk_size: float = 64.0
@export var collision_res: int = 20
@export var max_commits_per_frame: int = 2

## [distance max, resolution du maillage]
const LODS: Array[Vector2] = [
	Vector2(110.0, 48.0),
	Vector2(210.0, 24.0),
	Vector2(380.0, 12.0),
	Vector2(9999.0, 6.0),
]

var view_distance: float = 520.0
var collision_distance: float = 130.0

var material: ShaderMaterial
var _chunks: Dictionary = {}          # Vector2i -> Dictionary(node, lod, body)
var _pending: Dictionary = {}         # Vector2i -> task id
var _results: Dictionary = {}         # Vector2i -> Dictionary
var _mutex := Mutex.new()
var _camera: Camera3D
var _initial_done := false
var _last_center := Vector2i(99999, 99999)

func _ready() -> void:
	view_distance = float(Settings.get_p(&"terrain_view_distance", 520.0))
	_build_material()

func set_camera(cam: Camera3D) -> void:
	_camera = cam

func _build_material() -> void:
	material = ShaderMaterial.new()
	material.shader = TerrainShader
	material.set_shader_parameter("sand_albedo", ProcTextures.ramped(512, 0.02, 5, 21,
		[Color(0.62, 0.58, 0.46), Color(0.88, 0.84, 0.72), Color(1.0, 0.97, 0.9)]))
	material.set_shader_parameter("sand_normal",
		ProcTextures.normal_map(512, 0.045, 4, 21, 0.6))
	material.set_shader_parameter("rock_albedo", ProcTextures.ramped(512, 0.012, 5, 88,
		[Color(0.16, 0.17, 0.18), Color(0.42, 0.43, 0.45), Color(0.62, 0.6, 0.58)]))
	material.set_shader_parameter("rock_normal",
		ProcTextures.normal_map(512, 0.02, 5, 88, 1.4))
	material.set_shader_parameter("detail_noise",
		ProcTextures.gray(512, 0.008, 4, 55))

# =============================================================================
#  Streaming
# =============================================================================
func _process(_delta: float) -> void:
	if _camera == null or not is_instance_valid(_camera):
		return
	var cam := _camera.global_position
	var center := Vector2i(floori(cam.x / chunk_size), floori(cam.z / chunk_size))
	if center != _last_center:
		_last_center = center
		_refresh_wanted(center, cam)
	_collect_results()

func _refresh_wanted(center: Vector2i, cam: Vector3) -> void:
	var radius := int(ceil(view_distance / chunk_size))
	var wanted: Dictionary = {}
	for dz in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			var coord := center + Vector2i(dx, dz)
			var c := _chunk_center(coord)
			var dist := Vector2(c.x - cam.x, c.z - cam.z).length()
			if dist > view_distance:
				continue
			wanted[coord] = _lod_for(dist)

	# libere les chunks sortis du champ
	for coord in _chunks.keys():
		if not wanted.has(coord):
			var entry: Dictionary = _chunks[coord]
			entry["node"].queue_free()
			_chunks.erase(coord)

	# demande la generation ou la mise a jour du niveau de detail
	for coord in wanted:
		var lod: int = wanted[coord]
		if _chunks.has(coord):
			if _chunks[coord]["lod"] == lod:
				_update_collision(coord, cam)
				continue
		if _pending.has(coord):
			continue
		_request(coord, lod)

func _chunk_center(coord: Vector2i) -> Vector3:
	return Vector3((coord.x + 0.5) * chunk_size, 0.0, (coord.y + 0.5) * chunk_size)

func _lod_for(dist: float) -> int:
	for i in LODS.size():
		if dist <= LODS[i].x:
			return i
	return LODS.size() - 1

func _request(coord: Vector2i, lod: int) -> void:
	var res := int(LODS[lod].y)
	var need_collision := lod == 0
	var id := WorkerThreadPool.add_task(
		_generate.bind(coord, res, need_collision), false,
		"terrain %d,%d" % [coord.x, coord.y])
	_pending[coord] = {"id": id, "lod": lod}

## Execute dans un thread : ne touche a aucun noeud, ne cree aucune ressource.
func _generate(coord: Vector2i, res: int, need_collision: bool) -> void:
	var origin := Vector3(coord.x * chunk_size, 0.0, coord.y * chunk_size)
	var step := chunk_size / float(res)
	var n := res + 1

	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var colors := PackedColorArray()
	var indices := PackedInt32Array()
	verts.resize(n * n)
	normals.resize(n * n)
	uvs.resize(n * n)
	colors.resize(n * n)

	var min_y := 99999.0
	var max_y := -99999.0
	var i := 0
	for z in n:
		for x in n:
			var wx := origin.x + x * step
			var wz := origin.z + z * step
			var h := Biome.height(wx, wz)
			verts[i] = Vector3(x * step, h, z * step)
			var nrm := Biome.normal(wx, wz, maxf(step * 0.5, 0.4))
			normals[i] = nrm
			uvs[i] = Vector2(wx, wz) * 0.05
			min_y = minf(min_y, h)
			max_y = maxf(max_y, h)

			var kind := Biome.kind_at(wx, wz, h)
			var slope: float = 1.0 - clampf(nrm.y, 0.0, 1.0)
			var rockiness: float = clampf(slope * 2.1 - 0.12, 0.0, 1.0)
			if kind == Biome.Kind.DEEP or kind == Biome.Kind.REEF:
				rockiness = clampf(rockiness + 0.18, 0.0, 1.0)
			# occlusion : un point plus bas que ses voisins est dans un creux
			var around := (Biome.height(wx + 2.5, wz) + Biome.height(wx - 2.5, wz)
				+ Biome.height(wx, wz + 2.5) + Biome.height(wx, wz - 2.5)) * 0.25
			var ao: float = clampf(1.0 - clampf((around - h) * 0.22, 0.0, 1.0), 0.35, 1.0)
			colors[i] = Color(rockiness, Biome.biome_gradient(kind),
				Biome.bio_amount(kind, h), ao)
			i += 1

	for z in res:
		for x in res:
			var a := z * n + x
			var b := a + 1
			var c := a + n
			var d := c + 1
			indices.append_array([a, c, b, b, c, d])

	var faces := PackedVector3Array()
	if need_collision:
		var cres := collision_res
		var cstep := chunk_size / float(cres)
		faces.resize(cres * cres * 6)
		var fi := 0
		for z in cres:
			for x in cres:
				var p00 := _local_point(origin, x, z, cstep)
				var p10 := _local_point(origin, x + 1, z, cstep)
				var p01 := _local_point(origin, x, z + 1, cstep)
				var p11 := _local_point(origin, x + 1, z + 1, cstep)
				faces[fi] = p00; faces[fi + 1] = p01; faces[fi + 2] = p10
				faces[fi + 3] = p10; faces[fi + 4] = p01; faces[fi + 5] = p11
				fi += 6

	_mutex.lock()
	_results[coord] = {
		"verts": verts, "normals": normals, "uvs": uvs, "colors": colors,
		"indices": indices, "faces": faces, "origin": origin,
		"aabb": AABB(Vector3(0, min_y - 1.0, 0),
			Vector3(chunk_size, maxf(max_y - min_y, 1.0) + 2.0, chunk_size)),
	}
	_mutex.unlock()

func _local_point(origin: Vector3, x: int, z: int, step: float) -> Vector3:
	var wx := origin.x + x * step
	var wz := origin.z + z * step
	return Vector3(x * step, Biome.height(wx, wz), z * step)

func _collect_results() -> void:
	var committed := 0
	for coord in _pending.keys():
		if committed >= max_commits_per_frame:
			break
		var info: Dictionary = _pending[coord]
		if not WorkerThreadPool.is_task_completed(info["id"]):
			continue
		WorkerThreadPool.wait_for_task_completion(info["id"])
		_mutex.lock()
		var data: Variant = _results.get(coord)
		_results.erase(coord)
		_mutex.unlock()
		_pending.erase(coord)
		if data == null:
			continue
		_commit(coord, info["lod"], data)
		committed += 1

	if not _initial_done and _pending.is_empty() and not _chunks.is_empty():
		_initial_done = true
		initial_load_finished.emit()

func _commit(coord: Vector2i, lod: int, data: Dictionary) -> void:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = data["verts"]
	arrays[Mesh.ARRAY_NORMAL] = data["normals"]
	arrays[Mesh.ARRAY_TEX_UV] = data["uvs"]
	arrays[Mesh.ARRAY_COLOR] = data["colors"]
	arrays[Mesh.ARRAY_INDEX] = data["indices"]
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.custom_aabb = data["aabb"]

	var old: Dictionary = _chunks.get(coord, {})
	if not old.is_empty():
		old["node"].queue_free()

	var node := MeshInstance3D.new()
	node.name = "Chunk_%d_%d" % [coord.x, coord.y]
	node.mesh = mesh
	node.material_override = material
	node.position = data["origin"]
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if lod <= 1 \
		else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(node)

	var body: StaticBody3D = null
	var faces: PackedVector3Array = data["faces"]
	if faces.size() > 0:
		var shape := ConcavePolygonShape3D.new()
		shape.set_faces(faces)
		body = StaticBody3D.new()
		body.name = "Collision"
		body.collision_layer = 1
		body.collision_mask = 0
		var cs := CollisionShape3D.new()
		cs.shape = shape
		body.add_child(cs)
		node.add_child(body)

	_chunks[coord] = {"node": node, "lod": lod, "body": body}
	chunk_ready.emit(coord)

func _update_collision(_coord: Vector2i, _cam: Vector3) -> void:
	pass

## Hauteur exacte du fond (utilisee par le gameplay, sans passer par la physique)
func height_at(x: float, z: float) -> float:
	return Biome.height(x, z)

func is_ready() -> bool:
	return _initial_done
