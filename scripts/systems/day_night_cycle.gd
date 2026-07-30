extends DirectionalLight3D
## DayNightCycle -- node "Sun" in the world scene.
##
## Drives a cheap, good-looking day cycle: sun angle, colour and energy, sky
## tint, and the switch that turns the city's street lamps and window lights on
## at dusk. The whole cycle is one lerp over a normalised time of day, so it
## costs nothing per frame.
##
## Time of day: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
## The game starts at 0.34 -- bright late morning, the best light for the city.
##
## Scene requirements: DirectionalLight3D named "Sun", sibling of the
## WorldEnvironment (which must run graphics_env.gd).
##
## Inspector parameters: enabled, day_length, start_time, night_light_threshold.

@export var enabled: bool = true
@export var day_length: float = 900.0          ## seconds for a full 24 h cycle
@export var start_time: float = 0.34
@export var night_light_threshold: float = 0.14  ## sun height below which lamps go on
@export var sun_energy_day: float = 1.5
@export var moon_energy: float = 0.18

const DAY_SUN := Color(1.0, 0.96, 0.88)
const GOLDEN := Color(1.0, 0.72, 0.42)
const NIGHT_SUN := Color(0.55, 0.68, 1.0)
const ZENITH_DAY := Color(0.16, 0.40, 0.82)
const ZENITH_DUSK := Color(0.26, 0.24, 0.52)
const HORIZON_DAY := Color(0.74, 0.86, 0.98)
const HORIZON_DUSK := Color(0.98, 0.62, 0.36)

var time_of_day: float = 0.34
var is_night: bool = false

var _env: Node = null
var _streamer: Node = null

func _ready() -> void:
	time_of_day = start_time
	shadow_enabled = true
	directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	directional_shadow_max_distance = 260.0
	directional_shadow_split_1 = 0.06
	directional_shadow_split_2 = 0.16
	directional_shadow_split_3 = 0.42
	directional_shadow_blend_splits = true
	directional_shadow_fade_start = 0.85
	shadow_normal_bias = 1.4
	shadow_bias = 0.06
	shadow_blur = 1.1
	light_angular_distance = 0.6      # softer contact shadows, sunlike
	sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_AND_SKY

	_env = get_parent().get_node_or_null("WorldEnvironment")
	_streamer = get_parent().get_node_or_null("Streamer")
	_apply(true)

func _process(delta: float) -> void:
	if not enabled or not bool(GameState.get_setting("day_night_enabled")):
		return
	if GameState.paused:
		return
	time_of_day = fposmod(time_of_day + delta / maxf(day_length, 1.0), 1.0)
	_apply(false)

func set_time_of_day(value: float) -> void:
	time_of_day = fposmod(value, 1.0)
	_apply(true)

func _apply(force: bool) -> void:
	# --- sun direction ------------------------------------------------------
	# The sun rises in the east (+X), peaks in the south, sets in the west.
	var angle: float = (time_of_day - 0.25) * TAU
	var height: float = sin(angle)
	var horizontal: float = cos(angle)
	var dir := Vector3(-horizontal, -maxf(height, -1.0), -0.35).normalized()
	look_at_from_position(global_position, global_position + dir, Vector3.UP)

	# --- colour + energy ----------------------------------------------------
	var day_amount: float = clampf(height * 2.4, 0.0, 1.0)
	var dusk_amount: float = clampf(1.0 - absf(height) * 4.0, 0.0, 1.0)
	var sun_color: Color = DAY_SUN.lerp(GOLDEN, dusk_amount)
	var night_amount: float = clampf(-height * 3.0, 0.0, 1.0)
	if height < 0.0:
		sun_color = GOLDEN.lerp(NIGHT_SUN, night_amount)
	light_color = sun_color
	light_energy = maxf(sun_energy_day * day_amount, moon_energy)
	shadow_enabled = light_energy > 0.25

	# --- sky ----------------------------------------------------------------
	var night_blend: float = clampf(-height * 2.2 + 0.15, 0.0, 1.0)
	var zenith: Color = ZENITH_DAY.lerp(ZENITH_DUSK, dusk_amount)
	var horizon: Color = HORIZON_DAY.lerp(HORIZON_DUSK, dusk_amount)
	if _env != null and _env.has_method("set_sky_params"):
		_env.call("set_sky_params", night_blend, zenith, horizon, night_blend)

	# --- city lights --------------------------------------------------------
	var want_night: bool = height < night_light_threshold
	if want_night != is_night or force:
		is_night = want_night
		if _streamer != null and _streamer.has_method("set_night"):
			_streamer.call("set_night", is_night)

## Human-readable clock for the HUD.
func clock_text() -> String:
	var minutes: int = int(time_of_day * 24.0 * 60.0)
	return "%02d:%02d" % [(minutes / 60) % 24, minutes % 60]
