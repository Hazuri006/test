class_name LevelBase
extends Node3D
## Base class for every level. Builds a WorldEnvironment (fog, tonemap, SSAO/SSR
## driven by settings), a NavigationRegion3D that bakes a navmesh from the
## procedural geometry, named spawn points, ambience and horror-event light
## handling. Subclasses implement _build_level() and may override on_level_ready().

@export var level_id: String = ""
@export var ambience_track: String = "hum"
@export var music_track: String = ""

var nav_region: NavigationRegion3D
var geo: Node3D            # geometry parent (baked into the navmesh)
var props: Node3D          # decorative props (not baked)
var dynamic: Node3D        # interactables, spawns, monster
var world_env: WorldEnvironment

var _spawns: Dictionary = {}            # id -> Transform3D
var _flicker_lights: Array[OmniLight3D] = []
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

func _ready() -> void:
	_rng.randomize()
	_setup_environment()

	nav_region = NavigationRegion3D.new()
	add_child(nav_region)
	geo = Node3D.new()
	geo.name = "Geometry"
	nav_region.add_child(geo)
	props = Node3D.new()
	props.name = "Props"
	add_child(props)
	dynamic = Node3D.new()
	dynamic.name = "Dynamic"
	add_child(dynamic)

	_build_level()
	_bake_navigation()
	_start_ambience()

	if not EventManager.horror_event.is_connected(_on_horror_event):
		EventManager.horror_event.connect(_on_horror_event)

## Subclasses build the layout here.
func _build_level() -> void:
	pass

## Optional hook fired after the player has spawned (for scripted intros).
func on_level_ready(_spawn_id: String) -> void:
	pass

const MONSTER_SCENE: String = "res://scenes/enemies/Monster.tscn"

## Instances a monster into the level. `opts` may override the model and behaviour:
## { "model_path", "model_scale", "model_yaw_offset", "proximity", "aggression" }.
## Returns the monster (or null).
func spawn_monster(pos: Vector3, yaw_deg: float, patrol: Array[Vector3] = [], active: bool = false, opts: Dictionary = {}) -> Node:
	if not ResourceLoader.exists(MONSTER_SCENE):
		return null
	var packed: PackedScene = ResourceLoader.load(MONSTER_SCENE) as PackedScene
	var monster: Node3D = packed.instantiate() as Node3D
	# Model config must be set BEFORE _ready (it builds the body there).
	if opts.has("model_path"):
		monster.set("model_path", str(opts["model_path"]))
	if opts.has("model_scale"):
		monster.set("model_scale", float(opts["model_scale"]))
	if opts.has("model_yaw_offset"):
		monster.set("model_yaw_offset", float(opts["model_yaw_offset"]))
	dynamic.add_child(monster)
	monster.global_position = pos
	monster.rotation.y = deg_to_rad(yaw_deg)
	if monster.has_method("set_patrol_points") and not patrol.is_empty():
		monster.call("set_patrol_points", patrol)
	if opts.has("proximity") and monster.has_method("set_proximity_aggro"):
		monster.call("set_proximity_aggro", float(opts["proximity"]))
	if opts.has("aggression") and monster.has_method("set_aggression"):
		monster.call("set_aggression", float(opts["aggression"]))
	if active and monster.has_method("wake"):
		monster.call("wake")
	return monster

# --- Spawns ------------------------------------------------------------------

func add_spawn(id: String, position: Vector3, yaw_deg: float = 0.0) -> void:
	var xf: Transform3D = Transform3D.IDENTITY
	xf.origin = position
	xf.basis = Basis.from_euler(Vector3(0, deg_to_rad(yaw_deg), 0))
	_spawns[id] = xf

func get_spawn(id: String) -> Transform3D:
	if _spawns.has(id):
		return _spawns[id]
	if _spawns.has("start"):
		return _spawns["start"]
	var fallback: Transform3D = Transform3D.IDENTITY
	fallback.origin = Vector3(0, 1.0, 0)
	return fallback

# --- Environment -------------------------------------------------------------

func _setup_environment() -> void:
	world_env = WorldEnvironment.new()
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.015, 0.018, 0.022)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.10, 0.11, 0.13)
	env.ambient_light_energy = 0.35
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.tonemap_white = 6.0

	env.fog_enabled = true
	env.fog_light_color = Color(0.05, 0.06, 0.07)
	env.fog_density = 0.035
	env.fog_sky_affect = 0.0

	var fog_quality: int = SettingsManager.get_int("graphics", "fog_quality")
	if fog_quality >= 2:
		env.volumetric_fog_enabled = true
		env.volumetric_fog_density = 0.02
		env.volumetric_fog_albedo = Color(0.10, 0.11, 0.13)
		env.volumetric_fog_emission = Color(0, 0, 0)

	env.ssao_enabled = SettingsManager.get_bool("graphics", "ssao")
	env.ssao_radius = 1.5
	env.ssao_intensity = 2.0
	env.ssr_enabled = SettingsManager.get_bool("graphics", "reflections")
	env.ssr_max_steps = 32

	env.glow_enabled = true
	env.glow_intensity = 0.5
	env.glow_bloom = 0.05
	env.glow_hdr_threshold = 1.1

	env.adjustment_enabled = true
	env.adjustment_brightness = clampf(SettingsManager.get_float("gameplay", "brightness"), 0.6, 1.6)
	env.adjustment_contrast = 1.05
	env.adjustment_saturation = 0.88

	_configure_environment(env)
	world_env.environment = env
	add_child(world_env)

## Subclasses tweak the Environment (e.g. exterior adds sky/fog colour).
func _configure_environment(_env: Environment) -> void:
	pass

# --- Navigation --------------------------------------------------------------

func _bake_navigation() -> void:
	var nav: NavigationMesh = NavigationMesh.new()
	# Match the default nav map cell size/height (0.25) and keep agent dimensions as
	# exact cell multiples so no precision warnings are emitted.
	nav.cell_size = 0.25
	nav.cell_height = 0.25
	nav.agent_radius = 0.5
	nav.agent_height = 1.75
	nav.agent_max_climb = 0.5
	nav.agent_max_slope = 50.0
	nav.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
	nav.geometry_source_geometry_mode = NavigationMesh.SOURCE_GEOMETRY_ROOT_NODE_CHILDREN
	nav_region.navigation_mesh = nav
	# Bake on the next idle frame so all geometry is in the tree.
	call_deferred("_do_bake")

func _do_bake() -> void:
	if is_instance_valid(nav_region):
		nav_region.bake_navigation_mesh()

# --- Ambience ----------------------------------------------------------------

func _start_ambience() -> void:
	if ambience_track != "":
		AudioManager.play_ambience(ambience_track, -10.0)
	if music_track != "":
		AudioManager.play_music(music_track, -16.0)

# --- Horror events -----------------------------------------------------------

func register_flicker_light(light: OmniLight3D) -> void:
	_flicker_lights.append(light)

func _on_horror_event(event_id: String, payload: Dictionary) -> void:
	match event_id:
		"light_flicker":
			_flicker_random_light()
		"light_shutdown":
			_shutdown_lights(payload)
		_:
			_handle_custom_event(event_id, payload)

## Subclasses can render bespoke events (silhouettes, props moving).
func _handle_custom_event(_event_id: String, _payload: Dictionary) -> void:
	pass

func _flicker_random_light() -> void:
	if _flicker_lights.is_empty():
		return
	var light: OmniLight3D = _flicker_lights[_rng.randi() % _flicker_lights.size()]
	if not is_instance_valid(light):
		return
	var base: float = float(light.get_meta("base_energy", light.light_energy))
	var tween: Tween = create_tween()
	for i: int in range(_rng.randi_range(3, 6)):
		tween.tween_property(light, "light_energy", base * _rng.randf_range(0.0, 0.4), 0.05)
		tween.tween_property(light, "light_energy", base, 0.08)
	AudioManager.play_at("metal", light.global_position, -16.0)

func _shutdown_lights(payload: Dictionary) -> void:
	var duration: float = float(payload.get("duration", 4.0))
	for light: OmniLight3D in _flicker_lights:
		if not is_instance_valid(light):
			continue
		var base: float = float(light.get_meta("base_energy", light.light_energy))
		var tween: Tween = create_tween()
		tween.tween_property(light, "light_energy", 0.0, 0.1)
		tween.tween_interval(duration)
		tween.tween_property(light, "light_energy", base, 0.5)
