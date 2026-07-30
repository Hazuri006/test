class_name EnemyBrute
extends EnemyBase
## Brute -- the heavy (scenes/enemies/enemy_brute.gd).
##
## Slow, enormous health pool, telegraphed mallet slam that knocks the hero
## across the street. Barely flinches: knockback_resist is high, so the answer
## is dodging and countering rather than staggering it.

@export var slam_radius: float = 4.4
@export var slam_knockback: float = 14.0

func _ready() -> void:
	max_health = 190.0
	move_speed = 2.9
	chase_speed = 4.0
	attack_damage = 22.0
	attack_range = 3.4
	attack_windup = 0.85          ## long tell: this is the counter window
	attack_recovery = 0.9
	attack_cooldown = 2.1
	detection_range = 24.0
	score_value = 220
	knockback_resist = 0.82
	super()
	health_bar.setup(1.7, Color(0.95, 0.45, 0.1))

func _build_visual() -> void:
	rig = EnemyRig.new().build(self, {
		"suit": Color(0.30, 0.36, 0.30),
		"trim": Color(0.20, 0.22, 0.20),
		"skin": Color(0.84, 0.66, 0.46),
		"accent": Color(0.55, 0.30, 0.12),
	}, 1.45, true, Color(0.95, 0.55, 0.1))
	rig.add_mallet()
	# Bigger body, bigger capsule.
	var shape := get_node_or_null("CollisionShape3D") as CollisionShape3D
	if shape != null and shape.shape is CapsuleShape3D:
		var capsule := (shape.shape as CapsuleShape3D).duplicate() as CapsuleShape3D
		capsule.radius = 0.55
		capsule.height = 2.4
		shape.shape = capsule
		shape.position.y = 1.2

## Ground slam: area damage plus a shockwave that throws the hero back.
func _attack_impact() -> void:
	var impact_point: Vector3 = global_position + _forward() * 2.0
	AudioManager.play_at("punch_heavy", global_position, 0.75)
	AudioManager.play_at("land_hard", impact_point, 0.8)
	GameState.shake_camera(0.35, 0.4)

	if ObjectPool.is_registered("impact_fx"):
		var host: Node = GameState.world if GameState.world != null else get_parent()
		var fx: Node = ObjectPool.acquire("impact_fx", host)
		if fx != null:
			(fx as Node3D).global_position = impact_point
			if fx.has_method("burst"):
				fx.call("burst", Vector3.UP, Color(0.9, 0.6, 0.3), 2.0)

	var player := GameState.get_player()
	if player == null:
		return
	if player.global_position.distance_to(impact_point) <= slam_radius:
		if player.has_method("take_damage"):
			player.call("take_damage", attack_damage, impact_point)
		if player.has_method("add_impulse"):
			var push: Vector3 = (player.global_position - impact_point)
			push.y = 0.0
			if push.length() > 0.01:
				player.call("add_impulse", push.normalized() * slam_knockback + Vector3.UP * 5.0)
	_attack_swing = 1.0
