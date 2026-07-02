extends Node3D

## Orchestrateur du jeu : enregistre l'input map en code (aucune
## configuration externe requise), construit l'environnement (glow, ambiance),
## gère la capture souris, le scan, la boucle de découverte et la
## régénération du système.

const SCAN_RANGE_BASE := 26.0

var discovered_count := 0
var _nearest_planet: Planet = null
var _nearest_distance := 0.0

@onready var system: StarSystem = $SystemRoot
@onready var ship: PlayerShip = $Ship
@onready var hud: GameHUD = $HUD
@onready var world_environment: WorldEnvironment = $WorldEnvironment


func _enter_tree() -> void:
	# Touches physiques : sur un clavier AZERTY, les positions de W/A/S/D
	# correspondent aux touches gravées Z/Q/S/D — les deux dispositions
	# fonctionnent donc sans configuration.
	_register_action("move_forward", [KEY_W, KEY_UP])
	_register_action("move_back", [KEY_S, KEY_DOWN])
	_register_action("move_left", [KEY_A, KEY_LEFT])
	_register_action("move_right", [KEY_D, KEY_RIGHT])
	_register_action("move_up", [KEY_SPACE])
	_register_action("move_down", [KEY_CTRL])
	_register_action("boost", [KEY_SHIFT])
	_register_action("scan", [KEY_E])
	_register_action("new_system", [KEY_N])


func _register_action(action_name: String, physical_keys: Array) -> void:
	if InputMap.has_action(action_name):
		return
	InputMap.add_action(action_name)
	for key in physical_keys:
		var key_event := InputEventKey.new()
		key_event.physical_keycode = key
		InputMap.action_add_event(action_name, key_event)


func _ready() -> void:
	randomize()
	_setup_environment()
	hud.new_system_requested.connect(_start_new_system)
	_generate_system(randi() & 0x7FFFFFFF)
	hud.show_overlay(true)


func _setup_environment() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.005, 0.007, 0.015)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.35, 0.4, 0.55)
	environment.ambient_light_energy = 0.4
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.glow_enabled = true
	environment.glow_intensity = 0.7
	environment.glow_bloom = 0.15
	environment.glow_hdr_threshold = 1.0
	world_environment.environment = environment


func _generate_system(seed_value: int) -> void:
	discovered_count = 0
	_nearest_planet = null
	_nearest_distance = 0.0
	system.generate(seed_value)
	ship.reset_to_start()
	hud.start_system(seed_value, system.planets.size())


func _start_new_system() -> void:
	_generate_system(randi() & 0x7FFFFFFF)


func _process(_delta: float) -> void:
	_update_nearest()
	_push_out_of_bodies()

	var prompt := ""
	var nearest_name := ""
	var nearest_distance := 0.0
	if _nearest_planet != null:
		nearest_name = _nearest_planet.planet_name
		if _nearest_planet.discovered:
			nearest_name += " (cartographiée)"
		nearest_distance = maxf(_nearest_distance, 0.0)
		if _nearest_distance <= _scan_range(_nearest_planet) and not _nearest_planet.discovered:
			prompt = "Appuyez sur E pour scanner %s" % _nearest_planet.planet_name
	hud.update_telemetry(ship.velocity.length(), nearest_name, nearest_distance, prompt)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.pressed and Input.get_mouse_mode() != Input.MOUSE_MODE_CAPTURED:
			Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
			hud.show_overlay(false)
		return
	if event.is_action_pressed("ui_cancel"):
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
		hud.show_overlay(true)
		return
	if event.is_action_pressed("scan"):
		_try_scan()
		return
	if event.is_action_pressed("new_system"):
		_start_new_system()


## Distance (à la surface) sous laquelle une planète devient scannable.
func _scan_range(planet: Planet) -> float:
	return planet.radius * 2.0 + SCAN_RANGE_BASE


func _update_nearest() -> void:
	_nearest_planet = null
	_nearest_distance = INF
	var ship_position := ship.global_position
	for planet in system.planets:
		var surface_distance := ship_position.distance_to(planet.global_position) - planet.radius
		if surface_distance < _nearest_distance:
			_nearest_distance = surface_distance
			_nearest_planet = planet


## Empêche le vaisseau de traverser le soleil ou les planètes : repoussé en
## douceur hors du volume, sans physique.
func _push_out_of_bodies() -> void:
	var sun_clearance := system.sun_radius * 1.25
	var from_sun := ship.global_position
	if from_sun.length() < sun_clearance:
		if from_sun.length() < 0.01:
			from_sun = Vector3.UP
		ship.global_position = from_sun.normalized() * sun_clearance
		ship.velocity *= 0.2
	for planet in system.planets:
		var clearance := planet.radius * 1.25
		var from_planet := ship.global_position - planet.global_position
		if from_planet.length() < clearance:
			if from_planet.length() < 0.01:
				from_planet = Vector3.UP
			ship.global_position = planet.global_position + from_planet.normalized() * clearance
			ship.velocity *= 0.2


func _try_scan() -> void:
	if _nearest_planet == null or _nearest_planet.discovered:
		return
	if _nearest_distance > _scan_range(_nearest_planet):
		return
	_nearest_planet.discovered = true
	discovered_count += 1
	var total := system.planets.size()
	hud.set_discoveries(discovered_count, total)
	var result_text := "NOUVELLE DÉCOUVERTE\n%s" % _nearest_planet.describe()
	if discovered_count >= total:
		result_text += "\n\nSystème entièrement cartographié !"
		hud.show_complete()
	hud.show_scan_result(result_text)
