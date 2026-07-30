extends Node3D
## CityBlock -- one city block, generated procedurally, drawn in 4 draw calls.
##
## A block owns:
##   * a raised sidewalk platform (visual + one box collider)
##   * 1-4 buildings, laid out on plots with margins so alleys appear naturally
##   * street furniture on its perimeter and clutter on its rooftops
##   * up to `max_lights` OmniLight3D (street lamps), disabled when far away
##   * optional traffic-light lamps that cycle
##
## All static geometry is uploaded into four MultiMeshInstance3D:
##   Structure (buildings)  -- always visible, this is the skyline
##   Details   (props, ledges, curbs) -- visibility_range_end = detail_range
##   Windows   (glass)      -- visibility_range_end = window_range
##   Accents   (emissive signs) -- visible far, they are the city lights
##
## Scene requirements: created entirely from code by CityGenerator; the node is a
## plain Node3D positioned at the block centre.
##
## Inspector parameters: detail_range, window_range, max_lights.

@export var detail_range: float = 260.0
@export var window_range: float = 480.0
@export var max_lights: int = 4

var block_i: int = 0
var block_j: int = 0
var district: CityLayout.District = CityLayout.District.RESIDENTIAL
var rooftops: Array = []          ## {pos (local), size} -- used by missions/spawners

var _structure: MultiMeshInstance3D
var _details: MultiMeshInstance3D
var _windows: MultiMeshInstance3D
var _accents: MultiMeshInstance3D
var _body: StaticBody3D
var _lights: Array[OmniLight3D] = []
var _traffic_lamps: Array[MeshInstance3D] = []
var _traffic_phase: float = 0.0
var _detail_level: int = 3
var _rng := RandomNumberGenerator.new()

# Shared traffic-light materials (created once for the whole game).
static var _tl_red: ShaderMaterial
static var _tl_amber: ShaderMaterial
static var _tl_green: ShaderMaterial

func generate(i: int, j: int, world_seed: int) -> void:
	block_i = i
	block_j = j
	district = CityLayout.district_of(i, j)
	_rng.seed = world_seed + i * 7919 + j * 104729
	name = "Block_%d_%d" % [i, j]

	var out := {"walls": [], "windows": [], "accents": [], "details": [], "lights": []}
	_build_platform(out)
	if CityLayout.is_open_block(district):
		_build_park(out)
	else:
		_build_buildings(out)
	_build_perimeter_props(out)

	_upload(out)
	_spawn_lights(out)

# =============================================================================
#  GROUND
# =============================================================================

func _build_platform(out: Dictionary) -> void:
	var s := CityLayout.BLOCK_SIZE
	var h := CityLayout.SIDEWALK_HEIGHT
	var pavement := BrickKit.SIDEWALK_COLOR
	if district == CityLayout.District.PARK:
		pavement = BrickKit.GRASS_COLOR
	elif district == CityLayout.District.INDUSTRIAL:
		pavement = BrickKit.SIDEWALK_COLOR.darkened(0.22)
	(out["walls"] as Array).append({"pos": Vector3(0, h * 0.5 - 0.2, 0),
			"size": Vector3(s, h + 0.4, s), "tint": pavement})
	# Curb: a darker rim, plus the studs on its top face give the toy read.
	for axis in [0, 1]:
		for sign_dir in [-1.0, 1.0]:
			var pos := Vector3(0, h + 0.02, sign_dir * (s * 0.5 - 0.5)) if axis == 0 \
					else Vector3(sign_dir * (s * 0.5 - 0.5), h + 0.02, 0)
			var size := Vector3(s, 0.16, 1.0) if axis == 0 else Vector3(1.0, 0.16, s)
			(out["details"] as Array).append({"pos": pos, "size": size,
					"tint": pavement.darkened(0.3)})

# =============================================================================
#  BUILDINGS
# =============================================================================

func _build_buildings(out: Dictionary) -> void:
	var builder := BuildingBuilder.new(_rng)
	var plots := _plot_layout()
	var hr := CityLayout.height_range(district)
	for plot in plots:
		var footprint: Vector2 = plot["size"]
		var centre: Vector3 = plot["pos"]
		var height: float = _rng.randf_range(hr.x, hr.y)
		var style := _pick_style(footprint)
		var body: Color = BrickKit.BUILDING_COLORS[_rng.randi_range(0, BrickKit.BUILDING_COLORS.size() - 1)]
		var accent: Color = BrickKit.ACCENT_COLORS[_rng.randi_range(0, BrickKit.ACCENT_COLORS.size() - 1)]
		builder.clear()
		builder.build(style, centre, footprint, height, body, accent, true)

		(out["walls"] as Array).append_array(builder.walls)
		(out["windows"] as Array).append_array(builder.windows)
		(out["accents"] as Array).append_array(builder.accents)
		for collider in builder.colliders:
			_queue_collider(collider)
		for roof in builder.roofs:
			rooftops.append(roof)
			_build_roof_clutter(out, roof)

	# Neon blades on commercial fronts: the district's signature.
	if district == CityLayout.District.COMMERCIAL:
		for k in 3:
			var edge: int = _rng.randi_range(0, 3)
			var pos := _edge_point(edge, _rng.randf_range(-0.35, 0.35), 8.0)
			var facing := _edge_normal(edge)
			CityProps.add_neon_blade(out, pos + Vector3(0, 6.0, 0), facing, 7.0,
					BrickKit.ACCENT_COLORS[_rng.randi_range(0, BrickKit.ACCENT_COLORS.size() - 1)])

## Divides the block into plots. Bigger districts get fewer, larger buildings.
func _plot_layout() -> Array:
	var s := CityLayout.BLOCK_SIZE
	var margin := 4.0
	var plots: Array = []
	match district:
		CityLayout.District.DOWNTOWN:
			if _rng.randf() < 0.55:
				plots.append({"pos": Vector3.ZERO, "size": Vector2(s - margin * 2.4, s - margin * 2.4)})
			else:
				for sx in [-1.0, 1.0]:
					plots.append({"pos": Vector3(sx * s * 0.24, 0, 0),
							"size": Vector2(s * 0.42, s - margin * 2.0)})
		CityLayout.District.COMMERCIAL:
			for sz in [-1.0, 1.0]:
				plots.append({"pos": Vector3(0, 0, sz * s * 0.26),
						"size": Vector2(s - margin * 2.0, s * 0.38)})
		CityLayout.District.INDUSTRIAL:
			plots.append({"pos": Vector3(0, 0, -s * 0.2), "size": Vector2(s - margin * 2.0, s * 0.44)})
			if _rng.randf() < 0.7:
				plots.append({"pos": Vector3(-s * 0.2, 0, s * 0.28),
						"size": Vector2(s * 0.46, s * 0.3)})
		CityLayout.District.WATERFRONT:
			plots.append({"pos": Vector3(0, 0, s * 0.16), "size": Vector2(s - margin * 2.0, s * 0.5)})
		_:
			# Residential: four plots with alleys between them.
			for sx in [-1.0, 1.0]:
				for sz in [-1.0, 1.0]:
					if _rng.randf() < 0.12:
						continue    # a gap = a courtyard or a parking lot
					plots.append({"pos": Vector3(sx * s * 0.25, 0, sz * s * 0.25),
							"size": Vector2(s * 0.38, s * 0.38)})
	return plots

func _pick_style(footprint: Vector2) -> BuildingBuilder.Style:
	match district:
		CityLayout.District.DOWNTOWN:
			var choices: Array[int] = [BuildingBuilder.Style.TIERED_TOWER,
					BuildingBuilder.Style.OCTAGON_TOWER, BuildingBuilder.Style.TWIN_TOWER,
					BuildingBuilder.Style.TIERED_TOWER]
			return choices[_rng.randi_range(0, choices.size() - 1)] as BuildingBuilder.Style
		CityLayout.District.COMMERCIAL:
			return BuildingBuilder.Style.SHOP_ROW
		CityLayout.District.INDUSTRIAL:
			return BuildingBuilder.Style.WAREHOUSE
		CityLayout.District.RESIDENTIAL:
			return BuildingBuilder.Style.L_SHAPE if _rng.randf() < 0.5 else BuildingBuilder.Style.SLAB
		_:
			return BuildingBuilder.Style.SLAB

## Rooftop clutter: water tower, antenna, AC units, hatch, pipes.
func _build_roof_clutter(out: Dictionary, roof: Dictionary) -> void:
	var pos: Vector3 = roof["pos"]
	var size: Vector2 = roof["size"]
	if size.x < 8.0 or size.y < 8.0:
		return
	var spot := func(inset: float) -> Vector3:
		return pos + Vector3(_rng.randf_range(-1.0, 1.0) * (size.x * 0.5 - inset), 0.0,
				_rng.randf_range(-1.0, 1.0) * (size.y * 0.5 - inset))
	if _rng.randf() < 0.55:
		CityProps.add_water_tower(out, spot.call(4.0), _rng.randf_range(0.85, 1.25))
	if _rng.randf() < 0.45:
		CityProps.add_antenna(out, spot.call(3.0), _rng.randf_range(6.0, 16.0))
	var units: int = _rng.randi_range(1, 3)
	for u in units:
		CityProps.add_ac_unit(out, spot.call(3.0),
				Vector2(_rng.randf_range(1.8, 3.4), _rng.randf_range(1.8, 3.0)))
	if _rng.randf() < 0.6:
		CityProps.add_roof_hatch(out, spot.call(3.0))
	CityProps.add_vent_pipes(out, pos, _rng.randi_range(0, 3), _rng)

# =============================================================================
#  PARK
# =============================================================================

func _build_park(out: Dictionary) -> void:
	var s := CityLayout.BLOCK_SIZE
	CityProps.add_park_path(out, Vector3(0, CityLayout.SIDEWALK_HEIGHT, 0), Vector2(s * 0.9, 6.0))
	CityProps.add_park_path(out, Vector3(0, CityLayout.SIDEWALK_HEIGHT, 0), Vector2(6.0, s * 0.9))
	CityProps.add_fountain(out, Vector3(0, CityLayout.SIDEWALK_HEIGHT, 0))
	var trees: int = 16
	for t in trees:
		var pos := Vector3(_rng.randf_range(-s * 0.44, s * 0.44), CityLayout.SIDEWALK_HEIGHT,
				_rng.randf_range(-s * 0.44, s * 0.44))
		if absf(pos.x) < 5.0 or absf(pos.z) < 5.0:
			continue        # keep the paths clear
		if pos.length() < 12.0:
			continue        # keep the fountain plaza clear
		CityProps.add_tree(out, pos, _rng.randf_range(0.8, 1.5), _rng)
	for b in 10:
		var pos := Vector3(_rng.randf_range(-s * 0.42, s * 0.42), CityLayout.SIDEWALK_HEIGHT,
				_rng.randf_range(-s * 0.42, s * 0.42))
		CityProps.add_bush(out, pos, _rng)
	for i in 4:
		var a: float = TAU * float(i) / 4.0 + PI * 0.25
		CityProps.add_bench(out, Vector3(cos(a) * 10.0, CityLayout.SIDEWALK_HEIGHT, sin(a) * 10.0), -a)
	# Rooftop-free block: give missions a ground marker instead.
	rooftops.append({"pos": Vector3(0, CityLayout.SIDEWALK_HEIGHT, 0), "size": Vector2(10, 10)})

# =============================================================================
#  PERIMETER PROPS
# =============================================================================

func _build_perimeter_props(out: Dictionary) -> void:
	var traffic_district: bool = district == CityLayout.District.DOWNTOWN \
			or district == CityLayout.District.COMMERCIAL
	for edge in 4:
		var normal := _edge_normal(edge)
		# Two lamp posts per edge, set back from the curb.
		for t in [-0.28, 0.28]:
			var base := _edge_point(edge, t, 2.2)
			CityProps.add_lamppost(out, base, normal)
		if _rng.randf() < 0.5:
			CityProps.add_hydrant(out, _edge_point(edge, _rng.randf_range(-0.2, 0.2), 1.8))
		if _rng.randf() < 0.4:
			CityProps.add_trash_bin(out, _edge_point(edge, _rng.randf_range(-0.4, 0.4), 1.6))
		if district == CityLayout.District.COMMERCIAL and _rng.randf() < 0.5:
			var rot: float = 0.0 if edge % 2 == 0 else PI * 0.5
			CityProps.add_bus_shelter(out, _edge_point(edge, _rng.randf_range(-0.2, 0.2), 3.4), rot)
		if _rng.randf() < 0.5:
			CityProps.add_manhole(out, _edge_point(edge, _rng.randf_range(-0.4, 0.4), -3.0))
	if traffic_district:
		# One mast per block corner facing the crossing.
		for corner in 2:
			var sx: float = 1.0 if corner == 0 else -1.0
			var base := Vector3(sx * (CityLayout.BLOCK_SIZE * 0.5 - 1.6),
					CityLayout.SIDEWALK_HEIGHT, sx * (CityLayout.BLOCK_SIZE * 0.5 - 1.6))
			var head := CityProps.add_traffic_light(out, base, Vector3(sx, 0, sx).normalized())
			_queue_traffic_lamp(head)

## Point on block edge `edge` (0=+Z, 1=+X, 2=-Z, 3=-X). `t` in [-0.5, 0.5]
## slides along the edge, `inset` moves towards the block centre.
func _edge_point(edge: int, t: float, inset: float) -> Vector3:
	var h := CityLayout.SIDEWALK_HEIGHT
	var half := CityLayout.BLOCK_SIZE * 0.5
	match edge:
		0: return Vector3(CityLayout.BLOCK_SIZE * t, h, half - inset)
		1: return Vector3(half - inset, h, CityLayout.BLOCK_SIZE * t)
		2: return Vector3(CityLayout.BLOCK_SIZE * t, h, -half + inset)
		_: return Vector3(-half + inset, h, CityLayout.BLOCK_SIZE * t)

func _edge_normal(edge: int) -> Vector3:
	match edge:
		0: return Vector3.BACK
		1: return Vector3.RIGHT
		2: return Vector3.FORWARD
		_: return Vector3.LEFT

# =============================================================================
#  UPLOAD
# =============================================================================

var _pending_colliders: Array = []
var _pending_traffic: Array = []

## Biggest solid box in this block ({pos, size} in local space), used to place a
## conservative occluder. Empty when the block has no real massing.
var largest_volume: Dictionary = {}

func _queue_collider(c: Variant) -> void:
	if typeof(c) != TYPE_DICTIONARY:
		return
	_pending_colliders.append(c)
	var size: Vector3 = c["size"]
	var volume: float = size.x * size.y * size.z
	if largest_volume.is_empty() or volume > float(largest_volume.get("volume", 0.0)):
		largest_volume = {"pos": c["pos"], "size": size, "volume": volume}

func _queue_traffic_lamp(head: Vector3) -> void:
	_pending_traffic.append(head)

func _upload(out: Dictionary) -> void:
	_structure = BrickKit.new_multimesh(BrickKit.brick(Color.WHITE, true, 0.3))
	_structure.name = "Structure"
	add_child(_structure)
	BrickKit.fill_multimesh(_structure, out["walls"])

	_details = BrickKit.new_multimesh(BrickKit.brick(Color.WHITE, true, 0.32))
	_details.name = "Details"
	_details.visibility_range_end = detail_range
	_details.visibility_range_end_margin = 24.0
	add_child(_details)
	BrickKit.fill_multimesh(_details, out["details"])

	_windows = BrickKit.new_multimesh(BrickKit.glass(false))
	_windows.name = "Windows"
	_windows.visibility_range_end = window_range
	_windows.visibility_range_end_margin = 40.0
	add_child(_windows)
	BrickKit.fill_multimesh(_windows, out["windows"])

	_accents = BrickKit.new_multimesh(BrickKit.neon(Color.WHITE, 2.2))
	_accents.name = "Accents"
	add_child(_accents)
	BrickKit.fill_multimesh(_accents, out["accents"])

	for mmi in [_structure, _details, _windows, _accents]:
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		mmi.gi_mode = GeometryInstance3D.GI_MODE_STATIC

	_build_collision()
	_build_traffic_lamps()

func _build_collision() -> void:
	_body = StaticBody3D.new()
	_body.name = "Collision"
	# Layer 1 (world) + layer 4 (web anchor): buildings are the swing skeleton.
	_body.collision_layer = BrickKit.L_WORLD | BrickKit.L_WEB_ANCHOR
	_body.collision_mask = 0
	add_child(_body)

	# Sidewalk platform.
	var platform := CollisionShape3D.new()
	var pbox := BoxShape3D.new()
	pbox.size = Vector3(CityLayout.BLOCK_SIZE, CityLayout.SIDEWALK_HEIGHT + 0.4,
			CityLayout.BLOCK_SIZE)
	platform.shape = pbox
	platform.position = Vector3(0, CityLayout.SIDEWALK_HEIGHT * 0.5 - 0.2, 0)
	_body.add_child(platform)

	for entry in _pending_colliders:
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = entry["size"]
		shape.shape = box
		shape.position = entry["pos"]
		_body.add_child(shape)
	_pending_colliders.clear()

func _build_traffic_lamps() -> void:
	if _pending_traffic.is_empty():
		return
	if _tl_red == null:
		_tl_red = BrickKit.neon(Color(1.0, 0.15, 0.12), 3.4)
		_tl_amber = BrickKit.neon(Color(1.0, 0.72, 0.1), 3.4)
		_tl_green = BrickKit.neon(Color(0.2, 1.0, 0.35), 3.4)
	for head in _pending_traffic:
		var lamp := MeshInstance3D.new()
		lamp.mesh = BrickKit.unit_box()
		lamp.scale = Vector3(0.55, 0.55, 0.28)
		lamp.position = head + Vector3(0, 0.85, 0.4)
		lamp.material_override = _tl_red
		lamp.visibility_range_end = detail_range * 1.4
		add_child(lamp)
		_traffic_lamps.append(lamp)
	_pending_traffic.clear()
	# Desync blocks so the whole city does not blink in unison.
	_traffic_phase = _rng.randf() * 10.0
	set_process(true)

func _spawn_lights(out: Dictionary) -> void:
	var candidates: Array = out["lights"]
	if candidates.is_empty():
		return
	# Keep only a few, evenly spread: dynamic lights are the main GPU cost here.
	var step: int = maxi(int(float(candidates.size()) / float(max_lights)), 1)
	var placed := 0
	var index := 0
	while index < candidates.size() and placed < max_lights:
		var entry: Dictionary = candidates[index]
		var light := OmniLight3D.new()
		light.position = entry["pos"]
		light.light_color = entry["color"]
		light.light_energy = entry["energy"]
		light.omni_range = 16.0
		light.shadow_enabled = false
		light.distance_fade_enabled = true
		light.distance_fade_begin = 55.0
		light.distance_fade_length = 25.0
		light.visible = false        ## night only -- DayNightCycle turns these on
		add_child(light)
		_lights.append(light)
		placed += 1
		index += step

# =============================================================================
#  STREAMING / LOD
# =============================================================================

func _process(delta: float) -> void:
	if _traffic_lamps.is_empty():
		set_process(false)
		return
	_traffic_phase += delta
	var cycle: float = fmod(_traffic_phase, 12.0)
	var mat: ShaderMaterial = _tl_green
	if cycle > 9.6:
		mat = _tl_amber
	elif cycle > 5.0:
		mat = _tl_red
	for lamp in _traffic_lamps:
		if lamp.material_override != mat:
			lamp.material_override = mat

## Called by WorldStreamer. 3 = full, 2 = no props, 1 = silhouette + lights only.
func set_detail_level(level: int) -> void:
	if _detail_level == level:
		return
	_detail_level = level
	if _details != null:
		_details.visible = level >= 2
	if _windows != null:
		_windows.visible = level >= 2
	set_process(level >= 3 and not _traffic_lamps.is_empty())
	for lamp in _traffic_lamps:
		lamp.visible = level >= 3

## Street lamps only burn at night, and only in nearby blocks.
func set_night_lights(on: bool) -> void:
	for light in _lights:
		light.visible = on and _detail_level >= 2

func light_count() -> int:
	return _lights.size()

## A random rooftop in this block, in world space (used by missions/spawners).
func random_rooftop() -> Vector3:
	if rooftops.is_empty():
		return global_position + Vector3.UP * 20.0
	var roof: Dictionary = rooftops[_rng.randi_range(0, rooftops.size() - 1)]
	return global_position + (roof["pos"] as Vector3) + Vector3.UP * 1.0
