class_name EnemyBase
extends CharacterBody3D
## EnemyBase -- shared brain and body for every crook in Brick City.
##
## AI: PATROL -> DETECT -> CHASE -> ATTACK -> RECOVER -> RETURN, plus HURT,
## WEBBED and DEFEATED. Movement uses NavigationAgent3D when a path exists and
## falls back to direct steering when it does not, so an enemy knocked onto a
## rooftop still behaves instead of freezing.
##
## Reactions the design brief asks for, all implemented here:
##   * takes damage and shows a health bar
##   * gets knocked back, and can be launched into the air (juggling)
##   * plays a hit reaction, can be webbed (stunned) and thrown into objects
##   * falls over on defeat and is then recycled cleanly
##
## Subclasses override: _configure() for stats/look, _attack_impact() for the
## actual hit, and optionally _think() for special behaviour.
##
## Scene requirements (see scenes/enemies/*.tscn):
##   CharacterBody3D   collision_layer = 4 (enemy), mask = 133 (world|enemy|vehicle)
##     CollisionShape3D  CapsuleShape3D
##     NavigationAgent3D
##
## Inspector parameters: every stat below is exported.

enum State { PATROL, CHASE, ATTACK, RECOVER, RETURN, HURT, WEBBED, DEFEATED }

@export_group("Stats")
@export var max_health: float = 60.0
@export var move_speed: float = 4.6
@export var chase_speed: float = 6.2
@export var attack_damage: float = 9.0
@export var attack_range: float = 2.3
@export var attack_windup: float = 0.42
@export var attack_recovery: float = 0.65
@export var attack_cooldown: float = 1.4
@export var score_value: int = 60

@export_group("Senses")
@export var detection_range: float = 26.0
@export var lose_range: float = 42.0
@export var leash_range: float = 60.0
@export var patrol_radius: float = 9.0

@export_group("Physics")
@export var gravity: float = 26.0
@export var knockback_resist: float = 0.0     ## 0 = light, 1 = immovable
@export var friction: float = 9.0

var state: State = State.PATROL
var health: float = 60.0
var home_position: Vector3 = Vector3.ZERO
var target: Node3D = null
var rig: EnemyRig
var health_bar: HealthBar3D
var agent: NavigationAgent3D

var _state_timer: float = 0.0
var _attack_timer: float = 0.0
var _cooldown: float = 0.0
var _webbed_timer: float = 0.0
var _patrol_point: Vector3 = Vector3.ZERO
var _patrol_wait: float = 0.0
var _anim_phase: float = 0.0
var _attack_swing: float = 0.0
var _impact_done: bool = false
var _far_away: bool = false
var _nav_ready: bool = false
var _nav_repath: float = 0.0
var _defeated_timer: float = 0.0
var _alerted: bool = false

func _ready() -> void:
	add_to_group("enemies")
	collision_layer = BrickKit.L_ENEMY
	collision_mask = BrickKit.MASK_ENEMY_BODY
	health = max_health
	home_position = global_position
	_patrol_point = global_position

	agent = get_node_or_null("NavigationAgent3D")
	if agent == null:
		agent = NavigationAgent3D.new()
		add_child(agent)
	agent.path_desired_distance = 1.0
	agent.target_desired_distance = 1.2
	agent.path_max_distance = 8.0
	agent.avoidance_enabled = false
	agent.radius = 0.5

	_build_visual()

	health_bar = HealthBar3D.new()
	health_bar.position = Vector3(0, 2.35, 0)
	add_child(health_bar)
	health_bar.setup(1.1)

	# The navigation map needs one physics frame before it can be queried.
	await get_tree().physics_frame
	_nav_ready = true

## Subclasses build their own look here.
func _build_visual() -> void:
	rig = EnemyRig.new().build(self, {
		"suit": Color(0.26, 0.30, 0.38),
		"trim": Color(0.16, 0.17, 0.2),
		"skin": Color(0.92, 0.78, 0.52),
		"accent": Color(0.75, 0.45, 0.12),
	}, 1.0)

# =============================================================================
#  MAIN LOOP
# =============================================================================

func _physics_process(delta: float) -> void:
	if _far_away and state != State.DEFEATED:
		# Frozen: still fall, but no thinking, no animation.
		velocity.y -= gravity * delta
		move_and_slide()
		return

	_state_timer += delta
	_cooldown = maxf(_cooldown - delta, 0.0)

	match state:
		State.PATROL:
			_process_patrol(delta)
		State.CHASE:
			_process_chase(delta)
		State.ATTACK:
			_process_attack(delta)
		State.RECOVER:
			_process_recover(delta)
		State.RETURN:
			_process_return(delta)
		State.HURT:
			_process_hurt(delta)
		State.WEBBED:
			_process_webbed(delta)
		State.DEFEATED:
			_process_defeated(delta)

	if not is_on_floor():
		velocity.y -= gravity * delta
	move_and_slide()
	_animate(delta)

func _enter(next: State) -> void:
	if state == next or state == State.DEFEATED:
		return
	state = next
	_state_timer = 0.0
	if next == State.ATTACK:
		_attack_timer = 0.0
		_impact_done = false

# --- states -------------------------------------------------------------------

func _process_patrol(delta: float) -> void:
	_acquire_target()
	if target != null:
		_on_alerted()
		_enter(State.CHASE)
		return
	if _patrol_wait > 0.0:
		_patrol_wait -= delta
		_brake(delta)
		return
	var to_point: Vector3 = _patrol_point - global_position
	to_point.y = 0.0
	if to_point.length() < 1.5:
		_patrol_wait = randf_range(1.2, 3.4)
		var angle: float = randf() * TAU
		_patrol_point = home_position + Vector3(cos(angle), 0.0, sin(angle)) * randf_range(2.0, patrol_radius)
		return
	_move_towards(_patrol_point, move_speed, delta)

func _process_chase(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		_enter(State.RETURN)
		return
	var dist: float = global_position.distance_to(target.global_position)
	if dist > lose_range or home_position.distance_to(global_position) > leash_range:
		target = null
		_enter(State.RETURN)
		return
	if dist <= attack_range and _cooldown <= 0.0:
		_enter(State.ATTACK)
		return
	_move_towards(target.global_position, chase_speed, delta)
	_think(delta)

func _process_attack(delta: float) -> void:
	_attack_timer += delta
	_brake(delta)
	_face(target.global_position if target != null else global_position + _forward(), delta * 3.0)
	if not _impact_done and _attack_timer >= attack_windup:
		_impact_done = true
		_attack_impact()
	if _attack_timer >= attack_windup + attack_recovery:
		_cooldown = attack_cooldown
		_enter(State.RECOVER)

## Short back-off after attacking: gives the player a rhythm to counter.
func _process_recover(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		_enter(State.RETURN)
		return
	var away: Vector3 = global_position - target.global_position
	away.y = 0.0
	if away.length() > 0.1 and _state_timer < 0.45:
		_steer(away.normalized() * move_speed * 0.6, delta)
	else:
		_brake(delta)
	if _state_timer > 0.7:
		_enter(State.CHASE)

func _process_return(delta: float) -> void:
	_acquire_target()
	if target != null:
		_enter(State.CHASE)
		return
	var to_home: Vector3 = home_position - global_position
	to_home.y = 0.0
	if to_home.length() < 2.0:
		_enter(State.PATROL)
		return
	_move_towards(home_position, move_speed, delta)

func _process_hurt(delta: float) -> void:
	_brake(delta * 0.35)
	if _state_timer > 0.35:
		_enter(State.CHASE if target != null else State.RETURN)

func _process_webbed(delta: float) -> void:
	_webbed_timer -= delta
	_brake(delta)
	if _webbed_timer <= 0.0:
		_enter(State.CHASE if target != null else State.PATROL)

func _process_defeated(delta: float) -> void:
	_brake(delta * 0.6)
	_defeated_timer += delta
	# Fall over, then sink and disappear.
	if rig != null and rig.root != null:
		rig.root.rotation.x = lerpf(rig.root.rotation.x, deg_to_rad(-88.0), 6.0 * delta)
		rig.root.position.y = lerpf(rig.root.position.y, 0.35, 4.0 * delta)
		if _defeated_timer > 2.2:
			rig.root.position.y -= delta * 1.4
	if _defeated_timer > 3.4:
		_despawn()

# --- movement helpers ---------------------------------------------------------

func _move_towards(destination: Vector3, speed: float, delta: float) -> void:
	var direction: Vector3 = _path_direction(destination, delta)
	if direction.length_squared() < 0.001:
		_brake(delta)
		return
	_steer(direction * speed, delta)
	_face(global_position + direction, delta * 6.0)

## Navigation with a graceful fallback. Repathing is throttled: agents that
## recompute every frame are a classic performance sink.
func _path_direction(destination: Vector3, delta: float) -> Vector3:
	var straight: Vector3 = destination - global_position
	straight.y = 0.0
	if not _nav_ready or agent == null:
		return straight.normalized() if straight.length() > 0.1 else Vector3.ZERO
	_nav_repath -= delta
	if _nav_repath <= 0.0:
		_nav_repath = 0.35
		agent.target_position = destination
	if agent.is_navigation_finished():
		return straight.normalized() if straight.length() > 1.0 else Vector3.ZERO
	var next: Vector3 = agent.get_next_path_position()
	var to_next: Vector3 = next - global_position
	to_next.y = 0.0
	if to_next.length() < 0.05:
		return straight.normalized() if straight.length() > 0.1 else Vector3.ZERO
	return to_next.normalized()

func _steer(desired: Vector3, delta: float) -> void:
	var current := Vector3(velocity.x, 0.0, velocity.z)
	current = current.move_toward(desired, 26.0 * delta)
	velocity.x = current.x
	velocity.z = current.z

func _brake(delta: float) -> void:
	velocity.x = move_toward(velocity.x, 0.0, friction * delta * 6.0)
	velocity.z = move_toward(velocity.z, 0.0, friction * delta * 6.0)

func _face(point: Vector3, weight: float) -> void:
	var to_point: Vector3 = point - global_position
	to_point.y = 0.0
	if to_point.length() < 0.05:
		return
	var want: float = atan2(-to_point.x, -to_point.z)
	rotation.y = lerp_angle(rotation.y, want, clampf(weight, 0.0, 1.0))

func _forward() -> Vector3:
	return -global_transform.basis.z

func _acquire_target() -> void:
	var player := GameState.get_player()
	if player == null:
		target = null
		return
	if global_position.distance_to(player.global_position) <= detection_range:
		target = player

## Hook for subclasses (dodging, strafing, keeping distance...).
func _think(_delta: float) -> void:
	pass

## Hook for subclasses: what the attack actually does.
func _attack_impact() -> void:
	if target == null or not is_instance_valid(target):
		return
	if global_position.distance_to(target.global_position) > attack_range * 1.35:
		AudioManager.play_at("dodge", global_position, 1.2)
		return
	if target.has_method("take_damage"):
		target.call("take_damage", attack_damage, global_position)
	AudioManager.play_at("punch", global_position, randf_range(0.9, 1.1))
	_attack_swing = 1.0

# =============================================================================
#  DAMAGE
# =============================================================================

func take_damage(amount: float, from_position: Vector3 = Vector3.ZERO,
		knockback: Vector3 = Vector3.ZERO) -> void:
	if state == State.DEFEATED:
		return
	health -= amount
	health_bar.set_ratio(health / max_health)
	Events.enemy_damaged.emit(self, amount)
	_far_away = false        # being punched wakes an enemy up regardless of range

	if knockback.length() > 0.01:
		var resist: float = clampf(1.0 - knockback_resist, 0.05, 1.0)
		velocity += knockback * resist
		if knockback.y > 1.0:
			velocity.y = maxf(velocity.y, knockback.y * resist)

	if health <= 0.0:
		_defeat()
		return

	# Look at the attacker: getting hit from behind should turn you round.
	if from_position != Vector3.ZERO:
		_face(from_position, 0.7)
		var player := GameState.get_player()
		if player != null and from_position.distance_to(player.global_position) < 4.0:
			target = player
	if state != State.WEBBED:
		_enter(State.HURT)
	AudioManager.play_at("hit", global_position, randf_range(0.9, 1.15), 40.0)

## Web attack: stops the enemy in place for a while.
func apply_web(duration: float) -> void:
	if state == State.DEFEATED:
		return
	_webbed_timer = maxf(_webbed_timer, duration)
	_enter(State.WEBBED)
	_show_web_cocoon()
	AudioManager.play_at("web_attach", global_position, randf_range(0.9, 1.1))

func _show_web_cocoon() -> void:
	var existing := get_node_or_null("WebCocoon")
	if existing != null:
		(existing as Node3D).visible = true
		return
	var cocoon := Node3D.new()
	cocoon.name = "WebCocoon"
	add_child(cocoon)
	var mat := BrickKit.brick(Color(0.94, 0.96, 1.0), false, 0.55)
	for i in 6:
		var strand := BrickKit.add_box(cocoon, Vector3(0.9, 0.1, 0.9),
				Vector3(0, 0.4 + float(i) * 0.28, 0), mat, "Strand%d" % i)
		strand.rotation.y = randf_range(0.0, PI)

func _hide_web_cocoon() -> void:
	var cocoon := get_node_or_null("WebCocoon")
	if cocoon != null:
		(cocoon as Node3D).visible = false

func _defeat() -> void:
	state = State.DEFEATED
	_defeated_timer = 0.0
	health = 0.0
	health_bar.visible = false
	collision_layer = 0            # stop blocking the player and other enemies
	remove_from_group("enemies")
	add_to_group("defeated_enemies")
	GameState.add_score(score_value)
	Events.enemy_defeated.emit(self)
	AudioManager.play_at("enemy_down", global_position, randf_range(0.9, 1.1))
	_spawn_defeat_fx()

func _spawn_defeat_fx() -> void:
	if not ObjectPool.is_registered("impact_fx"):
		return
	var host: Node = GameState.world if GameState.world != null else get_parent()
	var fx: Node = ObjectPool.acquire("impact_fx", host)
	if fx == null:
		return
	(fx as Node3D).global_position = global_position + Vector3.UP
	if fx.has_method("burst"):
		fx.call("burst", Vector3.UP, Color(0.8, 0.85, 1.0), 1.3)

func is_defeated() -> bool:
	return state == State.DEFEATED

func _despawn() -> void:
	if has_meta(ObjectPool.META_KEY):
		ObjectPool.release(self)
	else:
		queue_free()

# =============================================================================
#  PROCEDURAL ANIMATION
# =============================================================================

func _animate(delta: float) -> void:
	if rig == null:
		return
	var speed := Vector3(velocity.x, 0.0, velocity.z).length()
	_anim_phase += delta * (2.0 + speed * 1.5)
	_attack_swing = maxf(_attack_swing - delta * 3.0, 0.0)

	var swing: float = sin(_anim_phase) * clampf(speed / 6.0, 0.05, 1.0)
	var leg_l: Node3D = rig.bone("LegL")
	var leg_r: Node3D = rig.bone("LegR")
	var arm_l: Node3D = rig.bone("ArmL")
	var arm_r: Node3D = rig.bone("ArmR")
	var chest: Node3D = rig.bone("Chest")
	var hips: Node3D = rig.bone("Hips")

	if leg_l != null:
		leg_l.rotation.x = swing * 0.75
	if leg_r != null:
		leg_r.rotation.x = -swing * 0.75
	if arm_l != null:
		arm_l.rotation.x = -swing * 0.6
	if arm_r != null:
		arm_r.rotation.x = swing * 0.6 - _attack_swing * 2.2
	if chest != null:
		chest.rotation.y = swing * 0.12
		chest.rotation.x = clampf(speed * 0.02, 0.0, 0.2) + _attack_swing * 0.3
	if hips != null:
		hips.position.y = (0.86) + absf(sin(_anim_phase)) * 0.04 * clampf(speed / 6.0, 0.0, 1.0)

	if state == State.WEBBED:
		# Struggling in the webbing.
		if chest != null:
			chest.rotation.z = sin(_state_timer * 18.0) * 0.14
	elif chest != null:
		chest.rotation.z = 0.0

# =============================================================================
#  STREAMING / POOLING
# =============================================================================

func set_far_away(far: bool) -> void:
	if _far_away == far:
		return
	_far_away = far
	if health_bar != null and far:
		health_bar.visible = false

func _on_alerted() -> void:
	if _alerted:
		return
	_alerted = true
	AudioManager.play_at("enemy_alert", global_position, randf_range(0.9, 1.2))

## Reset used both by the pool and by mission restarts.
func reset_enemy(at: Vector3) -> void:
	global_position = at
	home_position = at
	_patrol_point = at
	health = max_health
	state = State.PATROL
	target = null
	velocity = Vector3.ZERO
	_alerted = false
	_webbed_timer = 0.0
	_defeated_timer = 0.0
	_cooldown = 0.0
	collision_layer = BrickKit.L_ENEMY
	if not is_in_group("enemies"):
		add_to_group("enemies")
	remove_from_group("defeated_enemies")
	if rig != null and rig.root != null:
		rig.root.rotation = Vector3.ZERO
		rig.root.position = Vector3.ZERO
	if health_bar != null:
		health_bar.set_ratio(1.0)
		health_bar.visible = false
	_hide_web_cocoon()

func pool_acquired() -> void:
	set_far_away(false)

func pool_released() -> void:
	target = null
	velocity = Vector3.ZERO
