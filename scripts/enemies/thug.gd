class_name EnemyThug
extends EnemyBase
## Thug -- the standard street crook (scenes/enemies/enemy_thug.gd).
##
## Walks up, swings, backs off. Low health, low damage: the enemy the combo
## system is balanced around. Wears a cap and a work jacket.

func _ready() -> void:
	max_health = 60.0
	move_speed = 4.4
	chase_speed = 6.4
	attack_damage = 9.0
	attack_range = 2.4
	attack_windup = 0.40
	attack_recovery = 0.55
	attack_cooldown = 1.3
	detection_range = 26.0
	score_value = 60
	knockback_resist = 0.0
	super()

func _build_visual() -> void:
	rig = EnemyRig.new().build(self, {
		"suit": Color(0.32, 0.34, 0.42),
		"trim": Color(0.18, 0.19, 0.24),
		"skin": Color(0.90, 0.74, 0.52),
		"accent": Color(0.78, 0.42, 0.16),
	}, 1.0)
