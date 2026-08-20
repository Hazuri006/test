extends RefCounted
class_name MeshBuilder

## Petite boite a outils de geometrie : tout le mobilier du jeu (capsule de
## survie, fabricateur, casiers) est bati avec ces primitives, sans le moindre
## fichier de modele.

## Surface de revolution. `profile` : suite de points (rayon, hauteur),
## parcourus du bas vers le haut. `flip` inverse les normales (vue interieure).
##
## Attention au sens d'enroulement : Godot tient pour face AVANT celle dont la
## normale calculee a la main droite s'ECARTE de la camera, soit l'inverse de
## la convention OpenGL. Un triangle enroule "naturellement" est donc elimine.
static func lathe(profile: PackedVector2Array, segments: int = 32,
		flip: bool = false, uv_scale: Vector2 = Vector2.ONE) -> ArrayMesh:
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()

	for i in profile.size():
		var pt := profile[i]
		# normale du profil : perpendiculaire a la tangente locale
		var prev := profile[maxi(i - 1, 0)]
		var next := profile[mini(i + 1, profile.size() - 1)]
		var tangent := (next - prev).normalized()
		var n2 := Vector2(tangent.y, -tangent.x)
		if flip:
			n2 = -n2
		for s in segments + 1:
			var a := TAU * float(s) / float(segments)
			var c := cos(a)
			var sn := sin(a)
			verts.append(Vector3(pt.x * c, pt.y, pt.x * sn))
			normals.append(Vector3(n2.x * c, n2.y, n2.x * sn).normalized())
			uvs.append(Vector2(float(s) / segments * uv_scale.x,
				float(i) / maxf(profile.size() - 1.0, 1.0) * uv_scale.y))

	var stride := segments + 1
	for i in profile.size() - 1:
		for s in segments:
			var i0 := i * stride + s
			var i1 := i0 + 1
			var i2 := i0 + stride
			var i3 := i2 + 1
			if flip:
				indices.append_array([i0, i2, i1, i1, i2, i3])
			else:
				indices.append_array([i0, i1, i2, i1, i3, i2])
	return commit(verts, normals, uvs, indices)

## Disque perce (anneau plein), oriente vers le haut ou vers le bas.
static func annulus(inner: float, outer: float, y: float, segments: int = 32,
		face_up: bool = true) -> ArrayMesh:
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var n := Vector3.UP if face_up else Vector3.DOWN
	for s in segments + 1:
		var a := TAU * float(s) / float(segments)
		var c := cos(a)
		var sn := sin(a)
		verts.append(Vector3(inner * c, y, inner * sn))
		verts.append(Vector3(outer * c, y, outer * sn))
		normals.append(n)
		normals.append(n)
		uvs.append(Vector2(float(s) / segments, 0.0))
		uvs.append(Vector2(float(s) / segments, 1.0))
	for s in segments:
		var i0 := s * 2
		if face_up:
			indices.append_array([i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2])
		else:
			indices.append_array([i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3])
	return commit(verts, normals, uvs, indices)

static func commit(verts: PackedVector3Array, normals: PackedVector3Array,
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

static func metal(color: Color, rough: float = 0.35,
		metallic: float = 0.85) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	m.metallic = metallic
	m.metallic_specular = 0.6
	return m

static func emissive(color: Color, energy: float = 2.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.emission_enabled = true
	m.emission = color
	m.emission_energy_multiplier = energy
	m.roughness = 0.4
	return m

static func mesh_node(name_str: String, mesh: Mesh, mat: Material,
		pos: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = name_str
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	return mi

static func box_collider(size: Vector3, pos: Vector3,
		rot: Vector3 = Vector3.ZERO) -> CollisionShape3D:
	var shape := BoxShape3D.new()
	shape.size = size
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.position = pos
	cs.rotation = rot
	return cs
