extends LevelBase
## QUEST 1 — Enter the Hospital. A foggy forecourt: forest, the chained main gate,
## and the maintenance building that holds the flashlight and the way inside.

var _moon: DirectionalLight3D
var _silhouette: Node3D

func _ready() -> void:
	level_id = "exterior"
	ambience_track = "drone"
	super._ready()

func _configure_environment(env: Environment) -> void:
	env.background_color = Color(0.02, 0.03, 0.05)
	env.ambient_light_color = Color(0.10, 0.13, 0.20)
	env.ambient_light_energy = 0.45
	env.fog_light_color = Color(0.06, 0.08, 0.12)
	env.fog_density = 0.05

func _build_level() -> void:
	add_spawn("start", Vector3(0, 0.2, 22), 180.0)

	# Moonlight.
	_moon = DirectionalLight3D.new()
	_moon.rotation = Vector3(deg_to_rad(-55), deg_to_rad(35), 0)
	_moon.light_color = Color(0.55, 0.62, 0.85)
	_moon.light_energy = 0.35
	_moon.shadow_enabled = true
	_moon.directional_shadow_max_distance = 45.0
	add_child(_moon)

	# Ground + path.
	WorldBuilder.add_floor(geo, Vector3(0, 0, 6), Vector2(50, 64), GameTypes.SurfaceType.DIRT, MaterialLibrary.forest_ground())
	WorldBuilder.add_floor(props, Vector3(0, 0.02, 10), Vector2(3.5, 40), GameTypes.SurfaceType.CONCRETE, MaterialLibrary.dirty_concrete())

	_scatter_trees()
	_build_facade()
	_build_maintenance()
	_build_triggers()
	_build_rain()

func _scatter_trees() -> void:
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = 1986
	for i: int in range(56):
		var side: float = 1.0 if rng.randf() > 0.5 else -1.0
		var x: float = side * rng.randf_range(5.0, 23.0)
		var z: float = rng.randf_range(-12.0, 32.0)
		WorldBuilder.tree(props, Vector3(x, 0, z), rng.randf_range(6.0, 11.0))
	# Undergrowth bushes for forest density.
	for i: int in range(34):
		var side2: float = 1.0 if rng.randf() > 0.5 else -1.0
		WorldBuilder.bush(props, Vector3(side2 * rng.randf_range(4.0, 24.0), 0, rng.randf_range(-12.0, 32.0)), rng.randf_range(0.8, 1.6))
	for i: int in range(12):
		WorldBuilder.rock(geo, Vector3(rng.randf_range(-18, 18), 0, rng.randf_range(-6, 28)), rng.randf_range(0.6, 1.8))

func _build_facade() -> void:
	var wall_mat: StandardMaterial3D = MaterialLibrary.building_wall()
	# Main facade with a central gate gap, plus a window strip where a figure waits.
	WorldBuilder.wall(geo, Vector3(-16, 0, -6), Vector3(-2.2, 0, -6), 6.0, 0.5, wall_mat)
	WorldBuilder.wall(geo, Vector3(2.2, 0, -6), Vector3(16, 0, -6), 6.0, 0.5, wall_mat)
	WorldBuilder.visual_box(geo, Vector3(0, 5.2, -6), Vector3(4.6, 1.6, 0.5), wall_mat)
	# Side walls enclosing a shallow courtyard.
	WorldBuilder.wall(geo, Vector3(-16, 0, -6), Vector3(-16, 0, -16), 6.0, 0.5, wall_mat)
	WorldBuilder.wall(geo, Vector3(16, 0, -6), Vector3(16, 0, -16), 6.0, 0.5, wall_mat)
	WorldBuilder.wall(geo, Vector3(-16, 0, -16), Vector3(16, 0, -16), 6.0, 0.5, wall_mat)
	WorldBuilder.add_floor(geo, Vector3(0, 0, -11), Vector2(32, 10), GameTypes.SurfaceType.CONCRETE, MaterialLibrary.wet_tile())

	# Lit windows.
	for x: float in [-9.0, -5.0, 5.0, 9.0]:
		WorldBuilder.visual_box(props, Vector3(x, 2.4, -5.7), Vector3(1.4, 1.8, 0.1), MaterialLibrary.get_emissive("window", Color(0.12, 0.13, 0.10), 0.8))

	# The chained main gate (cannot be opened from here).
	var gate: LockedDoor = LockedDoor.new()
	gate.jammed = true
	gate.jammed_message = "The gate is chained and padlocked. Not this way."
	gate.door_color = Color(0.22, 0.16, 0.12)
	gate.position = Vector3(-2.0, 0, -6)
	dynamic.add_child(gate)

	# The waiting silhouette (revealed during the intro lightning).
	_silhouette = Node3D.new()
	_silhouette.position = Vector3(5.0, 0, -5.5)
	var torso: MeshInstance3D = WorldBuilder.visual_box(_silhouette, Vector3(0, 1.5, 0), Vector3(0.5, 1.9, 0.4), MaterialLibrary.monster_skin())
	torso.visible = true
	WorldBuilder.visual_box(_silhouette, Vector3(0, 2.6, 0), Vector3(0.35, 0.35, 0.35), MaterialLibrary.monster_skin())
	_silhouette.visible = false
	dynamic.add_child(_silhouette)

func _build_maintenance() -> void:
	var wall_mat: StandardMaterial3D = MaterialLibrary.peeling_paint()
	var center: Vector3 = Vector3(13, 0, 2)
	WorldBuilder.room(geo, center, Vector2(8, 9), 3.2, GameTypes.SurfaceType.CONCRETE, wall_mat, MaterialLibrary.dirty_concrete(),
		[["w", 4.5, 1.6]])   # doorway on the west side facing the path
	var lamp: OmniLight3D = WorldBuilder.fluorescent(props, center + Vector3(0, 3.0, 0), true)
	register_flicker_light(lamp)
	WorldBuilder.desk(props, center + Vector3(2, 0, -2.5), PI)
	WorldBuilder.cabinet(props, center + Vector3(-2.5, 0, -3), 0.0)
	WorldBuilder.pipe(props, center + Vector3(-3.5, 3.0, -3), center + Vector3(3.5, 3.0, -3))

	# Flashlight pickup (Quest 1: get_flashlight).
	var flashlight: PickupItem = PickupItem.new()
	flashlight.item_id = "flashlight"
	flashlight.quest_id = "q1_enter"
	flashlight.quest_step = "get_flashlight"
	flashlight.persistent_id = "ext_flashlight"
	flashlight.position = center + Vector3(2, 0.85, -2.5)
	dynamic.add_child(flashlight)

	# A note from the sender (gate code lore) on the desk.
	var note: DocumentPickup = DocumentPickup.new()
	note.document_id = "doc_intro_letter"
	note.position = center + Vector3(1.4, 0.82, -2.5)
	dynamic.add_child(note)

	# Door into the hospital proper -> reception (interior).
	var entry: LevelDoor = LevelDoor.new()
	entry.target_level = "interior"
	entry.target_spawn = "from_exterior"
	entry.transition_label = "Enter the hospital"
	entry.quest_id = "q1_enter"
	entry.quest_step = "reach_reception"
	entry.position = center + Vector3(0, 0, 4.4)
	entry.rotation.y = PI
	dynamic.add_child(entry)

func _build_triggers() -> void:
	var cross: TriggerVolume = TriggerVolume.new()
	cross.box_size = Vector3(40, 4, 4)
	cross.position = Vector3(0, 1.5, 12)
	cross.quest_id = "q1_enter"
	cross.quest_step = "cross_forest"
	cross.subtitle = "The hospital. After three years, I'm finally here."
	cross.persistent_id = "ext_cross"
	dynamic.add_child(cross)

	var gate_trigger: TriggerVolume = TriggerVolume.new()
	gate_trigger.box_size = Vector3(8, 4, 4)
	gate_trigger.position = Vector3(0, 1.5, -2)
	gate_trigger.quest_id = "q1_enter"
	gate_trigger.quest_step = "reach_gate"
	gate_trigger.subtitle = "Chained shut. There's a maintenance building to the east."
	gate_trigger.persistent_id = "ext_gate"
	dynamic.add_child(gate_trigger)

	var maint_trigger: TriggerVolume = TriggerVolume.new()
	maint_trigger.box_size = Vector3(2, 4, 2)
	maint_trigger.position = Vector3(9.2, 1.5, 2)
	maint_trigger.quest_id = "q1_enter"
	maint_trigger.quest_step = "enter_maintenance"
	maint_trigger.subtitle = "Unlocked. Of course it is."
	maint_trigger.persistent_id = "ext_maint"
	dynamic.add_child(maint_trigger)

func _build_rain() -> void:
	var rain: CPUParticles3D = CPUParticles3D.new()
	rain.amount = 700
	rain.lifetime = 1.2
	rain.position = Vector3(0, 14, 6)
	rain.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	rain.emission_box_extents = Vector3(24, 0.5, 30)
	rain.direction = Vector3(0.1, -1, 0)
	rain.spread = 2.0
	rain.initial_velocity_min = 16.0
	rain.initial_velocity_max = 20.0
	rain.gravity = Vector3(0, -9.8, 0)
	rain.scale_amount_min = 0.02
	rain.scale_amount_max = 0.04
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = Vector3(0.02, 0.35, 0.02)
	rain.mesh = mesh
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Color(0.6, 0.7, 0.85, 0.4)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rain.mesh.surface_set_material(0, mat)
	props.add_child(rain)

func on_level_ready(_spawn_id: String) -> void:
	_play_intro()

func _play_intro() -> void:
	GameManager.show_subtitle("Lena's last message: \"Do not let them open the lower ward.\"", 6.0)
	await get_tree().create_timer(3.0).timeout
	AudioManager.play_2d("thunder", -4.0)
	await _lightning_flash()
	GameManager.show_subtitle("Did something just move at that window?", 4.0)

func _lightning_flash() -> void:
	if not is_instance_valid(_moon):
		return
	if is_instance_valid(_silhouette):
		_silhouette.visible = true
	var tween: Tween = create_tween()
	tween.tween_property(_moon, "light_energy", 3.2, 0.08)
	tween.tween_property(_moon, "light_energy", 0.35, 0.25)
	tween.tween_property(_moon, "light_energy", 2.4, 0.06)
	tween.tween_property(_moon, "light_energy", 0.35, 0.4)
	await tween.finished
	if is_instance_valid(_silhouette):
		_silhouette.visible = false
