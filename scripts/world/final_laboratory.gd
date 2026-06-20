extends LevelBase
## Doctor Voss's laboratory — the end of the road. Lena's final recording, the
## containment coil, and the device where the player makes the choice (Quest 5).

const H: float = 3.4
const FY: float = 0.0

func _ready() -> void:
	level_id = "lab"
	ambience_track = "hum"
	super._ready()

func _configure_environment(env: Environment) -> void:
	env.ambient_light_color = Color(0.12, 0.13, 0.12)
	env.ambient_light_energy = 0.4
	env.fog_density = 0.04

func _build_level() -> void:
	add_spawn("from_lower", Vector3(0, FY + 0.2, 2), 0.0)
	add_spawn("start", Vector3(0, FY + 0.2, 2), 0.0)

	WorldBuilder.add_floor(geo, Vector3(0, FY, -6), Vector2(20, 20), GameTypes.SurfaceType.TILE, MaterialLibrary.wet_tile())
	WorldBuilder.ceiling(geo, Vector3(0, 0, -6), Vector2(20, 20), FY + H, MaterialLibrary.ceiling())
	var wm: StandardMaterial3D = MaterialLibrary.peeling_paint()
	WorldBuilder.wall_run_z(geo, -10, -16, 4, FY, H, [], wm)
	WorldBuilder.wall_run_z(geo, 10, -16, 4, FY, H, [], wm)
	WorldBuilder.wall_run_x(geo, 4, -10, 10, FY, H, [], wm)
	WorldBuilder.wall_run_x(geo, -16, -10, 10, FY, H, [], wm)

	register_flicker_light(WorldBuilder.fluorescent(props, Vector3(0, FY + H - 0.3, -2), true))
	register_flicker_light(WorldBuilder.fluorescent(props, Vector3(0, FY + H - 0.3, -10), true))

	# Operating table + cabinets.
	WorldBuilder.static_box(props, Vector3(-4, FY + 0.5, -4), Vector3(1.0, 0.1, 2.0), MaterialLibrary.painted_metal())
	WorldBuilder.cabinet(props, Vector3(4, FY, -4), PI)
	WorldBuilder.cabinet(props, Vector3(-6, FY, -8), 0.0)
	WorldBuilder.blood_stain(props, Vector3(-4, FY + 0.02, -4), 1.4)

	# Quest 5: Lena's final recording (records evidence "lena_final").
	var recorder: AudioLogPickup = AudioLogPickup.new()
	recorder.audio_log_id = "log_lena_final"
	recorder.quest_id = "q5_stop"
	recorder.quest_step = "recover_final"
	recorder.position = Vector3(-4, FY + 0.62, -4)
	dynamic.add_child(recorder)

	# Lena's note (last evidence flavour) + the containment coil.
	var note: DocumentPickup = DocumentPickup.new()
	note.document_id = "doc_final_note"
	note.position = Vector3(4, FY + 0.82, -4)
	dynamic.add_child(note)
	var coil: PickupItem = PickupItem.new()
	coil.item_id = "containment_coil"
	coil.persistent_id = "lab_coil"
	coil.position = Vector3(-6, FY + 0.95, -8)
	dynamic.add_child(coil)

	# Backup copies of the key evidence, so the Containment ending stays reachable
	# even if the player skipped a document earlier.
	var j: DocumentPickup = DocumentPickup.new()
	j.document_id = "doc_voss_journal"
	j.position = Vector3(6, FY + 0.82, -8)
	dynamic.add_child(j)

	# The containment device (the choice).
	var console: EndingConsole = EndingConsole.new()
	console.position = Vector3(0, FY, -12)
	dynamic.add_child(console)

func on_level_ready(_spawn_id: String) -> void:
	GameManager.set_checkpoint("lab", "from_lower")
	GameManager.show_subtitle("Voss's laboratory. The lattice fills the far wall, breathing.", 6.0)
