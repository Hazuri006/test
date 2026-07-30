class_name EnemySquad
extends Node3D
## EnemySquad -- a tracked group of enemies with optional waves.
##
## Missions do not want to babysit individual crooks; they want "spawn a fight
## here, tell me when it is over". A squad owns its enemies, reports the live
## count to the HUD, and can release the next wave when the current one thins
## out.
##
## Scene requirements: created in code by mission scripts.

signal wave_started(index: int, total: int)
signal wave_cleared(index: int)
signal squad_defeated

@export var next_wave_threshold: float = 0.35   ## release the next wave at 35% left
@export var spawn_radius: float = 8.0
@export var announce_to_hud: bool = true

var waves: Array = []              ## Array[Dictionary] compositions
var current_wave: int = -1
var members: Array[EnemyBase] = []
var active: bool = false

var _center: Vector3 = Vector3.ZERO

func _ready() -> void:
	Events.enemy_defeated.connect(_on_enemy_defeated)

## `wave_list` is e.g. [{"thug": 3}, {"thug": 2, "runner": 2}, {"brute": 1}]
func start(center: Vector3, wave_list: Array, radius: float = 8.0) -> void:
	_center = center
	waves = wave_list
	spawn_radius = radius
	current_wave = -1
	active = true
	_next_wave()

func _next_wave() -> void:
	current_wave += 1
	if current_wave >= waves.size():
		active = false
		squad_defeated.emit()
		if announce_to_hud:
			Events.enemy_counter_changed.emit(0)
		return
	var composition: Dictionary = waves[current_wave]
	var spawned := EnemyFactory.spawn_group(composition, _center, spawn_radius, get_parent())
	for enemy in spawned:
		members.append(enemy)
	wave_started.emit(current_wave, waves.size())
	if announce_to_hud:
		Events.enemy_counter_changed.emit(alive_count())
		if waves.size() > 1:
			Events.toast_requested.emit("Vague %d / %d" % [current_wave + 1, waves.size()])
	AudioManager.play("enemy_alert", 0.9, -4.0)

func _on_enemy_defeated(enemy: Node3D) -> void:
	if not active:
		return
	var member := enemy as EnemyBase
	if member == null or not members.has(member):
		return
	members.erase(member)
	if announce_to_hud:
		Events.enemy_counter_changed.emit(alive_count())
	var remaining_ratio: float = float(alive_count()) / float(maxi(_wave_size(current_wave), 1))
	if alive_count() == 0:
		wave_cleared.emit(current_wave)
		_next_wave()
	elif remaining_ratio <= next_wave_threshold and current_wave + 1 < waves.size():
		# Overlap waves slightly so a fight never goes quiet.
		_next_wave()

func _wave_size(index: int) -> int:
	if index < 0 or index >= waves.size():
		return 1
	var total: int = 0
	for key in (waves[index] as Dictionary).keys():
		total += int((waves[index] as Dictionary)[key])
	return total

func alive_count() -> int:
	var count: int = 0
	for member in members:
		if is_instance_valid(member) and not member.is_defeated():
			count += 1
	return count

func total_remaining_waves() -> int:
	return maxi(waves.size() - current_wave - 1, 0)

## Immediately removes everyone (mission failed / player left the area).
func disband() -> void:
	active = false
	for member in members:
		if is_instance_valid(member):
			ObjectPool.release(member)
	members.clear()
	if announce_to_hud:
		Events.enemy_counter_changed.emit(0)
