extends LevelBase
## Sub-Level B: the generator room (Quest 2 climax), the morgue (third seal +
## scripted encounter) and the lift down to the lower ward (Quest 4 climax).

const H: float = 3.4
const FY: float = 0.0

var _power_on_start: bool = false
var _monster: Node = null
var _encounter_started: bool = false

func _ready() -> void:
	level_id = "basement"
	ambience_track = "drone"
	super._ready()

func _configure_environment(env: Environment) -> void:
	env.ambient_light_energy = 0.18
	env.fog_density = 0.06
	env.fog_light_color = Color(0.04, 0.05, 0.05)

func _build_level() -> void:
	_power_on_start = GameManager.get_flag_bool("power_on")
	add_spawn("from_interior", Vector3(0, FY + 0.2, 2), 0.0)
	add_spawn("from_lower", Vector3(0, FY + 0.2, -20), 0.0)
	add_spawn("start", Vector3(0, FY + 0.2, 2), 0.0)

	WorldBuilder.add_floor(geo, Vector3(0, FY, -10), Vector2(28, 32), GameTypes.SurfaceType.CONCRETE, MaterialLibrary.wet_tile())
	WorldBuilder.ceiling(geo, Vector3(0, 0, -10), Vector2(28, 32), FY + H, MaterialLibrary.dirty_concrete())

	var wm: StandardMaterial3D = MaterialLibrary.building_wall()
	# Perimeter.
	WorldBuilder.wall_run_z(geo, -14, -26, 6, FY, H, [], wm)
	WorldBuilder.wall_run_z(geo, 14, -26, 6, FY, H, [], wm)
	WorldBuilder.wall_run_x(geo, 6, -14, 14, FY, H, [], wm)
	WorldBuilder.wall_run_x(geo, -26, -14, 14, FY, H, [], wm)
	# Central corridor walls (x = -3 and x = 3), doorways into the two halls.
	WorldBuilder.wall_run_z(geo, -3, -22, 4, FY, H, [Vector2(-14, 1.8)], wm)
	WorldBuilder.wall_run_z(geo, 3, -22, 4, FY, H, [Vector2(-14, 1.8)], wm)
	# North cap before the lift alcove.
	WorldBuilder.wall_run_x(geo, -22, -3, 3, FY, H, [Vector2(0, 1.8)], wm)

	_build_generator_room()
	_build_morgue()
	_build_lift()
	_build_pipes()

	var patrol: Array[Vector3] = [Vector3(0, 0.2, -2), Vector3(-8, 0.2, -14), Vector3(8, 0.2, -14), Vector3(0, 0.2, -19)]
	_monster = spawn_monster(Vector3(8, 0.2, -16), 180.0, patrol, _power_on_start)

func _build_generator_room() -> void:
	var center: Vector3 = Vector3(-8, FY, -14)
	register_flicker_light(WorldBuilder.fluorescent(props, center + Vector3(0, H - 0.3, 0), _power_on_start))
	var gen: GeneratorPuzzle = GeneratorPuzzle.new()
	gen.position = center + Vector3(-3, 0, -3)
	gen.rotation.y = PI * 0.5
	dynamic.add_child(gen)
	WorldBuilder.cabinet(props, center + Vector3(3, 0, -3), PI)
	WorldBuilder.blood_stain(props, center + Vector3(0, 0.02, 1), 1.2)

func _build_morgue() -> void:
	var center: Vector3 = Vector3(8, FY, -14)
	register_flicker_light(WorldBuilder.fluorescent(props, center + Vector3(0, H - 0.3, 0), _power_on_start))
	# Body trays along the wall.
	for i: int in range(4):
		var z: float = -2.0 + i * 1.4
		WorldBuilder.static_box(props, center + Vector3(4, 0.6, z), Vector3(1.6, 0.5, 1.0), MaterialLibrary.painted_metal())
	for i: int in range(3):
		WorldBuilder.visual_box(props, center + Vector3(-2 + i * 1.6, 0.5, 2), Vector3(0.8, 0.3, 1.9), MaterialLibrary.bed_sheet())
	WorldBuilder.blood_stain(props, center + Vector3(0, 0.02, 0), 2.0)

	var report: DocumentPickup = DocumentPickup.new()
	report.document_id = "doc_morgue_report" if DocumentDatabase.has("doc_morgue_report") else "doc_fire_report"
	report.position = center + Vector3(-3, 0.82, -2)
	dynamic.add_child(report)

	# Third access seal.
	var seal: PickupItem = PickupItem.new()
	seal.item_id = "security_access_seal"
	seal.persistent_id = "bsm_seal_morgue"
	seal.position = center + Vector3(3, 0.95, 2)
	dynamic.add_child(seal)

	# Quest 4: explore the morgue + survive the encounter.
	var explore: TriggerVolume = TriggerVolume.new()
	explore.box_size = Vector3(9, 3, 12)
	explore.position = center
	explore.quest_id = "q4_lower"
	explore.quest_step = "explore_morgue"
	explore.persistent_id = "bsm_explore"
	explore.once = true
	explore.on_enter = _begin_encounter
	dynamic.add_child(explore)

func _build_lift() -> void:
	var lift: LevelDoor = LevelDoor.new()
	lift.target_level = "lower"
	lift.target_spawn = "from_basement"
	lift.transition_label = "Take the lift down"
	lift.required_flag = "power_on"
	lift.required_flag2 = "lockdown_cleared"
	lift.locked_message = "The lift is dead. Restore power and clear the lockdown."
	lift.quest_id = "q4_lower"
	lift.quest_step = "enter_underground"
	lift.position = Vector3(0, FY, -23.5)
	dynamic.add_child(lift)
	WorldBuilder.add_floor(props, Vector3(0, FY + 0.05, -23), Vector2(3.4, 2.5), GameTypes.SurfaceType.METAL, MaterialLibrary.rusted_metal())

func _build_pipes() -> void:
	for z: float in [-4.0, -12.0, -20.0]:
		WorldBuilder.pipe(props, Vector3(-13, H - 0.4, z), Vector3(13, H - 0.4, z), 0.1)

func on_level_ready(_spawn_id: String) -> void:
	GameManager.set_checkpoint("basement", "from_interior")
	GameManager.show_subtitle("The air down here is wet, and old, and wrong.", 5.0)

## Scripted morgue encounter (Quest 4: survive_encounter).
func _begin_encounter(_player: Node) -> void:
	if _encounter_started:
		return
	_encounter_started = true
	EventManager.trigger_event("light_shutdown", {"duration": 3.0}, 1.0, true)
	AudioManager.play_2d("sting", -4.0)
	GameManager.show_subtitle("Something just moved between the trays.", 4.0)
	if _monster != null and _monster.has_method("wake"):
		_monster.call("wake")
		if _monster.has_method("set_aggression"):
			_monster.call("set_aggression", 1.4 * GameManager.difficulty_config.monster_aggression_mult)
		if _monster.has_method("force_state"):
			_monster.call("force_state", GameTypes.MonsterState.SEARCH)
	await get_tree().create_timer(8.0).timeout
	var player: Node3D = GameManager.get_player()
	if player != null and player is Player and not (player as Player).is_dead():
		QuestManager.complete_step("q4_lower", "survive_encounter")
		GameManager.notify("You lost it in the dark — for now.")
