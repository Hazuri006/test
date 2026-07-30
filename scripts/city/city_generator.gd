extends Node3D
## CityGenerator -- builds all of Brick City at load time.
##
## Order of construction:
##   1. land + water + road surface + markings + crosswalks
##   2. the two landmarks (bank, Mechanix factory)
##   3. every city block (CityBlock does its own geometry)
##   4. the suspension bridge over the bay
##   5. navigation mesh for the street grid
##   6. box occluders on the downtown towers
##   7. the traffic system
##
## Generation is asynchronous: it yields every few blocks so the loading screen
## keeps animating instead of freezing.
##
## Scene requirements: a Node3D named "City" in the world scene with this script.
## Children are created here; nothing to author by hand.
##
## Inspector parameters: world_seed, generate_traffic, traffic_count,
## enable_occluders, night_lights_range.

signal generation_progress(ratio: float, label: String)
signal generation_finished

@export var world_seed: int = 20260730
@export var generate_traffic: bool = true
@export var traffic_count: int = 26
@export var enable_occluders: bool = true
@export var blocks_per_frame: int = 4

const BANK_BLOCK := Vector2i(1, 4)
const FACTORY_BLOCK := Vector2i(7, 7)

var blocks: Dictionary = {}            ## "i_j" -> CityBlock node
var bank: Dictionary = {}
var factory: Dictionary = {}
var navigation_region: NavigationRegion3D
var traffic: Node3D
var water_area: Area3D
var bridge_root: Node3D

var _rng := RandomNumberGenerator.new()
var _generated: bool = false

func _ready() -> void:
	_rng.seed = world_seed
	GameState.city = self

## Builds the whole city. Await it from the world scene.
func generate_async() -> void:
	if _generated:
		return
	_generated = true

	generation_progress.emit(0.02, "Coulee des fondations...")
	_build_ground()
	await get_tree().process_frame

	generation_progress.emit(0.10, "Construction de la baie...")
	_build_water()
	_build_bridge()
	await get_tree().process_frame

	generation_progress.emit(0.18, "Ouverture de la banque...")
	bank = Landmarks.build_bank(self, CityLayout.block_center(BANK_BLOCK.x, BANK_BLOCK.y))
	factory = Landmarks.build_factory(self, CityLayout.block_center(FACTORY_BLOCK.x, FACTORY_BLOCK.y))
	await get_tree().process_frame

	# --- city blocks --------------------------------------------------------
	var total: int = CityLayout.GRID * CityLayout.GRID
	var done: int = 0
	var since_yield: int = 0
	for i in CityLayout.GRID:
		for j in CityLayout.GRID:
			done += 1
			if (i == BANK_BLOCK.x and j == BANK_BLOCK.y) \
					or (i == FACTORY_BLOCK.x and j == FACTORY_BLOCK.y):
				continue        # landmark occupies this block
			var block := Node3D.new()
			block.set_script(load("res://scripts/city/city_block.gd"))
			block.position = CityLayout.block_center(i, j)
			add_child(block)
			block.generate(i, j, world_seed)
			blocks["%d_%d" % [i, j]] = block
			since_yield += 1
			if since_yield >= blocks_per_frame:
				since_yield = 0
				generation_progress.emit(0.2 + 0.6 * float(done) / float(total),
						"Assemblage des quartiers... %d%%" % int(100.0 * float(done) / float(total)))
				await get_tree().process_frame

	generation_progress.emit(0.84, "Tracage des routes...")
	_build_navigation()
	await get_tree().process_frame

	if enable_occluders:
		_build_occluders()
	generation_progress.emit(0.92, "Mise en circulation...")
	if generate_traffic:
		_build_traffic()
	await get_tree().process_frame

	generation_progress.emit(1.0, "Brick City est prete !")
	generation_finished.emit()

# =============================================================================
#  GROUND / ROADS
# =============================================================================

func _build_ground() -> void:
	var o := CityLayout.origin_offset()
	var sw := CityLayout.STREET_WIDTH
	var extent := CityLayout.city_extent()
	var min_x := o - sw - 24.0
	var max_x := o + extent + 24.0
	var min_z := o - sw               # the bay starts here
	var max_z := o + extent + 24.0
	var size_x := max_x - min_x
	var size_z := max_z - min_z
	var center := Vector3((min_x + max_x) * 0.5, 0.0, (min_z + max_z) * 0.5)

	# One collider + one visual box for the entire road surface.
	var ground := BrickKit.add_static_box(self, Vector3(size_x, 4.0, size_z),
			center + Vector3(0, -2.0, 0), BrickKit.brick(BrickKit.ROAD_COLOR, false, 0.55),
			BrickKit.L_WORLD | BrickKit.L_WEB_ANCHOR, 0, "Ground")
	ground.get_child(1).name = "GroundMesh"

	# Road markings and crosswalks live in one MultiMesh with distance culling.
	var data := BrickKit.new_batch()
	var p := CityLayout.pitch()
	for k in CityLayout.GRID + 1:
		var line: float = o + float(k) * p - sw * 0.5
		# dashed centre lines both ways
		var dashes: int = int((extent + sw) / 7.0)
		for d in dashes:
			var along: float = min_z + 4.0 + float(d) * 7.0
			if along > max_z - 4.0:
				break
			(data["details"] as Array).append({"pos": Vector3(line, 0.04, along),
					"size": Vector3(0.4, 0.08, 3.4), "tint": Color(0.92, 0.85, 0.35)})
			(data["details"] as Array).append({"pos": Vector3(along, 0.04, line),
					"size": Vector3(3.4, 0.08, 0.4), "tint": Color(0.92, 0.85, 0.35)})
	# crosswalks around the central districts only (they are the busy ones)
	for i in range(2, 6):
		for j in range(2, 7):
			var cross := CityLayout.intersection_center(i, j)
			for side in 4:
				var normal: Vector3 = [Vector3.BACK, Vector3.RIGHT, Vector3.FORWARD, Vector3.LEFT][side]
				var pos: Vector3 = cross + normal * (sw * 0.5 + 2.2)
				CityProps.add_crosswalk(data, pos, Vector3(absf(normal.z), 0, absf(normal.x)),
						sw - 2.0, 4.0)
	var markings := BrickKit.new_multimesh(BrickKit.brick(Color.WHITE, false, 0.6))
	markings.name = "RoadMarkings"
	markings.visibility_range_end = 230.0
	markings.visibility_range_end_margin = 30.0
	markings.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(markings)
	BrickKit.fill_multimesh(markings, data["details"])

	var walkways := BrickKit.new_multimesh(BrickKit.brick(Color.WHITE, false, 0.5))
	walkways.name = "Crosswalks"
	walkways.visibility_range_end = 260.0
	walkways.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(walkways)
	BrickKit.fill_multimesh(walkways, data["walls"])

func _build_water() -> void:
	var o := CityLayout.origin_offset()
	var sw := CityLayout.STREET_WIDTH
	var extent := CityLayout.city_extent()
	var water_depth := 240.0
	var center := Vector3(o + extent * 0.5, CityLayout.WATER_LEVEL, o - sw - water_depth * 0.5)
	var size := Vector3(extent + 200.0, 1.0, water_depth)

	# Glossy, slightly transparent slab. It reflects the skyline through the
	# environment, which is most of the effect for none of the cost.
	var surface := MeshInstance3D.new()
	surface.name = "Bay"
	surface.mesh = BrickKit.unit_box()
	surface.scale = size
	surface.position = center
	var mat := ShaderMaterial.new()
	mat.shader = load(BrickKit.BRICK_SHADER) as Shader
	mat.set_shader_parameter("base_color", BrickKit.WATER_COLOR)
	mat.set_shader_parameter("stud_visible", 0.0)
	mat.set_shader_parameter("roughness_value", 0.04)
	mat.set_shader_parameter("metallic_value", 0.65)
	mat.set_shader_parameter("bevel_width", 0.0)
	mat.set_shader_parameter("rim_light", 0.3)
	surface.material_override = mat
	add_child(surface)

	# Sea bed so the hero never falls out of the world here.
	BrickKit.add_static_box(self, Vector3(size.x, 6.0, size.z),
			center + Vector3(0, -8.0, 0), BrickKit.brick(Color(0.18, 0.20, 0.22), false, 0.8),
			BrickKit.L_WORLD, 0, "SeaBed")

	# Trigger that fishes the player out of the bay.
	water_area = Area3D.new()
	water_area.name = "WaterZone"
	water_area.collision_layer = BrickKit.L_TRIGGER
	water_area.collision_mask = BrickKit.L_PLAYER
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(size.x, 8.0, size.z)
	shape.shape = box
	water_area.add_child(shape)
	water_area.position = center + Vector3(0, -2.0, 0)
	water_area.body_entered.connect(_on_water_entered)
	add_child(water_area)

	# Quays along the waterfront edge.
	var data := BrickKit.new_batch()
	for i in 8:
		var x: float = o + 20.0 + float(i) * (extent / 8.0)
		CityProps.add_railing(data, Vector3(x, 0.2, o - sw - 0.5), extent / 8.0 - 2.0, true)
	# Two piers reaching into the bay -- good landing spots when swinging out.
	for s in [-1.0, 1.0]:
		var px: float = o + extent * (0.3 if s < 0 else 0.72)
		(data["walls"] as Array).append({"pos": Vector3(px, 0.4, o - sw - 24.0),
				"size": Vector3(10.0, 0.8, 48.0), "tint": Color(0.5, 0.36, 0.22)})
		(data["colliders"] as Array).append({"pos": Vector3(px, 0.4, o - sw - 24.0),
				"size": Vector3(10.0, 0.8, 48.0)})
		for k in 6:
			(data["details"] as Array).append({"pos": Vector3(px + 4.6, -1.0, o - sw - 6.0 - float(k) * 8.0),
					"size": Vector3(0.8, 4.0, 0.8), "tint": Color(0.36, 0.26, 0.16)})
			(data["details"] as Array).append({"pos": Vector3(px - 4.6, -1.0, o - sw - 6.0 - float(k) * 8.0),
					"size": Vector3(0.8, 4.0, 0.8), "tint": Color(0.36, 0.26, 0.16)})
	BrickKit.build_batch(self, data, "Waterfront", BrickKit.L_WORLD | BrickKit.L_WEB_ANCHOR, 400.0)

func _on_water_entered(body: Node3D) -> void:
	if body != GameState.get_player():
		return
	if body.has_method("respawn_at"):
		var o := CityLayout.origin_offset()
		var safe := Vector3(body.global_position.x, 3.0, o - CityLayout.STREET_WIDTH * 0.5)
		Transition.flash(Color(0.3, 0.6, 0.9, 0.5), 0.4)
		Events.toast_requested.emit("Sorti de la baie")
		body.call("respawn_at", safe)

## Suspension bridge across the bay: two 60 m towers and a cable fan. It is the
## best swinging playground in the city, which is exactly the point.
func _build_bridge() -> void:
	var o := CityLayout.origin_offset()
	var sw := CityLayout.STREET_WIDTH
	var extent := CityLayout.city_extent()
	var bx: float = o + extent * 0.5
	var start_z: float = o - sw
	var length: float = 190.0
	var deck_y: float = 1.2
	var width: float = 22.0
	var data := BrickKit.new_batch()

	# deck
	(data["walls"] as Array).append({"pos": Vector3(bx, deck_y, start_z - length * 0.5),
			"size": Vector3(width, 1.2, length), "tint": Color(0.55, 0.56, 0.58)})
	(data["colliders"] as Array).append({"pos": Vector3(bx, deck_y, start_z - length * 0.5),
			"size": Vector3(width, 1.2, length)})
	# kerbs + railings
	for s in [-1.0, 1.0]:
		(data["details"] as Array).append({"pos": Vector3(bx + s * (width * 0.5 - 0.6),
				deck_y + 0.8, start_z - length * 0.5),
				"size": Vector3(1.2, 0.6, length), "tint": Color(0.7, 0.7, 0.68)})
		CityProps.add_railing(data, Vector3(bx + s * (width * 0.5 - 0.4), deck_y + 0.6,
				start_z - length * 0.5), length - 4.0, false)
	# centre line
	var dashes: int = int(length / 7.0)
	for d in dashes:
		(data["details"] as Array).append({"pos": Vector3(bx, deck_y + 0.65,
				start_z - 4.0 - float(d) * 7.0),
				"size": Vector3(0.4, 0.08, 3.2), "tint": Color(0.92, 0.85, 0.35)})

	# towers + cables
	var tower_h: float = 60.0
	var tower_z: Array[float] = [start_z - length * 0.3, start_z - length * 0.72]
	for tz in tower_z:
		for s in [-1.0, 1.0]:
			var tx: float = bx + s * (width * 0.5 + 1.4)
			(data["walls"] as Array).append({"pos": Vector3(tx, tower_h * 0.5, tz),
					"size": Vector3(3.4, tower_h, 3.4), "tint": Color(0.72, 0.2, 0.18)})
			(data["colliders"] as Array).append({"pos": Vector3(tx, tower_h * 0.5, tz),
					"size": Vector3(3.4, tower_h, 3.4)})
			(data["details"] as Array).append({"pos": Vector3(tx, tower_h * 0.62, tz),
					"size": Vector3(5.0, 1.4, 5.0), "tint": Color(0.85, 0.3, 0.25)})
		# cross beams
		for h in [0.62, 0.9]:
			(data["walls"] as Array).append({"pos": Vector3(bx, tower_h * h, tz),
					"size": Vector3(width + 4.0, 1.6, 2.4), "tint": Color(0.72, 0.2, 0.18)})
			(data["colliders"] as Array).append({"pos": Vector3(bx, tower_h * h, tz),
					"size": Vector3(width + 4.0, 1.6, 2.4)})
		# cable fan down to the deck
		for s in [-1.0, 1.0]:
			var tx: float = bx + s * (width * 0.5 + 1.4)
			for c in 9:
				var t: float = (float(c) + 1.0) / 10.0
				var span: float = length * 0.24
				for dir in [-1.0, 1.0]:
					var cz: float = tz + dir * span * t
					var top: float = tower_h * 0.92
					var height: float = lerpf(top, deck_y + 2.0, t)
					(data["details"] as Array).append({
							"pos": Vector3(tx, (top + height) * 0.5, cz),
							"size": Vector3(0.22, top - height, 0.22),
							"tint": Color(0.35, 0.36, 0.4)})
	bridge_root = BrickKit.build_batch(self, data, "PontDesBriques",
			BrickKit.L_WORLD | BrickKit.L_WEB_ANCHOR, 500.0)

# =============================================================================
#  NAVIGATION
# =============================================================================

func _build_navigation() -> void:
	var builder := NavMeshBuilder.street_grid(0.05)
	# Landmark floors so enemies can fight there too.
	if not bank.is_empty():
		builder.add_rect_centered(bank["plaza"] as Vector3, Vector2(58.0, 24.0))
	if not factory.is_empty():
		var arena: Vector3 = factory["arena_center"]
		builder.add_rect_centered(Vector3(arena.x, 0.5, arena.z), Vector2(70.0, 70.0))

	navigation_region = NavigationRegion3D.new()
	navigation_region.name = "Navigation"
	add_child(navigation_region)
	navigation_region.navigation_mesh = builder.build(0.55, 1.9)

# =============================================================================
#  OCCLUSION
# =============================================================================

## Box occluders on the biggest towers. Everything behind a skyscraper is then
## skipped by the renderer -- a large win in a dense grid city.
##
## The box is taken from the block's LARGEST ACTUAL COLLIDER and shrunk, never
## guessed from the block size: an occluder that pokes out into open air makes
## the renderer hide things that are plainly visible (and, if the camera ends up
## inside it, the entire skyline disappears).
func _build_occluders() -> void:
	for key in blocks.keys():
		var block: Node3D = blocks[key]
		if block.district != CityLayout.District.DOWNTOWN \
				and block.district != CityLayout.District.COMMERCIAL:
			continue
		var volume: Dictionary = block.get("largest_volume")
		if volume.is_empty():
			continue
		var size: Vector3 = (volume["size"] as Vector3) * 0.72
		# Only worth it for genuinely large, view-blocking masses.
		if size.x < 12.0 or size.z < 12.0 or size.y < 30.0:
			continue
		var occluder := OccluderInstance3D.new()
		var box := BoxOccluder3D.new()
		box.size = size
		occluder.occluder = box
		occluder.position = block.position + (volume["pos"] as Vector3)
		add_child(occluder)

# =============================================================================
#  TRAFFIC
# =============================================================================

func _build_traffic() -> void:
	traffic = Node3D.new()
	traffic.name = "Traffic"
	traffic.set_script(load("res://scripts/city/traffic_system.gd"))
	add_child(traffic)
	traffic.set("vehicle_count", traffic_count)
	traffic.call("start", world_seed)

# =============================================================================
#  QUERIES (used by missions, spawners, the minimap)
# =============================================================================

func get_block(i: int, j: int) -> Node3D:
	return blocks.get("%d_%d" % [i, j])

func random_street_point() -> Vector3:
	var i: int = _rng.randi_range(0, CityLayout.GRID)
	var j: int = _rng.randi_range(0, CityLayout.GRID - 1)
	var base := CityLayout.intersection_center(i, j)
	return base + Vector3(_rng.randf_range(-4.0, 4.0), 0.2, _rng.randf_range(20.0, 50.0))

## A street point in a specific district, for side-activity spawning.
func random_point_in_district(district: CityLayout.District) -> Vector3:
	var candidates: Array[Vector2i] = []
	for i in CityLayout.GRID:
		for j in CityLayout.GRID:
			if CityLayout.district_of(i, j) == district:
				candidates.append(Vector2i(i, j))
	if candidates.is_empty():
		return random_street_point()
	var pick: Vector2i = candidates[_rng.randi_range(0, candidates.size() - 1)]
	var c := CityLayout.block_center(pick.x, pick.y)
	# Offset onto the street ring around the block.
	var side: int = _rng.randi_range(0, 3)
	var offset: float = CityLayout.BLOCK_SIZE * 0.5 + CityLayout.STREET_WIDTH * 0.5
	match side:
		0: return c + Vector3(_rng.randf_range(-20.0, 20.0), 0.2, offset)
		1: return c + Vector3(offset, 0.2, _rng.randf_range(-20.0, 20.0))
		2: return c + Vector3(_rng.randf_range(-20.0, 20.0), 0.2, -offset)
		_: return c + Vector3(-offset, 0.2, _rng.randf_range(-20.0, 20.0))

## A rooftop somewhere near `from`, for swing challenges and chase objectives.
func random_rooftop_near(from: Vector3, radius: float = 200.0) -> Vector3:
	var best := from + Vector3(0, 30.0, 0)
	var tries := 0
	while tries < 24:
		tries += 1
		var i: int = _rng.randi_range(0, CityLayout.GRID - 1)
		var j: int = _rng.randi_range(0, CityLayout.GRID - 1)
		var block: Node3D = get_block(i, j)
		if block == null:
			continue
		var roof: Vector3 = block.call("random_rooftop")
		if roof.distance_to(from) <= radius and roof.y > 8.0:
			return roof
		best = roof
	return best

func all_blocks() -> Array:
	return blocks.values()

## Highest rooftop in the city -- used for the tutorial's final objective.
func tallest_rooftop() -> Vector3:
	var best := Vector3.ZERO
	for key in blocks.keys():
		var block: Node3D = blocks[key]
		if block.district != CityLayout.District.DOWNTOWN:
			continue
		var roof: Vector3 = block.call("random_rooftop")
		if roof.y > best.y:
			best = roof
	if best == Vector3.ZERO:
		best = CityLayout.block_center(4, 4) + Vector3(0, 90.0, 0)
	return best
