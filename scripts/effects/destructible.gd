class_name Destructible
extends StaticBody3D
## Destructible -- a breakable brick prop.
##
## Used for Mecanix's street machines in the sabotage activity, and available for
## any prop that should come apart when punched. Takes damage from the hero's
## attack query (it sits on the prop layer), then bursts into a shower of brick
## shards.
##
## Scene requirements: created in code; builds its own body and collision.

signal destroyed

@export var max_health: float = 40.0
@export var shard_count: int = 14

var health: float = 40.0
var is_broken: bool = false

var _visual: Node3D
var _light: OmniLight3D

func _ready() -> void:
	collision_layer = BrickKit.L_PROP
	collision_mask = 0
	health = max_health
	add_to_group("destructibles")

## The default look: one of Mecanix's roadside machines.
func build_machine() -> void:
	_visual = Node3D.new()
	add_child(_visual)
	var casing := BrickKit.metal(Color(0.38, 0.41, 0.48), 0.35)
	var dark := BrickKit.brick(Color(0.18, 0.20, 0.24), false, 0.4)
	var glow := BrickKit.neon(Color(0.3, 0.9, 1.0), 2.6)

	BrickKit.add_box(_visual, Vector3(2.4, 0.5, 2.4), Vector3(0, 0.25, 0), dark, "Base")
	BrickKit.add_box(_visual, Vector3(1.9, 2.4, 1.9), Vector3(0, 1.6, 0), casing, "Body")
	BrickKit.add_box(_visual, Vector3(2.2, 0.4, 2.2), Vector3(0, 2.9, 0), dark, "Cap")
	BrickKit.add_shape(_visual, BrickKit.unit_cylinder(10), Vector3(0.5, 1.4, 0.5),
			Vector3(0, 3.6, 0), casing, "Mast")
	BrickKit.add_shape(_visual, BrickKit.unit_sphere(8, 12), Vector3(1.0, 1.0, 1.0),
			Vector3(0, 4.4, 0), glow, "Emitter")
	for s in [-1.0, 1.0]:
		BrickKit.add_box(_visual, Vector3(0.25, 1.6, 0.25), Vector3(s * 1.0, 1.6, 1.0), glow, "Vein")

	_light = OmniLight3D.new()
	_light.light_color = Color(0.3, 0.9, 1.0)
	_light.light_energy = 2.5
	_light.omni_range = 10.0
	_light.shadow_enabled = false
	_light.position = Vector3(0, 4.4, 0)
	add_child(_light)

	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.4, 4.8, 2.4)
	shape.shape = box
	shape.position = Vector3(0, 2.4, 0)
	add_child(shape)

func take_damage(amount: float, from_position: Vector3 = Vector3.ZERO,
		_knockback: Vector3 = Vector3.ZERO) -> void:
	if is_broken:
		return
	health -= amount
	AudioManager.play_at("metal_clang", global_position, randf_range(1.0, 1.3))
	if _visual != null:
		# Flinch so hits read even before it breaks.
		_visual.position = Vector3(randf_range(-0.1, 0.1), 0.0, randf_range(-0.1, 0.1))
	if health <= 0.0:
		_break(from_position)

func _break(from_position: Vector3) -> void:
	is_broken = true
	destroyed.emit()
	AudioManager.play_at("explosion", global_position, 1.2, 70.0)
	GameState.shake_camera(0.22, 0.3)
	GameState.add_score(120)
	if ObjectPool.is_registered("impact_fx"):
		var host: Node = GameState.world if GameState.world != null else get_parent()
		var fx: Node = ObjectPool.acquire("impact_fx", host)
		if fx != null:
			(fx as Node3D).global_position = global_position + Vector3.UP * 2.0
			if fx.has_method("burst"):
				var dir: Vector3 = (global_position - from_position).normalized() if from_position != Vector3.ZERO else Vector3.UP
				fx.call("burst", dir, Color(0.6, 0.9, 1.0), 2.0)
	collision_layer = 0
	if _light != null:
		_light.light_energy = 0.0
	# Collapse, then disappear.
	var tween := create_tween()
	if _visual != null:
		tween.tween_property(_visual, "scale", Vector3(1.3, 0.05, 1.3), 0.35)
		tween.parallel().tween_property(_visual, "rotation:z", randf_range(-0.6, 0.6), 0.35)
	tween.tween_interval(2.0)
	tween.tween_callback(queue_free)

func apply_web(_duration: float) -> void:
	pass

func is_defeated() -> bool:
	return is_broken
