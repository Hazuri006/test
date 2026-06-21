extends BackroomsBase
## LEVEL 1 — "Habitable Zone". A vast, dim warehouse maze (the second imported GLB),
## scaled up to walkable size. Find three level keys, reach the way down/out, and
## survive the second entity — which hunts you the moment you get close.

func _ready() -> void:
	level_id = "backrooms_l1"
	ambience_track = "drone"
	glb_path = "res://assets/environment/backrooms_l1.glb"
	# The GLB is authored at ~2 units; scale it up to a walkable level and lift its
	# floor (local y ≈ -1) to world y ≈ 0.
	glb_scale = 12.0
	glb_offset_y = 12.0
	glb_collision = false
	spawn_height = 5.0
	# The dense GLB does not bake a navmesh on its own, so lay a flat walkable floor
	# under it (its walls still carve / block). This guarantees a playable maze.
	nav_floor_size = 34.0
	nav_floor_y = 0.0
	nav_floor_carpet = Color(0.20, 0.20, 0.22)

	marker_item = "level_key"
	marker_count = 3
	marker_flag = "l1_exit_open"
	marker_quest = "qb_level1"
	marker_step = "find_keys"
	marker_message = "Three keys. The freight door at the edge of the zone unlocks."
	intro_step = "arrive"
	intro_text = "You fell through the carpet into somewhere bigger. Concrete. Pipes. The Habitable Zone."
	exit_step = "reach_deep_exit"
	exit_target_level = ""   # final ending
	exit_title = "OUT"
	exit_body = "The freight door grinds up and there is wind on the other side — real wind, cold, that smells of rain and not of carpet.\n\nYou step out onto a loading dock under a real sky, and behind you the door rolls shut on twenty thousand miles of buzzing yellow nothing.\n\nYou kept the tape. You kept your mind. You are one of the almost-none who walk back out.\n\n[END OF TAPE]"

	# The second entity — the new rigged zombie (authored large; scaled down).
	monster_model = "res://assets/monster/zombie_rigged.glb"
	monster_scale = 0.0153
	monster_yaw = PI
	monster_proximity = 7.5
	monster_aggression = 1.6
	super._ready()

func _configure_environment(env: Environment) -> void:
	env.background_color = Color(0.04, 0.04, 0.05)
	env.ambient_light_color = Color(0.35, 0.36, 0.4)
	env.ambient_light_energy = 0.55
	env.fog_enabled = true
	env.fog_light_color = Color(0.12, 0.13, 0.15)
	env.fog_density = 0.025
	env.adjustment_saturation = 0.85
	env.glow_enabled = true
	env.glow_intensity = 0.4

## Procedural warehouse shell + cover around the GLB (which is visual-only). Gives
## the chase real walls to break line-of-sight and crates to dodge behind.
func _build_extra_geometry() -> void:
	var wm: StandardMaterial3D = MaterialLibrary.building_wall()
	var hh: float = 6.0
	var b: float = 16.0
	WorldBuilder.wall_run_z(geo, -b, -b, b, 0.0, hh, [], wm)
	WorldBuilder.wall_run_z(geo, b, -b, b, 0.0, hh, [], wm)
	WorldBuilder.wall_run_x(geo, -b, -b, b, 0.0, hh, [], wm)
	WorldBuilder.wall_run_x(geo, b, -b, b, 0.0, hh, [], wm)
	# Ceiling + crates are visual/physical only (in props, so they don't create
	# walkable navmesh on top — which would float the placed items).
	WorldBuilder.ceiling(props, Vector3(0, 0, 0), Vector2(2 * b, 2 * b), hh, MaterialLibrary.dirty_concrete())
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = 1717
	for i: int in range(14):
		var x: float = rng.randf_range(-13, 13)
		var z: float = rng.randf_range(-13, 13)
		if Vector2(x, z).length() < 4.0:
			continue
		var hgt: float = rng.randf_range(1.2, 2.4)
		WorldBuilder.static_box(props, Vector3(x, hgt * 0.5, z), Vector3(rng.randf_range(1.2, 2.0), hgt, rng.randf_range(1.2, 2.0)), MaterialLibrary.painted_metal())
	for z: float in [-14.0, 0.0, 14.0]:
		WorldBuilder.pipe(props, Vector3(-20, hh - 0.6, z), Vector3(20, hh - 0.6, z), 0.15)

func on_level_ready(spawn_id: String) -> void:
	EventManager.tension = 0.7
	super.on_level_ready(spawn_id)

## Dim, sparse industrial lighting over the larger footprint (overrides the bright grid).
func _build_lights() -> void:
	var lamp_mat: StandardMaterial3D = MaterialLibrary.get_emissive("hz_lamp", Color(0.8, 0.85, 1.0), 1.6)
	for x in range(-24, 30, 9):
		for z in range(-26, 32, 9):
			var pos: Vector3 = Vector3(float(x), glb_offset_y + 6.0, float(z))
			WorldBuilder.visual_box(props, pos + Vector3(0, 0.2, 0), Vector3(1.2, 0.1, 0.5), lamp_mat)
			var light: OmniLight3D = WorldBuilder.omni(props, pos, Color(0.75, 0.8, 0.95), 1.4, 11.0, false)
			light.set_meta("base_energy", 1.4)
			if randf() < 0.4:
				register_flicker_light(light)

func _build_story() -> void:
	_add_doc("doc_hz_meg", _story_nodes)
	_add_audio("log_hz_survivor", _story_nodes)

func _build_easter_eggs() -> void:
	# M.E.G. supply cache.
	var water: PickupItem = PickupItem.new()
	water.item_id = "almond_water"
	water.amount = 3
	water.persistent_id = "hz_water"
	water.custom_label = "Take the almond water crate"
	dynamic.add_child(water)
	_egg_nodes.append(water)
	# A reference to the deeper levels.
	_add_doc("doc_hz_graffiti", _egg_nodes)

func _add_doc(doc_id: String, into: Array[Node3D]) -> void:
	var d: DocumentPickup = DocumentPickup.new()
	d.document_id = doc_id
	d.position = Vector3(2.5, glb_offset_y + 0.4, 4.0)
	dynamic.add_child(d)
	into.append(d)

func _add_audio(log_id: String, into: Array[Node3D]) -> void:
	var a: AudioLogPickup = AudioLogPickup.new()
	a.audio_log_id = log_id
	a.position = Vector3(1.5, glb_offset_y + 0.4, 2.5)
	dynamic.add_child(a)
	into.append(a)
