extends Node3D
## World -- scenes/world/game_world.tscn, the gameplay scene root.
##
## Boot sequence:
##   1. show the loading overlay
##   2. register every object pool
##   3. generate the city (async, progress reported to the overlay)
##   4. spawn the hero on a street, hand the streamer its block list
##   5. build the missions, then either start the campaign or restore a save
##   6. fade the overlay out and hand control to the player
##
## Scene requirements (see game_world.tscn):
##   Node3D "World"          <- this script
##     WorldEnvironment      -> graphics_env.gd
##     Sun (DirectionalLight3D) -> day_night_cycle.gd
##     City (Node3D)         -> city_generator.gd
##     Streamer (Node)       -> world_streamer.gd
##     Missions (Node)       -> mission_director.gd
##     Actors (Node3D)       -- runtime parent for player, enemies, FX
##     HUD                   -- instance of scenes/ui/hud.tscn
##     PauseMenu             -- instance of scenes/ui/pause_menu.tscn
##
## Inspector parameters: player_scene, spawn_block, show_loading.

@export var player_scene: PackedScene
@export var spawn_block: Vector2i = Vector2i(3, 3)
@export var show_loading: bool = true

var city: Node3D
var streamer: Node
var missions: Node
var actors: Node3D
var player: CharacterBody3D

var _loading_layer: CanvasLayer
var _loading_bar: ProgressBar
var _loading_label: Label
var _tip_label: Label
var _ready_done: bool = false

const TIPS: Array[String] = [
	"Maintiens Maj pendant un balancement pour raccourcir la toile et accelerer.",
	"Relache la toile en montant : tu gagnes de la hauteur.",
	"Q envoie une toile-tyrolienne : parfait pour grimper sur un toit.",
	"Ctrl esquive. Esquiver juste avant un coup ouvre une contre-attaque.",
	"R colle une toile sur un ennemi (ou un vehicule) et le stoppe net.",
	"Cours vers un mur en l'air pour t'y accrocher, puis grimpe ou cours dessus.",
	"E est une attaque lourde de zone : ideale contre un groupe.",
	"Les articulations lumineuses des bras de Mecanix sont ses points faibles.",
]

func _ready() -> void:
	GameState.register_world(self)
	city = get_node_or_null("City")
	streamer = get_node_or_null("Streamer")
	missions = get_node_or_null("Missions")
	actors = get_node_or_null("Actors")
	if actors == null:
		actors = Node3D.new()
		actors.name = "Actors"
		add_child(actors)
	if show_loading:
		_build_loading_overlay()
	_boot()

# =============================================================================
#  BOOT
# =============================================================================

func _boot() -> void:
	Engine.time_scale = 1.0
	get_tree().paused = false

	# --- pools --------------------------------------------------------------
	EnemyFactory.ensure_pools()
	if not ObjectPool.is_registered("debris"):
		ObjectPool.register("debris", load("res://scenes/effects/debris_chunk.tscn"), 8)

	# --- city ---------------------------------------------------------------
	if city != null:
		city.generation_progress.connect(_on_generation_progress)
		await city.generate_async()
	if streamer != null and city != null:
		streamer.call("bind_city", city)

	# --- hero ---------------------------------------------------------------
	_set_progress(0.94, "Reveil du heros...")
	_spawn_player()
	await get_tree().process_frame

	# --- missions -----------------------------------------------------------
	_set_progress(0.97, "Preparation des missions...")
	if missions != null and city != null:
		missions.call("setup", city)

	# --- save or new game ---------------------------------------------------
	if not GameState.pending_save_data.is_empty():
		SaveManager.apply_pending_save()
		if missions != null:
			missions.call("resume_campaign")
		Events.toast_requested.emit("Partie chargee")
	else:
		if missions != null:
			missions.call("start_campaign")
	SaveManager.set_autosave(true)

	_set_progress(1.0, "Bonne chasse !")
	AudioManager.play_music("explore")
	await get_tree().create_timer(0.4).timeout
	_hide_loading()
	_ready_done = true
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _spawn_player() -> void:
	if player_scene == null:
		player_scene = load("res://scenes/player/player.tscn") as PackedScene
	player = player_scene.instantiate() as CharacterBody3D
	actors.add_child(player)

	var spawn := CityLayout.intersection_center(spawn_block.x, spawn_block.y)
	spawn.y = 2.0
	if GameState.pending_spawn != null and typeof(GameState.pending_spawn) == TYPE_VECTOR3:
		spawn = GameState.pending_spawn
		GameState.pending_spawn = null
	player.global_position = spawn

	# Face the hero towards downtown so the first thing seen is the skyline.
	var rig: Node3D = player.get_node_or_null("CameraRig")
	if rig != null and rig.has_method("snap_behind"):
		var to_centre: Vector3 = CityLayout.block_center(4, 4) - spawn
		rig.call("snap_behind", rad_to_deg(atan2(-to_centre.x, -to_centre.z)))

# =============================================================================
#  LOADING OVERLAY
# =============================================================================

func _build_loading_overlay() -> void:
	_loading_layer = CanvasLayer.new()
	_loading_layer.layer = 64
	add_child(_loading_layer)

	var background := ColorRect.new()
	background.color = Color(0.04, 0.05, 0.09, 1.0)
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	_loading_layer.add_child(background)

	var column := VBoxContainer.new()
	column.set_anchors_preset(Control.PRESET_CENTER)
	column.position = Vector2(-320, -110)
	column.custom_minimum_size = Vector2(640, 0)
	column.add_theme_constant_override("separation", 14)
	_loading_layer.add_child(column)

	var title := Label.new()
	title.text = "BRICK CITY HERO"
	title.add_theme_font_size_override("font_size", 52)
	title.add_theme_color_override("font_color", Color(0.92, 0.20, 0.22))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.custom_minimum_size = Vector2(640, 0)
	column.add_child(title)

	_loading_label = Label.new()
	_loading_label.text = "Chargement..."
	_loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading_label.custom_minimum_size = Vector2(640, 0)
	_loading_label.add_theme_font_size_override("font_size", 18)
	_loading_label.add_theme_color_override("font_color", Color(0.85, 0.9, 1.0))
	column.add_child(_loading_label)

	_loading_bar = ProgressBar.new()
	_loading_bar.custom_minimum_size = Vector2(640, 18)
	_loading_bar.max_value = 1.0
	_loading_bar.value = 0.0
	_loading_bar.show_percentage = false
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.09, 0.10, 0.16)
	bg.set_corner_radius_all(9)
	var fg := StyleBoxFlat.new()
	fg.bg_color = Color(1.0, 0.82, 0.25)
	fg.set_corner_radius_all(9)
	_loading_bar.add_theme_stylebox_override("background", bg)
	_loading_bar.add_theme_stylebox_override("fill", fg)
	column.add_child(_loading_bar)

	_tip_label = Label.new()
	_tip_label.text = "Astuce : " + TIPS[randi() % TIPS.size()]
	_tip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tip_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tip_label.custom_minimum_size = Vector2(640, 0)
	_tip_label.add_theme_font_size_override("font_size", 15)
	_tip_label.add_theme_color_override("font_color", Color(0.7, 0.78, 0.92))
	column.add_child(_tip_label)

func _on_generation_progress(ratio: float, label: String) -> void:
	_set_progress(ratio * 0.9, label)

func _set_progress(ratio: float, label: String) -> void:
	if _loading_bar == null:
		return
	_loading_bar.value = ratio
	_loading_label.text = label
	# Rotate the tip every time the phase name changes.
	if randf() < 0.25:
		_tip_label.text = "Astuce : " + TIPS[randi() % TIPS.size()]

func _hide_loading() -> void:
	if _loading_layer == null:
		return
	var tween := create_tween().set_parallel(true)
	for child in _loading_layer.get_children():
		if child is CanvasItem:
			tween.tween_property(child, "modulate:a", 0.0, 0.5)
	tween.chain().tween_callback(_loading_layer.queue_free)

func is_ready_to_play() -> bool:
	return _ready_done
