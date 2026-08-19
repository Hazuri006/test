extends Node3D
class_name FishSchool

## Bancs de poissons.
##
## Chaque banc est un essaim de boids (separation, alignement, cohesion) qui
## suit une cible errante contrainte au biome et a la colonne d'eau. Le rendu
## passe par un MultiMesh unique par banc ; la donnee personnalisee de chaque
## instance porte la phase d'ondulation du corps, si bien que les poissons ne
## nagent jamais en synchronisation.

const FishShader := preload("res://shaders/fish.gdshader")

@export var school_size: int = 14
@export var bounds_radius: float = 14.0
@export var speed: float = 2.2
@export var body_length: float = 0.34

var positions: PackedVector3Array
var velocities: PackedVector3Array
var phases: PackedFloat32Array

var target: Vector3
var home: Vector3
var multimesh_instance: MultiMeshInstance3D
var material: ShaderMaterial

var _rng := RandomNumberGenerator.new()
var _retarget := 0.0
var _active := true

static var _shared_mesh: ArrayMesh = null

func setup(p_home: Vector3, size: int, tint: Color, length: float) -> void:
	home = p_home
	school_size = size
	body_length = length
	_rng.seed = hash(p_home)

	material = ShaderMaterial.new()
	material.shader = FishShader
	material.set_shader_parameter("body_color", tint)
	material.set_shader_parameter("body_length", body_length)
	material.set_shader_parameter("iridescence", tint.lightened(0.55))

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = _get_mesh()
	mm.instance_count = school_size

	multimesh_instance = MultiMeshInstance3D.new()
	multimesh_instance.multimesh = mm
	multimesh_instance.material_override = material
	multimesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Les transformations d'instance sont exprimees en coordonnees monde et le
	# noeud reste a l'origine : la boite doit donc entourer `home`, sans quoi
	# le banc disparait des qu'il s'eloigne du centre du monde.
	var extent := bounds_radius * 2.5
	multimesh_instance.custom_aabb = AABB(
		home - Vector3(extent, extent, extent),
		Vector3(extent * 2.0, extent * 2.0, extent * 2.0))
	add_child(multimesh_instance)

	positions.resize(school_size)
	velocities.resize(school_size)
	phases.resize(school_size)
	for i in school_size:
		positions[i] = home + Vector3(
			_rng.randf_range(-3.0, 3.0),
			_rng.randf_range(-1.5, 1.5),
			_rng.randf_range(-3.0, 3.0))
		velocities[i] = Vector3(_rng.randf_range(-1, 1), 0.0,
			_rng.randf_range(-1, 1)).normalized() * speed
		phases[i] = _rng.randf()
		mm.set_instance_custom_data(i, Color(phases[i], _rng.randf(),
			_rng.randf_range(0.7, 1.3), _rng.randf()))
	target = home
	global_position = Vector3.ZERO

func set_active(value: bool) -> void:
	_active = value
	visible = value
	set_process(value)

func _process(delta: float) -> void:
	if not _active or multimesh_instance == null:
		return
	delta = minf(delta, 0.1)

	# ------------------------------------------------- errance du banc -------
	_retarget -= delta
	if _retarget <= 0.0:
		_retarget = _rng.randf_range(3.5, 9.0)
		var a := _rng.randf() * TAU
		var r := _rng.randf_range(3.0, bounds_radius)
		target = home + Vector3(cos(a) * r, _rng.randf_range(-3.0, 3.0), sin(a) * r)
		# on reste au-dessus du fond et sous la surface
		var floor_y := Biome.height(target.x, target.z)
		target.y = clampf(target.y, floor_y + 1.2, minf(floor_y + 22.0, -1.5))

	var mm := multimesh_instance.multimesh
	for i in school_size:
		var p := positions[i]
		var v := velocities[i]

		var separation := Vector3.ZERO
		var alignment := Vector3.ZERO
		var cohesion := Vector3.ZERO
		var neighbours := 0
		for j in school_size:
			if j == i:
				continue
			var d: Vector3 = positions[j] - p
			var dist: float = d.length()
			if dist < 0.001 or dist > 4.0:
				continue
			neighbours += 1
			cohesion += positions[j]
			alignment += velocities[j]
			if dist < 0.85:
				separation -= d / dist * (0.85 - dist)
		if neighbours > 0:
			cohesion = (cohesion / neighbours - p) * 0.55
			alignment = (alignment / neighbours - v) * 0.5

		var seek := (target - p).normalized() * speed - v
		# le fond repousse : les poissons ne traversent jamais le sol
		var floor_y := Biome.height(p.x, p.z)
		var avoid := Vector3.ZERO
		if p.y < floor_y + 1.0:
			avoid.y += (floor_y + 1.0 - p.y) * 4.0
		if p.y > -1.0:
			avoid.y -= (p.y + 1.0) * 4.0

		var accel := separation * 3.2 + alignment * 1.4 + cohesion * 0.9 \
			+ seek * 1.2 + avoid
		v = (v + accel * delta).limit_length(speed * 1.6)
		if v.length() < 0.4:
			v = v.normalized() * 0.4 if v.length() > 0.001 else Vector3.FORWARD * 0.4
		p += v * delta

		positions[i] = p
		velocities[i] = v

		# orientation : -Z vers l'avant, roulis leger dans les virages
		var fwd := v.normalized()
		var up := Vector3.UP
		if absf(fwd.dot(up)) > 0.98:
			up = Vector3.FORWARD
		var basis := Basis.looking_at(fwd, up)
		var scale_f: float = 0.85 + phases[i] * 0.3
		mm.set_instance_transform(i,
			Transform3D(basis.scaled(Vector3.ONE * scale_f), p))

## Poisson : ellipsoide effile + nageoire caudale, aligne sur -Z.
static func _get_mesh() -> ArrayMesh:
	if _shared_mesh != null:
		return _shared_mesh
	var rings := 12
	var segments := 10
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()

	for r in rings + 1:
		var t := float(r) / float(rings)
		var z: float = lerpf(0.5, -0.5, t)          # museau -> queue
		# profil : renfle a l'avant, pince a l'arriere
		var radius: float = sin(pow(t, 0.75) * PI) * 0.14 + 0.012
		radius *= 1.0 - smoothstep(0.75, 1.0, t) * 0.75
		for s in segments + 1:
			var a := TAU * float(s) / float(segments)
			# section aplatie lateralement : un poisson n'est pas cylindrique
			var p := Vector3(cos(a) * radius * 0.62, sin(a) * radius, z)
			verts.append(p)
			normals.append(Vector3(cos(a) * 0.62, sin(a), 0.0).normalized())
			uvs.append(Vector2(float(s) / segments, t))
	var stride := segments + 1
	for r in rings:
		for s in segments:
			var i0 := r * stride + s
			var i1 := i0 + 1
			var i2 := i0 + stride
			var i3 := i2 + 1
			indices.append_array([i0, i2, i1, i1, i2, i3])

	# nageoire caudale : deux triangles en V
	var base := verts.size()
	verts.append(Vector3(0, 0, -0.46))
	verts.append(Vector3(0, 0.16, -0.62))
	verts.append(Vector3(0, -0.16, -0.62))
	for i in 3:
		normals.append(Vector3.RIGHT)
		uvs.append(Vector2(0.5, 1.0))
	indices.append_array([base, base + 1, base + 2, base, base + 2, base + 1])

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	_shared_mesh = ArrayMesh.new()
	_shared_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return _shared_mesh
