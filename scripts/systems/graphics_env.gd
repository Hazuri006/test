extends WorldEnvironment
## GraphicsEnvironment -- node "WorldEnvironment" in the world scene.
##
## Builds the whole look of the game in code so quality can be rebuilt at any
## time from the options menu without reloading the level:
##   procedural sky shader, ACES tonemapping, glow, SSAO, SSIL, SSR,
##   SDFGI and volumetric fog (high quality only), depth fog, colour grading.
##
## Quality levels (GameState "graphics_quality"):
##   0 low     - no SSAO/SSR/SDFGI/volumetrics, cheap glow
##   1 medium  - SSAO, glow, depth fog
##   2 high    - + SSR, SSIL, SDFGI
##   3 ultra   - + volumetric fog, higher SDFGI/SSAO quality
##
## Scene requirements: WorldEnvironment node with this script. The DirectionalLight
## must be a sibling named "Sun" for the sky shader to receive its direction.
##
## Inspector parameters: exposure, glow_strength, fog_density, saturation,
## contrast, sky_zenith, sky_horizon.

@export var exposure: float = 1.0
@export var glow_strength: float = 0.85
@export var glow_bloom: float = 0.22
@export var fog_density: float = 0.0022
@export var saturation: float = 1.12
@export var contrast: float = 1.06
@export var brightness: float = 1.0
@export var sky_zenith: Color = Color(0.16, 0.40, 0.82)
@export var sky_horizon: Color = Color(0.74, 0.86, 0.98)

var sky_material: ShaderMaterial

func _ready() -> void:
	build_environment()
	Events.settings_applied.connect(_on_settings_applied)

func _on_settings_applied() -> void:
	build_environment()

func build_environment() -> void:
	var quality: int = int(GameState.get_setting("graphics_quality"))
	var env := Environment.new()

	# --- sky ----------------------------------------------------------------
	sky_material = ShaderMaterial.new()
	sky_material.shader = load(BrickKit.SKY_SHADER) as Shader
	sky_material.set_shader_parameter("zenith_color", sky_zenith)
	sky_material.set_shader_parameter("horizon_color", sky_horizon)
	sky_material.set_shader_parameter("cloud_coverage", 0.46)
	sky_material.set_shader_parameter("cloud_scale", 2.2)
	sky_material.set_shader_parameter("night_blend", 0.0)
	var sky := Sky.new()
	sky.sky_material = sky_material
	sky.radiance_size = Sky.RADIANCE_SIZE_128 if quality >= 2 else Sky.RADIANCE_SIZE_64
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	env.background_mode = Environment.BG_SKY
	env.sky = sky

	# --- ambient / reflections ---------------------------------------------
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 1.0
	env.ambient_light_energy = 1.0
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY

	# --- tonemap + grading --------------------------------------------------
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = exposure
	env.tonemap_white = 6.0
	env.adjustment_enabled = true
	env.adjustment_brightness = brightness
	env.adjustment_contrast = contrast
	env.adjustment_saturation = saturation

	# --- glow: the neon signs and window highlights live or die here --------
	env.glow_enabled = true
	env.glow_intensity = glow_strength
	env.glow_bloom = glow_bloom
	env.glow_strength = 1.0
	env.glow_hdr_threshold = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	# Glow levels are indexed properties in Godot 4 ("glow_levels/1" ... "/7").
	env.set("glow_levels/1", 0.0)
	env.set("glow_levels/2", 0.4)
	env.set("glow_levels/3", 0.9)
	env.set("glow_levels/4", 0.6)
	env.set("glow_levels/5", 0.3)

	# --- ambient occlusion --------------------------------------------------
	if quality >= 1:
		env.ssao_enabled = true
		env.ssao_radius = 1.8
		env.ssao_intensity = 2.2 if quality >= 2 else 1.6
		env.ssao_power = 1.5
		env.ssao_detail = 0.6
		env.ssao_light_affect = 0.15
	else:
		env.ssao_enabled = false

	# --- screen-space reflections (glass towers) ---------------------------
	env.ssr_enabled = quality >= 2
	if env.ssr_enabled:
		env.ssr_max_steps = 48 if quality >= 3 else 28
		env.ssr_fade_in = 0.2
		env.ssr_fade_out = 4.0
		env.ssr_depth_tolerance = 0.3
	env.ssil_enabled = quality >= 3
	if env.ssil_enabled:
		env.ssil_radius = 4.0
		env.ssil_intensity = 0.8

	# --- global illumination ------------------------------------------------
	if quality >= 2:
		env.sdfgi_enabled = true
		env.sdfgi_use_occlusion = quality >= 3
		env.sdfgi_cascades = 4 if quality >= 3 else 3
		env.sdfgi_min_cell_size = 0.4
		env.sdfgi_energy = 1.0
		env.sdfgi_bounce_feedback = 0.5
	else:
		env.sdfgi_enabled = false

	# --- fog: distance haze makes the skyline read as huge ------------------
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = Color(0.68, 0.78, 0.92)
	env.fog_light_energy = 1.0
	env.fog_sun_scatter = 0.25
	env.fog_density = fog_density
	env.fog_sky_affect = 0.35
	env.fog_height = 0.0
	env.fog_height_density = 0.0
	env.fog_depth_begin = 60.0
	env.fog_depth_end = 900.0
	env.fog_depth_curve = 0.8

	# --- volumetric fog: god rays through the streets ----------------------
	if quality >= 3:
		env.volumetric_fog_enabled = true
		env.volumetric_fog_density = 0.012
		env.volumetric_fog_albedo = Color(0.85, 0.9, 1.0)
		env.volumetric_fog_emission_energy = 0.0
		env.volumetric_fog_gi_inject = 0.6
		env.volumetric_fog_length = 160.0
		env.volumetric_fog_detail_spread = 2.0
	else:
		env.volumetric_fog_enabled = false

	environment = env

	# --- camera post-effects ------------------------------------------------
	var attributes := CameraAttributesPractical.new()
	attributes.dof_blur_far_enabled = quality >= 2
	attributes.dof_blur_far_distance = 320.0
	attributes.dof_blur_far_transition = 120.0
	attributes.dof_blur_amount = 0.06
	attributes.auto_exposure_enabled = false
	camera_attributes = attributes

## Called by DayNightCycle so the sky matches the sun.
func set_sky_params(night_blend: float, zenith: Color, horizon: Color, stars: float) -> void:
	if sky_material == null:
		return
	sky_material.set_shader_parameter("night_blend", night_blend)
	sky_material.set_shader_parameter("zenith_color", zenith)
	sky_material.set_shader_parameter("horizon_color", horizon)
	sky_material.set_shader_parameter("star_amount", stars)
	if environment != null:
		environment.fog_light_color = horizon.lerp(Color(0.06, 0.08, 0.16), night_blend)
		environment.ambient_light_energy = lerpf(1.0, 0.45, night_blend)
