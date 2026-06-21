extends Node
## Loads, stores and applies all user settings (gameplay, controls, audio,
## graphics, accessibility). Persists to user://settings.cfg and re-applies on
## launch. Registered as the `SettingsManager` autoload.

signal settings_changed(section: String, key: String, value: Variant)
signal settings_applied()

const SETTINGS_PATH: String = "user://settings.cfg"

## Bus names, also created by AudioManager. Index 0 is Master.
const AUDIO_KEYS: PackedStringArray = [
	"master_volume", "music_volume", "effects_volume", "voice_volume", "ambience_volume",
]

## Nested defaults. Every persisted key MUST have a default here so loading an old
## or partial config never yields an untyped/None value.
var _defaults: Dictionary = {
	"gameplay": {
		"difficulty": GameTypes.Difficulty.NORMAL,
		"subtitles": true,
		"subtitle_size": 1,
		"interaction_prompts": true,
		"head_bob": true,
		"camera_shake": true,
		"detection_indicator": true,
		"objective_hints": true,
		"hold_to_sprint": true,
		"hold_to_crouch": true,
		"brightness": 1.0,
		"vhs": true,
	},
	"controls": {
		"mouse_sensitivity": 1.0,
		"invert_y": false,
	},
	"audio": {
		"master_volume": 0.9,
		"music_volume": 0.7,
		"effects_volume": 0.9,
		"voice_volume": 1.0,
		"ambience_volume": 0.8,
	},
	"graphics": {
		"preset": "medium",
		"display_mode": 0,
		"vsync": 1,
		"frame_limit": 60,
		"render_scale": 1.0,
		"shadow_quality": 2,
		"fog_quality": 2,
		"ssao": true,
		"reflections": true,
		"anti_aliasing": 1,
		"texture_filter": 2,
	},
}

## Live working copy of all settings.
var _values: Dictionary = {}

func _ready() -> void:
	_values = _deep_duplicate(_defaults)
	load_settings()

# --- Persistence -------------------------------------------------------------

func load_settings() -> void:
	var config: ConfigFile = ConfigFile.new()
	var err: Error = config.load(SETTINGS_PATH)
	if err != OK:
		GameLog.info("No settings file found; writing defaults.")
		save_settings()
		return
	for section: String in _defaults.keys():
		var defaults_section: Dictionary = _defaults[section]
		for key: String in defaults_section.keys():
			if config.has_section_key(section, key):
				var fallback: Variant = defaults_section[key]
				var raw: Variant = config.get_value(section, key, fallback)
				(_values[section] as Dictionary)[key] = _coerce_like(raw, fallback)
	GameLog.info("Settings loaded.")

func save_settings() -> void:
	var config: ConfigFile = ConfigFile.new()
	for section: String in _values.keys():
		var section_dict: Dictionary = _values[section]
		for key: String in section_dict.keys():
			config.set_value(section, key, section_dict[key])
	var err: Error = config.save(SETTINGS_PATH)
	if err != OK:
		GameLog.error("Failed to save settings (error %d)." % err)

# --- Access ------------------------------------------------------------------

func get_value(section: String, key: String, fallback: Variant = null) -> Variant:
	if _values.has(section):
		var section_dict: Dictionary = _values[section]
		if section_dict.has(key):
			return section_dict[key]
	if fallback != null:
		return fallback
	if _defaults.has(section) and (_defaults[section] as Dictionary).has(key):
		return (_defaults[section] as Dictionary)[key]
	return null

func set_value(section: String, key: String, value: Variant) -> void:
	if not _values.has(section):
		_values[section] = {}
	(_values[section] as Dictionary)[key] = value
	settings_changed.emit(section, key, value)
	if section == "audio":
		_apply_audio_key(key)
	save_settings()

# --- Typed convenience getters ----------------------------------------------

func get_bool(section: String, key: String) -> bool:
	return bool(get_value(section, key, false))

func get_int(section: String, key: String) -> int:
	return int(get_value(section, key, 0))

func get_float(section: String, key: String) -> float:
	return float(get_value(section, key, 0.0))

func get_string(section: String, key: String) -> String:
	return str(get_value(section, key, ""))

func mouse_sensitivity() -> float:
	return get_float("controls", "mouse_sensitivity")

func invert_y() -> bool:
	return get_bool("controls", "invert_y")

func head_bob_enabled() -> bool:
	return get_bool("gameplay", "head_bob")

func camera_shake_enabled() -> bool:
	return get_bool("gameplay", "camera_shake")

func subtitles_enabled() -> bool:
	return get_bool("gameplay", "subtitles")

func prompts_enabled() -> bool:
	return get_bool("gameplay", "interaction_prompts")

func detection_indicator_enabled() -> bool:
	return get_bool("gameplay", "detection_indicator")

func objective_hints_enabled() -> bool:
	return get_bool("gameplay", "objective_hints")

func difficulty() -> int:
	return get_int("gameplay", "difficulty")

# --- Application -------------------------------------------------------------

func apply_all() -> void:
	apply_audio()
	apply_window()
	apply_graphics()
	apply_keybinds()
	settings_applied.emit()

## Reapplies any persisted key rebinds (stored as controls/key_<action> = keycode).
func apply_keybinds() -> void:
	var controls: Dictionary = _values.get("controls", {})
	for key: Variant in controls.keys():
		var key_str: String = str(key)
		if not key_str.begins_with("key_"):
			continue
		var action: String = key_str.substr(4)
		if not InputMap.has_action(action):
			continue
		var keycode: int = int(controls[key])
		if keycode <= 0:
			continue
		InputMap.action_erase_events(action)
		var ev: InputEventKey = InputEventKey.new()
		ev.physical_keycode = keycode as Key
		InputMap.action_add_event(action, ev)

func apply_audio() -> void:
	for key: String in AUDIO_KEYS:
		_apply_audio_key(key)

func _apply_audio_key(key: String) -> void:
	var bus_name: String = _bus_name_for(key)
	var bus_index: int = AudioServer.get_bus_index(bus_name)
	if bus_index < 0:
		return
	var linear: float = clampf(get_float("audio", key), 0.0, 1.0)
	AudioServer.set_bus_volume_db(bus_index, linear_to_db(maxf(linear, 0.0001)))
	AudioServer.set_bus_mute(bus_index, linear <= 0.001)

func _bus_name_for(key: String) -> String:
	match key:
		"master_volume": return "Master"
		"music_volume": return "Music"
		"effects_volume": return "SFX"
		"voice_volume": return "Voice"
		"ambience_volume": return "Ambience"
		_: return "Master"

func apply_window() -> void:
	if not is_inside_tree():
		return
	var mode: int = get_int("graphics", "display_mode")
	match mode:
		0:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, false)
		1:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		2:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, true)
	var vsync: int = get_int("graphics", "vsync")
	DisplayServer.window_set_vsync_mode(vsync as DisplayServer.VSyncMode)
	Engine.max_fps = maxi(get_int("graphics", "frame_limit"), 0)

func apply_graphics() -> void:
	if not is_inside_tree():
		return
	var viewport: Viewport = get_viewport()
	if viewport == null:
		return
	viewport.scaling_3d_scale = clampf(get_float("graphics", "render_scale"), 0.5, 1.0)

	var aa: int = get_int("graphics", "anti_aliasing")
	match aa:
		0:
			viewport.msaa_3d = Viewport.MSAA_DISABLED
			viewport.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
		1:
			viewport.msaa_3d = Viewport.MSAA_DISABLED
			viewport.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA
		2:
			viewport.msaa_3d = Viewport.MSAA_2X
			viewport.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
		3:
			viewport.msaa_3d = Viewport.MSAA_4X
			viewport.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED

	var shadow_quality: int = get_int("graphics", "shadow_quality")
	var atlas_sizes: PackedInt32Array = [1024, 2048, 4096, 8192]
	viewport.positional_shadow_atlas_size = atlas_sizes[clampi(shadow_quality, 0, 3)]

	var filter: int = get_int("graphics", "texture_filter")
	var anisotropy: Array[int] = [
		Viewport.ANISOTROPY_DISABLED,
		Viewport.ANISOTROPY_2X,
		Viewport.ANISOTROPY_4X,
		Viewport.ANISOTROPY_8X,
		Viewport.ANISOTROPY_16X,
	]
	viewport.anisotropic_filtering_level = anisotropy[clampi(filter, 0, 4)] as Viewport.AnisotropicFiltering

## Applies a named quality preset by writing the relevant graphics keys.
func apply_preset(preset: String) -> void:
	var p: Dictionary = {}
	match preset:
		"low":
			p = {"render_scale": 0.75, "shadow_quality": 0, "fog_quality": 0,
				"ssao": false, "reflections": false, "anti_aliasing": 1, "texture_filter": 1}
		"medium":
			p = {"render_scale": 0.9, "shadow_quality": 2, "fog_quality": 1,
				"ssao": true, "reflections": false, "anti_aliasing": 1, "texture_filter": 2}
		"high":
			p = {"render_scale": 1.0, "shadow_quality": 2, "fog_quality": 2,
				"ssao": true, "reflections": true, "anti_aliasing": 2, "texture_filter": 3}
		"ultra":
			p = {"render_scale": 1.0, "shadow_quality": 3, "fog_quality": 3,
				"ssao": true, "reflections": true, "anti_aliasing": 3, "texture_filter": 4}
		_:
			return
	for key: String in p.keys():
		(_values["graphics"] as Dictionary)[key] = p[key]
	(_values["graphics"] as Dictionary)["preset"] = preset
	save_settings()
	apply_graphics()
	settings_changed.emit("graphics", "preset", preset)

func reset_to_defaults() -> void:
	_values = _deep_duplicate(_defaults)
	save_settings()
	apply_all()

# --- Helpers -----------------------------------------------------------------

## Coerces a loaded value to the same primitive type as its default, guarding
## against type drift between config versions.
func _coerce_like(raw: Variant, like: Variant) -> Variant:
	match typeof(like):
		TYPE_BOOL: return bool(raw)
		TYPE_INT: return int(raw)
		TYPE_FLOAT: return float(raw)
		TYPE_STRING: return str(raw)
		_: return raw

func _deep_duplicate(src: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for k: Variant in src.keys():
		var v: Variant = src[k]
		if v is Dictionary:
			out[k] = _deep_duplicate(v as Dictionary)
		else:
			out[k] = v
	return out
