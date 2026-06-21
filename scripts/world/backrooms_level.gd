extends LevelBase
## THE BACKROOMS. Loads the imported GLB maze as the environment (with generated
## collision + baked navmesh), floods it with buzzing fluorescent light, and hunts
## the player with the entity. Player / sigils / exit / monster are placed on sampled
## navmesh points after the bake, so everything is reachable whatever the maze layout.

const GLB_PATH: String = "res://assets/environment/backrooms.glb"

var _sigils: Array[Node3D] = []
var _exit: Node3D = null
var _monster: Node = null
var _story_nodes: Array[Node3D] = []
var _placed: bool = false
var _sigils_done: bool = false

func _ready() -> void:
	level_id = "backrooms"
	ambience_track = "hum"
	super._ready()

func _configure_environment(env: Environment) -> void:
	# The unmistakable Backrooms look: bright, flat, sickly yellow, no escape from it.
	env.background_color = Color(0.16, 0.15, 0.08)
	env.ambient_light_color = Color(1.0, 0.93, 0.62)
	env.ambient_light_energy = 1.15
	env.fog_enabled = true
	env.fog_light_color = Color(0.55, 0.5, 0.28)
	env.fog_density = 0.018
	env.adjustment_saturation = 1.1
	env.adjustment_contrast = 1.0
	env.glow_enabled = true
	env.glow_intensity = 0.7

func _build_level() -> void:
	# Spawn high; we reposition onto the navmesh once it has baked.
	add_spawn("start", Vector3(2.5, 3.0, 2.5), 0.0)

	# Safety floor far below (catches falls; NOT in the nav region so it cannot
	# pollute the navmesh with an unreachable lower level).
	WorldBuilder.add_floor(props, Vector3(2.5, -3.0, 2.5), Vector2(60, 64),
		GameTypes.SurfaceType.CARPET, MaterialLibrary.get_material("void_floor", Color(0.02, 0.02, 0.02), 1.0, 0.0, false))

	# The imported maze (with collision; baked into the navmesh).
	var model: Node3D = WorldBuilder.add_glb(geo, GLB_PATH, Vector3.ZERO, 1.0, GameTypes.SurfaceType.CARPET)
	if model == null:
		_build_fallback_maze()

	_build_lights()
	_build_sigils()
	_build_story()
	_build_exit()
	_build_monster()

func _build_story() -> void:
	var guide: DocumentPickup = DocumentPickup.new()
	guide.document_id = "doc_br_survival"
	guide.position = Vector3(3.5, 0.4, 2.5)
	dynamic.add_child(guide)
	_story_nodes.append(guide)
	var tape: AudioLogPickup = AudioLogPickup.new()
	tape.audio_log_id = "log_br_intro"
	tape.position = Vector3(1.5, 0.4, 2.5)
	dynamic.add_child(tape)
	_story_nodes.append(tape)
	var note: DocumentPickup = DocumentPickup.new()
	note.document_id = "doc_br_wanderer"
	note.position = Vector3(2.5, 0.4, 4.0)
	dynamic.add_child(note)
	_story_nodes.append(note)

func _build_lights() -> void:
	var lamp_mat: StandardMaterial3D = MaterialLibrary.get_emissive("buzz_lamp", Color(1.0, 0.95, 0.65), 2.6)
	for x in range(-9, 15, 4):
		for z in range(-11, 17, 4):
			var pos: Vector3 = Vector3(float(x), 1.85, float(z))
			WorldBuilder.visual_box(props, pos + Vector3(0, 0.1, 0), Vector3(1.0, 0.05, 0.4), lamp_mat)
			var light: OmniLight3D = WorldBuilder.omni(props, pos, Color(1.0, 0.92, 0.62), 1.2, 6.0, false)
			light.set_meta("base_energy", 1.2)
			if randf() < 0.25:
				register_flicker_light(light)

func _build_sigils() -> void:
	for i: int in range(3):
		var sigil: PickupItem = PickupItem.new()
		sigil.item_id = "exit_sigil"
		sigil.persistent_id = "br_sigil_%d" % i
		sigil.custom_label = "Take the exit sigil"
		sigil.position = Vector3(2.5 + i * 2.0, 0.4, 2.5)
		dynamic.add_child(sigil)
		_sigils.append(sigil)
	if not GameManager.inventory.changed.is_connected(_check_sigils):
		GameManager.inventory.changed.connect(_check_sigils)

func _build_exit() -> void:
	var exit: BackroomsExit = BackroomsExit.new()
	exit.position = Vector3(10, 0.0, 12)
	dynamic.add_child(exit)
	_exit = exit

func _build_monster() -> void:
	var patrol: Array[Vector3] = [
		Vector3(0, 0.3, 0), Vector3(8, 0.3, 8), Vector3(-6, 0.3, 10), Vector3(10, 0.3, -8),
	]
	_monster = spawn_monster(Vector3(12, 0.3, 14), 180.0, patrol, true)
	if _monster != null:
		if _monster.has_method("set_proximity_aggro"):
			_monster.call("set_proximity_aggro", 6.5)
		if _monster.has_method("set_aggression"):
			_monster.call("set_aggression", 1.3 * GameManager.difficulty_config.monster_aggression_mult)

func _check_sigils() -> void:
	if _sigils_done:
		return
	if GameManager.inventory.get_count("exit_sigil") >= 3:
		_sigils_done = true
		GameManager.set_flag("exit_open", true)
		QuestManager.complete_step("qb_escape", "find_sigils")
		GameManager.notify("Three sigils. Somewhere in the rooms, a door you didn't cut just opened.")
		AudioManager.play_2d("sting", -8.0)

func on_level_ready(_spawn_id: String) -> void:
	GameManager.set_checkpoint("backrooms", "start")
	GameManager.show_subtitle("You no-clipped through the wall. This is not a place. Keep moving.", 6.0)
	QuestManager.complete_step("qb_escape", "no_clip")
	# Wait for the threaded navmesh bake, then scatter everything onto reachable points.
	if not _placed:
		await get_tree().create_timer(1.2).timeout
		_place_on_navmesh()

func _place_on_navmesh() -> void:
	_placed = true
	var map: RID = nav_region.get_navigation_map()
	if not NavigationServer3D.map_is_active(map):
		return
	var origin: Vector3 = _sample(map, Vector3.ZERO, 0.0)
	# Player onto a clear point.
	var player: Node3D = GameManager.get_player()
	if player != null:
		player.global_position = origin + Vector3(0, 0.4, 0)
	# Story pickups clustered near where the player wakes.
	for i: int in range(_story_nodes.size()):
		if is_instance_valid(_story_nodes[i]):
			var off: Vector3 = Vector3(cos(i * 2.1) * 1.6, 0.4, sin(i * 2.1) * 1.6)
			_story_nodes[i].global_position = origin + off
	# Three sigils, spread out.
	for sigil: Node3D in _sigils:
		if is_instance_valid(sigil):
			sigil.global_position = _sample(map, origin, 9.0) + Vector3(0, 0.4, 0)
	# Exit, far from the player.
	if is_instance_valid(_exit):
		_exit.global_position = _sample(map, origin, 14.0)
	# Entity, far away to start.
	if _monster != null and _monster is Node3D:
		(_monster as Node3D).global_position = _sample(map, origin, 16.0) + Vector3(0, 0.3, 0)
	GameLog.info("Backrooms: placed player/sigils/exit/monster on navmesh (origin=%s)." % str(origin.snapped(Vector3.ONE)))

## Returns a navmesh point at least `min_dist` from `away_from` (best effort).
func _sample(map: RID, away_from: Vector3, min_dist: float) -> Vector3:
	var best: Vector3 = away_from
	for i: int in range(24):
		var p: Vector3 = NavigationServer3D.map_get_random_point(map, 1, false)
		if p == Vector3.ZERO:
			continue
		best = p
		if p.distance_to(away_from) >= min_dist:
			return p
	return best

## Minimal procedural maze if the GLB is unavailable (keeps the level playable).
func _build_fallback_maze() -> void:
	var wm: StandardMaterial3D = MaterialLibrary.get_material("backrooms_wall", Color(0.78, 0.72, 0.36), 0.85, 0.0)
	var fm: StandardMaterial3D = MaterialLibrary.get_material("backrooms_carpet", Color(0.35, 0.30, 0.12), 0.95, 0.0)
	WorldBuilder.add_floor(geo, Vector3(2, 0, 2), Vector2(40, 44), GameTypes.SurfaceType.CARPET, fm)
	WorldBuilder.ceiling(geo, Vector3(2, 0, 2), Vector2(40, 44), 2.2, MaterialLibrary.get_material("backrooms_ceil", Color(0.7, 0.66, 0.4), 0.8, 0.0))
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = 77
	for i: int in range(24):
		var x: float = rng.randf_range(-16, 20)
		var z: float = rng.randf_range(-18, 22)
		var horiz: bool = rng.randf() > 0.5
		var seg_len: float = rng.randf_range(4.0, 9.0)
		var a: Vector3 = Vector3(x, 0, z)
		var b: Vector3 = a + (Vector3(seg_len, 0, 0) if horiz else Vector3(0, 0, seg_len))
		WorldBuilder.wall(geo, a, b, 2.2, 0.2, wm)
	# Perimeter.
	WorldBuilder.wall_run_z(geo, -18, -20, 24, 0.0, 2.2, [], wm)
	WorldBuilder.wall_run_z(geo, 22, -20, 24, 0.0, 2.2, [], wm)
	WorldBuilder.wall_run_x(geo, 24, -18, 22, 0.0, 2.2, [], wm)
	WorldBuilder.wall_run_x(geo, -20, -18, 22, 0.0, 2.2, [], wm)
