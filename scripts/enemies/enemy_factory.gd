class_name EnemyFactory
extends RefCounted
## EnemyFactory -- one place that knows how to make a crook.
##
## Registers every enemy scene (and the shared FX/projectile) with ObjectPool on
## first use, then hands out ready-to-fight enemies. Missions, side activities
## and the boss fight all spawn through here, so pooling is never bypassed.

const SCENES := {
	"thug": "res://scenes/enemies/enemy_thug.tscn",
	"runner": "res://scenes/enemies/enemy_runner.tscn",
	"brute": "res://scenes/enemies/enemy_brute.tscn",
	"gunner": "res://scenes/enemies/enemy_gunner.tscn",
}

const PREWARM := {"thug": 8, "runner": 4, "brute": 2, "gunner": 4}

static var _ready_pools: bool = false

## Registers all pools. Safe to call repeatedly.
static func ensure_pools() -> void:
	if _ready_pools:
		return
	_ready_pools = true
	for key in SCENES.keys():
		var scene: PackedScene = load(SCENES[key]) as PackedScene
		if scene != null:
			ObjectPool.register("enemy_%s" % key, scene, int(PREWARM.get(key, 0)))
	ObjectPool.register("enemy_bolt", load("res://scenes/enemies/enemy_projectile.tscn"), 12)
	ObjectPool.register("impact_fx", load("res://scenes/effects/impact_fx.tscn"), 10)

## Spawns one enemy of `kind` at `at`. `parent` defaults to the world node.
static func spawn(kind: String, at: Vector3, parent: Node = null) -> EnemyBase:
	ensure_pools()
	var host: Node = parent
	if host == null:
		host = GameState.world
	if host == null:
		return null
	var enemy := ObjectPool.acquire("enemy_%s" % kind, host) as EnemyBase
	if enemy == null:
		return null
	# reset_enemy needs the node inside the tree, which acquire() guarantees.
	enemy.reset_enemy(at)
	return enemy

## Spawns a mixed group in a ring around `center`. `composition` is e.g.
## {"thug": 3, "runner": 1}. Returns the spawned enemies.
static func spawn_group(composition: Dictionary, center: Vector3, radius: float = 6.0,
		parent: Node = null) -> Array[EnemyBase]:
	var out: Array[EnemyBase] = []
	var total: int = 0
	for key in composition.keys():
		total += int(composition[key])
	var index: int = 0
	for key in composition.keys():
		for i in int(composition[key]):
			var angle: float = TAU * float(index) / float(maxi(total, 1)) + randf() * 0.4
			index += 1
			var offset := Vector3(cos(angle), 0.0, sin(angle)) * radius
			var at: Vector3 = center + offset
			at.y = center.y + 0.5
			var enemy := spawn(String(key), at, parent)
			if enemy != null:
				out.append(enemy)
	return out

## Random composition scaled by difficulty, used by side activities.
static func random_composition(strength: int) -> Dictionary:
	var comp := {"thug": maxi(1, strength)}
	if strength >= 2:
		comp["runner"] = 1
	if strength >= 3:
		comp["gunner"] = 1
	if strength >= 4:
		comp["brute"] = 1
	return comp
