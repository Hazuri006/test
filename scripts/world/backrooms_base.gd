class_name BackroomsBase
extends LevelBase
## Shared machinery for the Backrooms levels: load a GLB maze (with generated
## collision + baked navmesh), scatter markers / story / easter eggs / exit / entity
## onto sampled navmesh points (so everything is reachable whatever the layout), and
## hunt the player with an entity that chases on proximity. Subclasses set the config
## vars (before super._ready()) and may override the theme, lights, story and eggs.

# --- Config (set by subclasses) ----------------------------------------------
var glb_path: String = ""
var glb_scale: float = 1.0
var glb_offset_y: float = 0.0
var glb_collision: bool = true
var spawn_height: float = 4.0
## If > 0, a flat procedural floor of this size is added to the nav region. Use when
## the GLB does not bake a usable navmesh (dense/decorative models): it guarantees a
## walkable surface for the player, the entity and entity placement.
var nav_floor_size: float = 0.0
var nav_floor_y: float = 0.0
var nav_floor_carpet: Color = Color(0.30, 0.26, 0.12)

var marker_item: String = "exit_sigil"
var marker_count: int = 3
var marker_flag: String = "exit_open"
var marker_quest: String = "qb_escape"
var marker_step: String = "find_sigils"
var marker_message: String = "All the markers. Somewhere, a door you didn't cut just opened."

var intro_step: String = ""
var intro_text: String = ""

var exit_step: String = "reach_exit"
var exit_target_level: String = ""
var exit_target_spawn: String = "start"
var exit_title: String = "YOU FOUND THE WAY OUT"
var exit_body: String = ""

var monster_model: String = "res://assets/monster/zombie_hazmat.glb"
var monster_scale: float = 1.12
var monster_yaw: float = PI
var monster_proximity: float = 6.5
var monster_aggression: float = 1.3
## Navmesh-free level: the GLB is the walkable environment (player walks on its
## collision); entities are placed by raycasting to the floor and the entity steers
## directly toward the player. Use when the GLB does not bake a navmesh.
var navless_level: bool = false

# --- Runtime -----------------------------------------------------------------
var _markers: Array[Node3D] = []
var _story_nodes: Array[Node3D] = []
var _egg_nodes: Array[Node3D] = []
var _monster: Node = null
var _exit: Node3D = null
var _placed: bool = false
var _markers_done: bool = false

func _build_level() -> void:
	add_spawn("start", Vector3(0, glb_offset_y + spawn_height, 0), 0.0)
	# Safety floor far below (catches falls; NOT in the nav region).
	WorldBuilder.add_floor(props, Vector3(0, -10.0, 0), Vector2(160, 160),
		GameTypes.SurfaceType.CARPET, MaterialLibrary.get_material("void_floor", Color(0.02, 0.02, 0.02), 1.0, 0.0, false))

	var model: Node3D = WorldBuilder.add_glb(geo, glb_path, Vector3(0, glb_offset_y, 0), glb_scale, GameTypes.SurfaceType.CARPET, glb_collision)
	if model == null:
		_build_fallback()
	# Guaranteed walkable floor (when the GLB itself does not bake a navmesh).
	if nav_floor_size > 0.0:
		WorldBuilder.add_floor(geo, Vector3(0, nav_floor_y, 0), Vector2(nav_floor_size, nav_floor_size),
			GameTypes.SurfaceType.CARPET, MaterialLibrary.get_material("navfloor_%s" % nav_floor_carpet.to_html(false), nav_floor_carpet, 0.95, 0.0))

	_build_extra_geometry()
	_build_lights()
	_build_markers()
	_build_story()
	_build_easter_eggs()
	_build_exit()
	_build_monster()

# --- Markers -----------------------------------------------------------------

func _build_markers() -> void:
	for i: int in range(marker_count):
		var m: PickupItem = PickupItem.new()
		m.item_id = marker_item
		m.persistent_id = "%s_marker_%d" % [level_id, i]
		m.custom_label = "Take it"
		m.position = Vector3(2.0 + i * 2.0, glb_offset_y + 0.4, 2.0)
		dynamic.add_child(m)
		_markers.append(m)
	if not GameManager.inventory.changed.is_connected(_check_markers):
		GameManager.inventory.changed.connect(_check_markers)

func _check_markers() -> void:
	if _markers_done:
		return
	if GameManager.inventory.get_count(marker_item) >= marker_count:
		_markers_done = true
		GameManager.set_flag(marker_flag, true)
		QuestManager.complete_step(marker_quest, marker_step)
		GameManager.notify(marker_message)
		AudioManager.play_2d("sting", -8.0)

# --- Exit + entity -----------------------------------------------------------

func _build_exit() -> void:
	var exit: BackroomsExit = BackroomsExit.new()
	exit.required_flag = marker_flag
	exit.quest_id = marker_quest
	exit.quest_step = exit_step
	exit.target_level = exit_target_level
	exit.target_spawn = exit_target_spawn
	exit.ending_title = exit_title
	exit.ending_body = exit_body
	exit.sealed_message = "Sealed. Find the %d markers." % marker_count
	exit.position = Vector3(8, glb_offset_y, 8)
	dynamic.add_child(exit)
	_exit = exit

func _build_monster() -> void:
	var o: float = glb_offset_y
	var patrol: Array[Vector3] = [
		Vector3(0, o, 0), Vector3(8, o, 8), Vector3(-6, o, 10), Vector3(10, o, -8),
	]
	_monster = spawn_monster(Vector3(12, o + 0.3, 12), 180.0, patrol, true, {
		"model_path": monster_model,
		"model_scale": monster_scale,
		"model_yaw_offset": monster_yaw,
		"proximity": monster_proximity,
		"aggression": monster_aggression * GameManager.difficulty_config.monster_aggression_mult,
		"navless": navless_level,
	})

# --- Lifecycle ---------------------------------------------------------------

func on_level_ready(_spawn_id: String) -> void:
	GameManager.set_checkpoint(level_id, "start")
	if intro_text != "":
		GameManager.show_subtitle(intro_text, 6.0)
	if intro_step != "":
		QuestManager.complete_step(marker_quest, intro_step)
	if not _placed:
		if navless_level:
			await get_tree().create_timer(0.4).timeout
			_place_navless()
		else:
			await get_tree().create_timer(1.2).timeout
			_place_on_navmesh()

func _place_on_navmesh() -> void:
	_placed = true
	var map: RID = nav_region.get_navigation_map()
	if not NavigationServer3D.map_is_active(map):
		GameLog.warn("%s: navmesh not active; entities keep placeholder positions." % level_id)
		return
	var origin: Vector3 = _floor_snap(_sample(map, Vector3.ZERO, 0.0))
	var player: Node3D = GameManager.get_player()
	if player != null:
		player.global_position = origin + Vector3(0, 0.6, 0)
	for i: int in range(_story_nodes.size()):
		if is_instance_valid(_story_nodes[i]):
			_story_nodes[i].global_position = _floor_snap(origin + Vector3(cos(i * 2.1) * 1.8, 0, sin(i * 2.1) * 1.8)) + Vector3(0, 0.4, 0)
	for marker: Node3D in _markers:
		if is_instance_valid(marker):
			marker.global_position = _floor_snap(_sample(map, origin, 9.0)) + Vector3(0, 0.5, 0)
	for egg: Node3D in _egg_nodes:
		if is_instance_valid(egg):
			egg.global_position = _floor_snap(_sample(map, origin, 6.0)) + Vector3(0, 0.4, 0)
	if is_instance_valid(_exit):
		_exit.global_position = _floor_snap(_sample(map, origin, 14.0))
	if _monster != null and _monster is Node3D:
		(_monster as Node3D).global_position = _floor_snap(_sample(map, origin, 16.0)) + Vector3(0, 0.3, 0)
	GameLog.info("%s: placed entities on navmesh (origin=%s)." % [level_id, str(origin.snapped(Vector3.ONE))])

## Placement for navmesh-free (GLB-as-environment) levels: raycast down to the GLB
## floor to scatter the player / story / markers / exit / entity.
func _place_navless() -> void:
	_placed = true
	var origin: Vector3 = _find_floor_point(Vector3(0, glb_offset_y, 0), 0.0)
	var player: Node3D = GameManager.get_player()
	if player != null:
		player.global_position = origin + Vector3(0, 0.6, 0)
	for i: int in range(_story_nodes.size()):
		if is_instance_valid(_story_nodes[i]):
			_story_nodes[i].global_position = _find_floor_point(origin, 2.2 + i * 0.8) + Vector3(0, 0.4, 0)
	for marker: Node3D in _markers:
		if is_instance_valid(marker):
			marker.global_position = _find_floor_point(origin, 8.0) + Vector3(0, 0.5, 0)
	for egg: Node3D in _egg_nodes:
		if is_instance_valid(egg):
			egg.global_position = _find_floor_point(origin, 5.0) + Vector3(0, 0.4, 0)
	if is_instance_valid(_exit):
		_exit.global_position = _find_floor_point(origin, 11.0)
	if _monster != null and _monster is Node3D:
		(_monster as Node3D).global_position = _find_floor_point(origin, 13.0) + Vector3(0, 0.3, 0)
	GameLog.info("%s: navless placement (player origin=%s)." % [level_id, str(origin.snapped(Vector3.ONE))])

## Raycasts straight down through the GLB's vertical extent to find a floor under an
## XZ position. Tries several angles at `radius` around `centre`; returns `centre`'s
## floor if none hit.
func _find_floor_point(centre: Vector3, radius: float) -> Vector3:
	if radius <= 0.0:
		var c: Vector3 = _raycast_floor_xz(centre.x, centre.z)
		return c if c.is_finite() else centre
	for i: int in range(16):
		var ang: float = float(i) * (TAU / 16.0)
		var r: float = radius * randf_range(0.7, 1.25)
		var p: Vector3 = _raycast_floor_xz(centre.x + cos(ang) * r, centre.z + sin(ang) * r)
		if p.is_finite():
			return p
	return centre

func _raycast_floor_xz(x: float, z: float) -> Vector3:
	# The GLB floor sits near (offset - scale); start just above it (inside the
	# interior, below any ceiling) so we find the floor, not the model's top.
	var floor_y: float = glb_offset_y - glb_scale
	var space: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(
		Vector3(x, floor_y + 6.0, z), Vector3(x, floor_y - 6.0, z), GameTypes.LAYER_WORLD)
	var hit: Dictionary = space.intersect_ray(query)
	if hit.has("position"):
		return hit["position"]
	return Vector3(INF, INF, INF)

## Raycasts down to the solid floor under `pos` so placed items never float on a
## crate top or hover above the ground. Falls back to `pos` if nothing is hit.
func _floor_snap(pos: Vector3) -> Vector3:
	var space: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(
		pos + Vector3(0, 1.5, 0), pos + Vector3(0, -8.0, 0), GameTypes.LAYER_WORLD)
	var hit: Dictionary = space.intersect_ray(query)
	if hit.has("position"):
		return hit["position"]
	return pos

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

# --- Overridable hooks -------------------------------------------------------

## Default: a bright buzzing fluorescent grid (the yellow rooms). Subclasses override.
func _build_lights() -> void:
	var lamp_mat: StandardMaterial3D = MaterialLibrary.get_emissive("buzz_lamp", Color(1.0, 0.95, 0.65), 2.6)
	for x in range(-9, 15, 4):
		for z in range(-11, 17, 4):
			var pos: Vector3 = Vector3(float(x), glb_offset_y + 1.85, float(z))
			WorldBuilder.visual_box(props, pos + Vector3(0, 0.1, 0), Vector3(1.0, 0.05, 0.4), lamp_mat)
			var light: OmniLight3D = WorldBuilder.omni(props, pos, Color(1.0, 0.92, 0.62), 1.2, 6.0, false)
			light.set_meta("base_energy", 1.2)
			if randf() < 0.25:
				register_flicker_light(light)

## Extra collision/maze geometry added to the nav region (e.g. a procedural
## perimeter + cover for a GLB used as visual-only backdrop). Default: none.
func _build_extra_geometry() -> void:
	pass

func _build_story() -> void:
	pass

func _build_easter_eggs() -> void:
	pass

## A minimal procedural maze if the GLB is unavailable (keeps the level playable).
func _build_fallback() -> void:
	var wm: StandardMaterial3D = MaterialLibrary.get_material("br_wall", Color(0.78, 0.72, 0.36), 0.85, 0.0)
	var fm: StandardMaterial3D = MaterialLibrary.get_material("br_carpet", Color(0.35, 0.30, 0.12), 0.95, 0.0)
	var o: float = glb_offset_y
	WorldBuilder.add_floor(geo, Vector3(2, o, 2), Vector2(40, 44), GameTypes.SurfaceType.CARPET, fm)
	WorldBuilder.ceiling(geo, Vector3(2, 0, 2), Vector2(40, 44), o + 2.4, MaterialLibrary.get_material("br_ceil", Color(0.7, 0.66, 0.4), 0.8, 0.0))
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = 77
	for i: int in range(26):
		var x: float = rng.randf_range(-16, 20)
		var z: float = rng.randf_range(-18, 22)
		var horiz: bool = rng.randf() > 0.5
		var seg: float = rng.randf_range(4.0, 9.0)
		var a: Vector3 = Vector3(x, o, z)
		var b: Vector3 = a + (Vector3(seg, 0, 0) if horiz else Vector3(0, 0, seg))
		WorldBuilder.wall(geo, a, b, 2.4, 0.2, wm)
	WorldBuilder.wall_run_z(geo, -18, -20, 24, o, 2.4, [], wm)
	WorldBuilder.wall_run_z(geo, 22, -20, 24, o, 2.4, [], wm)
	WorldBuilder.wall_run_x(geo, 24, -18, 22, o, 2.4, [], wm)
	WorldBuilder.wall_run_x(geo, -20, -18, 22, o, 2.4, [], wm)
