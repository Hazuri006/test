extends Node3D
class_name WorldManager

## Orchestre l'ambiance : course du soleil et de la lune, ciel physique,
## brouillard, et surtout la bascule continue entre l'air et l'eau.
##
## Rien n'est binaire : `submersion` va de 0 a 1 pendant que la camera traverse
## la surface, et absolument tout (brouillard, lumiere, saturation, son) est
## interpole avec elle. C'est ce qui rend le passage tete hors de l'eau /
## tete sous l'eau credible.

const SkyShader := preload("res://shaders/sky.gdshader")
const UnderwaterShader := preload("res://shaders/underwater_post.gdshader")

@export var day_length: float = 1200.0        # secondes pour un cycle complet
@export var time_scale_enabled: bool = true

@export_group("Air")
@export var air_fog_density: float = 0.0012
@export var air_fog_color: Color = Color(0.62, 0.74, 0.86)

@export_group("Eau")
@export var surface_water_color: Color = Color(0.045, 0.30, 0.38)
@export var deep_water_color: Color = Color(0.004, 0.028, 0.07)
@export var water_visibility: float = 48.0

var sun: DirectionalLight3D
var moon: DirectionalLight3D
var environment: Environment
var sky_material: ShaderMaterial
var post_material: ShaderMaterial
var post_quad: MeshInstance3D

var ocean: Ocean
var camera: Camera3D

var submersion: float = 0.0                   # 0 = a l'air, 1 = immerge
var camera_depth: float = 0.0                 # metres sous la surface
var sun_direction: Vector3 = Vector3.UP
var damage_flash: float = 0.0

var _ambient_air: AudioStreamPlayer
var _ambient_water: AudioStreamPlayer
var _ambient_deep: AudioStreamPlayer

func _ready() -> void:
	_setup_lights()
	_setup_environment()
	_setup_post_process()
	_setup_ambience()
	Settings.quality_changed.connect(_on_quality_changed)

func bind(p_ocean: Ocean, p_camera: Camera3D) -> void:
	ocean = p_ocean
	camera = p_camera
	if post_quad != null and camera != null:
		# le quad de post-traitement voyage avec la camera
		if post_quad.get_parent() != camera:
			post_quad.reparent(camera, false)
		post_quad.position = Vector3(0, 0, -0.2)
		post_quad.rotation = Vector3.ZERO

# =============================================================================
#  Mise en place
# =============================================================================
func _setup_lights() -> void:
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 320.0
	sun.directional_shadow_split_1 = 0.05
	sun.directional_shadow_split_2 = 0.15
	sun.directional_shadow_split_3 = 0.42
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.035
	sun.shadow_normal_bias = 1.4
	sun.light_angular_distance = 0.53      # diametre apparent reel du Soleil
	sun.light_specular = 0.6
	add_child(sun)

	moon = DirectionalLight3D.new()
	moon.name = "Moon"
	moon.light_energy = 0.0
	moon.light_color = Color(0.55, 0.68, 0.95)
	moon.shadow_enabled = true
	moon.directional_shadow_max_distance = 160.0
	moon.light_angular_distance = 0.52
	add_child(moon)

func _setup_environment() -> void:
	sky_material = ShaderMaterial.new()
	sky_material.shader = SkyShader
	_apply_sky_quality()

	var sky := Sky.new()
	sky.sky_material = sky_material
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	sky.radiance_size = Sky.RADIANCE_SIZE_256

	environment = Environment.new()
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.ambient_light_sky_contribution = 1.0
	environment.ambient_light_energy = 1.0
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_SKY

	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_exposure = 1.0
	environment.tonemap_white = 6.0

	environment.glow_enabled = true
	environment.glow_intensity = 0.55
	environment.glow_bloom = 0.08
	environment.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	environment.glow_hdr_threshold = 1.1
	environment.set_glow_level(3, 1.0)
	environment.set_glow_level(4, 0.7)
	environment.set_glow_level(5, 0.4)

	environment.fog_enabled = true
	environment.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	environment.fog_light_color = air_fog_color
	environment.fog_density = air_fog_density
	environment.fog_sky_affect = 0.0
	environment.fog_aerial_perspective = 0.6

	environment.volumetric_fog_enabled = false
	environment.volumetric_fog_density = 0.008
	environment.volumetric_fog_gi_inject = 0.4
	environment.volumetric_fog_length = 128.0
	environment.volumetric_fog_detail_spread = 2.0

	environment.adjustment_enabled = true
	environment.adjustment_brightness = 1.0
	environment.adjustment_contrast = 1.03
	environment.adjustment_saturation = 1.05

	_apply_environment_quality()

	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	we.environment = environment
	add_child(we)

func _setup_post_process() -> void:
	post_material = ShaderMaterial.new()
	post_material.shader = UnderwaterShader
	post_material.render_priority = 120

	var quad := QuadMesh.new()
	quad.size = Vector2(2.0, 2.0)
	quad.flip_faces = false

	post_quad = MeshInstance3D.new()
	post_quad.name = "UnderwaterPost"
	post_quad.mesh = quad
	post_quad.material_override = post_material
	post_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	post_quad.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	# le quad est reprojete en coordonnees d'ecran par le shader : il ne doit
	# jamais etre elimine par le frustum
	post_quad.extra_cull_margin = 16384.0
	post_quad.custom_aabb = AABB(Vector3(-1e5, -1e5, -1e5), Vector3(2e5, 2e5, 2e5))
	add_child(post_quad)

func _setup_ambience() -> void:
	_ambient_air = SoundBank.make_looping_player("ambient_surface", self, -18.0)
	_ambient_water = SoundBank.make_looping_player("ambient_underwater", self, -60.0)
	_ambient_deep = SoundBank.make_looping_player("ambient_deep", self, -60.0)
	for p in [_ambient_air, _ambient_water, _ambient_deep]:
		if p.stream != null:
			p.play()

func _apply_sky_quality() -> void:
	if sky_material == null:
		return
	sky_material.set_shader_parameter("clouds_enabled", Settings.get_p(&"clouds", true))
	sky_material.set_shader_parameter("cloud_steps",
		int(Settings.get_p(&"cloud_steps", 36)))
	sky_material.set_shader_parameter("cloud_light_steps",
		int(Settings.get_p(&"cloud_light_steps", 5)))

func _apply_environment_quality() -> void:
	if environment == null:
		return
	environment.ssao_enabled = Settings.get_p(&"ssao", true)
	environment.ssao_radius = 1.4
	environment.ssao_intensity = 1.6
	environment.ssil_enabled = Settings.get_p(&"ssil", false)
	environment.ssr_enabled = Settings.get_p(&"ssr", true)
	environment.ssr_max_steps = 48
	environment.ssr_fade_in = 0.2
	environment.ssr_fade_out = 4.0
	if environment.sky != null:
		environment.sky.radiance_size = int(Settings.get_p(&"sky_radiance", 3)) \
			as Sky.RadianceSize
		environment.sky.process_mode = int(Settings.get_p(&"sky_process", 2)) \
			as Sky.ProcessMode

func _on_quality_changed(_level: int) -> void:
	_apply_sky_quality()
	_apply_environment_quality()

# =============================================================================
#  Boucle
# =============================================================================
func _process(delta: float) -> void:
	if time_scale_enabled and not GameState.paused:
		GameState.time_of_day = fposmod(
			GameState.time_of_day + delta / maxf(day_length, 1.0), 1.0)
	_update_sun(delta)
	if camera == null or not is_instance_valid(camera):
		return
	_update_submersion(delta)
	_update_environment(delta)
	_update_shaders()
	_update_ambience()

func _update_sun(_delta: float) -> void:
	var a := (GameState.time_of_day - 0.25) * TAU
	var dir := Vector3(0.0, sin(a), cos(a))
	# course inclinee : le soleil ne passe pas exactement au zenith
	dir = dir.rotated(Vector3.BACK, deg_to_rad(21.0)).rotated(Vector3.UP,
		deg_to_rad(38.0)).normalized()
	sun_direction = dir

	var elev := dir.y
	var up_ref := Vector3.UP if absf(dir.y) < 0.995 else Vector3.FORWARD
	sun.global_transform = Transform3D(Basis.looking_at(-dir, up_ref), Vector3.ZERO)

	# temperature de couleur : rouge rasant -> blanc au zenith
	var warm := Color(1.0, 0.42, 0.16)
	var noon := Color(1.0, 0.965, 0.92)
	var k: float = clampf(elev * 3.2, 0.0, 1.0)
	sun.light_color = warm.lerp(noon, sqrt(k))
	var energy: float = clampf(elev * 4.0 + 0.06, 0.0, 1.0)
	sun.light_energy = energy * 1.35
	sun.visible = energy > 0.001

	# la lune prend le relais, a l'oppose et bien plus faible
	var moon_dir := (-dir).rotated(Vector3.UP, deg_to_rad(24.0))
	moon.global_transform = Transform3D(
		Basis.looking_at(-moon_dir, Vector3.UP if absf(moon_dir.y) < 0.995
			else Vector3.FORWARD), Vector3.ZERO)
	moon.light_energy = clampf(moon_dir.y * 2.0, 0.0, 1.0) * 0.14 \
		* clampf(1.0 - elev * 6.0, 0.0, 1.0)
	moon.visible = moon.light_energy > 0.001
	if sky_material != null:
		sky_material.set_shader_parameter("moon_direction", moon_dir)

func _update_submersion(delta: float) -> void:
	var cam_pos := camera.global_position
	var surface := 0.0
	if ocean != null:
		surface = ocean.get_wave_height(cam_pos.x, cam_pos.z)
	camera_depth = maxf(surface - cam_pos.y, 0.0)
	# transition douce sur 24 cm : la moitie de la hauteur d'un masque
	var target: float = clampf((surface - cam_pos.y) / 0.24 + 0.5, 0.0, 1.0)
	submersion = move_toward(submersion, target, delta * 9.0)

func _update_environment(delta: float) -> void:
	var s := submersion
	var depth_t: float = clampf(camera_depth / 110.0, 0.0, 1.0)
	var water := surface_water_color.lerp(deep_water_color, depth_t)

	# --- brouillard ---------------------------------------------------------
	environment.fog_light_color = air_fog_color.lerp(water, s)
	var water_density: float = lerpf(0.020, 0.075, depth_t)
	environment.fog_density = lerpf(air_fog_density, water_density, s)
	environment.fog_sky_affect = lerpf(0.0, 1.0, s)
	environment.fog_aerial_perspective = lerpf(0.6, 0.0, s)
	environment.fog_light_energy = lerpf(1.0, lerpf(0.9, 0.15, depth_t), s)

	# --- brouillard volumetrique : c'est lui qui porte les rais de lumiere ---
	var want_volumetric: bool = bool(Settings.get_p(&"volumetric_fog", true)) and s > 0.05
	environment.volumetric_fog_enabled = want_volumetric
	if want_volumetric:
		environment.volumetric_fog_density = lerpf(0.012, 0.055, depth_t) * s
		environment.volumetric_fog_albedo = water.lightened(0.25)
		environment.volumetric_fog_emission = water * 0.12
		environment.volumetric_fog_emission_energy = lerpf(0.6, 0.05, depth_t)
		environment.volumetric_fog_anisotropy = 0.35
		environment.volumetric_fog_length = lerpf(120.0, 60.0, depth_t)

	# --- lumiere ambiante ----------------------------------------------------
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY if s < 0.5 \
		else Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = water.lightened(0.15)
	environment.ambient_light_energy = lerpf(1.0, lerpf(0.85, 0.05, depth_t), s)
	environment.ambient_light_sky_contribution = lerpf(1.0, 0.0, s)

	# le soleil perd sa puissance en profondeur (loi de Beer sur l'eclairement)
	var under_atten: float = exp(-camera_depth * 0.022)
	sun.light_energy = sun.light_energy * lerpf(1.0, under_atten, s)
	sun.light_specular = lerpf(0.6, 0.15, s)

	# --- etalonnage ----------------------------------------------------------
	environment.adjustment_saturation = lerpf(1.05, lerpf(0.95, 0.6, depth_t), s)
	environment.adjustment_contrast = lerpf(1.03, 1.12, s)
	environment.glow_intensity = lerpf(0.55, 0.9, s)

	damage_flash = move_toward(damage_flash, 0.0, delta * 1.6)

func _update_shaders() -> void:
	var cam_pos := camera.global_position
	var water_level := 0.0
	if ocean != null:
		water_level = ocean.get_wave_height(cam_pos.x, cam_pos.z)
		ocean.material.set_shader_parameter("sun_direction", sun_direction)
		ocean.material.set_shader_parameter("sun_color", sun.light_color)
		ocean.material.set_shader_parameter("sun_energy", maxf(sun.light_energy, 0.02))
		ocean.material.set_shader_parameter("underwater_view", submersion)
		var depth_t: float = clampf(camera_depth / 110.0, 0.0, 1.0)
		ocean.material.set_shader_parameter("underwater_fog_color",
			surface_water_color.lerp(deep_water_color, depth_t))

	# position du soleil a l'ecran pour les rais de lumiere
	var sun_uv := Vector2(0.5, -1.0)
	var visible_sun := 0.0
	if sun_direction.y > -0.05:
		var world_sun := cam_pos + sun_direction * 800.0
		if not camera.is_position_behind(world_sun):
			var sp := camera.unproject_position(world_sun)
			var vp := camera.get_viewport().get_visible_rect().size
			sun_uv = sp / maxf(vp.x, 1.0) * Vector2(1.0, vp.x / maxf(vp.y, 1.0))
			sun_uv = Vector2(sp.x / vp.x, sp.y / vp.y)
			visible_sun = clampf(sun_direction.y * 3.0, 0.0, 1.0)

	var depth_t2: float = clampf(camera_depth / 110.0, 0.0, 1.0)
	post_material.set_shader_parameter("water_level", water_level)
	post_material.set_shader_parameter("submersion", submersion)
	post_material.set_shader_parameter("depth_below", camera_depth)
	post_material.set_shader_parameter("water_color", surface_water_color)
	post_material.set_shader_parameter("deep_water_color", deep_water_color)
	post_material.set_shader_parameter("visibility",
		lerpf(water_visibility, water_visibility * 0.55, depth_t2))
	post_material.set_shader_parameter("sun_screen_pos", sun_uv)
	post_material.set_shader_parameter("sun_visible", visible_sun)
	post_material.set_shader_parameter("godray_strength",
		float(Settings.get_p(&"godrays", 0.85)) * (1.0 - depth_t2 * 0.8))
	post_material.set_shader_parameter("caustics_strength",
		float(Settings.get_p(&"caustics", 1.4)) * exp(-camera_depth * 0.012))
	post_material.set_shader_parameter("damage_flash", damage_flash)

func _update_ambience() -> void:
	var depth_t: float = clampf(camera_depth / 90.0, 0.0, 1.0)
	var vol := Settings.master_volume
	_ambient_air.volume_db = linear_to_db(maxf((1.0 - submersion) * 0.28 * vol, 0.0001))
	_ambient_water.volume_db = linear_to_db(
		maxf(submersion * (1.0 - depth_t) * 0.5 * vol, 0.0001))
	_ambient_deep.volume_db = linear_to_db(maxf(submersion * depth_t * 0.6 * vol, 0.0001))

func flash_damage(amount: float = 1.0) -> void:
	damage_flash = clampf(damage_flash + amount, 0.0, 1.0)

func is_underwater() -> bool:
	return submersion > 0.5

func light_level() -> float:
	## 0 = nuit noire au fond, 1 = plein soleil en surface
	return clampf(maxf(sun_direction.y, 0.0) * exp(-camera_depth * 0.02), 0.0, 1.0)
