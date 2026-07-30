class_name NavMeshBuilder
extends RefCounted
## NavMeshBuilder -- assembles a NavigationMesh from explicit quads.
##
## The city's walkable surface is known exactly (we generated the street grid),
## so baking from source geometry would be a waste of seconds and would happily
## produce navmesh inside buildings. Instead the generator hands us the quads it
## wants agents to walk on: streets, intersections, plazas, the factory floor.
##
## Winding: quads are emitted so their normal points up (+Y), which is what the
## navigation server expects.

var _vertices: PackedVector3Array = PackedVector3Array()
var _polygons: Array[PackedInt32Array] = []

## Adds an axis-aligned rectangle on the XZ plane at height `y`.
func add_rect(min_x: float, min_z: float, max_x: float, max_z: float, y: float) -> void:
	var base := _vertices.size()
	_vertices.append(Vector3(min_x, y, min_z))
	_vertices.append(Vector3(min_x, y, max_z))
	_vertices.append(Vector3(max_x, y, max_z))
	_vertices.append(Vector3(max_x, y, min_z))
	_polygons.append(PackedInt32Array([base, base + 1, base + 2, base + 3]))

## Convenience: rectangle from a centre and a size.
func add_rect_centered(center: Vector3, size: Vector2) -> void:
	add_rect(center.x - size.x * 0.5, center.z - size.y * 0.5,
			center.x + size.x * 0.5, center.z + size.y * 0.5, center.y)

func polygon_count() -> int:
	return _polygons.size()

func build(agent_radius: float = 0.5, agent_height: float = 1.9) -> NavigationMesh:
	var nav := NavigationMesh.new()
	nav.agent_radius = agent_radius
	nav.agent_height = agent_height
	nav.agent_max_climb = 0.5
	nav.agent_max_slope = 45.0
	# Must match the navigation map's cell size/height (project defaults).
	nav.cell_size = 0.25
	nav.cell_height = 0.25
	nav.vertices = _vertices
	for poly in _polygons:
		nav.add_polygon(poly)
	return nav

## Builds the full street grid for a CityLayout-shaped city.
## Streets and intersections are emitted as separate, non-overlapping quads so
## the navigation graph stays clean.
static func street_grid(y: float = 0.03) -> NavMeshBuilder:
	var b := NavMeshBuilder.new()
	var o := CityLayout.origin_offset()
	var p := CityLayout.pitch()
	var bs := CityLayout.BLOCK_SIZE
	var sw := CityLayout.STREET_WIDTH

	# Street strip coordinates: strip k spans [o + k*p - sw, o + k*p] for k in 0..GRID
	for k in CityLayout.GRID + 1:
		var lo: float = o + float(k) * p - sw
		var hi: float = o + float(k) * p
		# Segments between intersections, along Z (vertical streets).
		for j in CityLayout.GRID:
			var z0: float = o + float(j) * p
			var z1: float = z0 + bs
			b.add_rect(lo, z0, hi, z1, y)
		# Segments along X (horizontal streets).
		for i in CityLayout.GRID:
			var x0: float = o + float(i) * p
			var x1: float = x0 + bs
			b.add_rect(x0, lo, x1, hi, y)
	# Intersections.
	for i in CityLayout.GRID + 1:
		for j in CityLayout.GRID + 1:
			var x_lo: float = o + float(i) * p - sw
			var z_lo: float = o + float(j) * p - sw
			b.add_rect(x_lo, z_lo, x_lo + sw, z_lo + sw, y)
	return b
