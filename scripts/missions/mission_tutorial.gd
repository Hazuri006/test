extends Node
## MissionTutorial -- mission 1, "Premiers pas sur les toits".
##
## Teaches the whole movement vocabulary by watching what the player actually
## does, never by locking input: walk, sprint, jump, double jump, look around,
## fire a web, swing, and finally reach a marked rooftop. Each objective
## completes on real gameplay, so a player who already knows the controls blasts
## through it in thirty seconds.
##
## Scene requirements: a plain Node child of the world's "Missions" node.

const MISSION_ID := "m01_tutorial"

var mission: Mission
var _player: Node3D
var _walked: float = 0.0
var _sprint_time: float = 0.0
var _look_amount: float = 0.0
var _jumped: bool = false
var _double_jumped: bool = false
var _web_used: bool = false
var _swing_time: float = 0.0
var _last_position: Vector3 = Vector3.ZERO
var _last_yaw: float = 0.0
var _rooftop: Vector3 = Vector3.ZERO
var _hint_timer: float = 0.0

func build_mission(rooftop_target: Vector3) -> Mission:
	_rooftop = rooftop_target
	mission = Mission.new(MISSION_ID, "Premiers pas sur les toits",
			"Apprends a te deplacer, a te balancer et rejoins le toit indique.", 300)
	mission.add_objective(MissionObjective.new("Deplace-toi (Z Q S D / W A S D)",
			MissionObjective.Kind.ACTION, 1))
	mission.add_objective(MissionObjective.new("Cours en maintenant Maj",
			MissionObjective.Kind.ACTION, 1))
	mission.add_objective(MissionObjective.new("Regarde autour de toi (souris)",
			MissionObjective.Kind.ACTION, 1))
	mission.add_objective(MissionObjective.new("Saute (Espace)",
			MissionObjective.Kind.ACTION, 1))
	mission.add_objective(MissionObjective.new("Double saute en l'air (Espace x2)",
			MissionObjective.Kind.ACTION, 1))
	mission.add_objective(MissionObjective.new("Lance une toile (clic droit)",
			MissionObjective.Kind.ACTION, 1))
	mission.add_objective(MissionObjective.new("Balance-toi pendant 3 secondes",
			MissionObjective.Kind.ACTION, 1))
	mission.add_objective(MissionObjective.new("Rejoins le toit balise",
			MissionObjective.Kind.REACH, 1, rooftop_target))
	return mission

func _ready() -> void:
	Events.mission_started.connect(_on_mission_started)
	Events.web_attached.connect(_on_web_attached)
	Events.player_state_changed.connect(_on_player_state)
	set_process(false)

func _on_mission_started(id: String, _title: String) -> void:
	if id != MISSION_ID:
		set_process(false)
		return
	_player = GameState.get_player()
	if _player != null:
		_last_position = _player.global_position
	set_process(true)
	Events.dialogue_requested.emit("Web Hero",
			"Bon. Une ville entiere en briques, et personne pour la surveiller. Au travail.", 4.5)

func _on_web_attached(_point: Vector3) -> void:
	_web_used = true

func _on_player_state(state_name: String) -> void:
	if state_name == "double_jump":
		_double_jumped = true
	elif state_name == "jump":
		_jumped = true

func _process(delta: float) -> void:
	if mission == null or not mission.is_active():
		return
	_player = GameState.get_player()
	if _player == null:
		return

	# --- track what the player is doing --------------------------------------
	var pos: Vector3 = _player.global_position
	var moved: float = Vector2(pos.x - _last_position.x, pos.z - _last_position.z).length()
	_last_position = pos
	_walked += moved
	if _player.has_method("get_speed") and float(_player.call("get_speed")) > 10.0 \
			and _player.is_on_floor():
		_sprint_time += delta
	var rig: Node3D = _player.get_node_or_null("CameraRig")
	if rig != null:
		var yaw: float = float(rig.call("get_yaw"))
		_look_amount += absf(angle_difference(_last_yaw, yaw))
		_last_yaw = yaw
	if _player.has_method("is_swinging") and bool(_player.call("is_swinging")):
		_swing_time += delta

	# --- resolve the current objective ---------------------------------------
	match mission.current_index:
		0:
			if _walked > 9.0:
				_complete("Bien. Maintenant, accelere.")
		1:
			if _sprint_time > 1.6:
				_complete("Voila. Un heros ne marche pas.")
		2:
			if _look_amount > 3.4:
				_complete("La camera suit ton regard.")
		3:
			if _jumped:
				_complete("Encore une fois, mais en l'air.")
		4:
			if _double_jumped:
				_complete("Parfait. Le double saut sauve des vies.")
		5:
			if _web_used:
				_complete("Vise un batiment, la toile fait le reste.")
		6:
			if _swing_time > 3.0:
				_complete("Tu tiens ton rythme. Direction le toit balise !")
		7:
			if pos.distance_to(_rooftop) < 9.0:
				MissionManager.complete_objective(MISSION_ID)
				Events.dialogue_requested.emit("Web Hero",
						"Toute la ville est a moi. Voyons ce qui s'y passe.", 4.0)

	# Occasional nudge if the player is stuck on the same step.
	_hint_timer += delta
	if _hint_timer > 25.0:
		_hint_timer = 0.0
		var objective := mission.current_objective()
		if objective != null:
			Events.toast_requested.emit(objective.text)

func _complete(line: String) -> void:
	MissionManager.complete_objective(MISSION_ID)
	if line != "":
		Events.dialogue_requested.emit("Web Hero", line, 3.0)
