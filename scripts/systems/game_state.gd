extends Node
## GameState (autoload)
##
## Small, boring, global truth: who the player is, where the world is, the score,
## the settings, and whether we are paused. Systems ask GameState instead of
## walking the scene tree looking for each other.
##
## Scene requirements: none (autoload).

signal world_ready(world: Node3D)

const SETTING_DEFAULTS := {
	"mouse_sensitivity": 0.0030,
	"invert_y": false,
	"master_volume": 0.9,
	"music_volume": 0.6,
	"sfx_volume": 0.85,
	"graphics_quality": 2,   # 0 = low, 1 = medium, 2 = high, 3 = ultra
	"day_night_enabled": true,
	"show_minimap": true,
	"camera_shake": 1.0,
}

var player: Node3D = null
var world: Node3D = null
var city = null                        ## CityGenerator, set once the city exists
var score: int = 0
var paused: bool = false
var in_cutscene: bool = false
var settings: Dictionary = SETTING_DEFAULTS.duplicate(true)
## Where a freshly loaded game should drop the hero (set by SaveManager).
var pending_spawn: Variant = null
var pending_save_data: Dictionary = {}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

# --- registration -------------------------------------------------------------

func register_player(p: Node3D) -> void:
	player = p
	Events.player_spawned.emit(p)

func register_world(w: Node3D) -> void:
	world = w
	world_ready.emit(w)

func get_player() -> Node3D:
	if player != null and is_instance_valid(player):
		return player
	return null

func player_position() -> Vector3:
	var p := get_player()
	return p.global_position if p != null else Vector3.ZERO

# --- score --------------------------------------------------------------------

func add_score(amount: int) -> void:
	score += amount
	Events.score_changed.emit(score)

func reset_score() -> void:
	score = 0
	Events.score_changed.emit(score)

# --- pause --------------------------------------------------------------------

func set_paused(value: bool) -> void:
	if paused == value:
		return
	paused = value
	get_tree().paused = value
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if value else Input.MOUSE_MODE_CAPTURED
	Events.game_paused.emit(value)

func toggle_pause() -> void:
	set_paused(not paused)

## True when normal gameplay input should be read.
func gameplay_active() -> bool:
	return not paused and not in_cutscene

# --- settings -----------------------------------------------------------------

func get_setting(key: String) -> Variant:
	return settings.get(key, SETTING_DEFAULTS.get(key))

func set_setting(key: String, value: Variant) -> void:
	settings[key] = value
	apply_settings()

func apply_settings() -> void:
	AudioManager.apply_volumes(
		float(get_setting("master_volume")),
		float(get_setting("music_volume")),
		float(get_setting("sfx_volume")))
	Events.settings_applied.emit()

func shake_camera(strength: float, duration: float = 0.25) -> void:
	Events.camera_shake_requested.emit(strength * float(get_setting("camera_shake")), duration)
