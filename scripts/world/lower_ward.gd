extends LevelBase
## The lower ward — red emergency lighting, backward announcements, an aggressive
## Attendant, the ritual puzzle (Puzzle 4) and most of the endgame evidence.

const H: float = 3.2
const FY: float = 0.0

func _ready() -> void:
	level_id = "lower"
	ambience_track = "drone"
	super._ready()

func _configure_environment(env: Environment) -> void:
	env.ambient_light_color = Color(0.18, 0.04, 0.04)
	env.ambient_light_energy = 0.3
	env.fog_light_color = Color(0.12, 0.02, 0.02)
	env.fog_density = 0.07

func _build_level() -> void:
	add_spawn("from_basement", Vector3(0, FY + 0.2, 2), 0.0)
	add_spawn("start", Vector3(0, FY + 0.2, 2), 0.0)

	WorldBuilder.add_floor(geo, Vector3(0, FY, -10), Vector2(24, 28), GameTypes.SurfaceType.CONCRETE, MaterialLibrary.dirty_concrete())
	WorldBuilder.ceiling(geo, Vector3(0, 0, -10), Vector2(24, 28), FY + H, MaterialLibrary.dirty_concrete())
	var wm: StandardMaterial3D = MaterialLibrary.dirty_concrete()
	WorldBuilder.wall_run_z(geo, -12, -24, 4, FY, H, [], wm)
	WorldBuilder.wall_run_z(geo, 12, -24, 4, FY, H, [], wm)
	WorldBuilder.wall_run_x(geo, 4, -12, 12, FY, H, [], wm)
	WorldBuilder.wall_run_x(geo, -24, -12, 12, FY, H, [], wm)
	# A chamber wall separating the ritual room from the lab approach.
	WorldBuilder.wall_run_x(geo, -18, -12, 12, FY, H, [Vector2(0, 1.8)], wm)

	# Red emergency lights.
	for z: float in [0.0, -8.0, -16.0]:
		var red: OmniLight3D = WorldBuilder.omni(props, Vector3(0, FY + H - 0.3, z), Color(0.9, 0.12, 0.1), 1.4, 9.0, false)
		red.set_meta("base_energy", 1.4)
		register_flicker_light(red)

	_build_ritual()
	_build_evidence()
	_build_lab_door()
	WorldBuilder.blood_stain(props, Vector3(2, FY + 0.02, -6), 2.4)
	WorldBuilder.wheelchair(props, Vector3(-4, FY, -4), 0.8)

	var patrol: Array[Vector3] = [Vector3(0, 0.2, -2), Vector3(-6, 0.2, -12), Vector3(6, 0.2, -12), Vector3(0, 0.2, -15)]
	var monster: Node = spawn_monster(Vector3(0, 0.2, -14), 180.0, patrol, true)
	if monster != null and monster.has_method("set_aggression"):
		monster.call("set_aggression", 1.5 * GameManager.difficulty_config.monster_aggression_mult)

func _build_ritual() -> void:
	var ritual: RitualPuzzle = RitualPuzzle.new()
	ritual.position = Vector3(0, FY, -14)
	dynamic.add_child(ritual)
	var notes: DocumentPickup = DocumentPickup.new()
	notes.document_id = "doc_ritual_notes"
	notes.position = Vector3(-5, FY + 0.82, -10)
	dynamic.add_child(notes)

func _build_evidence() -> void:
	var journal: DocumentPickup = DocumentPickup.new()
	journal.document_id = "doc_voss_journal"
	journal.position = Vector3(5, FY + 0.82, -10)
	dynamic.add_child(journal)
	var explog: DocumentPickup = DocumentPickup.new()
	explog.document_id = "doc_experiment_log"
	explog.position = Vector3(-5, FY + 0.82, -6)
	dynamic.add_child(explog)

	var v1: AudioLogPickup = AudioLogPickup.new()
	v1.audio_log_id = "log_voss_1"
	v1.position = Vector3(5, FY + 0.7, -6)
	dynamic.add_child(v1)
	var v2: AudioLogPickup = AudioLogPickup.new()
	v2.audio_log_id = "log_voss_2"
	v2.position = Vector3(4, FY + 0.7, -14)
	dynamic.add_child(v2)
	var sec: AudioLogPickup = AudioLogPickup.new()
	sec.audio_log_id = "log_security"
	sec.position = Vector3(-4, FY + 0.7, -14)
	dynamic.add_child(sec)

func _build_lab_door() -> void:
	var door: LevelDoor = LevelDoor.new()
	door.target_level = "lab"
	door.target_spawn = "from_lower"
	door.transition_label = "Enter the laboratory"
	door.required_flag = "ritual_solved"
	door.locked_message = "Sealed by three symbols. Align them as the notes describe."
	door.quest_id = "q5_stop"
	door.quest_step = "find_lab"
	door.position = Vector3(0, FY, -22)
	dynamic.add_child(door)

func on_level_ready(_spawn_id: String) -> void:
	GameManager.set_checkpoint("lower", "from_basement")
	GameManager.set_flag("lower_ward_reached", true)
	EventManager.tension = 1.0
	AudioManager.play_2d("static", -10.0)
	GameManager.show_subtitle("The intercom crackles — an announcement, played backward.", 5.0)
	await get_tree().create_timer(4.0).timeout
	AudioManager.play_2d("whisper", -6.0)
	GameManager.show_subtitle("It knows you're down here now.", 4.0)
