extends Node
## WorldStreamer -- node "Streamer" in the world scene.
##
## Distance-based activation for the city. Every `update_interval` seconds it
## walks the block list (a few dozen entries -- nothing) and assigns each block
## a detail level. It also parks far-away enemies so a hundred idle thugs on the
## other side of the map cost nothing.
##
## Detail levels:
##   3 full     - props, windows, traffic lights, street lamps
##   2 medium   - windows kept, small props culled
##   1 far      - silhouette + emissive signs only
##
## Scene requirements: plain Node named "Streamer" in the world, with the City
## node as a sibling named "City".
##
## Inspector parameters: full_detail_range, medium_detail_range,
## enemy_active_range, update_interval.

@export var full_detail_range: float = 150.0
@export var medium_detail_range: float = 330.0
@export var enemy_active_range: float = 190.0
@export var update_interval: float = 0.35

var city: Node3D
var _timer: float = 0.0
var _night: bool = false
var _block_cursor: int = 0
var _blocks: Array = []

func _ready() -> void:
	await get_tree().process_frame
	city = get_parent().get_node_or_null("City")

## Called once the city has finished generating.
func bind_city(generator: Node3D) -> void:
	city = generator
	_blocks = generator.call("all_blocks")

func _process(delta: float) -> void:
	if _blocks.is_empty():
		return
	_timer -= delta
	if _timer > 0.0:
		return
	_timer = update_interval
	var player_pos := GameState.player_position()

	# Blocks are updated in slices so a big city never spikes a frame.
	var slice: int = maxi(_blocks.size() / 4, 8)
	for n in slice:
		if _blocks.is_empty():
			return
		_block_cursor = (_block_cursor + 1) % _blocks.size()
		var block: Node3D = _blocks[_block_cursor]
		if not is_instance_valid(block):
			continue
		var dist: float = block.global_position.distance_to(player_pos)
		var level: int = 1
		if dist < full_detail_range:
			level = 3
		elif dist < medium_detail_range:
			level = 2
		block.call("set_detail_level", level)
		block.call("set_night_lights", _night)

	_update_enemies(player_pos)

## Enemies far from the hero stop thinking entirely.
func _update_enemies(player_pos: Vector3) -> void:
	for node in get_tree().get_nodes_in_group("enemies"):
		var enemy := node as Node3D
		if enemy == null or not is_instance_valid(enemy):
			continue
		if enemy.has_method("set_far_away"):
			enemy.call("set_far_away", enemy.global_position.distance_to(player_pos) > enemy_active_range)

func set_night(night: bool) -> void:
	_night = night
	for block in _blocks:
		if is_instance_valid(block):
			block.call("set_night_lights", night)

func is_night() -> bool:
	return _night
