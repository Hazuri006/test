class_name MaterialLibrary
extends RefCounted
## Static factory of cached PBR materials for the procedural fallback environment.
##
## Materials are cached by key so the whole hospital reuses a small palette of
## StandardMaterial3D instances (an explicit optimisation: fewer unique materials
## means fewer state changes / draw calls). A single shared procedural detail
## normal map adds surface break-up without shipping any external textures, so the
## project never produces a missing-resource error.

static var _cache: Dictionary = {}
static var _detail_normal: Texture2D = null

## Lazily builds (once) a tiling procedural normal map used as a detail normal on
## large surfaces so flat boxes read as rough plaster/concrete.
static func _get_detail_normal() -> Texture2D:
	if _detail_normal != null:
		return _detail_normal
	var noise: FastNoiseLite = FastNoiseLite.new()
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	noise.frequency = 0.045
	noise.fractal_octaves = 4
	var tex: NoiseTexture2D = NoiseTexture2D.new()
	tex.width = 256
	tex.height = 256
	tex.seamless = true
	tex.as_normal_map = true
	tex.bump_strength = 2.5
	tex.noise = noise
	_detail_normal = tex
	return _detail_normal

## Core builder. Returns a cached material for `key`; creates it from the supplied
## parameters on first request. All later requests with the same key reuse it.
static func get_material(
		key: String,
		albedo: Color,
		roughness: float,
		metallic: float = 0.0,
		use_detail: bool = true) -> StandardMaterial3D:
	if _cache.has(key):
		return _cache[key] as StandardMaterial3D
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = albedo
	mat.roughness = clampf(roughness, 0.0, 1.0)
	mat.metallic = clampf(metallic, 0.0, 1.0)
	mat.metallic_specular = 0.5
	if use_detail:
		mat.normal_enabled = true
		mat.normal_scale = 0.6
		mat.normal_texture = _get_detail_normal()
		mat.uv1_triplanar = true
		mat.uv1_scale = Vector3(0.35, 0.35, 0.35)
	_cache[key] = mat
	return mat

## Builds (and caches) an unshaded/emissive material for screens, signage and lamps.
static func get_emissive(key: String, color: Color, energy: float) -> StandardMaterial3D:
	if _cache.has(key):
		return _cache[key] as StandardMaterial3D
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = energy
	mat.roughness = 0.4
	_cache[key] = mat
	return mat

## Builds (and caches) a translucent material for glass and grime.
static func get_glass(key: String, color: Color) -> StandardMaterial3D:
	if _cache.has(key):
		return _cache[key] as StandardMaterial3D
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.05
	mat.metallic = 0.0
	mat.refraction_enabled = false
	_cache[key] = mat
	return mat

# --- Named palette helpers used by the environment builders ------------------

static func concrete_wall() -> StandardMaterial3D:
	return get_material("concrete_wall", Color(0.34, 0.34, 0.33), 0.92, 0.0)

static func dirty_concrete() -> StandardMaterial3D:
	return get_material("dirty_concrete", Color(0.22, 0.22, 0.20), 0.95, 0.0)

static func peeling_paint() -> StandardMaterial3D:
	return get_material("peeling_paint", Color(0.46, 0.47, 0.43), 0.85, 0.0)

static func floor_tile() -> StandardMaterial3D:
	return get_material("floor_tile", Color(0.30, 0.31, 0.30), 0.55, 0.0)

static func wet_tile() -> StandardMaterial3D:
	return get_material("wet_tile", Color(0.20, 0.22, 0.23), 0.18, 0.0)

static func ceiling() -> StandardMaterial3D:
	return get_material("ceiling", Color(0.40, 0.40, 0.38), 0.9, 0.0)

static func rusted_metal() -> StandardMaterial3D:
	return get_material("rusted_metal", Color(0.33, 0.22, 0.16), 0.72, 0.85)

static func painted_metal() -> StandardMaterial3D:
	return get_material("painted_metal", Color(0.18, 0.30, 0.32), 0.55, 0.7)

static func old_wood() -> StandardMaterial3D:
	return get_material("old_wood", Color(0.24, 0.16, 0.10), 0.78, 0.0)

static func bed_sheet() -> StandardMaterial3D:
	return get_material("bed_sheet", Color(0.55, 0.54, 0.50), 0.9, 0.0)

static func blood() -> StandardMaterial3D:
	return get_material("blood", Color(0.18, 0.02, 0.02), 0.35, 0.0, false)

static func forest_ground() -> StandardMaterial3D:
	return get_material("forest_ground", Color(0.12, 0.11, 0.08), 0.95, 0.0)

static func bark() -> StandardMaterial3D:
	return get_material("bark", Color(0.10, 0.08, 0.06), 0.9, 0.0)

static func foliage() -> StandardMaterial3D:
	var mat: StandardMaterial3D = get_material("foliage", Color(0.06, 0.10, 0.05), 0.85, 0.0, false)
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat

static func rock() -> StandardMaterial3D:
	return get_material("rock", Color(0.16, 0.16, 0.17), 0.88, 0.0)

static func monitor_screen() -> StandardMaterial3D:
	return get_emissive("monitor_screen", Color(0.10, 0.18, 0.14), 1.6)

static func lamp_on() -> StandardMaterial3D:
	return get_emissive("lamp_on", Color(0.85, 0.85, 0.78), 3.0)

static func lamp_off() -> StandardMaterial3D:
	return get_material("lamp_off", Color(0.6, 0.6, 0.58), 0.5, 0.0, false)

static func monster_skin() -> StandardMaterial3D:
	return get_material("monster_skin", Color(0.14, 0.13, 0.12), 0.65, 0.0, false)

static func monster_uniform() -> StandardMaterial3D:
	return get_material("monster_uniform", Color(0.20, 0.21, 0.20), 0.8, 0.0, false)

## Clears the cache. Only used by tooling/tests; the running game never needs it.
static func clear_cache() -> void:
	_cache.clear()
	_detail_normal = null
