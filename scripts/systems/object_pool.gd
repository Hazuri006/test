extends Node
## ObjectPool (autoload)
##
## Generic reuse pool for things that spawn and die constantly: projectiles,
## impact effects, debris chunks and enemies. Instancing a scene mid-combat is
## one of the easiest ways to cause a frame spike, so everything short-lived in
## this project goes through here.
##
## Usage:
##     ObjectPool.register("bullet", preload("res://scenes/enemies/projectile.tscn"), 24)
##     var b := ObjectPool.acquire("bullet", get_tree().current_scene)
##     ...
##     ObjectPool.release(b)
##
## Pooled nodes may implement `pool_acquired()` and `pool_released()` to reset
## their own state. Nodes are parked under a hidden holder while idle.
##
## Scene requirements: none (autoload).

const META_KEY := "_pool_key"

var _pools: Dictionary = {}      ## key -> {factory: Variant, idle: Array[Node], made: int}
var _holder: Node

func _ready() -> void:
	_holder = Node.new()
	_holder.name = "PoolHolder"
	add_child(_holder)

## `factory` may be a PackedScene or a Callable returning a Node.
func register(key: String, factory: Variant, prewarm: int = 0) -> void:
	if _pools.has(key):
		return
	_pools[key] = {"factory": factory, "idle": [], "made": 0}
	for i in prewarm:
		var n := _make(key)
		if n != null:
			_park(n)

func is_registered(key: String) -> bool:
	return _pools.has(key)

func acquire(key: String, parent: Node) -> Node:
	if not _pools.has(key) or parent == null:
		return null
	var pool: Dictionary = _pools[key]
	var idle: Array = pool["idle"]
	var node: Node = null
	while node == null and not idle.is_empty():
		var candidate: Node = idle.pop_back()
		if is_instance_valid(candidate):
			node = candidate
	if node == null:
		node = _make(key)
	if node == null:
		return null
	if node.get_parent() != null:
		node.get_parent().remove_child(node)
	parent.add_child(node)
	if node is Node3D:
		(node as Node3D).visible = true
	node.process_mode = Node.PROCESS_MODE_INHERIT
	if node.has_method("pool_acquired"):
		node.call("pool_acquired")
	return node

func release(node: Node) -> void:
	if node == null or not is_instance_valid(node):
		return
	if not node.has_meta(META_KEY):
		node.queue_free()
		return
	if node.has_method("pool_released"):
		node.call("pool_released")
	_park(node)
	var key: String = node.get_meta(META_KEY)
	if _pools.has(key):
		var idle: Array = _pools[key]["idle"]
		if not idle.has(node):
			idle.append(node)

func _make(key: String) -> Node:
	var pool: Dictionary = _pools[key]
	var factory: Variant = pool["factory"]
	var node: Node = null
	if factory is PackedScene:
		node = (factory as PackedScene).instantiate()
	elif factory is Callable:
		node = (factory as Callable).call()
	if node == null:
		return null
	node.set_meta(META_KEY, key)
	pool["made"] = int(pool["made"]) + 1
	return node

func _park(node: Node) -> void:
	if node.get_parent() != null:
		node.get_parent().remove_child(node)
	_holder.add_child(node)
	if node is Node3D:
		(node as Node3D).visible = false
	node.process_mode = Node.PROCESS_MODE_DISABLED

## Frees everything -- called when leaving a gameplay session so a new run does
## not inherit stale nodes that pointed at the old world.
func clear_all() -> void:
	for key in _pools.keys():
		for n in (_pools[key]["idle"] as Array):
			if is_instance_valid(n):
				n.queue_free()
	_pools.clear()

func debug_stats() -> String:
	var parts: Array[String] = []
	for key in _pools.keys():
		parts.append("%s: %d idle / %d made" % [key, (_pools[key]["idle"] as Array).size(), _pools[key]["made"]])
	return ", ".join(parts)
