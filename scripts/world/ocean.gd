extends Node3D
class_name Ocean

## Surface de l'ocean.
##
## Deux maillages partagent le meme materiau :
##  * une grille fine centree sur la camera (detail proche) ;
##  * un anneau a pas croissant qui pousse l'horizon jusqu'a 6 km sans exploser
##    le nombre de sommets.
## Les deux suivent la camera, en s'alignant sur la grille pour que les vagues
## restent immobiles dans le monde (sinon la houle "glisse" avec le joueur).
##
## La houle de Gerstner est dupliquee a l'identique sur le CPU : c'est elle qui
## sert a faire flotter la capsule et a savoir si la tete du joueur est immergee.

const OceanShader := preload("res://shaders/ocean.gdshader")

## Doit rester STRICTEMENT identique au tableau WAVES du shader.
## x = angle relatif au vent (rad), y = longueur d'onde (m), z = cambrure
const WAVES: Array[Vector3] = [
	Vector3( 0.00, 74.0, 0.075),
	Vector3( 0.51, 41.0, 0.082),
	Vector3(-0.68, 23.0, 0.090),
	Vector3( 1.24, 12.5, 0.082),
	Vector3(-1.51,  6.7, 0.070),
	Vector3( 2.42,  3.3, 0.058),
]
const GRAVITY := 9.81

@export var near_size: float = 420.0
@export var far_radius: float = 6000.0
@export var sea_state: float = 1.0 : set = set_sea_state
@export var wind_angle: float = 0.6 : set = set_wind_angle
@export var choppiness: float = 0.85
@export var wave_speed: float = 1.0

var material: ShaderMaterial
var wave_time: float = 0.0

var _near: MeshInstance3D
var _far: MeshInstance3D
var _cell: float = 2.0
var _camera: Camera3D

func _ready() -> void:
	_build_material()
	_build_meshes()
	set_notify_transform(false)

func _build_material() -> void:
	material = ShaderMaterial.new()
	material.shader = OceanShader
	material.set_shader_parameter("detail_normal_a",
		ProcTextures.normal_map(512, 0.012, 5, 1471, 1.0))
	material.set_shader_parameter("detail_normal_b",
		ProcTextures.normal_map(512, 0.03, 4, 8823, 0.7))
	material.set_shader_parameter("foam_noise",
		ProcTextures.gray(512, 0.01, 5, 331))
	material.set_shader_parameter("sea_state", sea_state)
	material.set_shader_parameter("wind_angle", wind_angle)
	material.set_shader_parameter("choppiness", choppiness)
	material.set_shader_parameter("wave_speed", wave_speed)
	material.render_priority = -1

func _build_meshes() -> void:
	var res: int = int(Settings.get_p(&"ocean_near_res", 220))
	var rings: int = int(Settings.get_p(&"ocean_far_rings", 72))
	_cell = near_size / float(res)

	_near = MeshInstance3D.new()
	_near.name = "NearSurface"
	_near.mesh = _build_grid(near_size, res)
	_near.material_override = material
	_near.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# la houle deplace les sommets : on elargit la boite pour eviter un cull
	_near.custom_aabb = AABB(Vector3(-near_size, -60, -near_size),
		Vector3(near_size * 2.0, 120, near_size * 2.0))
	add_child(_near)

	_far = MeshInstance3D.new()
	_far.name = "FarSurface"
	# L'anneau demarre en deca du bord de la grille carree (rayon inscrit
	# 0.5, rayon circonscrit 0.707) : les deux maillages se recouvrent donc
	# partout, ce qui interdit toute fissure sur le pourtour. Le recouvrement
	# est sans consequence visuelle puisque les deux surfaces partagent le
	# meme materiau et la meme houle : elles se colorent a l'identique.
	_far.mesh = _build_ring(near_size * 0.485, far_radius, 160, rings)
	_far.material_override = material
	_far.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_far.custom_aabb = AABB(Vector3(-far_radius, -80, -far_radius),
		Vector3(far_radius * 2.0, 160, far_radius * 2.0))
	add_child(_far)

## Grille reguliere centree sur l'origine.
static func _build_grid(size: float, res: int) -> ArrayMesh:
	var verts := PackedVector3Array()
	var uvs := PackedVector2Array()
	var normals := PackedVector3Array()
	var indices := PackedInt32Array()
	var step := size / float(res)
	var half := size * 0.5
	verts.resize((res + 1) * (res + 1))
	uvs.resize(verts.size())
	normals.resize(verts.size())
	var i := 0
	for z in res + 1:
		for x in res + 1:
			verts[i] = Vector3(-half + x * step, 0.0, -half + z * step)
			uvs[i] = Vector2(float(x) / res, float(z) / res)
			normals[i] = Vector3.UP
			i += 1
	for z in res:
		for x in res:
			var a := z * (res + 1) + x
			var b := a + 1
			var c := a + res + 1
			var d := c + 1
			indices.append_array([a, c, b, b, c, d])
	return _commit(verts, normals, uvs, indices)

## Anneau a pas radial croissant : beaucoup de detail pres du bord interieur,
## de tres grands quads a l'horizon.
static func _build_ring(inner: float, outer: float, segments: int,
		rings: int) -> ArrayMesh:
	var verts := PackedVector3Array()
	var uvs := PackedVector2Array()
	var normals := PackedVector3Array()
	var indices := PackedInt32Array()
	for r in rings + 1:
		var t := float(r) / float(rings)
		# progression exponentielle : le pas suit la perte de resolution ecran
		var radius: float = inner * pow(outer / inner, t)
		for s in segments + 1:
			var a := TAU * float(s) / float(segments)
			verts.append(Vector3(cos(a) * radius, 0.0, sin(a) * radius))
			normals.append(Vector3.UP)
			uvs.append(Vector2(float(s) / segments, t))
	var stride := segments + 1
	for r in rings:
		for s in segments:
			var i0 := r * stride + s
			var i1 := i0 + 1
			var i2 := i0 + stride
			var i3 := i2 + 1
			indices.append_array([i0, i2, i1, i1, i2, i3])
	return _commit(verts, normals, uvs, indices)

static func _commit(verts: PackedVector3Array, normals: PackedVector3Array,
		uvs: PackedVector2Array, indices: PackedInt32Array) -> ArrayMesh:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

func set_camera(cam: Camera3D) -> void:
	_camera = cam

func set_sea_state(value: float) -> void:
	sea_state = value
	if material != null:
		material.set_shader_parameter("sea_state", value)

func set_wind_angle(value: float) -> void:
	wind_angle = value
	if material != null:
		material.set_shader_parameter("wind_angle", value)

func _process(delta: float) -> void:
	wave_time += delta * Engine.time_scale
	if material != null:
		material.set_shader_parameter("wave_time", wave_time)
	if _camera != null and is_instance_valid(_camera):
		var p := _camera.global_position
		# alignement sur la grille : la houle reste ancree dans le monde
		global_position = Vector3(
			snappedf(p.x, _cell), global_position.y, snappedf(p.z, _cell))

# =============================================================================
#  Houle cote CPU — reproduction exacte de la somme de Gerstner du shader
# =============================================================================

## Deplacement 3D applique au point de repos `p` (xz).
func _gerstner_displacement(px: float, pz: float, t: float) -> Vector3:
	var disp := Vector3.ZERO
	for w in WAVES:
		var ang: float = wind_angle + w.x
		var dx := cos(ang)
		var dz := sin(ang)
		var k: float = TAU / w.y
		var c: float = sqrt(GRAVITY / k)
		var steep: float = clampf(w.z * sea_state * choppiness, 0.0, 0.92)
		var a: float = steep / k
		var f: float = k * ((dx * px + dz * pz) - c * t * wave_speed)
		disp.x += dx * a * cos(f)
		disp.z += dz * a * cos(f)
		disp.y += a * sin(f)
	return disp

## Hauteur de la surface a l'aplomb de (x, z) dans le monde.
## Gerstner deplace aussi horizontalement : on inverse par point fixe.
func get_wave_height(x: float, z: float) -> float:
	var gx := x
	var gz := z
	for i in 4:
		var d := _gerstner_displacement(gx, gz, wave_time)
		gx = x - d.x
		gz = z - d.z
	return global_position.y + _gerstner_displacement(gx, gz, wave_time).y

func get_wave_height_at(pos: Vector3) -> float:
	return get_wave_height(pos.x, pos.z)

## Normale de la surface, obtenue par differences finies sur la hauteur.
func get_wave_normal(x: float, z: float, eps: float = 0.6) -> Vector3:
	var h := get_wave_height(x, z)
	var hx := get_wave_height(x + eps, z)
	var hz := get_wave_height(x, z + eps)
	return Vector3(h - hx, eps, h - hz).normalized()

## Vitesse orbitale de l'eau : utilisee pour bercer les objets flottants.
func get_orbital_velocity(x: float, z: float) -> Vector3:
	var dt := 0.05
	var a := _gerstner_displacement(x, z, wave_time)
	var b := _gerstner_displacement(x, z, wave_time + dt)
	return (b - a) / dt

func is_underwater(pos: Vector3) -> bool:
	return pos.y < get_wave_height(pos.x, pos.z)

func depth_at(pos: Vector3) -> float:
	return maxf(get_wave_height(pos.x, pos.z) - pos.y, 0.0)
