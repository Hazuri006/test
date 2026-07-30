class_name EnemyRunner
extends EnemyBase
## Runner -- fast, twitchy crook (scenes/enemies/enemy_runner.gd).
##
## Sprints, strafes, sidesteps when the hero winds up an attack, and throws a
## two-hit flurry instead of a single swing. Low health: catching one is the
## reward for reading its dodge.

@export var dodge_chance: float = 0.55
@export var dodge_speed: float = 12.0
@export var dodge_cooldown: float = 1.6

var _dodge_cd: float = 0.0
var _flurry: int = 0

func _ready() -> void:
	max_health = 42.0
	move_speed = 6.0
	chase_speed = 9.4
	attack_damage = 6.0
	attack_range = 2.2
	attack_windup = 0.22
	attack_recovery = 0.30
	attack_cooldown = 0.75
	detection_range = 30.0
	score_value = 85
	knockback_resist = 0.0
	super()

func _build_visual() -> void:
	rig = EnemyRig.new().build(self, {
		"suit": Color(0.75, 0.24, 0.28),
		"trim": Color(0.20, 0.20, 0.24),
		"skin": Color(0.86, 0.70, 0.50),
		"accent": Color(0.95, 0.80, 0.20),
	}, 0.9)

func _think(delta: float) -> void:
	_dodge_cd = maxf(_dodge_cd - delta, 0.0)
	var player := GameState.get_player()
	if player == null or _dodge_cd > 0.0:
		return
	# React to the hero's wind-up: leap sideways out of the swing.
	if player.has_method("is_attacking") and player.call("is_attacking"):
		if global_position.distance_to(player.global_position) < 4.5 and randf() < dodge_chance:
			var side: Vector3 = _forward().cross(Vector3.UP).normalized()
			if randf() < 0.5:
				side = -side
			velocity += side * dodge_speed + Vector3.UP * 2.5
			_dodge_cd = dodge_cooldown
			AudioManager.play_at("dodge", global_position, 1.3)

func _attack_impact() -> void:
	super()
	# Flurry: chain up to three quick jabs before recovering.
	_flurry += 1
	if _flurry < 3 and target != null and is_instance_valid(target) \
			and global_position.distance_to(target.global_position) < attack_range * 1.2:
		_impact_done = false
		_attack_timer = 0.0
	else:
		_flurry = 0
