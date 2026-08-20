extends Node3D
## Point d'entree : assemble le monde, la capsule, le joueur et l'interface.
##
## Presque tout est instancie ici plutot que dans la scene : la generation
## depend du profil de qualite (resolution de l'ocean, distance d'affichage,
## densite de vie), qui n'est connu qu'au lancement.

const START_POSITION := Vector3(0.0, 0.0, 0.0)

var ocean: Ocean
var terrain: Terrain
var flora: Flora
var reef: Reef
var fauna: Fauna
var resources: ResourceField
var world_manager: WorldManager
var lifepod: Lifepod
var player: Player
var ui: UIRoot

var _biome: int = -1
var _last_health: float = 100.0
var _weather_phase: float = 0.0

func _ready() -> void:
	randomize()
	_build_world()
	_build_lifepod()
	_build_player()
	_build_ui()
	_wire()
	GameState.world = self
	GameState.notify_danger("Impact — alimentation du fabricateur rompue")
	GameState.notify_info("Ouvrez le casier (E) : l'outil de reparation s'y trouve")
	GameState.notify_info("E : interagir   Tab : inventaire   F : lampe   V : vue")

func _build_world() -> void:
	world_manager = WorldManager.new()
	world_manager.name = "WorldManager"
	add_child(world_manager)

	ocean = Ocean.new()
	ocean.name = "Ocean"
	add_child(ocean)

	terrain = Terrain.new()
	terrain.name = "Terrain"
	add_child(terrain)

	flora = Flora.new()
	flora.name = "Flora"
	add_child(flora)

	reef = Reef.new()
	reef.name = "Reef"
	add_child(reef)

	fauna = Fauna.new()
	fauna.name = "Fauna"
	add_child(fauna)

	resources = ResourceField.new()
	resources.name = "Resources"
	add_child(resources)

func _build_lifepod() -> void:
	lifepod = Lifepod.new()
	lifepod.name = "Lifepod"
	add_child(lifepod)
	lifepod.global_position = START_POSITION
	lifepod.bind_ocean(ocean)

func _build_player() -> void:
	player = Player.new()
	player.name = "Player"
	add_child(player)
	# le plancher de la capsule est a FLOAT_OFFSET au-dessus de l'eau
	player.global_position = START_POSITION + Vector3(0.0, 1.2, -0.9)
	player.bind_world(ocean, world_manager)
	player.set_respawn_point(START_POSITION + Vector3(0.0, 1.2, -0.9))

func _build_ui() -> void:
	ui = UIRoot.new()
	ui.name = "UI"
	add_child(ui)
	ui.bind_player(player)

func _wire() -> void:
	var cam := player.camera
	ocean.set_camera(cam)
	terrain.set_camera(cam)
	flora.set_camera(cam)
	reef.set_camera(cam)
	fauna.set_camera(cam)
	resources.set_camera(cam)
	world_manager.bind(ocean, cam)

	# le flash rouge des degats passe par le post-traitement sous-marin
	player.stats.health_changed.connect(func(current, _maximum):
		if current < _last_health:
			world_manager.flash_damage(0.55)
		_last_health = current)

	terrain.initial_load_finished.connect(func():
		# une fois le fond charge, on repositionne la capsule et le joueur
		lifepod.global_position = START_POSITION
		var spawn := lifepod.get_spawn_point()
		player.global_position = spawn
		player.set_respawn_point(spawn)
		GameState.notify_success("Terrain synchronise"))

func _process(delta: float) -> void:
	if player == null:
		return
	_update_biome()
	_update_weather(delta)

func _update_biome() -> void:
	var p := player.global_position
	var kind := Biome.kind_at(p.x, p.z)
	if kind != _biome:
		_biome = kind
		GameState.biome_changed.emit(Biome.biome_name(kind))

## Meteo lente : l'etat de la mer respire sur plusieurs minutes, ce qui fait
## varier la houle, l'ecume et le bercement de la capsule.
func _update_weather(delta: float) -> void:
	_weather_phase = wrapf(_weather_phase + delta * 0.012, 0.0, TAU)
	var state := 1.0 + sin(_weather_phase) * 0.42 + sin(_weather_phase * 2.7) * 0.16
	ocean.set_sea_state(clampf(state, 0.35, 1.75))
	ocean.set_wind_angle(0.6 + sin(_weather_phase * 0.5) * 0.5)
