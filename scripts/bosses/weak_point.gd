class_name BossWeakPoint
extends AnimatableBody3D
## BossWeakPoint -- the damageable coupling on a robotic arm (or the reactor).
##
## A tiny forwarding body: the hero's attack query finds it on the boss physics
## layer, calls take_damage(), and it passes the hit to its owner. Keeping it
## separate means the arm can move freely while the hit box follows exactly.

signal hit(amount: float, from_position: Vector3)

var owner_node: Node = null
var vulnerable: bool = true
var damage_multiplier: float = 1.0

func bind(node: Node, multiplier: float = 1.0) -> void:
	owner_node = node
	damage_multiplier = multiplier

func take_damage(amount: float, from_position: Vector3 = Vector3.ZERO,
		_knockback: Vector3 = Vector3.ZERO) -> void:
	if not vulnerable:
		AudioManager.play_at("metal_clang", global_position, 1.6, 30.0)
		Events.toast_requested.emit("Blindage trop epais ici !")
		return
	var final_amount: float = amount * damage_multiplier
	hit.emit(final_amount, from_position)
	if owner_node != null and is_instance_valid(owner_node):
		if owner_node.has_method("damage_weak_point"):
			owner_node.call("damage_weak_point", final_amount, from_position)

## Web attacks land on weak points too, they just do not stun machinery.
func apply_web(_duration: float) -> void:
	pass

func is_defeated() -> bool:
	return not vulnerable
