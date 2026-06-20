extends LevelBase
## Reception, ward corridors, treatment, security and archive rooms. Hosts most of
## Quest 2 (power items), Quest 3 (archive) and the Quest 4 seals + lockdown. A
## single continuous floor guarantees the baked navmesh is fully connected.

const H: float = 4.0
const FLOOR_Y: float = 0.0

var _power_on_start: bool = false
var _seals_done: bool = false

func _ready() -> void:
	level_id = "interior"
	ambience_track = "hum"
	super._ready()

func _configure_environment(env: Environment) -> void:
	env.ambient_light_energy = 0.28
	env.fog_density = 0.03

func _build_level() -> void:
	_power_on_start = GameManager.get_flag_bool("power_on")
	add_spawn("from_exterior", Vector3(0, FLOOR_Y + 0.2, 6), 0.0)
	add_spawn("from_basement", Vector3(0, FLOOR_Y + 0.2, -29), 0.0)
	add_spawn("start", Vector3(0, FLOOR_Y + 0.2, 6), 0.0)

	# One big floor + ceiling for the whole interior footprint.
	WorldBuilder.add_floor(geo, Vector3(0, FLOOR_Y, -12), Vector2(32, 44), GameTypes.SurfaceType.TILE, MaterialLibrary.floor_tile())
	WorldBuilder.ceiling(geo, Vector3(0, 0, -12), Vector2(32, 44), FLOOR_Y + H, MaterialLibrary.ceiling())

	_build_walls()
	_build_reception()
	_build_treatment()
	_build_ward()
	_build_security()
	_build_archive()
	_build_storage()
	_dress_with_pack()
	_build_monster()
	_connect_seal_tracker()

## Decorates the level with pieces from the imported hospital asset pack (visual
## only; the blockout keeps collision/navigation). Skipped cleanly if the pack
## is not installed.
func _dress_with_pack() -> void:
	if not HospitalAssets.available():
		return
	# Reception waiting area.
	HospitalAssets.spawn(props, "SM_Couch", Vector3(5, FLOOR_Y, 3), 90.0)
	HospitalAssets.spawn(props, "SM_Chair2", Vector3(3, FLOOR_Y, 4), 0.0)
	HospitalAssets.spawn(props, "SM_Chair2", Vector3(3, FLOOR_Y, 5), 0.0)
	HospitalAssets.spawn(props, "SM_TrashContainer", Vector3(6, FLOOR_Y, 6), 0.0)
	HospitalAssets.spawn(props, "SM_Drip", Vector3(-6, FLOOR_Y, 2), 0.0)
	# Corridor: wall lockers + ceiling pipe runs.
	for z: float in [-7.0, -12.0, -18.0, -25.0]:
		HospitalAssets.spawn(props, "SM_Locker", Vector3(-1.7, FLOOR_Y + 0.9, z), 90.0)
	HospitalAssets.spawn(props, "SM_PipeBig1", Vector3(1.7, FLOOR_Y + H - 0.4, -10), 0.0)
	HospitalAssets.spawn(props, "SM_PipeBig2", Vector3(1.7, FLOOR_Y + H - 0.4, -20), 0.0)
	HospitalAssets.spawn(props, "SM_PipeSmall1", Vector3(-1.7, FLOOR_Y + H - 0.6, -16), 0.0)
	# Treatment + ward + archive dressing.
	HospitalAssets.spawn(props, "SM_Drip", Vector3(-11, FLOOR_Y, -7), 0.0)
	HospitalAssets.spawn(props, "SM_Shelf1", Vector3(-12, FLOOR_Y + 1.0, -11), 90.0)
	HospitalAssets.spawn(props, "SM_Drip", Vector3(11, FLOOR_Y, -11), 0.0)
	HospitalAssets.spawn(props, "SM_Tray2", Vector3(9, FLOOR_Y + 0.78, -7), 0.0)
	HospitalAssets.spawn(props, "SM_Shelf2", Vector3(12, FLOOR_Y + 1.0, -25), -90.0)

func _build_walls() -> void:
	var wm: StandardMaterial3D = MaterialLibrary.peeling_paint()
	# Perimeter (x -16..16, z -34..10).
	_wall_x(-16, -34, 10, [], wm)
	_wall_x(16, -34, 10, [], wm)
	_wall_z(10, -16, 16, [], wm)
	_wall_z(-34, -16, 16, [], wm)
	# Reception / corridor partition at z = -3 (doorway at x=0).
	_wall_z(-3, -16, 16, [Vector2(0, 1.6)], wm)
	# Corridor walls at x = -2 and x = 2 (z -3..-31), doorways to rooms.
	_wall_x(-2, -31, -3, [Vector2(-9, 1.6), Vector2(-23, 1.6)], wm)
	_wall_x(2, -31, -3, [Vector2(-9, 1.6), Vector2(-23, 1.6)], wm)
	# Side-room divider walls at z = -15.
	_wall_z(-15, -16, -2, [], wm)
	_wall_z(-15, 2, 16, [], wm)
	# Corridor north cap at z = -31 (doorway to storage/stairs).
	_wall_z(-31, -2, 2, [Vector2(0, 1.6)], wm)

func _build_reception() -> void:
	_light(Vector3(0, FLOOR_Y + H - 0.3, 3), _power_on_start)
	WorldBuilder.desk(props, Vector3(-4, FLOOR_Y, 5), 0.3)
	WorldBuilder.chair(props, Vector3(-4, FLOOR_Y, 6), 0.0)
	WorldBuilder.blood_stain(props, Vector3(3, FLOOR_Y + 0.02, 2), 1.4)
	# Collapsed main entrance (you cannot leave the way you came).
	for i: int in range(5):
		WorldBuilder.rock(geo, Vector3(-2 + i * 1.0, FLOOR_Y, 8.5), randf_range(1.2, 1.8))

	# Quest 2: the electrical map.
	var map: DocumentPickup = DocumentPickup.new()
	map.document_id = "doc_electrical_map"
	map.quest_id = "q2_power"
	map.quest_step = "find_map"
	map.position = Vector3(-4, FLOOR_Y + 0.82, 5)
	dynamic.add_child(map)
	# An item version so the map shows in the inventory too.
	var map_item: PickupItem = PickupItem.new()
	map_item.item_id = "electrical_map"
	map_item.persistent_id = "int_map_item"
	map_item.position = Vector3(-3.4, FLOOR_Y + 0.85, 5)
	dynamic.add_child(map_item)

	var admit: DocumentPickup = DocumentPickup.new()
	admit.document_id = "doc_admission_log"
	admit.position = Vector3(-4.6, FLOOR_Y + 0.82, 4.4)
	dynamic.add_child(admit)

func _build_treatment() -> void:
	var center: Vector3 = Vector3(-9, FLOOR_Y, -9)
	_light(center + Vector3(0, H - 0.3, 0), _power_on_start)
	WorldBuilder.hospital_bed(props, center + Vector3(-3, 0, 0), PI * 0.5)
	WorldBuilder.hospital_bed(props, center + Vector3(3, 0, 0), PI * 0.5)
	WorldBuilder.cabinet(props, center + Vector3(0, 0, -4), 0.0)
	WorldBuilder.blood_stain(props, center + Vector3(-3, 0.02, 1), 1.0)

	_place_pickup("generator_fuse_a", "q2_power", "find_fuse_a", center + Vector3(0, 0.95, -4), "int_fuse_a")
	_place_pickup("flashlight_battery", "", "", center + Vector3(1, 0.95, -4), "int_batt_1")
	_place_pickup("archive_key", "q3_records", "find_archive_key", center + Vector3(-3, 0.65, 0), "int_archive_key")

	var note: DocumentPickup = DocumentPickup.new()
	note.document_id = "doc_staff_warning"
	note.position = center + Vector3(3, 0.7, 0.2)
	dynamic.add_child(note)

func _build_ward() -> void:
	var center: Vector3 = Vector3(9, FLOOR_Y, -9)
	_light(center + Vector3(0, H - 0.3, 0), _power_on_start)
	for i: int in range(3):
		WorldBuilder.hospital_bed(props, center + Vector3(-4 + i * 4, 0, 2), 0.0)
	WorldBuilder.blood_stain(props, center + Vector3(0, 0.02, 0), 1.6)

	# Two lockers to hide in.
	var locker1: HidingLocker = HidingLocker.new()
	locker1.position = center + Vector3(-5, 0, -3)
	dynamic.add_child(locker1)
	var locker2: HidingLocker = HidingLocker.new()
	locker2.position = center + Vector3(-3.5, 0, -3)
	dynamic.add_child(locker2)

	_place_pickup("generator_fuse_b", "q2_power", "find_fuse_b", center + Vector3(4, 0.95, -3), "int_fuse_b")
	_place_seal(center + Vector3(2, 0.65, -3), "int_seal_ward")

	var log_obj: AudioLogPickup = AudioLogPickup.new()
	log_obj.audio_log_id = "log_lena_1"
	log_obj.position = center + Vector3(0, 0.7, 3)
	dynamic.add_child(log_obj)

func _build_security() -> void:
	var center: Vector3 = Vector3(-9, FLOOR_Y, -23)
	_light(center + Vector3(0, H - 0.3, 0), _power_on_start)
	WorldBuilder.desk(props, center + Vector3(0, 0, 3), PI)
	register_flicker_light(_light(center + Vector3(3, H - 0.3, -3), _power_on_start))

	# CCTV terminal (Puzzle 3) reveals the cabinet code.
	var cctv: CameraTerminal = CameraTerminal.new()
	cctv.reveal_code = "0451"
	cctv.reveal_flag = "cctv_code_known"
	cctv.position = center + Vector3(0, 0.8, 3)
	dynamic.add_child(cctv)

	# Locked cabinet: open with the CCTV code, contains a seal + battery.
	var cabinet_pad: KeypadDoor = KeypadDoor.new()
	cabinet_pad.code = "0451"
	cabinet_pad.hint = "Use the CCTV terminal — Cam 3 shows a code."
	cabinet_pad.success_flag = "security_cabinet_open"
	cabinet_pad.success_message = "The evidence cabinet clicks open."
	cabinet_pad.position = center + Vector3(-4, 1.1, -4)
	dynamic.add_child(cabinet_pad)
	var cab_seal: PickupItem = PickupItem.new()
	cab_seal.item_id = "security_access_seal"
	cab_seal.persistent_id = "int_seal_security"
	cab_seal.position = center + Vector3(-4, 0.65, -3)
	dynamic.add_child(cab_seal)

	var memo: DocumentPickup = DocumentPickup.new()
	memo.document_id = "doc_security_memo"
	memo.position = center + Vector3(0.6, 0.82, 3)
	dynamic.add_child(memo)

	# Lockdown override: needs power + all three seals (consumed).
	var lockdown: Lever = Lever.new()
	lockdown.verb = "Override lockdown"
	lockdown.flag_id = "lockdown_cleared"
	lockdown.requires_flag = "power_on"
	lockdown.required_item_id = "security_access_seal"
	lockdown.required_item_count = 3
	lockdown.consume_required = true
	lockdown.requires_message = "Lockdown active. Needs power and three access seals."
	lockdown.success_message = "Security lockdown disengaged. The lift below is live."
	lockdown.quest_id = "q4_lower"
	lockdown.quest_step = "disable_lockdown"
	lockdown.handle_color = Color(0.2, 0.5, 0.7)
	lockdown.position = center + Vector3(-4, 1.2, -4.4)
	dynamic.add_child(lockdown)

func _build_archive() -> void:
	var center: Vector3 = Vector3(9, FLOOR_Y, -23)
	_light(center + Vector3(0, H - 0.3, 0), _power_on_start)
	for i: int in range(4):
		WorldBuilder.cabinet(props, center + Vector3(-5 + i * 2.4, 0, -4), 0.0)

	# Locked archive door (needs the archive key).
	var door: LockedDoor = LockedDoor.new()
	door.required_key_id = "archive_key"
	door.position = Vector3(2, FLOOR_Y, -22.3)
	door.rotation.y = PI * 0.5
	dynamic.add_child(door)

	# Reaching the archive interior.
	var reach: TriggerVolume = TriggerVolume.new()
	reach.box_size = Vector3(8, 4, 6)
	reach.position = center
	reach.quest_id = "q3_records"
	reach.quest_step = "reach_archive"
	reach.persistent_id = "int_reach_archive"
	dynamic.add_child(reach)

	# Patient records (search_records) + the calendar clue for the keypad.
	var records: DocumentPickup = DocumentPickup.new()
	records.document_id = "doc_patient_intake"
	records.quest_id = "q3_records"
	records.quest_step = "search_records"
	records.position = center + Vector3(0, 0.82, -3.6)
	dynamic.add_child(records)
	var calendar: DocumentPickup = DocumentPickup.new()
	calendar.document_id = "doc_calendar"
	calendar.position = center + Vector3(3, 1.4, -4.6)
	dynamic.add_child(calendar)

	# Keypad (Puzzle 2): code 9861 from the calendar, unlocks Lena's recorder.
	var pad: KeypadDoor = KeypadDoor.new()
	pad.code = "9861"
	pad.hint = "The ward calendar — circled days, in the order they were taken."
	pad.success_flag = "archive_unlocked"
	pad.success_message = "A drawer slides open. Inside: a recorder."
	pad.quest_id = "q3_records"
	pad.quest_step = "decode_file"
	pad.position = center + Vector3(-5, 1.1, -4.4)
	dynamic.add_child(pad)

	var recorder: AudioLogPickup = AudioLogPickup.new()
	recorder.audio_log_id = "log_lena_intro"
	recorder.quest_id = "q3_records"
	recorder.quest_step = "play_recording"
	recorder.requires_flag = "archive_unlocked"
	recorder.locked_message = "A drawer, locked. The keypad beside it is dark."
	recorder.position = center + Vector3(-5, 0.65, -3.4)
	dynamic.add_child(recorder)

func _build_storage() -> void:
	var center: Vector3 = Vector3(0, FLOOR_Y, -32)
	_light(center + Vector3(0, H - 0.3, 1), _power_on_start)
	WorldBuilder.pipe(props, Vector3(-15, H - 0.5, -33), Vector3(15, H - 0.5, -33))

	_place_pickup("fuel_can", "q2_power", "collect_fuel", center + Vector3(-3, 0.4, 0.5), "int_fuel")

	# Stairwell down to the basement (generator + morgue).
	var stairs: LevelDoor = LevelDoor.new()
	stairs.target_level = "basement"
	stairs.target_spawn = "from_interior"
	stairs.transition_label = "Descend to the basement"
	stairs.position = Vector3(0, FLOOR_Y, -33.4)
	dynamic.add_child(stairs)

func _build_monster() -> void:
	var patrol: Array[Vector3] = [
		Vector3(0, 0.2, -8), Vector3(0, 0.2, -20), Vector3(-8, 0.2, -9),
		Vector3(8, 0.2, -23), Vector3(0, 0.2, -29), Vector3(8, 0.2, -9),
	]
	spawn_monster(Vector3(0, 0.2, -29), 180.0, patrol, _power_on_start)

# --- Quest helpers -----------------------------------------------------------

func _connect_seal_tracker() -> void:
	if not GameManager.inventory.changed.is_connected(_check_seals):
		GameManager.inventory.changed.connect(_check_seals)
	_check_seals()

func _check_seals() -> void:
	if _seals_done:
		return
	if GameManager.inventory.get_count("security_access_seal") >= 3:
		_seals_done = true
		QuestManager.complete_step("q4_lower", "find_seals")

func _place_pickup(item_id: String, quest_id: String, step: String, pos: Vector3, pid: String) -> void:
	var p: PickupItem = PickupItem.new()
	p.item_id = item_id
	p.quest_id = quest_id
	p.quest_step = step
	p.persistent_id = pid
	p.position = pos
	dynamic.add_child(p)

func _place_seal(pos: Vector3, pid: String) -> void:
	_place_pickup("security_access_seal", "", "", pos, pid)

# --- Geometry helpers --------------------------------------------------------

func _light(pos: Vector3, on: bool) -> OmniLight3D:
	var lamp: OmniLight3D = WorldBuilder.fluorescent(props, pos, on)
	return lamp

## Wall parallel to the Z axis at fixed x, from z0 to z1, leaving doorway gaps
## (each Vector2 = centre_z, width). Adds lintels above the gaps.
func _wall_x(x: float, z0: float, z1: float, gaps: Array, mat: Material) -> void:
	var sorted: Array = gaps.duplicate()
	sorted.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.x < b.x)
	var cursor: float = z0
	for gap: Vector2 in sorted:
		var gs: float = gap.x - gap.y * 0.5
		var ge: float = gap.x + gap.y * 0.5
		if gs > cursor:
			WorldBuilder.wall(geo, Vector3(x, FLOOR_Y, cursor), Vector3(x, FLOOR_Y, gs), H, 0.2, mat)
		WorldBuilder.visual_box(geo, Vector3(x, FLOOR_Y + H - 0.4, gap.x), Vector3(0.2, 0.8, gap.y), mat)
		cursor = ge
	if cursor < z1:
		WorldBuilder.wall(geo, Vector3(x, FLOOR_Y, cursor), Vector3(x, FLOOR_Y, z1), H, 0.2, mat)

## Wall parallel to the X axis at fixed z, from x0 to x1, leaving doorway gaps.
func _wall_z(z: float, x0: float, x1: float, gaps: Array, mat: Material) -> void:
	var sorted: Array = gaps.duplicate()
	sorted.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.x < b.x)
	var cursor: float = x0
	for gap: Vector2 in sorted:
		var gs: float = gap.x - gap.y * 0.5
		var ge: float = gap.x + gap.y * 0.5
		if gs > cursor:
			WorldBuilder.wall(geo, Vector3(cursor, FLOOR_Y, z), Vector3(gs, FLOOR_Y, z), H, 0.2, mat)
		WorldBuilder.visual_box(geo, Vector3(gap.x, FLOOR_Y + H - 0.4, z), Vector3(gap.y, 0.8, 0.2), mat)
		cursor = ge
	if cursor < x1:
		WorldBuilder.wall(geo, Vector3(cursor, FLOOR_Y, z), Vector3(x1, FLOOR_Y, z), H, 0.2, mat)

func _handle_custom_event(event_id: String, _payload: Dictionary) -> void:
	if event_id == "power_restored":
		for light: OmniLight3D in _flicker_lights:
			if is_instance_valid(light):
				light.light_energy = float(light.get_meta("base_energy", 1.6))
