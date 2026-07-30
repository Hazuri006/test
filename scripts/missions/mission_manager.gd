extends Node
## MissionManager (autoload)
##
## Registry + state machine for every mission and side activity. It knows which
## mission is active, which objective is current, where the marker is, and how to
## save/restore all of that. It never contains mission-specific logic: the
## controller nodes in scripts/missions/ do the staging.
##
## Public API
##   register(mission)                     add a mission (idempotent)
##   start(id)                             begin a mission
##   objective_progress(id, amount)        push the current objective forward
##   complete_objective(id)                force the current objective done
##   fail(id) / complete(id)
##   set_marker(id, position)              move the current objective's marker
##   is_completed(id) / get_mission(id)
##
## Scene requirements: none (autoload).

signal mission_registered(mission: Mission)

var missions: Dictionary = {}          ## id -> Mission
var active_id: String = ""
var completed_ids: Array[String] = []
var boss_phase_reached: int = 0
var rewards_total: int = 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE

# =============================================================================
#  REGISTRY
# =============================================================================

func register(mission: Mission) -> Mission:
	if mission == null or mission.id == "":
		push_warning("MissionManager: refused to register a mission without an id")
		return mission
	if missions.has(mission.id):
		return missions[mission.id]
	missions[mission.id] = mission
	if completed_ids.has(mission.id):
		mission.state = Mission.State.COMPLETED
	mission_registered.emit(mission)
	return mission

func get_mission(id: String) -> Mission:
	return missions.get(id)

func active_mission() -> Mission:
	return missions.get(active_id)

func is_completed(id: String) -> bool:
	return completed_ids.has(id)

func is_active(id: String) -> bool:
	return active_id == id and missions.has(id) and (missions[id] as Mission).is_active()

func available_missions() -> Array[Mission]:
	var out: Array[Mission] = []
	for id in missions.keys():
		var m: Mission = missions[id]
		if m.state == Mission.State.NOT_STARTED:
			out.append(m)
	return out

# =============================================================================
#  FLOW
# =============================================================================

func start(id: String) -> bool:
	var mission: Mission = missions.get(id)
	if mission == null:
		push_warning("MissionManager: unknown mission '%s'" % id)
		return false
	if mission.state == Mission.State.ACTIVE:
		return false
	if mission.state == Mission.State.COMPLETED and not mission.is_side_activity:
		return false
	# Only one main mission at a time; side activities yield to main missions.
	if active_id != "" and active_id != id:
		var current: Mission = missions.get(active_id)
		if current != null and current.is_active():
			if mission.is_side_activity:
				return false
			_abandon(current)

	mission.reset()
	mission.state = Mission.State.ACTIVE
	active_id = id
	Events.mission_started.emit(mission.id, mission.title)
	AudioManager.play("mission_start", 1.0, -2.0)
	_publish_objective(mission)
	return true

func objective_progress(id: String, amount: int = 1) -> void:
	var mission: Mission = missions.get(id)
	if mission == null or not mission.is_active():
		return
	var objective := mission.current_objective()
	if objective == null:
		return
	var finished := objective.add_progress(amount)
	if finished:
		_on_objective_finished(mission)
	else:
		_publish_objective(mission)

func complete_objective(id: String) -> void:
	var mission: Mission = missions.get(id)
	if mission == null or not mission.is_active():
		return
	var objective := mission.current_objective()
	if objective == null:
		return
	objective.force_complete()
	_on_objective_finished(mission)

func _on_objective_finished(mission: Mission) -> void:
	AudioManager.play("objective", 1.0, -4.0)
	if mission.advance():
		complete(mission.id)
	else:
		_publish_objective(mission)

func complete(id: String) -> void:
	var mission: Mission = missions.get(id)
	if mission == null:
		return
	mission.state = Mission.State.COMPLETED
	if not completed_ids.has(id):
		completed_ids.append(id)
	rewards_total += mission.reward
	GameState.add_score(mission.reward)
	if active_id == id:
		active_id = ""
	Events.mission_marker_changed.emit(Vector3.ZERO, false)
	Events.mission_objective_changed.emit("", 0, 0)
	Events.mission_completed.emit(mission.id, mission.reward)
	AudioManager.play("mission_complete", 1.0, 0.0)
	# Autosave on every completed mission: losing progress to a crash is rude.
	SaveManager.save_game(SaveManager.current_slot, true)

func fail(id: String, reason: String = "") -> void:
	var mission: Mission = missions.get(id)
	if mission == null:
		return
	mission.state = Mission.State.FAILED
	if active_id == id:
		active_id = ""
	Events.mission_marker_changed.emit(Vector3.ZERO, false)
	Events.mission_failed.emit(mission.id)
	if reason != "":
		Events.toast_requested.emit(reason)

func _abandon(mission: Mission) -> void:
	mission.state = Mission.State.NOT_STARTED
	mission.reset()

# =============================================================================
#  MARKERS / HUD
# =============================================================================

func set_marker(id: String, position: Vector3) -> void:
	var mission: Mission = missions.get(id)
	if mission == null:
		return
	var objective := mission.current_objective()
	if objective == null:
		return
	objective.marker_position = position
	objective.has_marker = true
	if mission.is_active():
		Events.mission_marker_changed.emit(position, true)

func clear_marker(id: String) -> void:
	var mission: Mission = missions.get(id)
	if mission == null:
		return
	var objective := mission.current_objective()
	if objective != null:
		objective.has_marker = false
	if mission.is_active():
		Events.mission_marker_changed.emit(Vector3.ZERO, false)

func _publish_objective(mission: Mission) -> void:
	var objective := mission.current_objective()
	if objective == null:
		return
	Events.mission_objective_changed.emit(objective.display_text(),
			mission.current_index + 1, mission.objective_count())
	if objective.has_marker:
		Events.mission_marker_changed.emit(objective.marker_position, true)
	else:
		Events.mission_marker_changed.emit(Vector3.ZERO, false)

## Re-emits the current objective so a freshly built HUD is never blank.
func refresh_hud() -> void:
	var mission := active_mission()
	if mission != null and mission.is_active():
		Events.mission_started.emit(mission.id, mission.title)
		_publish_objective(mission)

# =============================================================================
#  SAVE / LOAD
# =============================================================================

func serialize() -> Dictionary:
	var active_progress: Array = []
	var mission := active_mission()
	if mission != null:
		for objective in mission.objectives:
			active_progress.append({"progress": objective.progress, "done": objective.completed})
	return {
		"active": active_id,
		"active_index": mission.current_index if mission != null else 0,
		"active_progress": active_progress,
		"completed": completed_ids.duplicate(),
		"boss_phase": boss_phase_reached,
		"rewards": rewards_total,
	}

func deserialize(data: Dictionary) -> void:
	if data.is_empty():
		return
	completed_ids.clear()
	for id in data.get("completed", []):
		completed_ids.append(String(id))
	boss_phase_reached = int(data.get("boss_phase", 0))
	rewards_total = int(data.get("rewards", 0))

	for id in missions.keys():
		var m: Mission = missions[id]
		if completed_ids.has(id):
			m.state = Mission.State.COMPLETED
		else:
			m.reset()

	var saved_active := String(data.get("active", ""))
	if saved_active != "" and missions.has(saved_active):
		var mission: Mission = missions[saved_active]
		mission.state = Mission.State.ACTIVE
		active_id = saved_active
		var progress: Array = data.get("active_progress", [])
		for i in mini(progress.size(), mission.objectives.size()):
			var entry: Dictionary = progress[i]
			mission.objectives[i].progress = int(entry.get("progress", 0))
			mission.objectives[i].completed = bool(entry.get("done", false))
		mission.current_index = clampi(int(data.get("active_index", 0)), 0,
				maxi(mission.objectives.size() - 1, 0))
		refresh_hud()

## Wipes runtime state when leaving a session (returning to the main menu).
func reset_session() -> void:
	missions.clear()
	active_id = ""
	completed_ids.clear()
	boss_phase_reached = 0
	rewards_total = 0
