extends Node
## BrickKit (autoload)
##
## The single source of truth for every mesh and material in the game.
## Nothing in this project ships imported art: buildings, props, the hero and the
## boss are all assembled from a handful of shared primitives plus the brick
## shader. Centralising it here means:
##   * materials are cached and shared -> very few draw-call state changes,
##   * the whole game can be re-skinned by editing one file,
##   * MultiMesh helpers keep the city at a low node count.
##
## Scene requirements: none (autoload).

const BRICK_SHADER := "res://assets/shaders/brick.gdshader"
const WEB_SHADER := "res://assets/shaders/web.gdshader"
const SKY_SHADER := "res://assets/shaders/sky.gdshader"

## Physics layer values (bit = 1 << (layer_index - 1)). Kept as plain ints so
## scenes and code agree without magic numbers spread everywhere.
const L_WORLD := 1
const L_PLAYER := 2
const L_ENEMY := 4
const L_WEB_ANCHOR := 8
const L_HITBOX := 16
const L_HURTBOX := 32
const L_PROP := 64
const L_VEHICLE := 128
const L_TRIGGER := 256
const L_BOSS := 512

## Handy composite masks.
const MASK_WEB_TARGETS := L_WORLD | L_WEB_ANCHOR | L_PROP | L_BOSS
const MASK_PLAYER_BODY := L_WORLD | L_PROP | L_VEHICLE
const MASK_ENEMY_BODY := L_WORLD | L_ENEMY | L_PROP | L_VEHICLE
const MASK_GROUND := L_WORLD | L_PROP | L_VEHICLE

## --- Toy palette -------------------------------------------------------------
## Bright moulded-plastic colours. Buildings pick from BUILDING_COLORS so the
## city stays colourful but never garish.
const HERO_RED := Color(0.86, 0.12, 0.16)
const HERO_BLUE := Color(0.10, 0.24, 0.68)
const HERO_DARK := Color(0.06, 0.09, 0.20)
const EYE_WHITE := Color(0.96, 0.98, 1.0)

const BUILDING_COLORS: Array[Color] = [
	Color(0.78, 0.76, 0.72), # sand
	Color(0.62, 0.65, 0.70), # concrete grey
	Color(0.72, 0.36, 0.28), # terracotta
	Color(0.42, 0.47, 0.56), # slate blue
	Color(0.85, 0.80, 0.62), # cream
	Color(0.34, 0.40, 0.38), # dark green grey
	Color(0.68, 0.55, 0.45), # brown
	Color(0.55, 0.62, 0.66), # steel
]

const ACCENT_COLORS: Array[Color] = [
	Color(0.95, 0.72, 0.10),
	Color(0.90, 0.25, 0.20),
	Color(0.15, 0.55, 0.85),
	Color(0.20, 0.70, 0.45),
	Color(0.75, 0.30, 0.70),
]

const ROAD_COLOR := Color(0.14, 0.15, 0.17)
const SIDEWALK_COLOR := Color(0.60, 0.60, 0.58)
const GRASS_COLOR := Color(0.24, 0.55, 0.24)
const WATER_COLOR := Color(0.10, 0.32, 0.52)
const METAL_COLOR := Color(0.55, 0.58, 0.62)

var _brick_shader: Shader
var _web_shader: Shader
var _material_cache: Dictionary = {}
var _mesh_cache: Dictionary = {}
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	_brick_shader = load(BRICK_SHADER) as Shader
	_web_shader = load(WEB_SHADER) as Shader
	rng.randomize()


# =============================================================================
#  MATERIALS
# =============================================================================

## Standard opaque brick material. Cached by every parameter combination.
func brick(color: Color, studs: bool = true, roughness: float = 0.28,
		metallic: float = 0.0, emission: float = 0.0) -> ShaderMaterial:
	var key := "b_%s_%s_%.2f_%.2f_%.2f" % [color.to_html(false), studs, roughness, metallic, emission]
	if _material_cache.has(key):
		return _material_cache[key]
	var mat := ShaderMaterial.new()
	mat.shader = _brick_shader
	mat.set_shader_parameter("base_color", color)
	mat.set_shader_parameter("stud_visible", 1.0 if studs else 0.0)
	mat.set_shader_parameter("roughness_value", roughness)
	mat.set_shader_parameter("metallic_value", metallic)
	mat.set_shader_parameter("emission_energy", emission)
	mat.set_shader_parameter("emission_tint", Color.WHITE)
	mat.set_shader_parameter("stud_density", 1.25)
	mat.set_shader_parameter("bevel_width", 0.035)
	_material_cache[key] = mat
	return mat

## Glossy window glass: smooth, dark, reflective, faintly lit from inside.
func glass(lit: bool = false) -> ShaderMaterial:
	var key := "glass_%s" % lit
	if _material_cache.has(key):
		return _material_cache[key]
	var mat := ShaderMaterial.new()
	mat.shader = _brick_shader
	mat.set_shader_parameter("base_color", Color(0.16, 0.24, 0.34) if not lit else Color(1.0, 0.85, 0.55))
	mat.set_shader_parameter("stud_visible", 0.0)
	mat.set_shader_parameter("roughness_value", 0.05)
	mat.set_shader_parameter("metallic_value", 0.85)
	mat.set_shader_parameter("emission_energy", 1.6 if lit else 0.0)
	mat.set_shader_parameter("bevel_width", 0.02)
	mat.set_shader_parameter("rim_light", 0.45)
	_material_cache[key] = mat
	return mat

## Brushed metal for the boss, machines and street furniture.
func metal(color: Color = METAL_COLOR, rough: float = 0.35) -> ShaderMaterial:
	return brick(color, false, rough, 0.9, 0.0)

## Strong self-lit material for signs, energy cores and holograms.
func neon(color: Color, energy: float = 3.0) -> ShaderMaterial:
	var key := "neon_%s_%.2f" % [color.to_html(false), energy]
	if _material_cache.has(key):
		return _material_cache[key]
	var mat := ShaderMaterial.new()
	mat.shader = _brick_shader
	mat.set_shader_parameter("base_color", color)
	mat.set_shader_parameter("stud_visible", 0.0)
	mat.set_shader_parameter("roughness_value", 0.4)
	mat.set_shader_parameter("emission_energy", energy)
	mat.set_shader_parameter("emission_tint", color)
	mat.set_shader_parameter("bevel_width", 0.01)
	_material_cache[key] = mat
	return mat

## Material for the web strand cylinder.
func web_material() -> ShaderMaterial:
	if _material_cache.has("web"):
		return _material_cache["web"]
	var mat := ShaderMaterial.new()
	mat.shader = _web_shader
	mat.set_shader_parameter("strand_color", Color(0.95, 0.97, 1.0, 0.92))
	_material_cache["web"] = mat
	return mat


# =============================================================================
#  MESHES  (all shared -- never allocate a mesh per object)
# =============================================================================

## Unit cube. The brick shader expects unit cubes scaled by their transform.
func unit_box() -> BoxMesh:
	if not _mesh_cache.has("box"):
		var m := BoxMesh.new()
		m.size = Vector3.ONE
		_mesh_cache["box"] = m
	return _mesh_cache["box"]

func unit_cylinder(radial_segments: int = 12) -> CylinderMesh:
	var key := "cyl_%d" % radial_segments
	if not _mesh_cache.has(key):
		var m := CylinderMesh.new()
		m.top_radius = 0.5
		m.bottom_radius = 0.5
		m.height = 1.0
		m.radial_segments = radial_segments
		m.rings = 1
		_mesh_cache[key] = m
	return _mesh_cache[key]

func unit_cone(radial_segments: int = 10) -> CylinderMesh:
	var key := "cone_%d" % radial_segments
	if not _mesh_cache.has(key):
		var m := CylinderMesh.new()
		m.top_radius = 0.0
		m.bottom_radius = 0.5
		m.height = 1.0
		m.radial_segments = radial_segments
		m.rings = 1
		_mesh_cache[key] = m
	return _mesh_cache[key]

func unit_sphere(rings: int = 8, radial: int = 12) -> SphereMesh:
	var key := "sph_%d_%d" % [rings, radial]
	if not _mesh_cache.has(key):
		var m := SphereMesh.new()
		m.radius = 0.5
		m.height = 1.0
		m.rings = rings
		m.radial_segments = radial
		_mesh_cache[key] = m
	return _mesh_cache[key]

func unit_torus(ring_segments: int = 24, radial: int = 8) -> TorusMesh:
	var key := "tor_%d_%d" % [ring_segments, radial]
	if not _mesh_cache.has(key):
		var m := TorusMesh.new()
		m.inner_radius = 0.4
		m.outer_radius = 0.5
		m.ring_segments = ring_segments
		m.rings = radial
		_mesh_cache[key] = m
	return _mesh_cache[key]


# =============================================================================
#  BUILDER HELPERS
# =============================================================================

## Visual-only brick. `size` is in metres, `pos` is the centre in parent space.
func add_box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material,
		node_name: String = "Brick") -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = unit_box()
	mi.material_override = mat
	mi.scale = size
	mi.position = pos
	parent.add_child(mi)
	return mi

## Visual brick using any shared mesh (cylinder / sphere / cone / torus).
func add_shape(parent: Node3D, mesh: Mesh, size: Vector3, pos: Vector3, mat: Material,
		node_name: String = "Part") -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	mi.material_override = mat
	mi.scale = size
	mi.position = pos
	parent.add_child(mi)
	return mi

## Solid, collidable box (used for buildings, floors, crates...).
func add_static_box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material,
		layer: int = L_WORLD | L_WEB_ANCHOR, mask: int = 0,
		node_name: String = "Block") -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = pos
	body.collision_layer = layer
	body.collision_mask = mask
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	var mi := MeshInstance3D.new()
	mi.mesh = unit_box()
	mi.material_override = mat
	mi.scale = size
	body.add_child(mi)
	parent.add_child(body)
	return body

## Collision-only box: pair it with a MultiMesh for the visuals.
func add_collider_box(parent: Node3D, size: Vector3, pos: Vector3,
		layer: int = L_WORLD | L_WEB_ANCHOR, node_name: String = "Collider") -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = pos
	body.collision_layer = layer
	body.collision_mask = 0
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	parent.add_child(body)
	return body

## Creates an empty MultiMeshInstance3D ready to receive brick transforms.
## Custom data is enabled so each brick can carry its own colour tint.
func new_multimesh(mat: Material, mesh: Mesh = null) -> MultiMeshInstance3D:
	var mmi := MultiMeshInstance3D.new()
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = mesh if mesh != null else unit_box()
	mmi.multimesh = mm
	mmi.material_override = mat
	return mmi

## Uploads a batch of bricks into a MultiMesh.
## `bricks` is an Array of Dictionaries: {pos: Vector3, size: Vector3, tint: Color}
##
## The visibility AABB is computed here and assigned explicitly. This matters:
## the automatic bounds of a MultiMesh are not reliable for meshes whose
## instances are scaled far beyond the source mesh (our unit cube scaled into
## 180 m towers), and an undersized box makes whole blocks vanish as soon as
## their centre leaves the frustum -- which is exactly what a street-level camera
## does all the time.
func fill_multimesh(mmi: MultiMeshInstance3D, bricks: Array) -> void:
	var mm := mmi.multimesh
	mm.instance_count = bricks.size()
	if bricks.is_empty():
		return
	var bounds_min := Vector3.INF
	var bounds_max := -Vector3.INF
	for i in bricks.size():
		var b: Dictionary = bricks[i]
		var basis := Basis.IDENTITY
		if b.has("rot"):
			basis = Basis(Vector3.UP, float(b["rot"]))
		var size: Vector3 = b["size"]
		basis = basis.scaled(size)
		var pos: Vector3 = b["pos"]
		mm.set_instance_transform(i, Transform3D(basis, pos))
		var tint: Color = b.get("tint", Color.WHITE)
		mm.set_instance_custom_data(i, Color(tint.r, tint.g, tint.b, 1.0))
		# Rotated bricks need the diagonal, not the half-size, to stay covered.
		var reach: float = maxf(size.x, size.z) * 0.5 * (1.4142 if b.has("rot") else 1.0)
		var extent := Vector3(reach, size.y * 0.5, reach)
		bounds_min = bounds_min.min(pos - extent)
		bounds_max = bounds_max.max(pos + extent)
	mmi.custom_aabb = AABB(bounds_min, bounds_max - bounds_min)

## Commits a batch of brick data (the same {walls, windows, accents, details,
## colliders} shape the city builders produce) into a single node with at most
## four MultiMeshes and one StaticBody3D. Used by landmarks, the bridge, the
## boss arena and anything else that is static, chunky and must stay cheap.
func build_batch(parent: Node3D, data: Dictionary, node_name: String,
		layer: int = L_WORLD | L_WEB_ANCHOR, detail_range: float = 0.0) -> Node3D:
	var root := Node3D.new()
	root.name = node_name
	parent.add_child(root)

	var groups := {
		"walls": brick(Color.WHITE, true, 0.3),
		"details": brick(Color.WHITE, true, 0.32),
		"windows": glass(false),
		"accents": neon(Color.WHITE, 2.2),
	}
	for key in groups.keys():
		var bricks: Array = data.get(key, [])
		if bricks.is_empty():
			continue
		var mmi := new_multimesh(groups[key])
		mmi.name = key.capitalize()
		if detail_range > 0.0 and (key == "details" or key == "windows"):
			mmi.visibility_range_end = detail_range
			mmi.visibility_range_end_margin = 30.0
		root.add_child(mmi)
		fill_multimesh(mmi, bricks)

	var colliders: Array = data.get("colliders", [])
	if not colliders.is_empty():
		var body := StaticBody3D.new()
		body.name = "Collision"
		body.collision_layer = layer
		body.collision_mask = 0
		root.add_child(body)
		for entry in colliders:
			var shape := CollisionShape3D.new()
			var box := BoxShape3D.new()
			box.size = entry["size"]
			shape.shape = box
			shape.position = entry["pos"]
			if entry.has("rot"):
				shape.rotation.y = float(entry["rot"])
			body.add_child(shape)
	return root

## Empty brick-data container in the shape every builder expects.
func new_batch() -> Dictionary:
	return {"walls": [], "details": [], "windows": [], "accents": [], "colliders": [], "lights": []}

## Slight random colour wobble around a base colour -- moulded plastic never
## comes out perfectly uniform, and this stops walls looking printed.
func vary(color: Color, amount: float = 0.06) -> Color:
	var f := 1.0 + rng.randf_range(-amount, amount)
	return Color(clampf(color.r * f, 0.0, 1.0), clampf(color.g * f, 0.0, 1.0),
			clampf(color.b * f, 0.0, 1.0), color.a)

func pick_building_color() -> Color:
	return BUILDING_COLORS[rng.randi_range(0, BUILDING_COLORS.size() - 1)]

func pick_accent() -> Color:
	return ACCENT_COLORS[rng.randi_range(0, ACCENT_COLORS.size() - 1)]
