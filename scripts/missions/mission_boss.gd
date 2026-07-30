extends Node
## MissionBoss -- mission 3, "L'ombre de Mecanix".
##
## The campaign finale: strange machinery is appearing across the city, the trail
## leads to the Usine Mecanix, the hero fights through the guards, the boss is
## revealed in a cutscene, and then the three-phase fight runs. It closes on a
## cinematic where Web Hero stops the factory's demolition rig from levelling a
## whole district.
##
## Scene requirements: a plain Node child of the world's "Missions" node.

const MISSION_ID := "m03_mechanix"

var mission: Mission
var factory: Dictionary = {}

var _boss: BossMechanix
var _squad: EnemySquad
var _phase: int = 0
var _boss_scene: PackedScene

func build_mission(factory_data: Dictionary) -> Mission:
	factory = factory_data
	mission = Mission.new(MISSION_ID, "L'ombre de Mecanix",
			"Des machines etranges surgissent partout. Remonte jusqu'a l'usine et arrete leur createur.",
			3000)
	mission.add_objective(MissionObjective.new("Rejoins l'usine technologique",
			MissionObjective.Kind.REACH, 1, factory_data.get("entry", Vector3.ZERO)))
	mission.add_objective(MissionObjective.new("Traverse l'usine et nettoie les gardes",
			MissionObjective.Kind.DEFEAT, 7, factory_data.get("arena_center", Vector3.ZERO)))
	mission.add_objective(MissionObjective.new("Detruis les articulations des bras robotiques",
			MissionObjective.Kind.CUSTOM, 1, factory_data.get("arena_center", Vector3.ZERO)))
	mission.add_objective(MissionObjective.new("Detruis le reacteur dorsal de Mecanix",
			MissionObjective.Kind.CUSTOM, 1, factory_data.get("arena_center", Vector3.ZERO)))
	mission.trigger_position = factory_data.get("entry", Vector3.ZERO)
	mission.trigger_radius = 30.0
	return mission

func _ready() -> void:
	Events.mission_started.connect(_on_mission_started)
	Events.enemy_defeated.connect(_on_enemy_defeated)
	Events.boss_health_changed.connect(_on_boss_health)
	Events.boss_defeated.connect(_on_boss_defeated)
	_boss_scene = load("res://scenes/bosses/mechanix.tscn") as PackedScene
	set_process(false)

func _on_mission_started(id: String, _title: String) -> void:
	if id != MISSION_ID:
		return
	_phase = 0
	set_process(true)
	MissionManager.set_marker(MISSION_ID, factory.get("entry", Vector3.ZERO))
	Events.dialogue_requested.emit("Web Hero",
			"Des bras mecaniques dans toute la ville... Ils viennent tous de la meme usine.", 4.5)

func _process(_delta: float) -> void:
	if mission == null or not mission.is_active():
		return
	var player := GameState.get_player()
	if player == null:
		return
	if _phase == 0:
		var entry: Vector3 = factory.get("entry", Vector3.ZERO)
		if player.global_position.distance_to(entry) < 26.0:
			_phase = 1
			_enter_factory()

# =============================================================================
#  FACTORY APPROACH
# =============================================================================

func _enter_factory() -> void:
	MissionManager.complete_objective(MISSION_ID)
	AudioManager.play_music("combat")
	Events.dialogue_requested.emit("Garde", "Personne n'entre ! Ordre du Docteur !", 2.6)
	var arena: Vector3 = factory.get("arena_center", Vector3.ZERO)
	_squad = EnemySquad.new()
	get_parent().add_child(_squad)
	_squad.start(arena, [
		{"thug": 3, "gunner": 1},
		{"runner": 2, "gunner": 2, "brute": 1},
	], 14.0)
	_squad.squad_defeated.connect(_on_guards_cleared)
	MissionManager.set_marker(MISSION_ID, arena)

func _on_enemy_defeated(_enemy: Node3D) -> void:
	if mission == null or not mission.is_active() or _phase != 1:
		return
	var objective := mission.current_objective()
	if objective != null and objective.kind == MissionObjective.Kind.DEFEAT:
		MissionManager.objective_progress(MISSION_ID, 1)

func _on_guards_cleared() -> void:
	if _phase != 1:
		return
	_phase = 2
	while mission.current_index < 2:
		MissionManager.complete_objective(MISSION_ID)
	await _boss_intro()

# =============================================================================
#  BOSS INTRO CUTSCENE
# =============================================================================

func _boss_intro() -> void:
	var player := GameState.get_player()
	if player == null:
		return
	var arena: Vector3 = factory.get("arena_center", Vector3.ZERO)
	var spawn: Vector3 = factory.get("boss_spawn", arena)

	GameState.in_cutscene = true
	if player.has_method("set_control_enabled"):
		player.call("set_control_enabled", false)
	Transition.cinematic_bars(true, 0.5)
	Events.boss_intro_started.emit("DOCTEUR MECANIX")

	var rig: Node3D = player.get_node_or_null("CameraRig")

	# Shot 1 -- the far wall buckles.
	if rig != null:
		rig.call("cinematic_look", arena + Vector3(0, 8.0, 30.0), arena + Vector3(0, 6.0, -20.0), 55.0)
	GameState.shake_camera(0.5, 0.8)
	AudioManager.play("metal_clang", 0.5)
	AudioManager.play("explosion", 0.7)
	await get_tree().create_timer(1.4).timeout

	# Spawn the boss mid-cutscene so his arms are on screen for the reveal.
	_boss = _boss_scene.instantiate() as BossMechanix
	get_parent().add_child(_boss)
	_boss.global_position = spawn

	# Shot 2 -- low angle on the harness.
	if rig != null:
		rig.call("cinematic_look", spawn + Vector3(9.0, 1.5, 12.0), spawn + Vector3(0, 4.0, 0), 48.0)
	AudioManager.play("boss_roar", 0.95)
	Events.dialogue_requested.emit("Docteur Mecanix",
			"Quatre bras. Zero patience. Tu tombes bien, j'avais besoin d'un cobaye.", 4.2)
	await get_tree().create_timer(3.6).timeout

	# Shot 3 -- back to the hero.
	if rig != null:
		rig.call("cinematic_look", player.global_position + Vector3(4.0, 3.0, 6.0),
				player.global_position + Vector3(0, 1.5, 0), 55.0)
	Events.dialogue_requested.emit("Web Hero", "Quatre bras, quatre articulations. Ca me va.", 3.0)
	await get_tree().create_timer(2.4).timeout

	Transition.cinematic_bars(false, 0.4)
	if rig != null:
		rig.call("restore_gameplay_camera")
	if player.has_method("set_control_enabled"):
		player.call("set_control_enabled", true)
	GameState.in_cutscene = false

	_phase = 3
	_boss.begin_fight(arena, float(factory.get("radius", 34.0)) * 0.85)
	Events.toast_requested.emit("Frappe les articulations lumineuses des bras !")

# =============================================================================
#  FIGHT TRACKING
# =============================================================================

func _on_boss_health(_current: float, _maximum: float, boss_phase: int) -> void:
	if mission == null or not mission.is_active():
		return
	# Objective 3 (arms) completes when the fight reaches its reactor phase.
	if boss_phase >= 3 and mission.current_index == 2:
		MissionManager.complete_objective(MISSION_ID)

func _on_boss_defeated() -> void:
	if mission == null or not mission.is_active():
		return
	_phase = 4
	await _finale()
	while mission.current_index < mission.objective_count():
		MissionManager.complete_objective(MISSION_ID)

# =============================================================================
#  FINALE CUTSCENE
# =============================================================================

## The factory's demolition rig fires up on its own and swings towards the
## skyline; the hero webs it down before it levels a district.
func _finale() -> void:
	var player := GameState.get_player()
	var arena: Vector3 = factory.get("arena_center", Vector3.ZERO)
	GameState.in_cutscene = true
	if player != null and player.has_method("set_control_enabled"):
		player.call("set_control_enabled", false)
	Transition.cinematic_bars(true, 0.5)
	AudioManager.play_music("explore")

	# Build the runaway rig: a huge arm on a tower, aimed at the city.
	var rig_root := Node3D.new()
	get_parent().add_child(rig_root)
	rig_root.global_position = arena + Vector3(0, 0, -26.0)
	var metal := BrickKit.metal(Color(0.5, 0.52, 0.58), 0.3)
	var hot := BrickKit.neon(Color(1.0, 0.4, 0.2), 3.0)
	BrickKit.add_box(rig_root, Vector3(6.0, 24.0, 6.0), Vector3(0, 12.0, 0), metal, "Tower")
	var boom := Node3D.new()
	boom.position = Vector3(0, 22.0, 0)
	rig_root.add_child(boom)
	BrickKit.add_box(boom, Vector3(3.0, 3.0, 34.0), Vector3(0, 0, -17.0), metal, "Boom")
	BrickKit.add_box(boom, Vector3(5.0, 5.0, 5.0), Vector3(0, 0, -34.0), hot, "Hammer")

	var camera_rig: Node3D = player.get_node_or_null("CameraRig") if player != null else null
	if camera_rig != null:
		camera_rig.call("cinematic_look", arena + Vector3(26.0, 16.0, 20.0),
				rig_root.global_position + Vector3(0, 20.0, -14.0), 60.0)
	Events.dialogue_requested.emit("Docteur Mecanix",
			"Si je tombe... le quartier tombe avec moi !", 3.4)
	AudioManager.play("alarm", 0.9)

	# The boom swings towards the city.
	var swing := create_tween()
	swing.tween_property(boom, "rotation:y", deg_to_rad(75.0), 2.6)
	await get_tree().create_timer(2.2).timeout

	Events.dialogue_requested.emit("Web Hero", "Pas aujourd'hui.", 1.6)
	# Web strands snap out and lash the boom down.
	if player != null:
		var web: Node = player.get_node_or_null("WebSystem")
		if web != null and web.has_method("spawn_strand"):
			for i in 5:
				var anchor: Vector3 = rig_root.global_position + Vector3(
						randf_range(-14.0, 14.0), 22.0, randf_range(-24.0, 0.0))
				web.call("spawn_strand", player.global_position + Vector3(0, 1.4, 0), anchor, 2.2)
				AudioManager.play("web_shoot", randf_range(0.9, 1.2))
				await get_tree().create_timer(0.18).timeout

	var collapse := create_tween()
	collapse.tween_property(boom, "rotation:x", deg_to_rad(-40.0), 1.4)
	collapse.parallel().tween_property(rig_root, "rotation:z", deg_to_rad(12.0), 1.4)
	GameState.shake_camera(0.7, 1.2)
	AudioManager.play("explosion", 0.7)
	Transition.flash(Color(1, 0.9, 0.7, 0.6), 0.8)
	await get_tree().create_timer(1.8).timeout

	if camera_rig != null and player != null:
		camera_rig.call("cinematic_look", player.global_position + Vector3(5.0, 3.0, 7.0),
				player.global_position + Vector3(0, 1.6, 0), 55.0)
	Events.dialogue_requested.emit("Web Hero",
			"Brick City tient debout. Comme toujours.", 3.6)
	if player != null and player.has_method("celebrate"):
		player.call("celebrate")
	await get_tree().create_timer(3.0).timeout

	Transition.cinematic_bars(false, 0.6)
	if camera_rig != null:
		camera_rig.call("restore_gameplay_camera")
	if player != null and player.has_method("set_control_enabled"):
		player.call("set_control_enabled", true)
	GameState.in_cutscene = false
	Events.toast_requested.emit("Campagne terminee ! La ville est a toi.")
