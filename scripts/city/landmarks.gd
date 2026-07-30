class_name Landmarks
extends RefCounted
## Landmarks -- the two hand-designed places in Brick City.
##
## Procedural blocks make the city feel big; landmarks make it feel authored.
## Both are built from the same brick data pipeline as everything else, then
## committed through BrickKit.build_batch (few nodes, few draw calls).
##
##   build_bank()    -> Banque Centrale de Brick City (mission 2)
##   build_factory() -> Usine Mecanix, the boss arena (final mission)
##
## Each returns a Dictionary with the created root plus the key world positions
## the mission scripts need.

# =============================================================================
#  BANK
# =============================================================================

## Neoclassical bank with a plaza, wide steps, square brick columns and a
## pediment. The plaza is the bank-heist arena; the steps are where the robbers
## come out.
static func build_bank(parent: Node3D, center: Vector3) -> Dictionary:
	var data := BrickKit.new_batch()
	var stone := Color(0.82, 0.79, 0.70)
	var stone_dark := Color(0.66, 0.63, 0.56)
	var gold := Color(0.92, 0.74, 0.24)
	var w := 46.0
	var d := 30.0
	var wall_h := 19.0

	# --- plaza + steps ------------------------------------------------------
	_box(data, "walls", Vector3(0, 0.2, d * 0.5 + 13.0), Vector3(w + 14.0, 0.5, 26.0), stone_dark)
	_collide(data, Vector3(0, 0.2, d * 0.5 + 13.0), Vector3(w + 14.0, 0.5, 26.0))
	for s in 4:
		var y: float = 0.45 + float(s) * 0.42
		var z: float = d * 0.5 + 2.6 - float(s) * 0.9
		_box(data, "walls", Vector3(0, y, z), Vector3(w * 0.8, 0.42, 3.0), stone)
		_collide(data, Vector3(0, y, z), Vector3(w * 0.8, 0.42, 3.0))

	# --- main hall ----------------------------------------------------------
	var floor_y := 2.2
	_box(data, "walls", Vector3(0, floor_y * 0.5, 0), Vector3(w, floor_y, d), stone)
	_collide(data, Vector3(0, floor_y * 0.5, 0), Vector3(w, floor_y, d))
	# back and side walls (front stays open behind the columns)
	_box(data, "walls", Vector3(0, floor_y + wall_h * 0.5, -d * 0.5 + 1.0),
			Vector3(w, wall_h, 2.0), stone)
	_collide(data, Vector3(0, floor_y + wall_h * 0.5, -d * 0.5 + 1.0), Vector3(w, wall_h, 2.0))
	for s in [-1.0, 1.0]:
		_box(data, "walls", Vector3(s * (w * 0.5 - 1.0), floor_y + wall_h * 0.5, 0),
				Vector3(2.0, wall_h, d), stone)
		_collide(data, Vector3(s * (w * 0.5 - 1.0), floor_y + wall_h * 0.5, 0),
				Vector3(2.0, wall_h, d))
	# interior floor + ceiling
	_box(data, "walls", Vector3(0, floor_y + wall_h, 0), Vector3(w, 1.6, d), stone_dark)
	_collide(data, Vector3(0, floor_y + wall_h, 0), Vector3(w, 1.6, d))

	# --- columns ------------------------------------------------------------
	var columns := 7
	for c in columns:
		var t: float = (float(c) + 0.5) / float(columns) - 0.5
		var x: float = t * (w - 6.0)
		var z: float = d * 0.5 - 1.6
		_box(data, "walls", Vector3(x, floor_y + 0.6, z), Vector3(3.2, 1.2, 3.2), stone_dark)
		_box(data, "walls", Vector3(x, floor_y + wall_h * 0.5, z), Vector3(2.4, wall_h - 2.4, 2.4), stone)
		_box(data, "walls", Vector3(x, floor_y + wall_h - 0.7, z), Vector3(3.4, 1.4, 3.4), stone_dark)

	# --- pediment + roof ----------------------------------------------------
	var pediment_y := floor_y + wall_h + 1.6
	for i in 4:
		var shrink: float = 1.0 - float(i) * 0.16
		_box(data, "walls", Vector3(0, pediment_y + float(i) * 1.3, d * 0.5 - 2.0),
				Vector3(w * shrink, 1.3, 4.0), stone)
	_box(data, "walls", Vector3(0, pediment_y + 1.0, 0), Vector3(w * 0.9, 2.0, d * 0.8), stone_dark)
	_collide(data, Vector3(0, pediment_y + 1.0, 0), Vector3(w * 0.9, 2.0, d * 0.8))
	# roof lantern -- a swing anchor right above the plaza
	_box(data, "walls", Vector3(0, pediment_y + 5.0, 0), Vector3(10.0, 8.0, 10.0), stone)
	_collide(data, Vector3(0, pediment_y + 5.0, 0), Vector3(10.0, 8.0, 10.0))
	_box(data, "walls", Vector3(0, pediment_y + 10.0, 0), Vector3(6.0, 2.0, 6.0), gold.darkened(0.3))
	_box(data, "accents", Vector3(0, pediment_y + 12.0, 0), Vector3(2.4, 2.4, 2.4), gold)

	# --- signage + doors ----------------------------------------------------
	_box(data, "accents", Vector3(0, pediment_y + 2.4, d * 0.5 + 0.4), Vector3(24.0, 2.2, 0.5), gold)
	for s in [-1.0, 0.0, 1.0]:
		_box(data, "windows", Vector3(s * 7.0, floor_y + 4.0, -d * 0.5 + 2.2),
				Vector3(6.0, 7.0, 0.4), Color(0.5, 0.7, 1.0))
	# vault door (interior back wall) -- the robbers' entry point in mission 2
	_box(data, "details", Vector3(0, floor_y + 3.4, -d * 0.5 + 2.3), Vector3(8.0, 6.4, 0.6), stone_dark)
	_box(data, "accents", Vector3(0, floor_y + 3.4, -d * 0.5 + 2.7), Vector3(3.0, 3.0, 0.3),
			Color(0.4, 0.9, 1.0))

	var root := BrickKit.build_batch(parent, data, "BanqueCentrale",
			BrickKit.L_WORLD | BrickKit.L_WEB_ANCHOR, 320.0)
	root.position = center

	return {
		"root": root,
		"plaza": center + Vector3(0, 0.5, d * 0.5 + 13.0),
		"entrance": center + Vector3(0, 2.6, d * 0.5 + 2.0),
		"rooftop": center + Vector3(0, pediment_y + 9.5, 0),
		"size": Vector2(w, d),
	}

# =============================================================================
#  MECHANIX FACTORY  (boss arena)
# =============================================================================

## Walled industrial compound, open to the sky so the hero can keep swinging
## during the fight. Four corner pylons and two gantries are deliberate web
## anchors -- phase 3 requires them.
static func build_factory(parent: Node3D, center: Vector3) -> Dictionary:
	var data := BrickKit.new_batch()
	var wall_col := Color(0.44, 0.46, 0.50)
	var trim := Color(0.86, 0.62, 0.12)
	var dark := Color(0.24, 0.26, 0.30)
	var energy := Color(0.25, 0.85, 1.0)

	var half := 39.0
	var wall_h := 21.0

	# --- floor --------------------------------------------------------------
	_box(data, "walls", Vector3(0, 0.15, 0), Vector3(half * 2.0, 0.6, half * 2.0), dark.lightened(0.1))
	_collide(data, Vector3(0, 0.15, 0), Vector3(half * 2.0, 0.6, half * 2.0))
	# painted hazard bands on the floor
	for i in 6:
		var x: float = -half + 6.0 + float(i) * 13.0
		_box(data, "details", Vector3(x, 0.47, 0), Vector3(1.2, 0.06, half * 1.8), trim.darkened(0.2))

	# --- perimeter walls with a gate on the south side ----------------------
	var gate_w := 14.0
	for side in 4:
		var normal: Vector3 = [Vector3.BACK, Vector3.RIGHT, Vector3.FORWARD, Vector3.LEFT][side]
		var along := Vector3(-normal.z, 0.0, normal.x)
		if side == 0:
			# south wall split around the gate
			for s in [-1.0, 1.0]:
				var seg_w: float = half - gate_w * 0.5
				var pos: Vector3 = normal * half + along * s * (gate_w * 0.5 + seg_w * 0.5)
				pos.y = wall_h * 0.5
				var size := Vector3(seg_w * 2.0 * absf(along.x) + 2.0 * absf(normal.x),
						wall_h, seg_w * 2.0 * absf(along.z) + 2.0 * absf(normal.z))
				_box(data, "walls", pos, size, wall_col)
				_collide(data, pos, size)
			# gate lintel
			var lintel: Vector3 = normal * half + Vector3(0, wall_h - 2.0, 0)
			_box(data, "walls", lintel, Vector3(gate_w + 2.0, 4.0, 2.0), wall_col.darkened(0.1))
			_collide(data, lintel, Vector3(gate_w + 2.0, 4.0, 2.0))
			_box(data, "accents", normal * half + Vector3(0, wall_h + 1.4, 0),
					Vector3(18.0, 2.0, 0.6), trim)
		else:
			var pos: Vector3 = normal * half
			pos.y = wall_h * 0.5
			var size := Vector3(half * 2.0 * absf(along.x) + 2.0 * absf(normal.x), wall_h,
					half * 2.0 * absf(along.z) + 2.0 * absf(normal.z))
			_box(data, "walls", pos, size, wall_col)
			_collide(data, pos, size)
		# ribbed pilasters so the walls are not blank
		for r in 7:
			var t: float = (float(r) + 0.5) / 7.0 - 0.5
			var p: Vector3 = normal * (half - 1.2) + along * t * half * 2.0
			p.y = wall_h * 0.5
			_box(data, "details", p, Vector3(1.6 + absf(normal.x) * 0.4, wall_h, 1.6 + absf(normal.z) * 0.4),
					wall_col.darkened(0.18))

	# --- corner pylons (web anchors) ---------------------------------------
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			var base := Vector3(sx * (half - 5.0), 0.0, sz * (half - 5.0))
			_box(data, "walls", base + Vector3(0, 15.0, 0), Vector3(3.4, 30.0, 3.4), dark)
			_collide(data, base + Vector3(0, 15.0, 0), Vector3(3.4, 30.0, 3.4))
			_box(data, "details", base + Vector3(0, 30.5, 0), Vector3(6.0, 1.0, 6.0), trim)
			_box(data, "accents", base + Vector3(0, 31.4, 0), Vector3(1.2, 1.2, 1.2), energy)
	# gantries linking the pylons: the swing rails for phase 3
	for axis in 2:
		for s in [-1.0, 1.0]:
			var pos := Vector3(s * (half - 5.0) * float(axis), 27.5, s * (half - 5.0) * float(1 - axis))
			var size := Vector3(1.8 if axis == 1 else half * 2.0 - 10.0, 1.4,
					half * 2.0 - 10.0 if axis == 1 else 1.8)
			_box(data, "walls", pos, size, dark.lightened(0.15))
			_collide(data, pos, size)

	# --- perimeter catwalk at 10 m -----------------------------------------
	for side in 4:
		var normal: Vector3 = [Vector3.BACK, Vector3.RIGHT, Vector3.FORWARD, Vector3.LEFT][side]
		var along := Vector3(-normal.z, 0.0, normal.x)
		var pos: Vector3 = normal * (half - 4.0) + Vector3(0, 10.0, 0)
		var size := Vector3(half * 2.0 * absf(along.x) + 5.0 * absf(normal.x), 0.6,
				half * 2.0 * absf(along.z) + 5.0 * absf(normal.z))
		_box(data, "walls", pos, size, dark.lightened(0.2))
		_collide(data, pos, size)
		_box(data, "details", pos + Vector3(0, 1.0, 0) - normal * 2.2,
				size * Vector3(1.0, 2.0, 1.0) + Vector3(0, 0.8, 0), trim.darkened(0.3))

	# --- central machine platform (boss spawn) -----------------------------
	_box(data, "walls", Vector3(0, 1.0, 0), Vector3(20.0, 2.0, 20.0), dark)
	_collide(data, Vector3(0, 1.0, 0), Vector3(20.0, 2.0, 20.0))
	for i in 4:
		var a: float = TAU * float(i) / 4.0 + PI * 0.25
		_box(data, "details", Vector3(cos(a) * 8.0, 2.6, sin(a) * 8.0), Vector3(2.4, 1.2, 2.4), trim)
	_box(data, "accents", Vector3(0, 2.2, 0), Vector3(12.0, 0.3, 12.0), energy)

	# --- reactor (phase 3 target) ------------------------------------------
	var reactor_pos := Vector3(0, 0.0, -half + 9.0)
	_box(data, "walls", reactor_pos + Vector3(0, 4.0, 0), Vector3(14.0, 8.0, 10.0), wall_col.darkened(0.2))
	_collide(data, reactor_pos + Vector3(0, 4.0, 0), Vector3(14.0, 8.0, 10.0))
	for s in [-1.0, 1.0]:
		_box(data, "details", reactor_pos + Vector3(s * 5.0, 9.5, 0), Vector3(3.0, 3.0, 3.0), dark)
	_box(data, "accents", reactor_pos + Vector3(0, 8.6, 0), Vector3(8.0, 1.6, 6.0), energy)

	# --- pipes, tanks, conveyor --------------------------------------------
	for s in [-1.0, 1.0]:
		_box(data, "walls", Vector3(s * (half - 12.0), 4.0, -half + 16.0),
				Vector3(7.0, 8.0, 7.0), wall_col.lightened(0.08))
		_collide(data, Vector3(s * (half - 12.0), 4.0, -half + 16.0), Vector3(7.0, 8.0, 7.0))
		_box(data, "details", Vector3(s * (half - 12.0), 8.6, -half + 16.0),
				Vector3(5.0, 1.4, 5.0), trim)
		# long pipe running towards the centre
		_box(data, "details", Vector3(s * (half - 22.0), 6.5, -half + 16.0),
				Vector3(20.0, 1.2, 1.2), wall_col.darkened(0.1))
	_box(data, "walls", Vector3(0, 1.4, half - 14.0), Vector3(26.0, 1.2, 5.0), dark.lightened(0.25))
	_collide(data, Vector3(0, 1.4, half - 14.0), Vector3(26.0, 1.2, 5.0))
	for i in 8:
		_box(data, "details", Vector3(-11.0 + float(i) * 3.2, 2.2, half - 14.0),
				Vector3(2.4, 0.4, 4.2), trim.darkened(0.35))

	var root := BrickKit.build_batch(parent, data, "UsineMecanix",
			BrickKit.L_WORLD | BrickKit.L_WEB_ANCHOR, 400.0)
	root.position = center

	# Industrial lighting: a few strong lamps, no shadows (cheap, moody).
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			var lamp := OmniLight3D.new()
			lamp.position = Vector3(sx * 22.0, 16.0, sz * 22.0)
			lamp.light_color = Color(1.0, 0.86, 0.6)
			lamp.light_energy = 5.0
			lamp.omni_range = 46.0
			lamp.shadow_enabled = false
			root.add_child(lamp)
	var core_light := OmniLight3D.new()
	core_light.position = Vector3(0, 6.0, -half + 9.0)
	core_light.light_color = energy
	core_light.light_energy = 8.0
	core_light.omni_range = 30.0
	core_light.shadow_enabled = false
	root.add_child(core_light)

	return {
		"root": root,
		"arena_center": center + Vector3(0, 2.2, 0),
		"boss_spawn": center + Vector3(0, 2.2, -6.0),
		"entry": center + Vector3(0, 1.0, half + 8.0),
		"reactor": center + reactor_pos + Vector3(0, 6.0, 0),
		"radius": half,
	}

# =============================================================================
#  HELPERS
# =============================================================================

static func _box(data: Dictionary, group: String, pos: Vector3, size: Vector3, tint: Color) -> void:
	(data[group] as Array).append({"pos": pos, "size": size, "tint": tint})

static func _collide(data: Dictionary, pos: Vector3, size: Vector3) -> void:
	(data["colliders"] as Array).append({"pos": pos, "size": size})
