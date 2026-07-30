extends Node
## MissionBankHeist -- mission 2, "Alerte a la Banque Centrale".
##
## Full scripted sequence:
##   alert -> travel marker -> arrival cutscene -> hostages -> three waves of
##   crooks -> a getaway van the hero has to web to a stop -> reward.
##
## Everything is staged from this one controller: the squad, the civilians, the
## camera work, the dialogue and the dynamic music switch.
##
## Scene requirements: a plain Node child of the world's "Missions" node.

const MISSION_ID := "m02_bank"

var mission: Mission
var bank_plaza: Vector3 = Vector3.ZERO
var bank_entrance: Vector3 = Vector3.ZERO

var _squad: EnemySquad
var _hostages: Array[Civilian] = []
var _robbers_out: bool = false
var _getaway: Vehicle = null
var _getaway_timer: float = 0.0
var _phase: int = 0

func build_mission(plaza: Vector3, entrance: Vector3) -> Mission:
	bank_plaza = plaza
	bank_entrance = entrance
	mission = Mission.new(MISSION_ID, "Alerte a la Banque Centrale",
			"Des malfrats braquent la Banque Centrale. Empeche-les de s'enfuir.", 900)
	mission.add_objective(MissionObjective.new("Rejoins la Banque Centrale",
			MissionObjective.Kind.REACH, 1, plaza))
	mission.add_objective(MissionObjective.new("Neutralise les braqueurs",
			MissionObjective.Kind.DEFEAT, 4, plaza))
	mission.add_objective(MissionObjective.new("Repousse les renforts",
			MissionObjective.Kind.DEFEAT, 5, plaza))
	mission.add_objective(MissionObjective.new("Arrete le fourgon avec tes toiles",
			MissionObjective.Kind.CUSTOM, 1, plaza))
	mission.trigger_position = plaza
	mission.trigger_radius = 26.0
	return mission

func _ready() -> void:
	Events.mission_started.connect(_on_mission_started)
	Events.mission_completed.connect(_on_mission_completed)
	Events.enemy_defeated.connect(_on_enemy_defeated)
	set_process(false)

func _on_mission_started(id: String, _title: String) -> void:
	if id != MISSION_ID:
		return
	_phase = 0
	_robbers_out = false
	set_process(true)
	AudioManager.play("alarm", 1.0, -4.0)
	Events.dialogue_requested.emit("Radio de la police",
			"Braquage en cours a la Banque Centrale ! Toutes les unites !", 4.0)
	MissionManager.set_marker(MISSION_ID, bank_plaza)

func _process(delta: float) -> void:
	if mission == null or not mission.is_active():
		return
	var player := GameState.get_player()
	if player == null:
		return

	match _phase:
		0:
			# Travel to the bank.
			if player.global_position.distance_to(bank_plaza) < 24.0:
				_phase = 1
				_start_arrival()
		3:
			_track_getaway(delta)

func _start_arrival() -> void:
	MissionManager.complete_objective(MISSION_ID)
	AudioManager.play_music("combat")
	await _arrival_cutscene()
	_spawn_hostages()
	_start_fight()

# =============================================================================
#  CUTSCENE
# =============================================================================

func _arrival_cutscene() -> void:
	var player := GameState.get_player()
	if player == null:
		return
	GameState.in_cutscene = true
	if player.has_method("set_control_enabled"):
		player.call("set_control_enabled", false)
	Transition.cinematic_bars(true, 0.4)

	var rig: Node3D = player.get_node_or_null("CameraRig")
	if rig != null and rig.has_method("cinematic_look"):
		rig.call("cinematic_look", bank_entrance + Vector3(0, 6.0, 26.0),
				bank_entrance + Vector3(0, 3.0, 0), 58.0)

	Events.dialogue_requested.emit("Braqueur", "Vite ! Chargez le fourgon !", 2.6)
	await get_tree().create_timer(2.8).timeout

	# The robbers burst out of the doors: spawn them mid-shot for the reveal.
	_robbers_out = true
	var first := EnemyFactory.spawn_group({"thug": 2}, bank_entrance + Vector3(0, 0, 3.0), 3.0,
			get_parent())
	for enemy in first:
		enemy.velocity = Vector3(randf_range(-3.0, 3.0), 4.0, 8.0)
	AudioManager.play("enemy_alert", 0.9)

	if rig != null and rig.has_method("cinematic_look"):
		rig.call("cinematic_look", bank_entrance + Vector3(14.0, 4.0, 14.0),
				bank_entrance + Vector3(0, 2.0, 4.0), 52.0)
	Events.dialogue_requested.emit("Web Hero", "Mauvaise banque, mauvaise ville, mauvais jour.", 3.0)
	await get_tree().create_timer(2.4).timeout

	Transition.cinematic_bars(false, 0.4)
	if rig != null and rig.has_method("restore_gameplay_camera"):
		rig.call("restore_gameplay_camera")
	if player.has_method("set_control_enabled"):
		player.call("set_control_enabled", true)
	GameState.in_cutscene = false
	GameState.shake_camera(0.2, 0.3)

# =============================================================================
#  FIGHT
# =============================================================================

func _spawn_hostages() -> void:
	for i in 2:
		var civilian := Civilian.new()
		get_parent().add_child(civilian)
		civilian.global_position = bank_entrance + Vector3(-6.0 + float(i) * 12.0, 0.0, 6.0)
		civilian.build(1000 + i)
		civilian.set_mood(Civilian.Mood.SCARED)
		civilian.face(bank_plaza)
		_hostages.append(civilian)

func _start_fight() -> void:
	_phase = 2
	_squad = EnemySquad.new()
	get_parent().add_child(_squad)
	_squad.start(bank_plaza, [
		{"thug": 3, "runner": 1},
		{"thug": 2, "gunner": 2},
		{"brute": 1, "runner": 2},
	], 9.0)
	_squad.wave_cleared.connect(_on_wave_cleared)
	_squad.squad_defeated.connect(_on_squad_defeated)
	Events.dialogue_requested.emit("Web Hero", "Personne ne part avec les economies du quartier.", 3.0)

func _on_wave_cleared(index: int) -> void:
	if index == 0:
		# Hostages are safe once the first group is down.
		for hostage in _hostages:
			if is_instance_valid(hostage):
				hostage.set_mood(Civilian.Mood.CHEERING)
				hostage.face(GameState.player_position())
		Events.toast_requested.emit("Otages liberes !")
		GameState.add_score(200)
		MissionManager.complete_objective(MISSION_ID)
	elif index == 1:
		MissionManager.complete_objective(MISSION_ID)

func _on_enemy_defeated(_enemy: Node3D) -> void:
	if mission == null or not mission.is_active():
		return
	# Keeps the "x/y" counter in the HUD moving for defeat objectives.
	var objective := mission.current_objective()
	if objective != null and objective.kind == MissionObjective.Kind.DEFEAT:
		MissionManager.objective_progress(MISSION_ID, 1)

func _on_squad_defeated() -> void:
	if mission == null or not mission.is_active():
		return
	_start_getaway()

# =============================================================================
#  GETAWAY
# =============================================================================

func _start_getaway() -> void:
	_phase = 3
	while mission.current_index < 3:
		MissionManager.complete_objective(MISSION_ID)
	Events.dialogue_requested.emit("Braqueur", "Le fourgon ! Demarre, demarre !", 2.5)

	var city: Node = GameState.city
	if city != null and city.traffic != null and city.traffic.has_method("spawn_getaway"):
		_getaway = city.traffic.call("spawn_getaway", bank_plaza + Vector3(0, 0, 22.0), 19.0)
	if _getaway == null:
		# No traffic system (traffic disabled): finish rather than soft-lock.
		MissionManager.complete_objective(MISSION_ID)
		return
	MissionManager.set_marker(MISSION_ID, _getaway.global_position)
	Events.toast_requested.emit("Colle le fourgon avec R (attaque toile)")
	AudioManager.play("alarm", 1.3, -10.0)

func _track_getaway(delta: float) -> void:
	if _getaway == null or not is_instance_valid(_getaway):
		MissionManager.complete_objective(MISSION_ID)
		_phase = 4
		return
	_getaway_timer += delta
	# Keep the marker glued to the fleeing van.
	if fmod(_getaway_timer, 0.25) < delta:
		MissionManager.set_marker(MISSION_ID, _getaway.global_position)
	if _getaway.is_stopped() and _getaway.webbed_timer > 0.0:
		_phase = 4
		Events.toast_requested.emit("Fourgon immobilise !")
		GameState.shake_camera(0.25, 0.4)
		AudioManager.play("metal_clang", 0.8)
		var crooks := EnemyFactory.spawn_group({"thug": 2}, _getaway.global_position, 4.0, get_parent())
		for crook in crooks:
			crook.take_damage(0.0, GameState.player_position())
		MissionManager.complete_objective(MISSION_ID)

func _on_mission_completed(id: String, reward: int) -> void:
	if id != MISSION_ID:
		return
	set_process(false)
	AudioManager.play_music("explore")
	Events.dialogue_requested.emit("Web Hero",
			"Banque sauvee. Mais ces types etaient trop bien equipes pour de simples voyous...", 5.0)
	Events.toast_requested.emit("Recompense : %d points" % reward)
	if _squad != null and is_instance_valid(_squad):
		_squad.queue_free()
	for hostage in _hostages:
		if is_instance_valid(hostage):
			hostage.set_mood(Civilian.Mood.CHEERING)
	var city: Node = GameState.city
	if _getaway != null and is_instance_valid(_getaway) and city != null and city.traffic != null:
		city.traffic.call("despawn", _getaway)
	_getaway = null
