extends BackroomsBase
## LEVEL 0 — "The Lobby". The iconic mono-yellow rooms: buzzing fluorescents, damp
## carpet, the hum. Find three exit sigils, reach the exit, drop to Level 1.

func _ready() -> void:
	level_id = "backrooms"
	ambience_track = "hum"
	glb_path = "res://assets/environment/backrooms.glb"
	glb_scale = 1.0
	glb_offset_y = 0.0
	spawn_height = 3.0

	marker_item = "exit_sigil"
	marker_count = 3
	marker_flag = "exit_open"
	marker_quest = "qb_escape"
	marker_step = "find_sigils"
	intro_step = "no_clip"
	intro_text = "You no-clipped through the wall. This is not a place. Keep moving."
	exit_step = "reach_exit"
	exit_target_level = "backrooms_l1"
	exit_target_spawn = "start"

	monster_model = "res://assets/monster/zombie_hazmat.glb"
	monster_scale = 1.12
	monster_proximity = 6.5
	monster_aggression = 1.3
	super._ready()

func _configure_environment(env: Environment) -> void:
	env.background_color = Color(0.16, 0.15, 0.08)
	env.ambient_light_color = Color(1.0, 0.93, 0.62)
	env.ambient_light_energy = 1.15
	env.fog_enabled = true
	env.fog_light_color = Color(0.55, 0.5, 0.28)
	env.fog_density = 0.018
	env.adjustment_saturation = 1.1
	env.glow_enabled = true
	env.glow_intensity = 0.7

func _build_story() -> void:
	_add_doc("doc_br_survival", _story_nodes)
	_add_audio("log_br_intro", _story_nodes)
	_add_doc("doc_br_wanderer", _story_nodes)

func _build_easter_eggs() -> void:
	# A scrawled smiley — the Backrooms classic.
	var smiley: InspectClue = InspectClue.new()
	smiley.label = "Scrawled on the wallpaper in marker: =)  ...you are not the first."
	smiley.mesh_kind = "box"
	smiley.tint = Color(0.1, 0.1, 0.1)
	dynamic.add_child(smiley)
	_egg_nodes.append(smiley)
	# Almond water stash.
	var water: PickupItem = PickupItem.new()
	water.item_id = "almond_water"
	water.amount = 2
	water.persistent_id = "br_l0_water"
	water.custom_label = "Take the almond water"
	dynamic.add_child(water)
	_egg_nodes.append(water)
	# Crossover easter egg toward the hospital campaign.
	_add_doc("doc_br_crossover", _egg_nodes)

func _add_doc(doc_id: String, into: Array[Node3D]) -> void:
	var d: DocumentPickup = DocumentPickup.new()
	d.document_id = doc_id
	d.position = Vector3(2.5, glb_offset_y + 0.4, 4.0)
	dynamic.add_child(d)
	into.append(d)

func _add_audio(log_id: String, into: Array[Node3D]) -> void:
	var a: AudioLogPickup = AudioLogPickup.new()
	a.audio_log_id = log_id
	a.position = Vector3(1.5, glb_offset_y + 0.4, 2.5)
	dynamic.add_child(a)
	into.append(a)
