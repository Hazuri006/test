extends Node
## SideActivities -- the "there is always something happening" system.
##
## Keeps a few optional jobs alive across the districts. Each one is a real
## Mission registered with MissionManager (flagged is_side_activity) plus a
## beacon in the world; getting close starts it, finishing it pays out and a new
## one is generated somewhere else after a cool-down.
##
## Types generated:
##   mugging     -- break up a crime in progress
##   rescue      -- save a citizen surrounded by crooks
##   lost_item   -- recover a lost brick case
##   chase       -- stop a fleeing vehicle with webs
##   sabotage    -- destroy Mecanix's machines
##   swing_rings -- swing through a ring course
##
## Scene requirements: a plain Node child of the world's "Missions" node.
##
## Inspector parameters: max_active, respawn_delay, trigger_radius, enabled.

@export var max_active: bool = true
@export var max_concurrent: int = 3
@export var respawn_delay: float = 25.0
@export var trigger_radius: float = 22.0
@export var enabled: bool = true

const TYPES := ["mugging", "rescue", "lost_item", "chase", "sabotage", "swing_rings"]

var activities: Array[Dictionary] = []
var _rng := RandomNumberGenerator.new()
var _respawn_timer: float = 0.0
var _counter: int = 0

func _ready() -> void:
	_rng.randomize()
	Events.enemy_defeated.connect(_on_enemy_defeated)
	set_process(false)

## Called by the mission director once the city exists.
func begin() -> void:
	if not enabled:
		return
	set_process(true)
	for i in max_concurrent:
		_spawn_activity()

func _process(delta: float) -> void:
	var player_pos := GameState.player_position()

	# Start any activity the hero walks into.
	for activity in activities:
		if bool(activity.get("started", false)):
			_update_activity(activity, delta)
			continue
		var beacon_pos: Vector3 = activity["position"]
		if player_pos.distance_to(beacon_pos) < trigger_radius:
			_start_activity(activity)

	if activities.size() < max_concurrent:
		_respawn_timer -= delta
		if _respawn_timer <= 0.0:
			_respawn_timer = respawn_delay
			_spawn_activity()

# =============================================================================
#  CREATION
# =============================================================================

func _spawn_activity() -> void:
	var city: Node = GameState.city
	if city == null:
		return
	var kind: String = TYPES[_rng.randi_range(0, TYPES.size() - 1)]
	var district: CityLayout.District = [
		CityLayout.District.RESIDENTIAL, CityLayout.District.COMMERCIAL,
		CityLayout.District.INDUSTRIAL, CityLayout.District.WATERFRONT,
	][_rng.randi_range(0, 3)]
	var position: Vector3 = city.call("random_point_in_district", district)
	position.y += 0.3

	# Never drop an activity on top of the player.
	if position.distance_to(GameState.player_position()) < 60.0:
		position = city.call("random_street_point")

	_counter += 1
	var id := "side_%s_%d" % [kind, _counter]
	var mission := Mission.new(id, _title_for(kind), _description_for(kind), _reward_for(kind))
	mission.is_side_activity = true
	mission.district = CityLayout.district_name(district)
	mission.trigger_position = position
	mission.trigger_radius = trigger_radius
	for objective in _objectives_for(kind, position):
		mission.add_objective(objective)
	MissionManager.register(mission)

	var beacon := WorldMarker.new()
	beacon.color = Color(0.35, 0.85, 1.0)
	beacon.beam_height = 45.0
	beacon.beam_radius = 0.9
	add_child(beacon)
	beacon.global_position = position

	activities.append({
		"id": id, "kind": kind, "position": position, "beacon": beacon,
		"started": false, "mission": mission, "nodes": [], "progress": 0,
		"squad": null, "timer": 0.0,
	})

func _title_for(kind: String) -> String:
	match kind:
		"mugging": return "Agression en cours"
		"rescue": return "Citoyen en danger"
		"lost_item": return "Objet perdu"
		"chase": return "Vehicule en fuite"
		"sabotage": return "Machines suspectes"
		"swing_rings": return "Defi de balancement"
	return "Activite"

func _description_for(kind: String) -> String:
	match kind:
		"mugging": return "Des voyous s'en prennent au quartier."
		"rescue": return "Un habitant est encercle par une bande."
		"lost_item": return "Une mallette en briques a ete perdue sur les toits."
		"chase": return "Un vehicule vole traverse la ville."
		"sabotage": return "Des machines inconnues ont ete installees ici."
		"swing_rings": return "Traverse tous les anneaux avant la fin du temps."
	return ""

func _reward_for(kind: String) -> int:
	match kind:
		"mugging": return 200
		"rescue": return 300
		"lost_item": return 150
		"chase": return 350
		"sabotage": return 300
		"swing_rings": return 400
	return 150

func _objectives_for(kind: String, position: Vector3) -> Array[MissionObjective]:
	var out: Array[MissionObjective] = []
	match kind:
		"mugging":
			out.append(MissionObjective.new("Mets les voyous hors d'etat de nuire",
					MissionObjective.Kind.DEFEAT, 3, position))
		"rescue":
			out.append(MissionObjective.new("Sauve le citoyen",
					MissionObjective.Kind.DEFEAT, 3, position))
		"lost_item":
			out.append(MissionObjective.new("Recupere la mallette",
					MissionObjective.Kind.REACH, 1, position))
		"chase":
			out.append(MissionObjective.new("Immobilise le vehicule avec tes toiles",
					MissionObjective.Kind.CUSTOM, 1, position))
		"sabotage":
			out.append(MissionObjective.new("Detruis les machines",
					MissionObjective.Kind.CUSTOM, 3, position))
		"swing_rings":
			out.append(MissionObjective.new("Traverse tous les anneaux",
					MissionObjective.Kind.CUSTOM, 8, position))
	return out

# =============================================================================
#  START / UPDATE
# =============================================================================

func _start_activity(activity: Dictionary) -> void:
	if MissionManager.active_id != "" and not MissionManager.active_mission().is_side_activity:
		return          # a main mission is running: do not steal the HUD
	if not MissionManager.start(String(activity["id"])):
		return
	activity["started"] = true
	var beacon: WorldMarker = activity["beacon"]
	if is_instance_valid(beacon):
		beacon.set_color(Color(1.0, 0.8, 0.25))
	var position: Vector3 = activity["position"]

	match String(activity["kind"]):
		"mugging":
			_setup_fight(activity, position, {"thug": 2, "runner": 1})
		"rescue":
			_setup_rescue(activity, position)
		"lost_item":
			_setup_item(activity, position)
		"chase":
			_setup_chase(activity, position)
		"sabotage":
			_setup_sabotage(activity, position)
		"swing_rings":
			_setup_rings(activity, position)
	Events.toast_requested.emit("Activite : %s" % _title_for(String(activity["kind"])))

func _setup_fight(activity: Dictionary, position: Vector3, composition: Dictionary) -> void:
	var squad := EnemySquad.new()
	squad.announce_to_hud = false
	get_parent().add_child(squad)
	squad.start(position, [composition], 6.0)
	activity["squad"] = squad
	squad.squad_defeated.connect(_on_activity_cleared.bind(activity))

func _setup_rescue(activity: Dictionary, position: Vector3) -> void:
	var civilian := Civilian.new()
	get_parent().add_child(civilian)
	civilian.global_position = position
	civilian.build(_rng.randi())
	civilian.set_mood(Civilian.Mood.SCARED)
	(activity["nodes"] as Array).append(civilian)
	_setup_fight(activity, position + Vector3(2.0, 0, 2.0), {"thug": 2, "runner": 1})

func _setup_item(activity: Dictionary, position: Vector3) -> void:
	var city: Node = GameState.city
	var roof: Vector3 = position + Vector3(0, 12.0, 0)
	if city != null:
		roof = city.call("random_rooftop_near", position, 120.0)
	var pickup := Area3D.new()
	pickup.collision_layer = BrickKit.L_TRIGGER
	pickup.collision_mask = BrickKit.L_PLAYER
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 2.5
	shape.shape = sphere
	pickup.add_child(shape)
	var mesh := MeshInstance3D.new()
	mesh.mesh = BrickKit.unit_box()
	mesh.scale = Vector3(1.2, 0.8, 0.6)
	mesh.material_override = BrickKit.neon(Color(1.0, 0.85, 0.3), 2.0)
	pickup.add_child(mesh)
	get_parent().add_child(pickup)
	pickup.global_position = roof + Vector3(0, 1.2, 0)
	pickup.body_entered.connect(func(body: Node3D) -> void:
		if body == GameState.get_player():
			_complete_activity(activity))
	(activity["nodes"] as Array).append(pickup)
	activity["position"] = pickup.global_position
	MissionManager.set_marker(String(activity["id"]), pickup.global_position)
	var beacon: WorldMarker = activity["beacon"]
	if is_instance_valid(beacon):
		beacon.global_position = pickup.global_position

func _setup_chase(activity: Dictionary, position: Vector3) -> void:
	var city: Node = GameState.city
	if city == null or city.traffic == null:
		_complete_activity(activity)
		return
	var vehicle: Vehicle = city.traffic.call("spawn_getaway", position, 17.0)
	if vehicle == null:
		_complete_activity(activity)
		return
	(activity["nodes"] as Array).append(vehicle)
	Events.toast_requested.emit("Colle le vehicule avec R")

func _setup_sabotage(activity: Dictionary, position: Vector3) -> void:
	for i in 3:
		var angle: float = TAU * float(i) / 3.0
		var machine := Destructible.new()
		get_parent().add_child(machine)
		machine.global_position = position + Vector3(cos(angle), 0.0, sin(angle)) * 6.0
		machine.build_machine()
		machine.destroyed.connect(_on_machine_destroyed.bind(activity))
		(activity["nodes"] as Array).append(machine)

func _setup_rings(activity: Dictionary, position: Vector3) -> void:
	var challenge := SwingChallenge.new()
	get_parent().add_child(challenge)
	challenge.global_position = position
	challenge.build_course(position, _rng.randi(), 8)
	challenge.ring_passed.connect(func(index: int, total: int) -> void:
		MissionManager.objective_progress(String(activity["id"]), 1)
		Events.toast_requested.emit("Anneau %d / %d" % [index, total]))
	challenge.challenge_completed.connect(func(_t: float) -> void:
		_complete_activity(activity))
	challenge.challenge_failed.connect(func() -> void:
		Events.toast_requested.emit("Temps ecoule !")
		_fail_activity(activity))
	(activity["nodes"] as Array).append(challenge)
	challenge.start()

func _update_activity(activity: Dictionary, delta: float) -> void:
	match String(activity["kind"]):
		"chase":
			var nodes: Array = activity["nodes"]
			if nodes.is_empty():
				return
			var vehicle: Vehicle = nodes[0]
			if not is_instance_valid(vehicle):
				_complete_activity(activity)
				return
			activity["timer"] = float(activity["timer"]) + delta
			if fmod(float(activity["timer"]), 0.3) < delta:
				MissionManager.set_marker(String(activity["id"]), vehicle.global_position)
			if vehicle.is_stopped() and vehicle.webbed_timer > 0.0:
				_complete_activity(activity)

func _on_enemy_defeated(_enemy: Node3D) -> void:
	var active := MissionManager.active_mission()
	if active == null or not active.is_side_activity:
		return
	var objective := active.current_objective()
	if objective != null and objective.kind == MissionObjective.Kind.DEFEAT:
		MissionManager.objective_progress(active.id, 1)

func _on_machine_destroyed(activity: Dictionary) -> void:
	activity["progress"] = int(activity["progress"]) + 1
	MissionManager.objective_progress(String(activity["id"]), 1)
	if int(activity["progress"]) >= 3:
		_complete_activity(activity)

func _on_activity_cleared(activity: Dictionary) -> void:
	# For rescue jobs the citizen celebrates before we wrap up.
	for node in (activity["nodes"] as Array):
		if node is Civilian and is_instance_valid(node):
			(node as Civilian).set_mood(Civilian.Mood.CHEERING)
			(node as Civilian).face(GameState.player_position())
	_complete_activity(activity)

# =============================================================================
#  CLEANUP
# =============================================================================

func _complete_activity(activity: Dictionary) -> void:
	if not activities.has(activity):
		return
	var id := String(activity["id"])
	if MissionManager.is_active(id):
		var mission := MissionManager.get_mission(id)
		while mission != null and mission.current_index < mission.objective_count():
			MissionManager.complete_objective(id)
	_cleanup_activity(activity, 6.0)
	_respawn_timer = respawn_delay

func _fail_activity(activity: Dictionary) -> void:
	var id := String(activity["id"])
	MissionManager.fail(id, "Activite echouee")
	_cleanup_activity(activity, 1.0)
	_respawn_timer = respawn_delay * 0.5

func _cleanup_activity(activity: Dictionary, delay: float) -> void:
	activities.erase(activity)
	var beacon: WorldMarker = activity["beacon"]
	if is_instance_valid(beacon):
		beacon.queue_free()
	var squad: EnemySquad = activity["squad"]
	if squad != null and is_instance_valid(squad):
		squad.queue_free()
	# Give civilians a moment to celebrate before they vanish.
	var nodes: Array = (activity["nodes"] as Array).duplicate()
	get_tree().create_timer(delay).timeout.connect(func() -> void:
		for node in nodes:
			if is_instance_valid(node):
				if node is Vehicle:
					var city: Node = GameState.city
					if city != null and city.traffic != null:
						city.traffic.call("despawn", node)
					continue
				if node.has_method("cleanup"):
					node.call("cleanup")
				else:
					node.queue_free())

func active_count() -> int:
	return activities.size()
