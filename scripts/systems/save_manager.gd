extends Node
## SaveManager (autoload)
##
## JSON save games through FileAccess plus a ConfigFile for the options menu.
## Stores: hero position/rotation, health, score, active mission, completed
## missions, unlocked rewards, side-activity progress and boss phase reached.
##
## Files written:
##   user://brick_hero_save_<slot>.json
##   user://brick_hero_settings.cfg
##
## Scene requirements: none (autoload).

const SAVE_PATH_TEMPLATE := "user://brick_hero_save_%d.json"
const SETTINGS_PATH := "user://brick_hero_settings.cfg"
const SAVE_VERSION := 1
const AUTOSAVE_INTERVAL := 90.0

var current_slot: int = 1
var _autosave_timer: float = 0.0
var _autosave_enabled: bool = false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	load_settings()

func _process(delta: float) -> void:
	if not _autosave_enabled or GameState.paused or GameState.in_cutscene:
		return
	_autosave_timer += delta
	if _autosave_timer >= AUTOSAVE_INTERVAL:
		_autosave_timer = 0.0
		save_game(current_slot, true)

## Autosave only runs while a real gameplay session is alive.
func set_autosave(active: bool) -> void:
	_autosave_enabled = active
	_autosave_timer = 0.0

# =============================================================================
#  SAVE / LOAD
# =============================================================================

func has_save(slot: int = 1) -> bool:
	return FileAccess.file_exists(SAVE_PATH_TEMPLATE % slot)

func save_game(slot: int = 1, silent: bool = false) -> bool:
	var data := {
		"version": SAVE_VERSION,
		"timestamp": Time.get_datetime_string_from_system(),
		"score": GameState.score,
		"player": {},
		"missions": MissionManager.serialize(),
	}

	var p := GameState.get_player()
	if p != null:
		data["player"] = {
			"position": _v3(p.global_position),
			"yaw": p.rotation.y,
			"health": p.get_health() if p.has_method("get_health") else 100.0,
		}

	var f := FileAccess.open(SAVE_PATH_TEMPLATE % slot, FileAccess.WRITE)
	if f == null:
		push_warning("SaveManager: could not open save file for writing (slot %d)" % slot)
		return false
	f.store_string(JSON.stringify(data, "\t"))
	f.close()

	current_slot = slot
	Events.save_written.emit(slot)
	if not silent:
		Events.toast_requested.emit("Partie sauvegardee")
	else:
		Events.toast_requested.emit("Sauvegarde automatique")
	return true

## Reads a save file into a Dictionary. Returns {} when missing or corrupt.
func read_save(slot: int = 1) -> Dictionary:
	var path := SAVE_PATH_TEMPLATE % slot
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var text := f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("SaveManager: save slot %d is corrupt, ignoring." % slot)
		return {}
	return parsed

## Stages a save so the world scene can consume it while it builds itself.
func queue_load(slot: int = 1) -> bool:
	var data := read_save(slot)
	if data.is_empty():
		return false
	current_slot = slot
	GameState.pending_save_data = data
	var pdata: Dictionary = data.get("player", {})
	if pdata.has("position"):
		GameState.pending_spawn = _to_v3(pdata["position"])
	GameState.score = int(data.get("score", 0))
	return true

## Called by the world once every system exists.
func apply_pending_save() -> void:
	var data: Dictionary = GameState.pending_save_data
	if data.is_empty():
		return
	var p := GameState.get_player()
	var pdata: Dictionary = data.get("player", {})
	if p != null and not pdata.is_empty():
		if pdata.has("position"):
			p.global_position = _to_v3(pdata["position"])
		if pdata.has("yaw"):
			p.rotation.y = float(pdata["yaw"])
		if pdata.has("health") and p.has_method("set_health"):
			p.set_health(float(pdata["health"]))
	MissionManager.deserialize(data.get("missions", {}))
	GameState.pending_save_data = {}

func clear_pending() -> void:
	GameState.pending_save_data = {}
	GameState.pending_spawn = null

func delete_save(slot: int = 1) -> void:
	var path := SAVE_PATH_TEMPLATE % slot
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func save_summary(slot: int = 1) -> String:
	var data := read_save(slot)
	if data.is_empty():
		return ""
	var missions: Dictionary = data.get("missions", {})
	var done: int = (missions.get("completed", []) as Array).size()
	return "%s  -  %d mission(s)  -  %d pts" % [
		str(data.get("timestamp", "?")), done, int(data.get("score", 0))]

# =============================================================================
#  SETTINGS (ConfigFile)
# =============================================================================

func save_settings() -> void:
	var cfg := ConfigFile.new()
	for key in GameState.settings.keys():
		cfg.set_value("options", key, GameState.settings[key])
	cfg.save(SETTINGS_PATH)

func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) != OK:
		return
	for key in GameState.SETTING_DEFAULTS.keys():
		if cfg.has_section_key("options", key):
			GameState.settings[key] = cfg.get_value("options", key)

# --- helpers ------------------------------------------------------------------

func _v3(v: Vector3) -> Array:
	return [snappedf(v.x, 0.001), snappedf(v.y, 0.001), snappedf(v.z, 0.001)]

func _to_v3(a: Variant) -> Vector3:
	if typeof(a) == TYPE_ARRAY and (a as Array).size() >= 3:
		return Vector3(float(a[0]), float(a[1]), float(a[2]))
	return Vector3.ZERO
