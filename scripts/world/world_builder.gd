class_name WorldBuilder
extends RefCounted
## Static factory for the procedural fallback environment. Every method creates real
## nodes (mesh + collision + surface tags) under a supplied parent and returns the
## created node, so levels compose dense rooms from primitives with PBR materials.
## These are clearly the "fallback" geometry described in the brief; dropping real
## GLB assets in later does not require touching this code.

# --- Core primitives ---------------------------------------------------------

## A solid box on the World layer (blocks movement, parsed by navmesh baking).
static func static_box(parent: Node, center: Vector3, size: Vector3, material: Material, surface: int = -1) -> StaticBody3D:
	var body: StaticBody3D = StaticBody3D.new()
	body.collision_layer = GameTypes.LAYER_WORLD
	body.collision_mask = 0
	body.position = center
	parent.add_child(body)

	var mi: MeshInstance3D = MeshInstance3D.new()
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = size
	mi.mesh = mesh
	mi.material_override = material
	body.add_child(mi)

	var cs: CollisionShape3D = CollisionShape3D.new()
	var shape: BoxShape3D = BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)

	if surface >= 0:
		body.set_meta("surface_type", surface)
	return body

## A non-colliding decorative box.
static func visual_box(parent: Node, center: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = size
	mi.mesh = mesh
	mi.material_override = material
	mi.position = center
	parent.add_child(mi)
	return mi

## Floor tile. `center` is the centre of the walkable surface (top at center.y).
static func add_floor(parent: Node, center: Vector3, size: Vector2, surface: int = GameTypes.SurfaceType.CONCRETE, material: Material = null) -> StaticBody3D:
	var mat: Material = material if material != null else MaterialLibrary.floor_tile()
	return static_box(parent, center - Vector3(0, 0.1, 0), Vector3(size.x, 0.2, size.y), mat, surface)

## Ceiling tile. `y` is the underside height.
static func ceiling(parent: Node, center_xz: Vector3, size: Vector2, y: float, material: Material = null) -> StaticBody3D:
	var mat: Material = material if material != null else MaterialLibrary.ceiling()
	return static_box(parent, Vector3(center_xz.x, y + 0.1, center_xz.z), Vector3(size.x, 0.2, size.y), mat)

## A wall segment between two points at a given height/thickness.
static func wall(parent: Node, from: Vector3, to: Vector3, height: float, thickness: float = 0.2, material: Material = null) -> StaticBody3D:
	var mat: Material = material if material != null else MaterialLibrary.concrete_wall()
	var mid: Vector3 = (from + to) * 0.5
	mid.y = from.y + height * 0.5
	var length: float = Vector2(to.x - from.x, to.z - from.z).length()
	var body: StaticBody3D = static_box(parent, mid, Vector3(length, height, thickness), mat)
	var angle: float = atan2(to.x - from.x, to.z - from.z)
	body.rotation.y = angle + PI * 0.5
	return body

## Builds a rectangular room (floor, ceiling, 4 walls) leaving optional doorway gaps.
## `doors` is an array of [side, offset, width] where side is "n"/"s"/"e"/"w".
static func room(parent: Node, center: Vector3, size: Vector2, height: float, surface: int, wall_mat: Material, floor_mat: Material, doors: Array = [], with_ceiling: bool = true) -> void:
	add_floor(parent, center, size, surface, floor_mat)
	if with_ceiling:
		ceiling(parent, center, size, center.y + height, MaterialLibrary.ceiling())
	var hx: float = size.x * 0.5
	var hz: float = size.y * 0.5
	# Each wall is split around its doorway gaps.
	_wall_with_gaps(parent, center + Vector3(-hx, 0, -hz), center + Vector3(hx, 0, -hz), height, "n", doors, wall_mat)
	_wall_with_gaps(parent, center + Vector3(-hx, 0, hz), center + Vector3(hx, 0, hz), height, "s", doors, wall_mat)
	_wall_with_gaps(parent, center + Vector3(-hx, 0, -hz), center + Vector3(-hx, 0, hz), height, "w", doors, wall_mat)
	_wall_with_gaps(parent, center + Vector3(hx, 0, -hz), center + Vector3(hx, 0, hz), height, "e", doors, wall_mat)

static func _wall_with_gaps(parent: Node, from: Vector3, to: Vector3, height: float, side: String, doors: Array, mat: Material) -> void:
	var gaps: Array[Vector2] = []   # (offset_along, width)
	for d: Array in doors:
		if str(d[0]) == side:
			gaps.append(Vector2(float(d[1]), float(d[2])))
	var total: float = (to - from).length()
	var dir: Vector3 = (to - from).normalized()
	if gaps.is_empty():
		wall(parent, from, to, height, 0.2, mat)
		return
	# Sort gaps by offset and emit wall pieces between them.
	gaps.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.x < b.x)
	var cursor: float = 0.0
	for gap: Vector2 in gaps:
		var gap_start: float = clampf(gap.x - gap.y * 0.5, 0.0, total)
		var gap_end: float = clampf(gap.x + gap.y * 0.5, 0.0, total)
		if gap_start > cursor:
			wall(parent, from + dir * cursor, from + dir * gap_start, height, 0.2, mat)
		# Lintel above the doorway.
		visual_box(parent, (from + dir * gap.x) + Vector3(0, from.y + height - 0.25, 0), Vector3(gap.y, 0.5, 0.2), mat)
		cursor = gap_end
	if cursor < total:
		wall(parent, from + dir * cursor, to, height, 0.2, mat)

## Wall parallel to the Z axis at fixed x, leaving doorway gaps (Vector2 =
## centre_z, width). Adds a lintel above each gap. Used by levels for partitions.
static func wall_run_z(parent: Node, x: float, z0: float, z1: float, floor_y: float, height: float, gaps: Array, mat: Material) -> void:
	var sorted: Array = gaps.duplicate()
	sorted.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.x < b.x)
	var cursor: float = z0
	for gap: Vector2 in sorted:
		var gs: float = gap.x - gap.y * 0.5
		var ge: float = gap.x + gap.y * 0.5
		if gs > cursor:
			wall(parent, Vector3(x, floor_y, cursor), Vector3(x, floor_y, gs), height, 0.2, mat)
		visual_box(parent, Vector3(x, floor_y + height - 0.4, gap.x), Vector3(0.2, 0.8, gap.y), mat)
		cursor = ge
	if cursor < z1:
		wall(parent, Vector3(x, floor_y, cursor), Vector3(x, floor_y, z1), height, 0.2, mat)

## Wall parallel to the X axis at fixed z, leaving doorway gaps.
static func wall_run_x(parent: Node, z: float, x0: float, x1: float, floor_y: float, height: float, gaps: Array, mat: Material) -> void:
	var sorted: Array = gaps.duplicate()
	sorted.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.x < b.x)
	var cursor: float = x0
	for gap: Vector2 in sorted:
		var gs: float = gap.x - gap.y * 0.5
		var ge: float = gap.x + gap.y * 0.5
		if gs > cursor:
			wall(parent, Vector3(cursor, floor_y, z), Vector3(gs, floor_y, z), height, 0.2, mat)
		visual_box(parent, Vector3(gap.x, floor_y + height - 0.4, z), Vector3(gap.y, 0.8, 0.2), mat)
		cursor = ge
	if cursor < x1:
		wall(parent, Vector3(cursor, floor_y, z), Vector3(x1, floor_y, z), height, 0.2, mat)

# --- Lights ------------------------------------------------------------------

static func omni(parent: Node, pos: Vector3, color: Color, energy: float, light_range: float, shadows: bool = false) -> OmniLight3D:
	var light: OmniLight3D = OmniLight3D.new()
	light.position = pos
	light.light_color = color
	light.light_energy = energy
	light.omni_range = light_range
	light.shadow_enabled = shadows
	light.distance_fade_enabled = true
	light.distance_fade_begin = 22.0
	light.distance_fade_length = 8.0
	parent.add_child(light)
	return light

## A hanging fluorescent fixture: a mesh plus an omni light. Returns the light so
## callers can attach flicker behaviour.
static func fluorescent(parent: Node, pos: Vector3, on: bool = true, shadows: bool = false) -> OmniLight3D:
	visual_box(parent, pos, Vector3(1.2, 0.06, 0.18), MaterialLibrary.lamp_on() if on else MaterialLibrary.lamp_off())
	var light: OmniLight3D = omni(parent, pos - Vector3(0, 0.2, 0), Color(0.85, 0.88, 0.95), 1.6 if on else 0.0, 7.0, shadows)
	light.set_meta("base_energy", 1.6)
	return light

# --- Props -------------------------------------------------------------------

static func hospital_bed(parent: Node, pos: Vector3, rot_y: float = 0.0) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	root.rotation.y = rot_y
	parent.add_child(root)
	static_box(root, Vector3(0, 0.5, 0), Vector3(0.9, 0.12, 2.0), MaterialLibrary.bed_sheet())
	visual_box(root, Vector3(0, 0.62, -0.7), Vector3(0.8, 0.14, 0.5), MaterialLibrary.bed_sheet())
	for x: float in [-0.4, 0.4]:
		for z: float in [-0.9, 0.9]:
			visual_box(root, Vector3(x, 0.22, z), Vector3(0.06, 0.44, 0.06), MaterialLibrary.rusted_metal())
	visual_box(root, Vector3(0, 0.95, -1.0), Vector3(0.9, 0.7, 0.05), MaterialLibrary.rusted_metal())
	return root

static func wheelchair(parent: Node, pos: Vector3, rot_y: float = 0.0) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	root.rotation.y = rot_y
	parent.add_child(root)
	visual_box(root, Vector3(0, 0.5, 0), Vector3(0.5, 0.06, 0.5), MaterialLibrary.old_wood())
	visual_box(root, Vector3(0, 0.8, -0.25), Vector3(0.5, 0.6, 0.05), MaterialLibrary.old_wood())
	for x: float in [-0.3, 0.3]:
		var w: CylinderMesh = CylinderMesh.new()
		w.top_radius = 0.28
		w.bottom_radius = 0.28
		w.height = 0.04
		var mi: MeshInstance3D = MeshInstance3D.new()
		mi.mesh = w
		mi.material_override = MaterialLibrary.rusted_metal()
		mi.position = Vector3(x, 0.28, 0.1)
		mi.rotation.z = PI * 0.5
		root.add_child(mi)
	return root

static func desk(parent: Node, pos: Vector3, rot_y: float = 0.0) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	root.rotation.y = rot_y
	parent.add_child(root)
	static_box(root, Vector3(0, 0.75, 0), Vector3(1.4, 0.08, 0.7), MaterialLibrary.old_wood())
	for x: float in [-0.6, 0.6]:
		visual_box(root, Vector3(x, 0.37, 0), Vector3(0.08, 0.74, 0.6), MaterialLibrary.old_wood())
	return root

static func cabinet(parent: Node, pos: Vector3, rot_y: float = 0.0) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	root.rotation.y = rot_y
	parent.add_child(root)
	static_box(root, Vector3(0, 0.9, 0), Vector3(0.8, 1.8, 0.5), MaterialLibrary.painted_metal())
	for y: float in [1.3, 0.8, 0.3]:
		visual_box(root, Vector3(0, y, 0.26), Vector3(0.6, 0.02, 0.02), MaterialLibrary.rusted_metal())
	return root

static func chair(parent: Node, pos: Vector3, rot_y: float = 0.0) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	root.rotation.y = rot_y
	parent.add_child(root)
	visual_box(root, Vector3(0, 0.45, 0), Vector3(0.45, 0.06, 0.45), MaterialLibrary.old_wood())
	visual_box(root, Vector3(0, 0.7, -0.2), Vector3(0.45, 0.5, 0.05), MaterialLibrary.old_wood())
	return root

static func pipe(parent: Node, from: Vector3, to: Vector3, radius: float = 0.08) -> MeshInstance3D:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var mesh: CylinderMesh = CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = maxf((to - from).length(), 0.05)
	mi.mesh = mesh
	mi.material_override = MaterialLibrary.rusted_metal()
	mi.position = (from + to) * 0.5
	var dir: Vector3 = (to - from).normalized()
	# Cylinders point +Y; rotate so +Y aligns with the pipe direction (guard verticals).
	if absf(dir.dot(Vector3.UP)) < 0.999:
		var axis: Vector3 = Vector3.UP.cross(dir).normalized()
		var angle: float = Vector3.UP.angle_to(dir)
		mi.transform.basis = Basis(axis, angle)
	parent.add_child(mi)
	return mi

static func tree(parent: Node, pos: Vector3, height: float = 8.0) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	root.rotation = Vector3(randf_range(-0.04, 0.04), randf_range(0.0, TAU), randf_range(-0.04, 0.04))
	parent.add_child(root)

	var trunk_h: float = height * 0.55
	# Tapered trunk with a cylinder collider so you cannot walk through it.
	var body: StaticBody3D = StaticBody3D.new()
	body.collision_layer = GameTypes.LAYER_WORLD
	body.collision_mask = 0
	root.add_child(body)
	var trunk: CylinderMesh = CylinderMesh.new()
	trunk.bottom_radius = 0.34
	trunk.top_radius = 0.16
	trunk.height = trunk_h
	var tmi: MeshInstance3D = MeshInstance3D.new()
	tmi.mesh = trunk
	tmi.material_override = MaterialLibrary.bark()
	tmi.position = Vector3(0, trunk_h * 0.5, 0)
	body.add_child(tmi)
	var col: CollisionShape3D = CollisionShape3D.new()
	var cyl: CylinderShape3D = CylinderShape3D.new()
	cyl.radius = 0.3
	cyl.height = trunk_h
	col.shape = cyl
	col.position = Vector3(0, trunk_h * 0.5, 0)
	body.add_child(col)

	# Layered conical canopy with per-tree colour variation.
	var tint: StandardMaterial3D = _foliage_tint(randi() % 4)
	var layers: int = 4
	for i: int in range(layers):
		var y: float = trunk_h * 0.8 + i * (height * 0.13)
		var r: float = (height * 0.34) * (1.0 - i * 0.2)
		var cone: CylinderMesh = CylinderMesh.new()
		cone.top_radius = 0.03
		cone.bottom_radius = r
		cone.height = height * 0.32
		var mi: MeshInstance3D = MeshInstance3D.new()
		mi.mesh = cone
		mi.material_override = tint
		mi.position = Vector3(randf_range(-0.1, 0.1), y, randf_range(-0.1, 0.1))
		root.add_child(mi)
	return root

static func _foliage_tint(variant: int) -> StandardMaterial3D:
	var greens: Array[Color] = [
		Color(0.06, 0.11, 0.05), Color(0.05, 0.09, 0.045),
		Color(0.08, 0.12, 0.06), Color(0.045, 0.08, 0.05),
	]
	var c: Color = greens[clampi(variant, 0, greens.size() - 1)]
	var mat: StandardMaterial3D = MaterialLibrary.get_material("foliage_%d" % variant, c, 0.9, 0.0, true)
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat

static func bush(parent: Node, pos: Vector3, size: float = 1.0) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	root.rotation.y = randf_range(0.0, TAU)
	parent.add_child(root)
	var tint: StandardMaterial3D = _foliage_tint(randi() % 4)
	for i: int in range(3):
		var s: SphereMesh = SphereMesh.new()
		s.radius = size * randf_range(0.4, 0.6)
		s.height = s.radius * 2.0
		var mi: MeshInstance3D = MeshInstance3D.new()
		mi.mesh = s
		mi.material_override = tint
		mi.position = Vector3(randf_range(-0.3, 0.3), size * 0.3, randf_range(-0.3, 0.3))
		root.add_child(mi)
	return root

static func rock(parent: Node, pos: Vector3, scale: float = 1.0) -> StaticBody3D:
	return static_box(parent, pos + Vector3(0, scale * 0.4, 0), Vector3(scale, scale * 0.8, scale), MaterialLibrary.rock())

static func blood_stain(parent: Node, pos: Vector3, size: float = 1.0) -> MeshInstance3D:
	# A thin dark quad laid on the floor (no external texture needed).
	var mi: MeshInstance3D = MeshInstance3D.new()
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = Vector3(size, 0.01, size * randf_range(0.6, 1.2))
	mi.mesh = mesh
	mi.material_override = MaterialLibrary.blood()
	mi.position = pos + Vector3(0, 0.015, 0)
	mi.rotation.y = randf_range(0.0, TAU)
	parent.add_child(mi)
	return mi
