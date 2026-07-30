class_name CityProps
extends RefCounted
## CityProps -- street furniture and rooftop clutter, as brick DATA.
##
## Nothing here creates nodes. Props are appended into the same arrays the
## buildings use, so a whole block of lampposts, benches, hydrants, water towers,
## antennas and trees costs zero extra nodes and zero extra draw calls.
##
## Every function takes an `out` dictionary shaped like:
##     {"walls": Array, "windows": Array, "accents": Array, "lights": Array}
## `lights` collects world positions where the block should place an actual
## OmniLight3D (street lamps, sign glow) -- the block caps how many it uses.

const LAMP_HEIGHT := 6.4
const TRAFFIC_POLE_HEIGHT := 5.4

static func _w(out: Dictionary, pos: Vector3, size: Vector3, tint: Color, rot: float = 0.0) -> void:
	var entry := {"pos": pos, "size": size, "tint": tint}
	if rot != 0.0:
		entry["rot"] = rot
	(out["walls"] as Array).append(entry)

static func _a(out: Dictionary, pos: Vector3, size: Vector3, tint: Color, rot: float = 0.0) -> void:
	var entry := {"pos": pos, "size": size, "tint": tint}
	if rot != 0.0:
		entry["rot"] = rot
	(out["accents"] as Array).append(entry)

static func _light(out: Dictionary, pos: Vector3, color: Color, energy: float) -> void:
	(out["lights"] as Array).append({"pos": pos, "color": color, "energy": energy})

# =============================================================================
#  STREET LEVEL
# =============================================================================

## Curved street lamp. `facing` points from the pole towards the road.
static func add_lamppost(out: Dictionary, base: Vector3, facing: Vector3) -> void:
	var dark := Color(0.22, 0.24, 0.27)
	var dir: Vector3 = facing.normalized() if facing.length() > 0.01 else Vector3.FORWARD
	_w(out, base + Vector3(0, 0.25, 0), Vector3(0.7, 0.5, 0.7), dark)
	_w(out, base + Vector3(0, LAMP_HEIGHT * 0.5, 0), Vector3(0.26, LAMP_HEIGHT, 0.26), dark)
	# arm over the road
	var arm: Vector3 = base + Vector3(0, LAMP_HEIGHT, 0) + dir * 1.1
	_w(out, arm, Vector3(maxf(absf(dir.x) * 2.4, 0.22), 0.22, maxf(absf(dir.z) * 2.4, 0.22)), dark)
	var head: Vector3 = base + Vector3(0, LAMP_HEIGHT - 0.35, 0) + dir * 2.1
	_w(out, head + Vector3(0, 0.3, 0), Vector3(1.3, 0.35, 0.9), dark)
	_a(out, head, Vector3(1.0, 0.22, 0.7), Color(1.0, 0.93, 0.72))
	_light(out, head - Vector3(0, 0.4, 0), Color(1.0, 0.88, 0.68), 3.2)

## Traffic light mast. Returns the world position of the lamp cluster so the
## block can animate it (see city_block.gd traffic light cycling).
static func add_traffic_light(out: Dictionary, base: Vector3, facing: Vector3) -> Vector3:
	var dark := Color(0.18, 0.19, 0.22)
	var dir: Vector3 = facing.normalized() if facing.length() > 0.01 else Vector3.FORWARD
	_w(out, base + Vector3(0, 0.3, 0), Vector3(0.9, 0.6, 0.9), dark)
	_w(out, base + Vector3(0, TRAFFIC_POLE_HEIGHT * 0.5, 0),
			Vector3(0.3, TRAFFIC_POLE_HEIGHT, 0.3), dark)
	var head: Vector3 = base + Vector3(0, TRAFFIC_POLE_HEIGHT - 0.6, 0) + dir * 1.4
	_w(out, head, Vector3(1.0, 2.7, 1.0), dark)
	return head

## Fire hydrant -- tiny, but it is the kind of detail that sells a city.
static func add_hydrant(out: Dictionary, base: Vector3) -> void:
	var red := Color(0.78, 0.14, 0.12)
	_w(out, base + Vector3(0, 0.12, 0), Vector3(0.6, 0.24, 0.6), red.darkened(0.3))
	_w(out, base + Vector3(0, 0.55, 0), Vector3(0.42, 0.7, 0.42), red)
	_w(out, base + Vector3(0, 0.95, 0), Vector3(0.5, 0.16, 0.5), red.lightened(0.15))
	_w(out, base + Vector3(0.3, 0.6, 0), Vector3(0.3, 0.18, 0.18), red.darkened(0.1))
	_w(out, base + Vector3(-0.3, 0.6, 0), Vector3(0.3, 0.18, 0.18), red.darkened(0.1))

static func add_bench(out: Dictionary, base: Vector3, rot: float) -> void:
	var wood := Color(0.55, 0.34, 0.18)
	var iron := Color(0.2, 0.21, 0.24)
	_w(out, base + Vector3(0, 0.42, 0), Vector3(2.4, 0.14, 0.7), wood, rot)
	_w(out, base + Vector3(0, 0.78, -0.28), Vector3(2.4, 0.6, 0.12), wood, rot)
	for s in [-1.0, 1.0]:
		var off := Vector3(cos(rot) * 1.0 * s, 0.2, -sin(rot) * 1.0 * s)
		_w(out, base + off, Vector3(0.16, 0.42, 0.62), iron, rot)

static func add_trash_bin(out: Dictionary, base: Vector3) -> void:
	var col := Color(0.24, 0.36, 0.28)
	_w(out, base + Vector3(0, 0.5, 0), Vector3(0.7, 1.0, 0.7), col)
	_w(out, base + Vector3(0, 1.05, 0), Vector3(0.8, 0.12, 0.8), col.darkened(0.25))

static func add_bus_shelter(out: Dictionary, base: Vector3, rot: float) -> void:
	var frame := Color(0.22, 0.24, 0.3)
	_w(out, base + Vector3(0, 2.7, 0), Vector3(5.0, 0.2, 2.0), frame, rot)
	(out["windows"] as Array).append({"pos": base + Vector3(0, 1.4, -0.9),
			"size": Vector3(5.0, 2.6, 0.14), "tint": Color.WHITE, "rot": rot})
	for s in [-1.0, 1.0]:
		_w(out, base + Vector3(2.4 * s, 1.35, 0), Vector3(0.2, 2.7, 2.0), frame, rot)
	_a(out, base + Vector3(2.2, 1.7, 0.9), Vector3(0.16, 1.8, 1.1), Color(0.3, 0.75, 1.0))

## Painted crosswalk stripes (flat, no collision, cheap).
static func add_crosswalk(out: Dictionary, center: Vector3, along: Vector3, width: float,
		length: float) -> void:
	var stripes: int = maxi(int(width / 1.4), 3)
	var perp: Vector3 = Vector3(-along.z, 0.0, along.x).normalized()
	for i in stripes:
		var t: float = (float(i) + 0.5) / float(stripes) - 0.5
		var pos: Vector3 = center + perp * t * width
		_w(out, pos + Vector3(0, 0.03, 0),
				Vector3(absf(along.x) * length + absf(perp.x) * 0.55,
						0.06,
						absf(along.z) * length + absf(perp.z) * 0.55),
				Color(0.92, 0.92, 0.88))

static func add_manhole(out: Dictionary, base: Vector3) -> void:
	_w(out, base + Vector3(0, 0.03, 0), Vector3(1.2, 0.06, 1.2), Color(0.3, 0.3, 0.32))

# =============================================================================
#  SIGNS
# =============================================================================

## Vertical neon blade sign for the commercial district.
static func add_neon_blade(out: Dictionary, base: Vector3, facing: Vector3, height: float,
		color: Color) -> void:
	var dir: Vector3 = facing.normalized()
	var thickness: float = 0.35
	_w(out, base, Vector3(absf(dir.x) * 1.2 + thickness, height, absf(dir.z) * 1.2 + thickness),
			Color(0.2, 0.2, 0.22))
	_a(out, base + dir * 0.4,
			Vector3(absf(dir.x) * 0.5 + 1.5, height * 0.86, absf(dir.z) * 0.5 + 1.5), color)

## Horizontal lit sign band above a shopfront or on a rooftop.
static func add_sign_band(out: Dictionary, center: Vector3, size: Vector3, color: Color) -> void:
	_w(out, center, size * Vector3(1.06, 1.3, 1.06), Color(0.16, 0.17, 0.2))
	_a(out, center, size, color)

# =============================================================================
#  ROOFTOPS
# =============================================================================

## The classic brick-city water tower: barrel, conical lid, four legs.
static func add_water_tower(out: Dictionary, base: Vector3, scale: float = 1.0) -> void:
	var wood := Color(0.48, 0.31, 0.19)
	var leg_h: float = 2.6 * scale
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			_w(out, base + Vector3(sx * 1.3 * scale, leg_h * 0.5, sz * 1.3 * scale),
					Vector3(0.3, leg_h, 0.3), Color(0.3, 0.3, 0.32))
	_w(out, base + Vector3(0, leg_h, 0), Vector3(3.6 * scale, 0.3, 3.6 * scale), wood.darkened(0.2))
	var barrel_h: float = 4.2 * scale
	for i in 4:
		_w(out, base + Vector3(0, leg_h + 0.3 + barrel_h * (float(i) + 0.5) / 4.0, 0),
				Vector3(3.4 * scale, barrel_h / 4.0 * 0.92, 3.4 * scale),
				wood if i % 2 == 0 else wood.lightened(0.08))
	_w(out, base + Vector3(0, leg_h + barrel_h + 0.8, 0),
			Vector3(3.9 * scale, 0.9, 3.9 * scale), Color(0.35, 0.2, 0.14))
	_w(out, base + Vector3(0, leg_h + barrel_h + 1.5, 0),
			Vector3(2.4 * scale, 0.7, 2.4 * scale), Color(0.35, 0.2, 0.14))

## Radio mast with guy wires and a blinking beacon.
static func add_antenna(out: Dictionary, base: Vector3, height: float) -> void:
	var steel := Color(0.42, 0.44, 0.48)
	_w(out, base + Vector3(0, height * 0.5, 0), Vector3(0.34, height, 0.34), steel)
	var rungs: int = maxi(int(height / 2.5), 2)
	for i in rungs:
		var y: float = height * (float(i) + 0.5) / float(rungs)
		_w(out, base + Vector3(0, y, 0), Vector3(1.3, 0.14, 1.3), steel.darkened(0.15))
	_a(out, base + Vector3(0, height + 0.5, 0), Vector3(0.6, 0.6, 0.6), Color(1.0, 0.3, 0.25))
	_light(out, base + Vector3(0, height + 0.5, 0), Color(1.0, 0.35, 0.3), 1.6)

static func add_ac_unit(out: Dictionary, base: Vector3, size: Vector2) -> void:
	var metal := Color(0.6, 0.62, 0.64)
	_w(out, base + Vector3(0, 0.7, 0), Vector3(size.x, 1.4, size.y), metal)
	_w(out, base + Vector3(0, 1.5, 0), Vector3(size.x * 0.7, 0.3, size.y * 0.7), metal.darkened(0.2))
	_w(out, base + Vector3(0, 1.75, 0), Vector3(size.x * 0.45, 0.3, size.y * 0.45), Color(0.3, 0.32, 0.34))

static func add_roof_hatch(out: Dictionary, base: Vector3) -> void:
	_w(out, base + Vector3(0, 0.5, 0), Vector3(2.4, 1.0, 2.4), Color(0.5, 0.5, 0.52))
	_w(out, base + Vector3(0, 1.1, 0), Vector3(2.0, 0.2, 2.0), Color(0.65, 0.34, 0.2))

static func add_vent_pipes(out: Dictionary, base: Vector3, count: int, rng: RandomNumberGenerator) -> void:
	for i in count:
		var off := Vector3(rng.randf_range(-3.0, 3.0), 0.0, rng.randf_range(-3.0, 3.0))
		var h: float = rng.randf_range(1.0, 2.6)
		_w(out, base + off + Vector3(0, h * 0.5, 0), Vector3(0.5, h, 0.5), Color(0.55, 0.56, 0.58))
		_w(out, base + off + Vector3(0, h + 0.15, 0), Vector3(0.75, 0.3, 0.75), Color(0.4, 0.41, 0.43))

# =============================================================================
#  PARK
# =============================================================================

## Brick tree: chunky trunk, three stacked canopy layers, slight lean.
static func add_tree(out: Dictionary, base: Vector3, scale: float, rng: RandomNumberGenerator) -> void:
	var trunk := Color(0.42, 0.28, 0.16)
	var greens: Array[Color] = [Color(0.20, 0.52, 0.22), Color(0.26, 0.60, 0.26), Color(0.16, 0.44, 0.20)]
	var trunk_h: float = 2.6 * scale
	_w(out, base + Vector3(0, trunk_h * 0.5, 0), Vector3(0.9 * scale, trunk_h, 0.9 * scale), trunk)
	var layers: int = 3
	for i in layers:
		var t: float = float(i) / float(layers)
		var w: float = (4.4 - 1.5 * t) * scale
		var y: float = trunk_h + (0.9 + 1.35 * float(i)) * scale
		var jitter := Vector3(rng.randf_range(-0.3, 0.3), 0.0, rng.randf_range(-0.3, 0.3)) * scale
		_w(out, base + jitter + Vector3(0, y, 0), Vector3(w, 1.5 * scale, w),
				greens[i % greens.size()], rng.randf_range(-0.4, 0.4))
	_w(out, base + Vector3(0, trunk_h + 4.6 * scale, 0),
			Vector3(1.8 * scale, 1.2 * scale, 1.8 * scale), greens[1])

static func add_bush(out: Dictionary, base: Vector3, rng: RandomNumberGenerator) -> void:
	var green := Color(0.22, 0.48, 0.24)
	_w(out, base + Vector3(0, 0.5, 0), Vector3(1.8, 1.0, 1.8), green, rng.randf_range(-0.5, 0.5))
	_w(out, base + Vector3(0, 1.1, 0), Vector3(1.1, 0.6, 1.1), green.lightened(0.1))

static func add_fountain(out: Dictionary, base: Vector3) -> void:
	var stone := Color(0.72, 0.71, 0.66)
	_w(out, base + Vector3(0, 0.3, 0), Vector3(9.0, 0.6, 9.0), stone)
	for i in 8:
		var a: float = TAU * float(i) / 8.0
		_w(out, base + Vector3(cos(a) * 4.2, 0.8, sin(a) * 4.2), Vector3(2.6, 1.0, 1.0), stone, -a)
	(out["windows"] as Array).append({"pos": base + Vector3(0, 0.72, 0),
			"size": Vector3(7.4, 0.2, 7.4), "tint": Color(0.6, 0.85, 1.0)})
	_w(out, base + Vector3(0, 1.4, 0), Vector3(1.6, 2.2, 1.6), stone.darkened(0.1))
	_w(out, base + Vector3(0, 2.7, 0), Vector3(3.0, 0.4, 3.0), stone)
	_a(out, base + Vector3(0, 3.2, 0), Vector3(1.0, 1.0, 1.0), Color(0.6, 0.9, 1.0))

static func add_park_path(out: Dictionary, center: Vector3, size: Vector2) -> void:
	_w(out, center + Vector3(0, 0.02, 0), Vector3(size.x, 0.08, size.y), Color(0.68, 0.62, 0.5))

static func add_railing(out: Dictionary, center: Vector3, length: float, along_x: bool) -> void:
	var metal := Color(0.3, 0.32, 0.36)
	var size := Vector3(length, 0.14, 0.14) if along_x else Vector3(0.14, 0.14, length)
	_w(out, center + Vector3(0, 1.05, 0), size, metal)
	_w(out, center + Vector3(0, 0.6, 0), size, metal)
	var posts: int = maxi(int(length / 2.4), 2)
	for i in posts:
		var t: float = (float(i) + 0.5) / float(posts) - 0.5
		var off := Vector3(length * t, 0.0, 0.0) if along_x else Vector3(0.0, 0.0, length * t)
		_w(out, center + off + Vector3(0, 0.55, 0), Vector3(0.16, 1.1, 0.16), metal)
