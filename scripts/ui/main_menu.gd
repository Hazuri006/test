extends Node3D
## MainMenu -- scenes/ui/main_menu.tscn, the project's MAIN SCENE.
##
## Builds a live 3D backdrop (a small brick skyline with the hero posed on a
## rooftop, lit by the same environment and sky shader as the game) and floats
## the menu on top of it. The camera slowly orbits, so the menu is never a static
## image.
##
## Menu: Nouvelle partie / Continuer / Parametres / Credits / Quitter.
##
## Scene requirements: Node3D root with this script. Camera, light, environment
## and skyline are all created here.
##
## Inspector parameters: orbit_speed, orbit_radius, camera_height, building_count.

@export var orbit_speed: float = 0.045
@export var orbit_radius: float = 15.0
@export var camera_height: float = 29.5
@export var building_count: int = 46

const GAME_SCENE := "res://scenes/world/game_world.tscn"

var _camera: Camera3D
var _angle: float = 0.0
var _menu_root: Control
var _buttons_box: VBoxContainer
var _settings: SettingsPanel
var _credits: Control
var _continue_button: Button

func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	GameState.set_paused(false)
	get_tree().paused = false
	Engine.time_scale = 1.0
	_build_backdrop()
	_build_menu()
	AudioManager.play_music("menu")
	Transition.fade_in(0.8)

# =============================================================================
#  3D BACKDROP
# =============================================================================

func _build_backdrop() -> void:
	var env := WorldEnvironment.new()
	env.name = "WorldEnvironment"
	env.set_script(load("res://scripts/systems/graphics_env.gd"))
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-38.0, 128.0, 0.0)
	sun.light_energy = 1.4
	sun.light_color = Color(1.0, 0.93, 0.82)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 220.0
	add_child(sun)

	_camera = Camera3D.new()
	_camera.fov = 58.0
	_camera.far = 900.0
	add_child(_camera)
	_camera.current = true

	var rng := RandomNumberGenerator.new()
	rng.seed = 987654
	var data := BrickKit.new_batch()

	# Ground plate.
	(data["walls"] as Array).append({"pos": Vector3(0, -1.0, 0),
			"size": Vector3(620, 2.0, 620), "tint": BrickKit.ROAD_COLOR.darkened(0.25)})

	# A compact skyline in a ring around the camera's orbit.
	var builder := BuildingBuilder.new(rng)
	for i in building_count:
		var angle: float = TAU * float(i) / float(building_count) + rng.randf_range(-0.05, 0.05)
		var distance: float = rng.randf_range(96.0, 230.0)
		var centre := Vector3(cos(angle) * distance, 0.0, sin(angle) * distance)
		var footprint := Vector2(rng.randf_range(12.0, 26.0), rng.randf_range(12.0, 26.0))
		var height: float = rng.randf_range(40.0, 150.0) * (1.0 - distance / 420.0)
		builder.clear()
		var styles: Array[int] = [BuildingBuilder.Style.TIERED_TOWER, BuildingBuilder.Style.SLAB,
				BuildingBuilder.Style.OCTAGON_TOWER, BuildingBuilder.Style.SHOP_ROW]
		builder.build(styles[rng.randi_range(0, styles.size() - 1)] as BuildingBuilder.Style,
				centre, footprint, maxf(height, 14.0), BrickKit.pick_building_color(),
				BrickKit.pick_accent(), true)
		(data["walls"] as Array).append_array(builder.walls)
		(data["windows"] as Array).append_array(builder.windows)
		(data["accents"] as Array).append_array(builder.accents)

	# Hero rooftop in the foreground.
	var rooftop := Vector3(0, 26.0, 0)
	(data["walls"] as Array).append({"pos": rooftop + Vector3(0, -13.0, 0),
			"size": Vector3(15, 26.0, 15), "tint": Color(0.52, 0.50, 0.48)})
	(data["details"] as Array).append({"pos": rooftop + Vector3(0, 0.4, 0),
			"size": Vector3(16, 0.8, 16), "tint": Color(0.62, 0.60, 0.56)})
	(data["walls"] as Array).append({"pos": rooftop + Vector3(0, 1.2, -7.4),
			"size": Vector3(16, 1.6, 1.0), "tint": Color(0.66, 0.64, 0.6)})
	CityProps.add_water_tower(data, rooftop + Vector3(4.6, 0.8, -4.2), 0.85)
	CityProps.add_antenna(data, rooftop + Vector3(-5.4, 0.8, -3.0), 7.0)
	BrickKit.build_batch(self, data, "Skyline")

	# The hero himself, posed heroically on the edge.
	var hero_holder := Node3D.new()
	hero_holder.name = "HeroPose"
	add_child(hero_holder)
	hero_holder.position = rooftop + Vector3(0.0, 0.8, 5.4)
	hero_holder.rotation.y = PI
	var rig := PlayerRig.new().build(hero_holder)
	# A crouched, ready-to-jump silhouette.
	rig.bone("Hips").position.y = 0.62
	rig.bone("Hips").rotation.x = deg_to_rad(18.0)
	rig.bone("Chest").rotation.x = deg_to_rad(-8.0)
	rig.bone("Head").rotation.x = deg_to_rad(-14.0)
	for tag in ["L", "R"]:
		rig.bone("Leg%s" % tag).rotation.x = deg_to_rad(66.0)
		rig.bone("Shin%s" % tag).rotation.x = deg_to_rad(-118.0)
	rig.bone("ArmR").rotation = Vector3(deg_to_rad(24.0), 0, deg_to_rad(18.0))
	rig.bone("ForearmR").rotation.x = deg_to_rad(-30.0)
	rig.bone("ArmL").rotation = Vector3(deg_to_rad(-58.0), 0, deg_to_rad(-26.0))
	rig.bone("ForearmL").rotation.x = deg_to_rad(-42.0)

	var key := OmniLight3D.new()
	key.light_color = Color(0.6, 0.8, 1.0)
	key.light_energy = 4.0
	key.omni_range = 22.0
	key.position = rooftop + Vector3(-4.0, 5.0, 12.0)
	add_child(key)

func _process(delta: float) -> void:
	_angle += orbit_speed * delta
	var hero := Vector3(0.0, 27.8, 5.4)
	_camera.position = hero + Vector3(cos(_angle) * orbit_radius,
			camera_height - hero.y + sin(_angle * 0.7) * 2.0, sin(_angle) * orbit_radius)
	# Aim slightly to the hero's left so he sits on the right of frame, clear of
	# the title column.
	var to_hero: Vector3 = hero - _camera.position
	var side: Vector3 = to_hero.cross(Vector3.UP).normalized()
	_camera.look_at(hero - side * 5.5, Vector3.UP)

# =============================================================================
#  MENU UI
# =============================================================================

func _build_menu() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)

	_menu_root = Control.new()
	_menu_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(_menu_root)

	# Left-side vignette so the text always reads over the skyline.
	var vignette := ColorRect.new()
	vignette.color = Color(0.03, 0.04, 0.09, 0.55)
	vignette.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	vignette.offset_right = 560.0
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_menu_root.add_child(vignette)

	var column := VBoxContainer.new()
	column.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	column.position = Vector2(90, -220)
	column.add_theme_constant_override("separation", 8)
	_menu_root.add_child(column)

	var title := Label.new()
	title.text = "BRICK CITY"
	title.add_theme_font_size_override("font_size", 74)
	title.add_theme_color_override("font_color", Color(0.92, 0.20, 0.22))
	title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	title.add_theme_constant_override("shadow_offset_x", 3)
	title.add_theme_constant_override("shadow_offset_y", 4)
	column.add_child(title)

	var subtitle := Label.new()
	subtitle.text = "H E R O"
	subtitle.add_theme_font_size_override("font_size", 40)
	subtitle.add_theme_color_override("font_color", Color(0.35, 0.55, 1.0))
	column.add_child(subtitle)

	var tagline := Label.new()
	tagline.text = "Un jeu d'action en monde ouvert, entierement en briques."
	tagline.add_theme_font_size_override("font_size", 15)
	tagline.add_theme_color_override("font_color", Color(0.8, 0.85, 0.95))
	column.add_child(tagline)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 28)
	column.add_child(spacer)

	_buttons_box = VBoxContainer.new()
	_buttons_box.add_theme_constant_override("separation", 10)
	column.add_child(_buttons_box)

	_add_button("Nouvelle partie", _on_new_game)
	_continue_button = _add_button("Continuer", _on_continue)
	_continue_button.disabled = not SaveManager.has_save(1)
	if not _continue_button.disabled:
		var summary := SaveManager.save_summary(1)
		_continue_button.tooltip_text = summary
	_add_button("Parametres", _on_settings)
	_add_button("Credits", _on_credits)
	_add_button("Quitter", _on_quit)

	_build_settings(layer)
	_build_credits(layer)

	var hint := Label.new()
	hint.text = "Clic droit : toile  |  Espace : saut  |  Maj : courir  |  Clic gauche : frapper"
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", Color(0.75, 0.8, 0.9, 0.8))
	hint.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	hint.position = Vector2(90, -50)
	_menu_root.add_child(hint)

func _add_button(text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(300, 46)
	button.add_theme_font_size_override("font_size", 20)
	button.pressed.connect(func() -> void:
		AudioManager.play("ui_click")
		callback.call())
	button.mouse_entered.connect(func() -> void: AudioManager.play("ui_hover", 1.0, -14.0))
	_buttons_box.add_child(button)
	return button

func _build_settings(layer: CanvasLayer) -> void:
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.position = Vector2(-300, -260)
	panel.custom_minimum_size = Vector2(600, 0)
	panel.visible = false
	layer.add_child(panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 20)
	margin.add_theme_constant_override("margin_bottom", 20)
	panel.add_child(margin)

	_settings = SettingsPanel.new()
	margin.add_child(_settings)
	_settings.build()
	_settings.closed.connect(func() -> void:
		panel.visible = false
		_menu_root.visible = true)
	_settings.set_meta("panel", panel)

func _build_credits(layer: CanvasLayer) -> void:
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.position = Vector2(-330, -220)
	panel.custom_minimum_size = Vector2(660, 0)
	panel.visible = false
	layer.add_child(panel)
	_credits = panel

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)

	var title := Label.new()
	title.text = "CREDITS"
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	column.add_child(title)

	var text := Label.new()
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.custom_minimum_size = Vector2(600, 0)
	text.add_theme_font_size_override("font_size", 15)
	text.text = """BRICK CITY HERO
Jeu d'action-aventure en monde ouvert, cree avec Godot 4.

CREATION ORIGINALE
Personnages, noms, designs, batiments, musiques et effets sonores sont
100% originaux et generes proceduralement. Aucune marque, aucun personnage
et aucune oeuvre existante n'est utilise ou imite.

TECHNIQUE
Geometrie, textures, animations, musique et bruitages sont produits par le
code au lancement : le projet ne contient aucun asset importe.

MOTEUR
Godot Engine 4 -- MIT License.

Merci d'avoir joue !"""
	column.add_child(text)

	var close := Button.new()
	close.text = "Retour"
	close.custom_minimum_size = Vector2(200, 40)
	close.pressed.connect(func() -> void:
		AudioManager.play("ui_back")
		panel.visible = false
		_menu_root.visible = true)
	column.add_child(close)

# =============================================================================
#  ACTIONS
# =============================================================================

func _on_new_game() -> void:
	SaveManager.clear_pending()
	MissionManager.reset_session()
	GameState.reset_score()
	Transition.change_scene(GAME_SCENE, "Construction de Brick City...")

func _on_continue() -> void:
	if not SaveManager.queue_load(1):
		Events.toast_requested.emit("Aucune sauvegarde trouvee")
		return
	MissionManager.reset_session()
	Transition.change_scene(GAME_SCENE, "Chargement de la partie...")

func _on_settings() -> void:
	var panel: PanelContainer = _settings.get_meta("panel")
	panel.visible = true
	_menu_root.visible = false

func _on_credits() -> void:
	_credits.visible = true
	_menu_root.visible = false

func _on_quit() -> void:
	SaveManager.save_settings()
	get_tree().quit()
