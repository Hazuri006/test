class_name EnemyGunner
extends EnemyBase
## Gunner -- ranged crook with a chunky toy blaster
## (scenes/enemies/enemy_gunner.gd).
##
## Fires slow, clearly visible energy bolts (a deliberately unrealistic prop, no
## real firearm) and tries to keep its distance, backing off when the hero closes
## in. Fragile in melee: closing the gap is the counterplay.

@export var preferred_distance: float = 14.0
@export var retreat_distance: float = 8.0
@export var projectile_speed: float = 26.0
@export var bolt_color: Color = Color(0.4, 1.0, 0.55)

func _ready() -> void:
	max_health = 46.0
	move_speed = 4.0
	chase_speed = 5.6
	attack_damage = 8.0
	attack_range = 22.0           ## "range" here is firing range
	attack_windup = 0.5
	attack_recovery = 0.45
	attack_cooldown = 1.9
	detection_range = 34.0
	lose_range = 46.0
	score_value = 110
	super()

func _build_visual() -> void:
	rig = EnemyRig.new().build(self, {
		"suit": Color(0.22, 0.30, 0.46),
		"trim": Color(0.14, 0.18, 0.26),
		"skin": Color(0.88, 0.72, 0.50),
		"accent": Color(0.30, 0.70, 0.95),
	}, 1.0, true, bolt_color)
	rig.add_blaster(bolt_color)

## Kite the hero: hold a firing line, retreat when crowded.
func _think(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	var dist: float = global_position.distance_to(target.global_position)
	if dist < retreat_distance:
		var away: Vector3 = global_position - target.global_position
		away.y = 0.0
		if away.length() > 0.01:
			_steer(away.normalized() * chase_speed, delta)
		_face(target.global_position, delta * 6.0)
	elif dist < preferred_distance:
		# strafe so it never stands still and never walks into melee
		var side: Vector3 = (target.global_position - global_position).cross(Vector3.UP).normalized()
		_steer(side * move_speed, delta)
		_face(target.global_position, delta * 6.0)

func _attack_impact() -> void:
	if target == null or not is_instance_valid(target):
		return
	var muzzle: Node3D = rig.bone("Muzzle")
	var origin: Vector3 = muzzle.global_position if muzzle != null else global_position + Vector3.UP * 1.4
	var to_target: Vector3 = (target.global_position + Vector3.UP * 0.9) - origin
	if to_target.length() < 0.1:
		return
	_fire_bolt(origin, to_target.normalized())
	AudioManager.play_at("shot", global_position, randf_range(0.95, 1.1), 60.0)
	_attack_swing = 0.6

func _fire_bolt(origin: Vector3, direction: Vector3) -> void:
	if not ObjectPool.is_registered("enemy_bolt"):
		return
	var host: Node = GameState.world if GameState.world != null else get_parent()
	var bolt: Node = ObjectPool.acquire("enemy_bolt", host)
	if bolt == null:
		return
	if bolt.has_method("launch"):
		bolt.call("launch", origin, direction * projectile_speed, attack_damage, bolt_color)
