extends Node
## Reglages graphiques et confort. Trois profils, applicables a chaud.
## Le rendu du ciel et les post-traitements sont les plus couteux : ce sont eux
## qui varient le plus entre les profils.

signal quality_changed(level: int)
signal setting_changed(key: StringName, value: Variant)

enum Quality { PERFORMANCE, BALANCED, ULTRA }

const CONFIG_PATH := "user://settings.cfg"

var quality: int = Quality.BALANCED
var mouse_sensitivity: float = 0.0022
var invert_y: bool = false
var fov: float = 78.0
var head_bob: float = 1.0
var motion_blur: bool = false
var master_volume: float = 0.9

## Parametres derives du profil de qualite.
var profile: Dictionary = {}

const PROFILES := {
	Quality.PERFORMANCE: {
		"render_scale": 0.8,
		"taa": false,
		"msaa": 0,
		"shadow_size": 2048,
		"sky_process": 2,        # Sky.PROCESS_MODE_INCREMENTAL
		"sky_radiance": 2,       # RADIANCE_SIZE_128
		"cloud_steps": 18,
		"cloud_light_steps": 3,
		"clouds": true,
		"ssao": false,
		"ssil": false,
		"ssr": false,
		"volumetric_fog": false,
		"godrays": 0.5,
		"caustics": 1.0,
		"ocean_near_res": 128,
		"ocean_far_rings": 40,
		"terrain_view_distance": 320.0,
		"fish_schools": 6,
		"kelp_density": 0.5,
		"sdfgi": false,
	},
	Quality.BALANCED: {
		"render_scale": 1.0,
		"taa": true,
		"msaa": 1,
		"shadow_size": 4096,
		"sky_process": 2,
		"sky_radiance": 3,        # RADIANCE_SIZE_256
		"cloud_steps": 36,
		"cloud_light_steps": 5,
		"clouds": true,
		"ssao": true,
		"ssil": false,
		"ssr": true,
		"volumetric_fog": true,
		"godrays": 0.85,
		"caustics": 1.4,
		"ocean_near_res": 220,
		"ocean_far_rings": 72,
		"terrain_view_distance": 520.0,
		"fish_schools": 12,
		"kelp_density": 1.0,
		"sdfgi": false,
	},
	Quality.ULTRA: {
		"render_scale": 1.0,
		"taa": true,
		"msaa": 2,
		"shadow_size": 8192,
		"sky_process": 1,         # PROCESS_MODE_HIGH_QUALITY
		"sky_radiance": 4,        # RADIANCE_SIZE_512
		"cloud_steps": 64,
		"cloud_light_steps": 7,
		"clouds": true,
		"ssao": true,
		"ssil": true,
		"ssr": true,
		"volumetric_fog": true,
		"godrays": 1.1,
		"caustics": 1.8,
		"ocean_near_res": 300,
		"ocean_far_rings": 110,
		"terrain_view_distance": 760.0,
		"fish_schools": 20,
		"kelp_density": 1.5,
		"sdfgi": false,
	},
}

func _ready() -> void:
	load_settings()
	_apply_profile()

func get_p(key: StringName, fallback: Variant = null) -> Variant:
	return profile.get(key, fallback)

func set_quality(level: int) -> void:
	quality = clampi(level, 0, 2)
	_apply_profile()
	save_settings()
	quality_changed.emit(quality)

func cycle_quality() -> void:
	set_quality((quality + 1) % 3)

func quality_name() -> String:
	match quality:
		Quality.PERFORMANCE: return "Performance"
		Quality.ULTRA: return "Ultra"
		_: return "Equilibre"

func _apply_profile() -> void:
	profile = PROFILES[quality].duplicate()
	var vp := get_viewport()
	if vp is Window:
		var w := vp as Window
		w.scaling_3d_scale = profile["render_scale"]
		w.use_taa = profile["taa"]
		w.msaa_3d = profile["msaa"] as Viewport.MSAA
		w.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED if profile["taa"] \
			else Viewport.SCREEN_SPACE_AA_FXAA
	RenderingServer.directional_shadow_atlas_set_size(profile["shadow_size"], true)

func set_value(key: StringName, value: Variant) -> void:
	set(String(key), value)
	setting_changed.emit(key, value)
	save_settings()

func save_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("video", "quality", quality)
	cfg.set_value("video", "fov", fov)
	cfg.set_value("video", "motion_blur", motion_blur)
	cfg.set_value("input", "mouse_sensitivity", mouse_sensitivity)
	cfg.set_value("input", "invert_y", invert_y)
	cfg.set_value("input", "head_bob", head_bob)
	cfg.set_value("audio", "master_volume", master_volume)
	cfg.save(CONFIG_PATH)

func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		return
	quality = cfg.get_value("video", "quality", quality)
	fov = cfg.get_value("video", "fov", fov)
	motion_blur = cfg.get_value("video", "motion_blur", motion_blur)
	mouse_sensitivity = cfg.get_value("input", "mouse_sensitivity", mouse_sensitivity)
	invert_y = cfg.get_value("input", "invert_y", invert_y)
	head_bob = cfg.get_value("input", "head_bob", head_bob)
	master_volume = cfg.get_value("audio", "master_volume", master_volume)
