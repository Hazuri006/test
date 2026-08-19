extends Node3D
class_name ProcBody

## Corps du joueur genere entierement par code : squelette, maillage peau,
## et animations procedurales.
##
## Pourquoi procedural plutot qu'un modele importe : aucun fichier binaire n'est
## necessaire, le corps reste modifiable depuis le code, et surtout les
## animations sont calculees en continu (pas de cles interpolees), ce qui donne
## un mouvement parfaitement fluide et qui reagit instantanement a la vitesse,
## a l'orientation du regard et a l'etat de nage.
##
## Squelette : bassin -> colonne -> torse -> cou -> tete, plus quatre membres.

const BONE_DEFS := [
	# nom,          parent,        position locale (repos),        longueur
	["hips",        "",            Vector3(0.0, 0.95, 0.0),        0.16],
	["spine",       "hips",        Vector3(0.0, 0.16, 0.0),        0.20],
	["chest",       "spine",       Vector3(0.0, 0.20, 0.0),        0.24],
	["neck",        "chest",       Vector3(0.0, 0.24, 0.0),        0.09],
	["head",        "neck",        Vector3(0.0, 0.09, 0.0),        0.22],
	["shoulder_l",  "chest",       Vector3(0.09, 0.20, 0.0),       0.09],
	["upperarm_l",  "shoulder_l",  Vector3(0.09, 0.0, 0.0),        0.27],
	["forearm_l",   "upperarm_l",  Vector3(0.27, 0.0, 0.0),        0.25],
	["hand_l",      "forearm_l",   Vector3(0.25, 0.0, 0.0),        0.17],
	["shoulder_r",  "chest",       Vector3(-0.09, 0.20, 0.0),      0.09],
	["upperarm_r",  "shoulder_r",  Vector3(-0.09, 0.0, 0.0),       0.27],
	["forearm_r",   "upperarm_r",  Vector3(-0.27, 0.0, 0.0),       0.25],
	["hand_r",      "forearm_r",   Vector3(-0.25, 0.0, 0.0),       0.17],
	["thigh_l",     "hips",        Vector3(0.10, -0.04, 0.0),      0.42],
	["shin_l",      "thigh_l",     Vector3(0.0, -0.42, 0.0),       0.40],
	["foot_l",      "shin_l",      Vector3(0.0, -0.40, 0.0),       0.30],
	["thigh_r",     "hips",        Vector3(-0.10, -0.04, 0.0),     0.42],
	["shin_r",      "thigh_r",     Vector3(0.0, -0.42, 0.0),       0.40],
	["foot_r",      "shin_r",      Vector3(0.0, -0.40, 0.0),       0.30],
]

## Enveloppe : bone, rayon a la base, rayon a l'extremite, axe local
const LIMB_SHAPES := [
	["hips",       0.155, 0.150, Vector3.UP,      10],
	["spine",      0.150, 0.160, Vector3.UP,      10],
	["chest",      0.165, 0.135, Vector3.UP,      10],
	["neck",       0.062, 0.060, Vector3.UP,       8],
	["upperarm_l", 0.068, 0.056, Vector3.RIGHT,    8],
	["forearm_l",  0.056, 0.044, Vector3.RIGHT,    8],
	["hand_l",     0.048, 0.030, Vector3.RIGHT,    6],
	["upperarm_r", 0.068, 0.056, Vector3.LEFT,     8],
	["forearm_r",  0.056, 0.044, Vector3.LEFT,     8],
	["hand_r",     0.048, 0.030, Vector3.LEFT,     6],
	["thigh_l",    0.095, 0.070, Vector3.DOWN,     8],
	["shin_l",     0.070, 0.048, Vector3.DOWN,     8],
	["foot_l",     0.055, 0.075, Vector3.DOWN,     6],
	["thigh_r",    0.095, 0.070, Vector3.DOWN,     8],
	["shin_r",     0.070, 0.048, Vector3.DOWN,     8],
	["foot_r",     0.055, 0.075, Vector3.DOWN,     6],
]

const HEAD_LAYER := 2          # calque masque a la camera subjective

var skeleton: Skeleton3D
var body_mesh: MeshInstance3D
var head_mesh: MeshInstance3D
var visor_mesh: MeshInstance3D
var bone_index: Dictionary = {}
var rest_global: Dictionary = {}

var suit_material: StandardMaterial3D
var skin_material: StandardMaterial3D
var visor_material: StandardMaterial3D

var wearing_fins: bool = false
var _fin_l: MeshInstance3D
var _fin_r: MeshInstance3D
var _tank: MeshInstance3D

func _ready() -> void:
	_build_materials()
	_build_skeleton()
	_build_meshes()
	_build_gear()

# =============================================================================
#  Construction
# =============================================================================
func _build_materials() -> void:
	suit_material = StandardMaterial3D.new()
	suit_material.albedo_color = Color(0.11, 0.14, 0.19)
	suit_material.roughness = 0.42
	suit_material.metallic = 0.05
	suit_material.metallic_specular = 0.55
	suit_material.clearcoat_enabled = true
	suit_material.clearcoat = 0.6
	suit_material.clearcoat_roughness = 0.25
	suit_material.normal_enabled = true
	suit_material.normal_texture = ProcTextures.normal_map(256, 0.35, 3, 12, 0.35)
	suit_material.normal_scale = 0.4
	suit_material.detail_enabled = false

	skin_material = StandardMaterial3D.new()
	skin_material.albedo_color = Color(0.72, 0.55, 0.45)
	skin_material.roughness = 0.6
	skin_material.subsurf_scatter_enabled = true
	skin_material.subsurf_scatter_strength = 0.35

	visor_material = StandardMaterial3D.new()
	visor_material.albedo_color = Color(0.05, 0.09, 0.12, 0.42)
	visor_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	visor_material.roughness = 0.05
	visor_material.metallic = 0.9
	visor_material.emission_enabled = true
	visor_material.emission = Color(0.1, 0.35, 0.4)
	visor_material.emission_energy_multiplier = 0.15
	visor_material.cull_mode = BaseMaterial3D.CULL_DISABLED

func _build_skeleton() -> void:
	skeleton = Skeleton3D.new()
	skeleton.name = "Skeleton"
	add_child(skeleton)
	for def in BONE_DEFS:
		var idx := skeleton.add_bone(def[0])
		bone_index[def[0]] = idx
	for def in BONE_DEFS:
		var idx: int = bone_index[def[0]]
		if def[1] != "":
			skeleton.set_bone_parent(idx, bone_index[def[1]])
		skeleton.set_bone_rest(idx, Transform3D(Basis.IDENTITY, def[2]))
	skeleton.reset_bone_poses()
	# transformations globales de repos : servent a poser les sommets
	for def in BONE_DEFS:
		var idx: int = bone_index[def[0]]
		rest_global[def[0]] = skeleton.get_bone_global_rest(idx)

func _build_meshes() -> void:
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var bones := PackedInt32Array()
	var weights := PackedFloat32Array()
	var indices := PackedInt32Array()

	for shape in LIMB_SHAPES:
		_add_limb(shape[0], shape[1], shape[2], shape[3], shape[4],
			verts, normals, uvs, bones, weights, indices)

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_BONES] = bones
	arrays[Mesh.ARRAY_WEIGHTS] = weights
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.surface_set_material(0, suit_material)

	body_mesh = MeshInstance3D.new()
	body_mesh.name = "Body"
	body_mesh.mesh = mesh
	skeleton.add_child(body_mesh)
	body_mesh.skeleton = body_mesh.get_path_to(skeleton)
	body_mesh.skin = skeleton.create_skin_from_rest_transforms()
	body_mesh.custom_aabb = AABB(Vector3(-1.6, -1.0, -1.6), Vector3(3.2, 3.4, 3.2))

	# --- tete : attachee a l'os, masquee pour la camera subjective ----------
	var head_attach := BoneAttachment3D.new()
	head_attach.name = "HeadAttach"
	skeleton.add_child(head_attach)
	head_attach.bone_name = "head"

	head_mesh = MeshInstance3D.new()
	head_mesh.name = "Head"
	var head := SphereMesh.new()
	head.radius = 0.115
	head.height = 0.27
	head.radial_segments = 20
	head.rings = 12
	head_mesh.mesh = head
	head_mesh.material_override = suit_material
	head_mesh.position = Vector3(0, 0.1, 0)
	head_mesh.layers = 1 << (HEAD_LAYER - 1)
	head_attach.add_child(head_mesh)

	visor_mesh = MeshInstance3D.new()
	visor_mesh.name = "Visor"
	var visor := SphereMesh.new()
	visor.radius = 0.108
	visor.height = 0.2
	visor.radial_segments = 18
	visor.rings = 10
	visor_mesh.mesh = visor
	visor_mesh.material_override = visor_material
	visor_mesh.position = Vector3(0, 0.1, -0.035)
	visor_mesh.scale = Vector3(0.95, 0.8, 1.0)
	visor_mesh.layers = 1 << (HEAD_LAYER - 1)
	head_attach.add_child(visor_mesh)

## Ajoute un tube effile autour d'un os, avec les poids de peau qui fondent
## vers l'os parent a la base et vers l'os enfant a l'extremite.
func _add_limb(bone_name: String, r0: float, r1: float, axis: Vector3,
		segments: int, verts: PackedVector3Array, normals: PackedVector3Array,
		uvs: PackedVector2Array, bones: PackedInt32Array,
		weights: PackedFloat32Array, indices: PackedInt32Array) -> void:
	var idx: int = bone_index[bone_name]
	var parent_idx: int = skeleton.get_bone_parent(idx)
	if parent_idx < 0:
		parent_idx = idx
	var child_idx := _first_child(bone_name)
	var length := _bone_length(bone_name)
	var origin: Vector3 = rest_global[bone_name].origin

	# repere local du membre : `axis` devient l'axe long
	var up := axis.normalized()
	var ref := Vector3.FORWARD if absf(up.dot(Vector3.FORWARD)) < 0.9 else Vector3.RIGHT
	var side := up.cross(ref).normalized()
	var fwd := side.cross(up).normalized()

	var rings := 7
	var base := verts.size()
	for ring in rings + 1:
		var t := float(ring) / float(rings)
		var radius: float = lerpf(r0, r1, t)
		# arrondi aux extremites : evite les tubes coupes net
		radius *= sqrt(clampf(1.0 - pow(2.0 * t - 1.0, 8.0), 0.02, 1.0))
		var center := origin + up * (length * t)

		# --- poids de peau ---------------------------------------------------
		var b0 := idx
		var b1 := idx
		var w0 := 1.0
		if t < 0.3:
			b1 = parent_idx
			w0 = 0.5 + 0.5 * (t / 0.3)
		elif t > 0.72 and child_idx >= 0:
			b1 = child_idx
			w0 = 1.0 - 0.45 * ((t - 0.72) / 0.28)
		var w1 := 1.0 - w0

		for s in segments:
			var a := TAU * float(s) / float(segments)
			var dir := side * cos(a) + fwd * sin(a)
			verts.append(center + dir * radius)
			# la normale tient compte du cone du membre
			var slope := (r1 - r0) / maxf(length, 0.001)
			normals.append((dir - up * slope).normalized())
			uvs.append(Vector2(float(s) / segments, t))
			bones.append_array([b0, b1, 0, 0])
			weights.append_array([w0, w1, 0.0, 0.0])

	for ring in rings:
		for s in segments:
			var s2 := (s + 1) % segments
			var i0 := base + ring * segments + s
			var i1 := base + ring * segments + s2
			var i2 := base + (ring + 1) * segments + s
			var i3 := base + (ring + 1) * segments + s2
			indices.append_array([i0, i2, i1, i1, i2, i3])

func _first_child(bone_name: String) -> int:
	for def in BONE_DEFS:
		if def[1] == bone_name:
			return bone_index[def[0]]
	return -1

func _bone_length(bone_name: String) -> float:
	for def in BONE_DEFS:
		if def[0] == bone_name:
			return def[3]
	return 0.2

# =============================================================================
#  Equipement visible
# =============================================================================
func _build_gear() -> void:
	# bouteille dans le dos
	var chest_attach := BoneAttachment3D.new()
	chest_attach.bone_name = "chest"
	skeleton.add_child(chest_attach)

	var tank_mat := StandardMaterial3D.new()
	tank_mat.albedo_color = Color(0.78, 0.5, 0.12)
	tank_mat.metallic = 0.8
	tank_mat.roughness = 0.3

	_tank = MeshInstance3D.new()
	_tank.name = "Tank"
	var cyl := CapsuleMesh.new()
	cyl.radius = 0.075
	cyl.height = 0.42
	_tank.mesh = cyl
	_tank.material_override = tank_mat
	_tank.position = Vector3(0.0, 0.1, 0.17)
	_tank.visible = false
	chest_attach.add_child(_tank)

	_fin_l = _make_fin("foot_l", 1.0)
	_fin_r = _make_fin("foot_r", -1.0)

func _make_fin(bone: String, side: float) -> MeshInstance3D:
	var attach := BoneAttachment3D.new()
	attach.bone_name = bone
	skeleton.add_child(attach)
	var fin := MeshInstance3D.new()
	fin.name = "Fin_" + bone
	var m := BoxMesh.new()
	m.size = Vector3(0.16, 0.03, 0.42)
	fin.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.08, 0.11, 0.16)
	mat.roughness = 0.5
	fin.material_override = mat
	fin.position = Vector3(0.02 * side, -0.12, -0.15)
	fin.visible = false
	attach.add_child(fin)
	return fin

func set_fins_visible(on: bool) -> void:
	wearing_fins = on
	if _fin_l != null:
		_fin_l.visible = on
	if _fin_r != null:
		_fin_r.visible = on

func set_tank_visible(on: bool) -> void:
	if _tank != null:
		_tank.visible = on

func set_first_person(first_person: bool) -> void:
	## En vue subjective la tete est retiree du champ de la camera, mais elle
	## continue de projeter son ombre.
	var cast := GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if first_person \
		else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for m in [head_mesh, visor_mesh]:
		if m != null:
			m.cast_shadow = cast
