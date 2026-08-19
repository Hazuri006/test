extends Interactable
class_name ResourceNode

## Gisement recoltable : affleurement rocheux, cristal, corail ou plante.
## Se brise a l'interaction et libere son contenu dans l'inventaire.

const OutcropShader := preload("res://shaders/outcrop.gdshader")

@export var node_type: StringName = &"limestone"
@export var display_name: String = "Affleurement calcaire"
## { id d'objet : probabilite } — chaque entree est tiree independamment
@export var loot: Dictionary = {}
@export var min_yield: int = 1
@export var max_yield: int = 2
@export var requires_knife: bool = false

var mesh_instance: MeshInstance3D
var _material: ShaderMaterial
var _field: Node = null
var _cell_key: String = ""

static var _rock_meshes: Array[ArrayMesh] = []

func _ready() -> void:
	super()
	prompt = "Recolter %s" % display_name
	add_to_group(&"resource_node")

func setup(type: StringName, cfg: Dictionary, variant: int, scale_factor: float,
		field: Node, key: String) -> void:
	node_type = type
	display_name = cfg.get("name", "Gisement")
	loot = cfg.get("loot", {})
	min_yield = cfg.get("min", 1)
	max_yield = cfg.get("max", 2)
	requires_knife = cfg.get("knife", false)
	_field = field
	_cell_key = key
	prompt = "Recolter %s" % display_name

	mesh_instance = MeshInstance3D.new()
	mesh_instance.mesh = _get_rock_mesh(variant)
	mesh_instance.scale = Vector3.ONE * scale_factor
	_material = ShaderMaterial.new()
	_material.shader = OutcropShader
	_material.set_shader_parameter("rock_color", cfg.get("rock", Color(0.3, 0.3, 0.29)))
	_material.set_shader_parameter("vein_color", cfg.get("vein", Color(0.3, 0.85, 1.0)))
	_material.set_shader_parameter("vein_amount", cfg.get("vein_amount", 0.3))
	_material.set_shader_parameter("emission_energy", cfg.get("glow", 1.6))
	_material.set_shader_parameter("metallic_amount", cfg.get("metallic", 0.0))
	_material.set_shader_parameter("rock_noise",
		ProcTextures.gray(256, 0.02, 4, 17 + variant))
	mesh_instance.material_override = _material
	add_child(mesh_instance)

	var shape := SphereShape3D.new()
	shape.radius = maxf(scale_factor * 0.55, 0.25)
	var col := CollisionShape3D.new()
	col.shape = shape
	col.position = Vector3(0, scale_factor * 0.25, 0)
	add_child(col)

func get_prompt(player: Node) -> String:
	if requires_knife and not _has_knife(player):
		return "%s (couteau requis)" % display_name
	return prompt

func can_interact(player: Node) -> bool:
	if not enabled:
		return false
	if requires_knife and not _has_knife(player):
		return false
	return true

func _has_knife(player: Node) -> bool:
	if player == null or not ("inventory" in player):
		return false
	return player.inventory.count(&"knife") > 0

func interact(player: Node) -> void:
	harvest(player)

func harvest(player: Node) -> void:
	if not can_interact(player):
		GameState.notify_warning("Il faut un couteau de survie")
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(global_position) ^ hash(node_type)
	var given := 0
	var total: int = rng.randi_range(min_yield, max_yield)
	var ids: Array = loot.keys()
	for i in total:
		var roll := rng.randf()
		var acc := 0.0
		for id in ids:
			acc += loot[id]
			if roll <= acc:
				var added: int = player.inventory.add(id, 1)
				if added > 0:
					given += added
					GameState.notify_success("+%d %s" % [added, ItemDB.item_name(id)])
				else:
					GameState.notify_warning("Inventaire plein")
				break
	if given == 0 and not loot.is_empty():
		GameState.notify_warning("Inventaire plein")
		return
	_break_apart()

func _break_apart() -> void:
	SoundBank.play_at("break_rock", get_parent(), -8.0, randf_range(0.85, 1.2))
	_spawn_debris()
	if _field != null and is_instance_valid(_field) and _field.has_method("mark_harvested"):
		_field.mark_harvested(_cell_key)
	queue_free()

func _spawn_debris() -> void:
	var parent := get_parent()
	if parent == null:
		return
	var p := GPUParticles3D.new()
	p.amount = 22
	p.lifetime = 1.6
	p.one_shot = true
	p.explosiveness = 1.0
	p.global_position = global_position + Vector3(0, 0.2, 0)
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, 1, 0)
	mat.spread = 65.0
	mat.initial_velocity_min = 0.6
	mat.initial_velocity_max = 2.4
	mat.gravity = Vector3(0, -1.2, 0)     # les debris coulent lentement
	mat.damping_min = 1.5
	mat.damping_max = 3.0
	mat.scale_min = 0.4
	mat.scale_max = 1.2
	mat.angular_velocity_min = -180.0
	mat.angular_velocity_max = 180.0
	p.process_material = mat
	var chunk := BoxMesh.new()
	chunk.size = Vector3(0.06, 0.06, 0.06)
	var cm := StandardMaterial3D.new()
	cm.albedo_color = Color(0.35, 0.34, 0.32)
	cm.roughness = 0.9
	chunk.material = cm
	p.draw_pass_1 = chunk
	parent.add_child(p)
	p.emitting = true
	parent.get_tree().create_timer(2.2).timeout.connect(p.queue_free)

func scan_id() -> StringName:
	return node_type

# -----------------------------------------------------------------------------
## Six rochers pre-calcules, partages par tous les gisements : une sphere
## deformee par du bruit, ce qui evite l'aspect "boule" sans cout memoire.
static func _get_rock_mesh(variant: int) -> ArrayMesh:
	if _rock_meshes.is_empty():
		for i in 6:
			_rock_meshes.append(_make_rock(i))
	return _rock_meshes[variant % _rock_meshes.size()]

static func _make_rock(seed_value: int) -> ArrayMesh:
	var noise := FastNoiseLite.new()
	noise.seed = 700 + seed_value * 31
	noise.frequency = 0.9
	noise.fractal_octaves = 4

	var rings := 14
	var segments := 18
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()

	for r in rings + 1:
		var phi: float = PI * float(r) / float(rings)
		for s in segments + 1:
			var theta: float = TAU * float(s) / float(segments)
			var dir := Vector3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta))
			var n: float = noise.get_noise_3d(dir.x * 2.0, dir.y * 2.0, dir.z * 2.0)
			var radius: float = 0.5 * (1.0 + n * 0.55)
			# aplati par le bas : le rocher est pose sur le fond
			var p := dir * radius
			p.y = maxf(p.y, -0.24)
			p.y *= 0.85
			verts.append(p)
			normals.append(dir)
			uvs.append(Vector2(float(s) / segments, float(r) / rings))

	var stride := segments + 1
	for r in rings:
		for s in segments:
			var i0 := r * stride + s
			var i1 := i0 + 1
			var i2 := i0 + stride
			var i3 := i2 + 1
			indices.append_array([i0, i2, i1, i1, i2, i3])

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	# recalcule des normales lissees a partir des faces reelles
	var st := SurfaceTool.new()
	st.create_from(mesh, 0)
	st.generate_normals()
	return st.commit()
