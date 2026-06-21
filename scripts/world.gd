extends Node3D
## Builds the playable level from the imported backrooms model at runtime:
##  - trimesh collision for every mesh,
##  - flickering omni lights placed on the lamp meshes,
##  - a navigation mesh baked from that collision,
##  - co-op player spawning and the escape objective.

const PLAYER_SCENE := preload("res://scenes/Player.tscn")
const FLICKER := preload("res://scripts/flicker_light.gd")

const LAMP_MATERIALS := ["Ceiling_Lamp", "Lamp", "Exit_Sign"]
const EMISSIVE_BOOST := {
	"Ceiling_Lamp": 6.0, "Lamp": 5.0, "Exit_Sign": 8.0,
	"Emission_Red": 7.0, "Window_1": 2.5,
}

@onready var nav_region: NavigationRegion3D = $NavigationRegion3D
@onready var env_model: Node3D = $NavigationRegion3D/EnvModel
@onready var players_root: Node3D = $Players
@onready var monster: CharacterBody3D = $Monster
@onready var spawner: MultiplayerSpawner = $PlayerSpawner

var _seen_materials := {}
var _shadow_budget := 18
var nav_ready := false
var exit_position := Vector3.INF
var _player_spawns: Array[Vector3] = []

func _ready() -> void:
	spawner.spawn_function = _spawn_fn
	_build_collision(env_model)
	_decorate_materials_and_lights(env_model)
	Game.reset()

	if _is_authority():
		# Let the new static bodies register with the physics server, then bake.
		await get_tree().physics_frame
		await get_tree().physics_frame
		_bake_navigation()

func _process(_dt: float) -> void:
	if _is_authority() and Game.state == Game.State.PLAYING and exit_position != Vector3.INF:
		for p in get_tree().get_nodes_in_group("players"):
			if is_instance_valid(p) and not p.is_dead and p.global_position.distance_to(exit_position) < 2.4:
				Game.on_escape(p)
				break

func _is_authority() -> bool:
	return (not Net.is_networked()) or multiplayer.is_server()

# --- geometry --------------------------------------------------------------

func _build_collision(node: Node) -> void:
	for child in node.get_children():
		_build_collision(child)
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		node.create_trimesh_collision()

func _decorate_materials_and_lights(node: Node) -> void:
	for child in node.get_children():
		_decorate_materials_and_lights(child)
	if not (node is MeshInstance3D):
		return
	var mi := node as MeshInstance3D
	if mi.mesh == null:
		return
	var is_lamp := false
	for s in mi.get_surface_override_material_count():
		var mat := mi.get_active_material(s)
		if mat == null:
			continue
		var mname := mat.resource_name
		if mname in EMISSIVE_BOOST and not _seen_materials.has(mname) and mat is StandardMaterial3D:
			var sm := mat as StandardMaterial3D
			sm.emission_enabled = true
			if sm.emission == Color(0, 0, 0):
				sm.emission = Color(1.0, 0.96, 0.74)
			sm.emission_energy_multiplier = EMISSIVE_BOOST[mname]
			_seen_materials[mname] = true
		if mname in LAMP_MATERIALS:
			is_lamp = true
	if is_lamp:
		_add_lamp_light(mi)

func _add_lamp_light(mi: MeshInstance3D) -> void:
	var aabb := mi.global_transform * mi.get_aabb()
	var center := aabb.get_center()
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.95, 0.72)
	light.light_energy = 2.6
	light.omni_range = max(5.0, aabb.size.length() * 1.6 + 3.5)
	light.omni_attenuation = 1.4
	light.light_specular = 0.4
	if _shadow_budget > 0:
		light.shadow_enabled = true
		light.distance_fade_enabled = true
		light.distance_fade_begin = 28.0
		light.distance_fade_length = 8.0
		_shadow_budget -= 1
	light.set_script(FLICKER)
	add_child(light)
	light.global_position = center - Vector3(0, aabb.size.y * 0.25, 0)

# --- navigation + spawning -------------------------------------------------

func _make_navmesh() -> NavigationMesh:
	var nm := NavigationMesh.new()
	nm.agent_radius = 0.5
	nm.agent_height = 1.85
	nm.agent_max_climb = 0.4
	nm.agent_max_slope = 50.0
	nm.cell_size = 0.18
	nm.cell_height = 0.18
	nm.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
	nm.geometry_source_geometry_mode = NavigationMesh.SOURCE_GEOMETRY_ROOT_NODE_CHILDREN
	nm.geometry_collision_mask = 1
	return nm

func _bake_navigation() -> void:
	nav_region.navigation_mesh = _make_navmesh()
	if not nav_region.bake_finished.is_connected(_on_nav_ready):
		nav_region.bake_finished.connect(_on_nav_ready)
	nav_region.bake_navigation_mesh(true)

func _on_nav_ready() -> void:
	# Wait for the navigation map's first synchronisation before querying it.
	for i in 4:
		await get_tree().physics_frame
	nav_ready = true
	_collect_spawns()
	_locate_exit()
	_position_monster()
	monster.set_active(true)

	if Net.is_networked():
		for id in multiplayer.get_peers():
			_spawn_player(id)
		_spawn_player(multiplayer.get_unique_id())
		if not multiplayer.peer_connected.is_connected(_spawn_player):
			multiplayer.peer_connected.connect(_spawn_player)
	else:
		_spawn_player(1)

func _collect_spawns() -> void:
	var map := nav_region.get_navigation_map()
	var pts: Array[Vector3] = []
	for i in 64:
		var p := NavigationServer3D.map_get_random_point(map, 1, false)
		if p != Vector3.ZERO:
			pts.append(p)
	# Survivors start toward the high-X open end; the entity lurks at the far end.
	pts.sort_custom(func(a, b): return a.x > b.x)
	_player_spawns = pts.slice(0, 8) if pts.size() >= 8 else pts

func _player_spawn_for(index: int) -> Vector3:
	if _player_spawns.is_empty():
		return Vector3(0, 1, 5)
	return _player_spawns[index % _player_spawns.size()] + Vector3(0, 0.2, 0)

func _position_monster() -> void:
	var map := nav_region.get_navigation_map()
	var far := monster.global_position
	var far_x := INF
	for i in 48:
		var p := NavigationServer3D.map_get_random_point(map, 1, false)
		if p != Vector3.ZERO and p.x < far_x:
			far_x = p.x
			far = p
	monster.global_position = far + Vector3(0, 0.4, 0)

func _locate_exit() -> void:
	# Find the exit door mesh by material name and remember where to escape.
	var found := _find_mesh_by_material(env_model, ["Exit_Door", "Exit_Sign"])
	if found:
		var aabb := found.global_transform * found.get_aabb()
		exit_position = aabb.get_center()
		exit_position.y = (_player_spawns[0].y if not _player_spawns.is_empty() else 0.0)
		var beacon := OmniLight3D.new()
		beacon.light_color = Color(0.3, 1.0, 0.4)
		beacon.light_energy = 3.0
		beacon.omni_range = 7.0
		add_child(beacon)
		beacon.global_position = aabb.get_center()

func _find_mesh_by_material(node: Node, names: Array) -> MeshInstance3D:
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		var mi := node as MeshInstance3D
		for s in mi.get_surface_override_material_count():
			var mat := mi.get_active_material(s)
			if mat and mat.resource_name in names:
				return mi
	for child in node.get_children():
		var r := _find_mesh_by_material(child, names)
		if r:
			return r
	return null

func _spawn_player(id: int) -> void:
	if not _is_authority():
		return
	var index := players_root.get_child_count()
	var pos := _player_spawn_for(index)
	var pname: String = Net.players.get(id, {}).get("name", "Survivor") if Net.is_networked() else "You"
	var data := {"id": id, "px": pos.x, "py": pos.y, "pz": pos.z, "name": pname}
	if Net.is_networked():
		spawner.spawn(data)
	else:
		players_root.add_child(_spawn_fn(data))

func _spawn_fn(data: Variant) -> Node:
	var p := PLAYER_SCENE.instantiate()
	p.name = str(data["id"])
	p.position = Vector3(data["px"], data["py"], data["pz"])
	p.call_deferred("setup", str(data["name"]))
	return p
