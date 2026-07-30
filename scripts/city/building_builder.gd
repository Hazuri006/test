class_name BuildingBuilder
extends RefCounted
## BuildingBuilder -- turns a footprint + a height + a style into brick data.
##
## It does NOT create nodes. It appends into flat arrays which the calling
## CityBlock uploads into a handful of MultiMeshes. That is the whole trick
## behind the city's performance: an entire block of towers is 3 draw calls
## plus a few box colliders, instead of thousands of MeshInstance3D nodes.
##
## Output arrays (each entry is {pos, size, tint}):
##   walls    -> opaque brick MultiMesh
##   windows  -> glossy glass MultiMesh
##   accents  -> emissive sign / trim MultiMesh
##   colliders-> {pos, size} boxes for one StaticBody3D per building
##   roofs    -> {pos, size} usable rooftops for prop scattering
##
## Styles are picked per district by CityBlock so the skyline never repeats.

enum Style { TIERED_TOWER, SLAB, TWIN_TOWER, OCTAGON_TOWER, L_SHAPE, WAREHOUSE, SHOP_ROW }

const BAND_HEIGHT: float = 3.7          ## one "floor" of bricks
const LEDGE_EVERY: int = 3              ## a studded ledge every N bands
const WINDOW_INSET: float = 0.06

var walls: Array = []
var windows: Array = []
var accents: Array = []
var colliders: Array = []
var roofs: Array = []

var _rng: RandomNumberGenerator

func _init(rng: RandomNumberGenerator) -> void:
	_rng = rng

func clear() -> void:
	walls.clear()
	windows.clear()
	accents.clear()
	colliders.clear()
	roofs.clear()

# =============================================================================
#  PUBLIC ENTRY POINT
# =============================================================================

## Builds one building. `center` is the footprint centre at ground level
## (local to the block node), `size` is the footprint in metres.
func build(style: Style, center: Vector3, size: Vector2, height: float,
		body_color: Color, accent_color: Color, lit_windows: bool) -> void:
	match style:
		Style.TIERED_TOWER:
			_build_tiered(center, size, height, body_color, accent_color, lit_windows)
		Style.SLAB:
			_build_slab(center, size, height, body_color, accent_color, lit_windows)
		Style.TWIN_TOWER:
			_build_twin(center, size, height, body_color, accent_color, lit_windows)
		Style.OCTAGON_TOWER:
			_build_octagon(center, size, height, body_color, accent_color, lit_windows)
		Style.L_SHAPE:
			_build_l_shape(center, size, height, body_color, accent_color, lit_windows)
		Style.WAREHOUSE:
			_build_warehouse(center, size, height, body_color, accent_color)
		Style.SHOP_ROW:
			_build_shop_row(center, size, height, body_color, accent_color, lit_windows)

# =============================================================================
#  STYLES
# =============================================================================

## Classic setback skyscraper: three or four shrinking tiers, art-deco crown.
func _build_tiered(center: Vector3, size: Vector2, height: float,
		body: Color, accent: Color, lit: bool) -> void:
	var tiers: int = _rng.randi_range(3, 4)
	var y: float = 0.0
	var current := size
	for t in tiers:
		var t_ratio: float = float(t) / float(tiers)
		var tier_height: float = height * (0.46 if t == 0 else 0.54 / float(tiers - 1)) \
				* _rng.randf_range(0.85, 1.15)
		tier_height = maxf(tier_height, BAND_HEIGHT * 2.0)
		_tier(center, current, y, tier_height, body, lit, t == 0)
		y += tier_height
		current *= _rng.randf_range(0.66, 0.82)
		# Corner buttresses on the first setback read as art-deco massing.
		if t == 0:
			_corner_pillars(center, size, y, tier_height * 0.35, body)
		if t_ratio > 0.5:
			break
	_crown(center, current, y, accent)
	roofs.append({"pos": Vector3(center.x, y, center.z), "size": current})

## Wide, flat-topped office slab: the bread and butter of a big city.
func _build_slab(center: Vector3, size: Vector2, height: float,
		body: Color, accent: Color, lit: bool) -> void:
	_tier(center, size, 0.0, height, body, lit, true)
	_parapet(center, size, height, body)
	# A rooftop billboard frame gives the skyline something to read.
	if _rng.randf() < 0.45:
		var sign_w: float = size.x * 0.7
		accents.append({"pos": Vector3(center.x, height + 3.4, center.z),
				"size": Vector3(sign_w, 5.0, 0.5), "tint": accent})
		walls.append({"pos": Vector3(center.x, height + 0.6, center.z),
				"size": Vector3(sign_w + 1.0, 1.2, 1.2), "tint": body.darkened(0.3)})
	roofs.append({"pos": Vector3(center.x, height, center.z), "size": size})

## Two towers on a shared podium -- great for swinging between.
func _build_twin(center: Vector3, size: Vector2, height: float,
		body: Color, accent: Color, lit: bool) -> void:
	var podium_h: float = maxf(height * 0.18, BAND_HEIGHT * 2.0)
	_tier(center, size, 0.0, podium_h, body, lit, true)
	var half := Vector2(size.x * 0.42, size.y * 0.9)
	var offset: float = size.x * 0.27
	for s in [-1.0, 1.0]:
		var c := Vector3(center.x + offset * s, center.y, center.z)
		var h: float = height * _rng.randf_range(0.85, 1.0)
		_tier(c, half, podium_h, h - podium_h, body, lit, false)
		_parapet(c, half, h, body)
		roofs.append({"pos": Vector3(c.x, h, c.z), "size": half})
	# Sky bridge between the towers: an intentional web-swing landmark.
	var bridge_y: float = podium_h + (height - podium_h) * 0.62
	walls.append({"pos": Vector3(center.x, bridge_y, center.z),
			"size": Vector3(offset * 2.0, 2.6, half.y * 0.45), "tint": body.lightened(0.1)})
	accents.append({"pos": Vector3(center.x, bridge_y + 1.5, center.z),
			"size": Vector3(offset * 2.0 - 1.0, 0.3, half.y * 0.5), "tint": accent})

## Faceted round tower, approximated with eight rotated slabs.
func _build_octagon(center: Vector3, size: Vector2, height: float,
		body: Color, accent: Color, lit: bool) -> void:
	var radius: float = minf(size.x, size.y) * 0.5
	var bands: int = maxi(int(height / BAND_HEIGHT), 2)
	var facet_w: float = radius * 0.83
	for b in bands:
		var y: float = b * BAND_HEIGHT + BAND_HEIGHT * 0.5
		var shrink: float = 1.0 - float(b) / float(bands) * 0.18
		for f in 8:
			var angle: float = TAU * float(f) / 8.0
			var pos := Vector3(center.x + cos(angle) * radius * 0.92 * shrink, y,
					center.z + sin(angle) * radius * 0.92 * shrink)
			walls.append({"pos": pos, "size": Vector3(facet_w * shrink, BAND_HEIGHT * 0.94, 1.6),
					"rot": -angle, "tint": body})
			if b % 2 == 1:
				windows.append({"pos": Vector3(center.x + cos(angle) * radius * 0.99 * shrink,
						y, center.z + sin(angle) * radius * 0.99 * shrink),
						"size": Vector3(facet_w * 0.7 * shrink, BAND_HEIGHT * 0.5, 0.3),
						"rot": -angle, "tint": Color.WHITE})
	# Core so the tower is never see-through, plus one box collider.
	walls.append({"pos": Vector3(center.x, height * 0.5, center.z),
			"size": Vector3(radius * 1.35, height, radius * 1.35), "tint": body.darkened(0.15)})
	colliders.append({"pos": Vector3(center.x, height * 0.5, center.z),
			"size": Vector3(radius * 1.9, height, radius * 1.9)})
	_crown(center, Vector2(radius, radius), height, accent)
	roofs.append({"pos": Vector3(center.x, height, center.z), "size": Vector2(radius * 1.4, radius * 1.4)})

## L-shaped apartment block wrapping a corner.
func _build_l_shape(center: Vector3, size: Vector2, height: float,
		body: Color, accent: Color, lit: bool) -> void:
	var arm_a := Vector2(size.x, size.y * 0.45)
	var arm_b := Vector2(size.x * 0.42, size.y)
	var ca := Vector3(center.x, center.y, center.z - size.y * 0.27)
	var cb := Vector3(center.x - size.x * 0.29, center.y, center.z)
	_tier(ca, arm_a, 0.0, height, body, lit, true)
	_tier(cb, arm_b, 0.0, height * _rng.randf_range(0.8, 1.0), body, lit, true)
	_parapet(ca, arm_a, height, body)
	roofs.append({"pos": Vector3(ca.x, height, ca.z), "size": arm_a})
	if _rng.randf() < 0.5:
		accents.append({"pos": Vector3(center.x + size.x * 0.4, 5.0, center.z),
				"size": Vector3(0.4, 3.0, size.y * 0.5), "tint": accent})

## Industrial shed: low, wide, ribbed roof, loading doors.
func _build_warehouse(center: Vector3, size: Vector2, height: float,
		body: Color, accent: Color) -> void:
	_tier(center, size, 0.0, height, body, false, true)
	# Ribbed roof: a run of thin studded slabs. Very toy-like from above.
	var ribs: int = maxi(int(size.y / 3.0), 3)
	for r in ribs:
		var z: float = center.z - size.y * 0.5 + (float(r) + 0.5) * (size.y / float(ribs))
		walls.append({"pos": Vector3(center.x, height + 0.45, z),
				"size": Vector3(size.x * 1.02, 0.9, size.y / float(ribs) * 0.55),
				"tint": body.darkened(0.12)})
	# Loading doors along the long face.
	var doors: int = maxi(int(size.x / 9.0), 1)
	for d in doors:
		var x: float = center.x - size.x * 0.5 + (float(d) + 0.5) * (size.x / float(doors))
		walls.append({"pos": Vector3(x, 2.2, center.z + size.y * 0.5 + 0.15),
				"size": Vector3(5.2, 4.4, 0.4), "tint": accent.darkened(0.25)})
	accents.append({"pos": Vector3(center.x, height * 0.78, center.z + size.y * 0.5 + 0.2),
			"size": Vector3(size.x * 0.35, 1.4, 0.35), "tint": accent})
	roofs.append({"pos": Vector3(center.x, height + 0.9, center.z), "size": size * 0.8})

## Street-level shops with bright signs and awnings, apartments above.
func _build_shop_row(center: Vector3, size: Vector2, height: float,
		body: Color, accent: Color, lit: bool) -> void:
	_tier(center, size, 0.0, height, body, lit, true)
	_parapet(center, size, height, body)
	var shops: int = maxi(int(size.x / 8.0), 2)
	for s in shops:
		var x: float = center.x - size.x * 0.5 + (float(s) + 0.5) * (size.x / float(shops))
		var front: float = center.z + size.y * 0.5
		var shop_color: Color = BrickKit.ACCENT_COLORS[_rng.randi_range(0, BrickKit.ACCENT_COLORS.size() - 1)]
		# shop window
		windows.append({"pos": Vector3(x, 1.9, front + 0.12),
				"size": Vector3(size.x / float(shops) * 0.78, 2.8, 0.3), "tint": Color.WHITE})
		# awning
		walls.append({"pos": Vector3(x, 3.7, front + 0.9),
				"size": Vector3(size.x / float(shops) * 0.86, 0.28, 1.9), "tint": shop_color})
		# lit sign board
		accents.append({"pos": Vector3(x, 4.6, front + 0.35),
				"size": Vector3(size.x / float(shops) * 0.7, 1.0, 0.3), "tint": shop_color})
	roofs.append({"pos": Vector3(center.x, height, center.z), "size": size})

# =============================================================================
#  SHARED PIECES
# =============================================================================

## One stack of brick bands with windows and studded ledges + a box collider.
func _tier(center: Vector3, size: Vector2, y_start: float, height: float,
		body: Color, lit: bool, ground_floor: bool) -> void:
	var bands: int = maxi(int(height / BAND_HEIGHT), 1)
	var band_h: float = height / float(bands)
	for b in bands:
		var y: float = y_start + (float(b) + 0.5) * band_h
		# Alternating band widths read as stacked plates of different sizes.
		var wob: float = 1.0 if b % 2 == 0 else 0.985
		walls.append({"pos": Vector3(center.x, y, center.z),
				"size": Vector3(size.x * wob, band_h * 0.94, size.y * wob),
				"tint": BrickKit.vary(body, 0.035)})
		# Studded ledge: its top face is what shows the shader's studs.
		if b > 0 and b % LEDGE_EVERY == 0:
			walls.append({"pos": Vector3(center.x, y_start + float(b) * band_h, center.z),
					"size": Vector3(size.x + 0.7, 0.36, size.y + 0.7),
					"tint": body.lightened(0.12)})
		if b == 0 and ground_floor:
			continue     # keep the ground floor for doors/shopfronts
		_band_windows(center, size, y, band_h, lit)
	colliders.append({"pos": Vector3(center.x, y_start + height * 0.5, center.z),
			"size": Vector3(size.x, height, size.y)})

## Windows on all four faces of one band.
func _band_windows(center: Vector3, size: Vector2, y: float, band_h: float, lit: bool) -> void:
	var per_face_x: int = clampi(int(size.x / 6.0), 1, 4)
	var per_face_z: int = clampi(int(size.y / 6.0), 1, 4)
	var w_h: float = band_h * 0.52
	for i in per_face_x:
		var x: float = center.x - size.x * 0.5 + (float(i) + 0.5) * (size.x / float(per_face_x))
		var w: float = size.x / float(per_face_x) * 0.6
		for s in [-1.0, 1.0]:
			var tint: Color = Color.WHITE
			if lit and _rng.randf() < 0.35:
				tint = Color(1.0, 0.86, 0.6)
			windows.append({"pos": Vector3(x, y, center.z + s * (size.y * 0.5 + WINDOW_INSET)),
					"size": Vector3(w, w_h, 0.28), "tint": tint})
	for j in per_face_z:
		var z: float = center.z - size.y * 0.5 + (float(j) + 0.5) * (size.y / float(per_face_z))
		var d: float = size.y / float(per_face_z) * 0.6
		for s in [-1.0, 1.0]:
			var tint: Color = Color.WHITE
			if lit and _rng.randf() < 0.35:
				tint = Color(1.0, 0.86, 0.6)
			windows.append({"pos": Vector3(center.x + s * (size.x * 0.5 + WINDOW_INSET), y, z),
					"size": Vector3(0.28, w_h, d), "tint": tint})

func _parapet(center: Vector3, size: Vector2, y: float, body: Color) -> void:
	var t: float = 0.7
	for s in [-1.0, 1.0]:
		walls.append({"pos": Vector3(center.x, y + 0.7, center.z + s * size.y * 0.5),
				"size": Vector3(size.x + t, 1.4, t), "tint": body.lightened(0.18)})
		walls.append({"pos": Vector3(center.x + s * size.x * 0.5, y + 0.7, center.z),
				"size": Vector3(t, 1.4, size.y + t), "tint": body.lightened(0.18)})

func _corner_pillars(center: Vector3, size: Vector2, y: float, height: float, body: Color) -> void:
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			walls.append({"pos": Vector3(center.x + sx * size.x * 0.5, y + height * 0.5,
					center.z + sz * size.y * 0.5),
					"size": Vector3(3.0, height, 3.0), "tint": body.lightened(0.1)})

## Art-deco crown + aviation beacon: the reason downtown looks like downtown.
func _crown(center: Vector3, size: Vector2, y: float, accent: Color) -> void:
	var steps: int = 3
	var s := size
	var cy: float = y
	for i in steps:
		walls.append({"pos": Vector3(center.x, cy + 1.0, center.z),
				"size": Vector3(s.x, 2.0, s.y), "tint": accent.darkened(0.25)})
		cy += 2.0
		s *= 0.62
	walls.append({"pos": Vector3(center.x, cy + 4.0, center.z),
			"size": Vector3(0.7, 8.0, 0.7), "tint": Color(0.3, 0.31, 0.34)})
	accents.append({"pos": Vector3(center.x, cy + 8.4, center.z),
			"size": Vector3(1.1, 1.1, 1.1), "tint": Color(1.0, 0.25, 0.2)})
