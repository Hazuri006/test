extends Node
## PlayerCombat -- node name "Combat", child of Player.
##
## Owns the whole attack timeline: light 3-hit combo, heavy slam, aerial dive
## kick, web attacks (stun / pull / throw), the counter window opened by dodging,
## and the combo counter feeding the HUD.
##
## Hit detection is done with a shape query at the attack's impact frame rather
## than with permanent Area3D hitboxes: exact timing, zero per-frame cost, and
## no risk of a stale overlap registering a hit after the animation ended.
##
## Scene requirements: none (pure logic node).
##
## Inspector parameters: light_damage, heavy_damage, web_damage, combo_window,
## hit_radius, knockback_*, hit_stop_duration.

@export_group("Damage")
@export var light_damage: float = 13.0
@export var heavy_damage: float = 31.0
@export var aerial_damage: float = 18.0
@export var web_damage: float = 7.0
@export var counter_bonus: float = 1.8

@export_group("Reach")
@export var hit_range: float = 1.9
@export var hit_radius: float = 1.5
@export var heavy_radius: float = 3.1
@export var web_attack_range: float = 26.0
@export var web_attack_cone: float = 0.55      ## dot() threshold in front of hero

@export_group("Feel")
@export var combo_window: float = 1.5
@export var hit_stop_duration: float = 0.055
@export var knockback_light: float = 6.0
@export var knockback_heavy: float = 15.0
@export var launch_heavy: float = 9.0
@export var counter_window_time: float = 0.34

## The attack table -- each entry is one move. `impact` is when damage lands,
## as a fraction of the animation, so retiming a move is a one-number change.
const MOVES := {
	"light_a": {"anim": "attack_a", "duration": 0.36, "impact": 0.34, "aoe": false},
	"light_b": {"anim": "attack_b", "duration": 0.36, "impact": 0.34, "aoe": false},
	"light_c": {"anim": "attack_c", "duration": 0.58, "impact": 0.40, "aoe": true},
	"heavy": {"anim": "attack_heavy", "duration": 0.80, "impact": 0.62, "aoe": true},
	"aerial": {"anim": "air_attack", "duration": 0.52, "impact": 0.34, "aoe": false},
	"web": {"anim": "web_shoot", "duration": 0.38, "impact": 0.30, "aoe": false},
}

var _player: CharacterBody3D
var _animator: Node3D
var _web: Node3D

var _current_move: String = ""
var _move_timer: float = 0.0
var _impact_done: bool = false
var _combo_index: int = 0
var _combo_timer: float = 0.0
var _combo_count: int = 0
var _buffered: String = ""
var _counter_timer: float = 0.0
var _counter_ready: bool = false
var _query := PhysicsShapeQueryParameters3D.new()
var _sphere := SphereShape3D.new()

func _ready() -> void:
	_player = get_parent() as CharacterBody3D
	_animator = _player.get_node_or_null("Visual")
	_web = _player.get_node_or_null("WebSystem")
	_query.collide_with_bodies = true
	_query.collide_with_areas = false
	# Enemies, boss parts and breakable props all react to punches.
	_query.collision_mask = BrickKit.L_ENEMY | BrickKit.L_BOSS | BrickKit.L_PROP

func _physics_process(delta: float) -> void:
	if _combo_timer > 0.0:
		_combo_timer -= delta
		if _combo_timer <= 0.0:
			_reset_combo()
	if _counter_timer > 0.0:
		_counter_timer -= delta
		if _counter_timer <= 0.0:
			_counter_ready = false

	if _current_move == "":
		if _buffered != "":
			var next := _buffered
			_buffered = ""
			_start_move(next)
		return

	var move: Dictionary = MOVES[_current_move]
	var duration: float = float(move["duration"])
	_move_timer += delta
	if not _impact_done and _move_timer >= duration * float(move["impact"]):
		_impact_done = true
		_resolve_impact(_current_move)
	if _move_timer >= duration:
		_current_move = ""
		if _buffered != "":
			var next := _buffered
			_buffered = ""
			_start_move(next)

# =============================================================================
#  REQUESTS (called from Player._unhandled_input)
# =============================================================================

func request_light() -> void:
	if not _player.is_on_floor():
		_queue("aerial")
		return
	# Chain a -> b -> c, restarting the chain after the window closes.
	var chain: Array[String] = ["light_a", "light_b", "light_c"]
	_queue(chain[_combo_index % chain.size()])

func request_heavy() -> void:
	_queue("heavy")

func request_web_attack() -> void:
	_queue("web")

func _queue(move_name: String) -> void:
	if _current_move == "":
		_start_move(move_name)
	else:
		# Buffer late input so combos feel responsive instead of dropping hits.
		var move: Dictionary = MOVES[_current_move]
		if _move_timer > float(move["duration"]) * 0.45:
			_buffered = move_name

func _start_move(move_name: String) -> void:
	if not MOVES.has(move_name):
		return
	_current_move = move_name
	_move_timer = 0.0
	_impact_done = false
	if move_name.begins_with("light"):
		_combo_index += 1
		_combo_timer = combo_window
	elif move_name == "heavy":
		_combo_timer = combo_window
	# Ask the player to hand movement control over to its ATTACK state.
	if _player.has_method("enter_attack_state"):
		_player.call("enter_attack_state")
	if _animator != null:
		_animator.restart_state(String(MOVES[move_name]["anim"]))
	# Slight forward step so attacks close the gap and never whiff by 10 cm.
	if move_name != "web":
		var forward: Vector3 = -_player.global_transform.basis.z
		_player.velocity.x = forward.x * 3.2
		_player.velocity.z = forward.z * 3.2
	if move_name == "heavy":
		AudioManager.play("dodge", 0.7, -8.0)

func is_attacking() -> bool:
	return _current_move != ""

func current_attack_anim() -> String:
	if _current_move == "":
		return "attack_a"
	return String(MOVES[_current_move]["anim"])

# =============================================================================
#  IMPACT RESOLUTION
# =============================================================================

func _resolve_impact(move_name: String) -> void:
	match move_name:
		"web":
			_resolve_web_attack()
		"heavy":
			_resolve_melee(heavy_damage, heavy_radius, knockback_heavy, launch_heavy, true)
		"aerial":
			_resolve_melee(aerial_damage, hit_radius, knockback_light * 1.4, 3.0, false)
		"light_c":
			_resolve_melee(light_damage * 1.35, heavy_radius * 0.85, knockback_light * 1.8, 4.0, true)
		_:
			_resolve_melee(light_damage, hit_radius, knockback_light, 0.0, false)

func _resolve_melee(damage: float, radius: float, knockback: float, launch: float, aoe: bool) -> void:
	if _counter_ready:
		damage *= counter_bonus
		knockback *= 1.5
		_counter_ready = false
		Events.toast_requested.emit("CONTRE !")

	var forward: Vector3 = -_player.global_transform.basis.z
	var centre: Vector3 = _player.global_position + Vector3.UP * 1.0
	if not aoe:
		centre += forward * hit_range
	_sphere.radius = radius
	_query.shape = _sphere
	_query.transform = Transform3D(Basis.IDENTITY, centre)
	var space := _player.get_world_3d().direct_space_state
	var hits: Array[Dictionary] = space.intersect_shape(_query, 12)

	var landed := 0
	for hit in hits:
		var body: Object = hit.get("collider")
		if body == null or not is_instance_valid(body):
			continue
		if not body.has_method("take_damage"):
			continue
		var body3d := body as Node3D
		# Front-arc check for single-target moves so the hero never punches
		# backwards through their own shoulders.
		if not aoe:
			var to_target: Vector3 = body3d.global_position - _player.global_position
			to_target.y = 0.0
			if to_target.length() > 0.05 and forward.dot(to_target.normalized()) < 0.25:
				continue
		var push: Vector3 = (body3d.global_position - _player.global_position)
		push.y = 0.0
		if push.length() < 0.01:
			push = forward
		push = push.normalized() * knockback + Vector3.UP * launch
		body.call("take_damage", damage, _player.global_position, push)
		_spawn_impact(body3d.global_position + Vector3.UP * 0.9, aoe)
		landed += 1

	if landed > 0:
		_register_hit(landed, aoe)
	else:
		AudioManager.play("dodge", 1.35, -14.0)

func _resolve_web_attack() -> void:
	var target := _find_web_target()
	if target == null:
		AudioManager.play("web_shoot", 1.15, -6.0)
		return
	var hand_pos: Vector3 = _player.global_position + Vector3.UP * 1.3
	if _animator != null and _animator.has_method("web_origin"):
		hand_pos = (_animator.web_origin(true) as Node3D).global_position
	if _web != null and _web.has_method("spawn_strand"):
		_web.spawn_strand(hand_pos, target.global_position + Vector3.UP * 0.9, 0.18)
	AudioManager.play("web_shoot", 1.0)

	if target.has_method("apply_web"):
		target.call("apply_web", 2.6)
	if target.has_method("take_damage"):
		var pull: Vector3 = (_player.global_position - target.global_position)
		pull.y = 0.0
		# A web attack yanks the target towards the hero -- that is the setup for
		# a juggle, and the way to stop a runner escaping.
		pull = pull.normalized() * 11.0 + Vector3.UP * 3.0
		target.call("take_damage", web_damage, _player.global_position, pull)
	_register_hit(1, false)
	if _animator != null:
		_animator.aim_arm_at(target.global_position + Vector3.UP * 0.9, true, 1.0)

## Nearest damageable thing inside the forward cone.
func _find_web_target() -> Node3D:
	var forward: Vector3 = -_player.global_transform.basis.z
	var best: Node3D = null
	var best_dist: float = web_attack_range
	# Enemies register themselves in the "enemies" group when they spawn.
	for node in get_tree().get_nodes_in_group("enemies"):
		var n := node as Node3D
		if n == null or not is_instance_valid(n):
			continue
		if n.has_method("is_defeated") and n.call("is_defeated"):
			continue
		var to_target: Vector3 = n.global_position - _player.global_position
		var dist: float = to_target.length()
		if dist > best_dist or dist < 0.2:
			continue
		if forward.dot(to_target.normalized()) < web_attack_cone:
			continue
		best = n
		best_dist = dist
	return best

# =============================================================================
#  FEEDBACK
# =============================================================================

func _register_hit(count: int, big: bool) -> void:
	_combo_count += count
	_combo_timer = combo_window
	Events.combo_changed.emit(_combo_count, 1.0)
	AudioManager.play("punch_heavy" if big else "punch", randf_range(0.94, 1.09))
	AudioManager.play("hit", randf_range(0.9, 1.1), -6.0)
	GameState.shake_camera(0.09 if not big else 0.2, 0.16 if not big else 0.3)
	GameState.add_score(10 * count * (2 if big else 1))
	var rig: Node3D = _player.get_node_or_null("CameraRig")
	if rig != null and rig.has_method("punch_nudge"):
		rig.call("punch_nudge", 0.1 if not big else 0.2)
	_hit_stop(hit_stop_duration * (1.8 if big else 1.0))

func _reset_combo() -> void:
	_combo_index = 0
	if _combo_count > 0:
		_combo_count = 0
		Events.combo_changed.emit(0, 0.0)

## Micro freeze-frame on impact. Restores itself even if several hits land.
func _hit_stop(duration: float) -> void:
	if duration <= 0.0:
		return
	Engine.time_scale = 0.22
	await get_tree().create_timer(duration, true, false, true).timeout
	Engine.time_scale = 1.0

func _spawn_impact(where: Vector3, big: bool) -> void:
	if not ObjectPool.is_registered("impact_fx"):
		return
	var host: Node = GameState.world if GameState.world != null else get_tree().current_scene
	var fx: Node = ObjectPool.acquire("impact_fx", host)
	if fx == null:
		return
	(fx as Node3D).global_position = where
	if fx.has_method("burst"):
		var forward: Vector3 = -_player.global_transform.basis.z
		fx.call("burst", forward, Color(1.0, 0.92, 0.6) if not big else Color(1.0, 0.7, 0.3),
				1.0 if not big else 1.8)

# =============================================================================
#  DODGE COUNTER
# =============================================================================

## Called by Player when a dodge starts: getting hit during this window (or
## attacking right after) turns into a counter with bonus damage.
func open_counter_window() -> void:
	_counter_timer = counter_window_time
	_counter_ready = true

func notify_hit_taken(_from: Vector3) -> void:
	_reset_combo()

func combo_count() -> int:
	return _combo_count
