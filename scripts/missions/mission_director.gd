extends Node
## MissionDirector -- node "Missions" in the world scene.
##
## Creates every mission's data, owns the controller nodes, keeps the world
## marker in sync with the current objective, and unlocks the campaign in order:
## tutorial -> bank heist -> Mecanix. Side activities run alongside once the
## tutorial is done.
##
## Scene requirements: a plain Node named "Missions" in game_world.tscn. All
## children are created here.

const TUTORIAL_ID := "m01_tutorial"
const BANK_ID := "m02_bank"
const BOSS_ID := "m03_mechanix"

var tutorial: Node
var bank: Node
var boss: Node
var side: Node

var _marker: WorldMarker
var _marker_active: bool = false
var _unlock_timer: float = 0.0
var _pending_unlock: String = ""

func _ready() -> void:
	Events.mission_marker_changed.connect(_on_marker_changed)
	Events.mission_completed.connect(_on_mission_completed)

## Called by the world once the city is built and the player exists.
func setup(city: Node3D) -> void:
	var bank_data: Dictionary = city.get("bank")
	var factory_data: Dictionary = city.get("factory")

	# --- mission 1: tutorial ------------------------------------------------
	tutorial = Node.new()
	tutorial.name = "MissionTutorial"
	tutorial.set_script(load("res://scripts/missions/mission_tutorial.gd"))
	add_child(tutorial)
	MissionManager.register(tutorial.call("build_mission", city.call("tallest_rooftop")))

	# --- mission 2: bank heist ---------------------------------------------
	bank = Node.new()
	bank.name = "MissionBankHeist"
	bank.set_script(load("res://scripts/missions/mission_bank_heist.gd"))
	add_child(bank)
	MissionManager.register(bank.call("build_mission",
			bank_data.get("plaza", Vector3.ZERO), bank_data.get("entrance", Vector3.ZERO)))

	# --- mission 3: the boss ------------------------------------------------
	boss = Node.new()
	boss.name = "MissionBoss"
	boss.set_script(load("res://scripts/missions/mission_boss.gd"))
	add_child(boss)
	MissionManager.register(boss.call("build_mission", factory_data))

	# --- side activities ----------------------------------------------------
	side = Node.new()
	side.name = "SideActivities"
	side.set_script(load("res://scripts/missions/side_activities.gd"))
	add_child(side)

	_marker = WorldMarker.new()
	add_child(_marker)
	_marker.visible = false

## Starts the campaign from the beginning (new game).
func start_campaign() -> void:
	MissionManager.start(TUTORIAL_ID)

## Restores flow after loading a save: resume the active mission or offer the
## next one in the chain.
func resume_campaign() -> void:
	if MissionManager.active_id != "":
		MissionManager.refresh_hud()
	elif not MissionManager.is_completed(TUTORIAL_ID):
		MissionManager.start(TUTORIAL_ID)
	elif not MissionManager.is_completed(BANK_ID):
		_queue_unlock(BANK_ID, 2.0)
	elif not MissionManager.is_completed(BOSS_ID):
		_queue_unlock(BOSS_ID, 2.0)
	if MissionManager.is_completed(TUTORIAL_ID) and side != null:
		side.call("begin")

func _process(delta: float) -> void:
	if _pending_unlock != "":
		_unlock_timer -= delta
		if _unlock_timer <= 0.0:
			var id := _pending_unlock
			_pending_unlock = ""
			MissionManager.start(id)

	# Keep the marker pinned and readable.
	if _marker_active and _marker != null:
		var player_pos := GameState.player_position()
		var to_marker: Vector3 = _marker.global_position - player_pos
		# The beam is only useful when it is not right on top of the hero.
		_marker.visible = to_marker.length() > 6.0

func _on_marker_changed(world_position: Vector3, is_visible: bool) -> void:
	_marker_active = is_visible
	if _marker == null:
		return
	_marker.visible = is_visible
	if is_visible:
		_marker.global_position = world_position

func _on_mission_completed(id: String, _reward: int) -> void:
	match id:
		TUTORIAL_ID:
			if side != null:
				side.call("begin")
			_queue_unlock(BANK_ID, 8.0)
			Events.toast_requested.emit("Nouvelle alerte dans quelques instants...")
		BANK_ID:
			_queue_unlock(BOSS_ID, 12.0)
			Events.toast_requested.emit("Des rapports etranges arrivent du nord de la ville...")
		BOSS_ID:
			Events.toast_requested.emit("Brick City est sauvee. Explore librement !")
			SaveManager.save_game(SaveManager.current_slot, true)

func _queue_unlock(id: String, delay: float) -> void:
	if MissionManager.is_completed(id):
		return
	_pending_unlock = id
	_unlock_timer = delay

## Used by the pause menu / debug: jump straight to a mission.
func force_start(id: String) -> void:
	_pending_unlock = ""
	MissionManager.start(id)
