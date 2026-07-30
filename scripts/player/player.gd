extends CharacterBody3D
## Player -- "Web Hero", the hero of Brick City.
##
## This script is the COORDINATOR only. Everything specialised lives in a child
## component so each piece stays readable and replaceable:
##   Visual      (player_animator.gd)  rig + AnimationTree
##   CameraRig   (third_person_camera.gd)
##   WebSystem   (web_system.gd)       anchors, pendulum, zip
##   Combat      (player_combat.gd)    combos, hitboxes, web attacks
##   SpeedFX     (speed_fx.gd)         wind lines + streak particles
##
## Movement model: run / sprint, jump + double jump with a flip, coyote time and
## jump buffering, wall climb, wall run, wall jump, air tricks, dive-roll dodge,
## web swinging and zip lines, plus dynamic landings.
##
## Scene requirements (see scenes/player/player.tscn):
##   CharacterBody3D "Player"   collision_layer = 2 (player)
##                              collision_mask  = 1|64|128 (world, props, vehicles)
##     CollisionShape3D  CapsuleShape3D radius 0.36 height 1.75
##     Visual            (Node3D)      -> player_animator.gd
##     CameraRig         (Node3D)      -> third_person_camera.gd
##     WebSystem         (Node3D)      -> web_system.gd
##     Combat            (Node)        -> player_combat.gd
##     SpeedFX           (Node3D)      -> speed_fx.gd
##     WallProbe         (RayCast3D)   forward, mask 1
##     GroundProbe       (RayCast3D)   down, mask 1|64|128
##
## Inspector parameters: see the export groups below -- every number that
## defines how the hero feels is tunable there.

enum State {
	IDLE, RUN, JUMP, DOUBLE_JUMP, FALL, LAND, SWING, ZIP,
	WALL_CLIMB, WALL_RUN, TRICK, ATTACK, DODGE, HURT, DEAD, VICTORY,
}

@export_group("Ground movement")
@export var walk_speed: float = 6.5
@export var run_speed: float = 13.0
@export var acceleration: float = 62.0
@export var deceleration: float = 74.0
@export var turn_speed: float = 12.0

@export_group("Air movement")
@export var gravity: float = 24.0
@export var terminal_velocity: float = 62.0
@export var jump_height: float = 3.3
@export var double_jump_height: float = 2.8
@export var air_control: float = 0.42
@export var air_drag: float = 0.4
@export var coyote_time: float = 0.13
@export var jump_buffer: float = 0.16

@export_group("Wall moves")
@export var wall_climb_speed: float = 5.2
@export var wall_run_speed: float = 12.5
@export var wall_run_max_time: float = 2.6
@export var wall_jump_force: float = 12.0
@export var wall_jump_push: float = 8.0
@export var wall_stick_force: float = 3.0

@export_group("Dodge")
@export var dodge_speed: float = 17.0
@export var dodge_duration: float = 0.34
@export var dodge_cooldown: float = 0.42
@export var dodge_invulnerable_time: float = 0.26

@export_group("Survivability")
@export var max_health: float = 100.0
@export var regen_delay: float = 7.0
@export var regen_rate: float = 8.0
@export var fall_damage_speed: float = 46.0
@export var fall_damage_scale: float = 1.6

var state: State = State.IDLE
var health: float = 100.0
var control_enabled: bool = true

# component references
var animator: Node3D
var camera_rig: Node3D
var web: Node3D
var combat: Node
var speed_fx: Node3D
var wall_probe: RayCast3D
var ground_probe: RayCast3D

# internal timers / flags
var _coyote: float = 0.0
var _jump_buffered: float = 0.0
var _air_jumps: int = 0
var _state_timer: float = 0.0
var _dodge_timer: float = 0.0
var _dodge_cd: float = 0.0
var _invuln: float = 0.0
var _wall_run_timer: float = 0.0
var _wall_normal: Vector3 = Vector3.ZERO
var _last_fall_speed: float = 0.0
var _time_since_damage: float = 999.0
var _facing: float = 0.0
var _input_dir: Vector2 = Vector2.ZERO
var _sprinting: bool = false
var _step_accum: float = 0.0
var _safe_ground: Vector3 = Vector3.ZERO
var _trick_available: bool = true

func _ready() -> void:
	health = max_health
	animator = get_node_or_null("Visual")
	camera_rig = get_node_or_null("CameraRig")
	web = get_node_or_null("WebSystem")
	combat = get_node_or_null("Combat")
	speed_fx = get_node_or_null("SpeedFX")
	wall_probe = get_node_or_null("WallProbe")
	ground_probe = get_node_or_null("GroundProbe")

	_facing = rotation.y
	_safe_ground = global_position
	GameState.register_player(self)
	Events.player_health_changed.emit(health, max_health)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

# =============================================================================
#  INPUT
# =============================================================================

## Actions are POLLED in _physics_process rather than handled in
## _unhandled_input. Two reasons that matter in practice:
##   * a Control that grabs focus (pause menu, options) can swallow input events,
##     but polling stays in step with the physics tick that consumes it,
##   * anything that drives the hero programmatically (cutscenes, the smoke test,
##     a future gamepad remap) works through the same path as a human player.
func _poll_actions() -> void:
	if not _can_act():
		return
	if Input.is_action_just_pressed("jump"):
		request_jump()
	if Input.is_action_just_pressed("web_swing"):
		try_web_swing()
	if Input.is_action_just_released("web_swing"):
		release_web()
	if Input.is_action_just_pressed("web_zip"):
		try_web_zip()
	if Input.is_action_just_pressed("dodge"):
		try_dodge()
	if Input.is_action_just_pressed("taunt") and is_on_floor():
		_enter(State.VICTORY)
	if combat == null:
		return
	if Input.is_action_just_pressed("attack_light"):
		combat.request_light()
	if Input.is_action_just_pressed("attack_heavy"):
		combat.request_heavy()
	if Input.is_action_just_pressed("web_attack"):
		combat.request_web_attack()

func _can_act() -> bool:
	return control_enabled and GameState.gameplay_active() and state != State.DEAD

func _read_input() -> void:
	if not _can_act():
		_input_dir = Vector2.ZERO
		_sprinting = false
		return
	_input_dir = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	# Godot's get_vector gives +Y for "move_back"; flip so +Y means forward.
	_input_dir.y = -_input_dir.y
	_sprinting = Input.is_action_pressed("sprint")

## Input direction converted to world space using the camera yaw.
func _world_input_dir() -> Vector3:
	if camera_rig == null:
		return Vector3(_input_dir.x, 0.0, -_input_dir.y)
	var fwd: Vector3 = camera_rig.get_flat_forward()
	var right: Vector3 = camera_rig.get_flat_right()
	var dir: Vector3 = fwd * _input_dir.y + right * _input_dir.x
	return dir.normalized() if dir.length_squared() > 0.0001 else Vector3.ZERO

# =============================================================================
#  MAIN LOOP
# =============================================================================

func _physics_process(delta: float) -> void:
	_read_input()
	_poll_actions()
	_tick_timers(delta)

	if web != null:
		web.update_aim()

	match state:
		State.SWING:
			_process_swing(delta)
		State.ZIP:
			_process_zip(delta)
		State.WALL_CLIMB:
			_process_wall_climb(delta)
		State.WALL_RUN:
			_process_wall_run(delta)
		State.DODGE:
			_process_dodge(delta)
		State.ATTACK:
			_process_attack(delta)
		State.HURT:
			_process_hurt(delta)
		State.DEAD:
			_process_dead(delta)
		State.VICTORY:
			_process_victory(delta)
		_:
			_process_locomotion(delta)

	var was_on_floor := is_on_floor()
	var vy_before := velocity.y
	move_and_slide()
	_post_move(delta, was_on_floor, vy_before)
	_update_visuals(delta)

func _tick_timers(delta: float) -> void:
	_state_timer += delta
	_jump_buffered = maxf(_jump_buffered - delta, 0.0)
	_dodge_cd = maxf(_dodge_cd - delta, 0.0)
	_invuln = maxf(_invuln - delta, 0.0)
	_time_since_damage += delta
	if is_on_floor():
		_coyote = coyote_time
		_air_jumps = 1
		_trick_available = true
		_wall_run_timer = 0.0
	else:
		_coyote = maxf(_coyote - delta, 0.0)

	# Passive regeneration once the hero has been out of trouble for a while.
	if health < max_health and _time_since_damage > regen_delay and state != State.DEAD:
		set_health(health + regen_rate * delta)

	# Safety net: falling out of the world (or into the bay) sends the hero back.
	if global_position.y < -60.0:
		respawn_at(_safe_ground + Vector3.UP * 2.0)

# =============================================================================
#  STATES
# =============================================================================

func _enter(next: State) -> void:
	if state == next:
		return
	# Leaving a traversal state cleans up its systems.
	if state == State.SWING and web != null and web.is_attached:
		web.release(false)
	if state == State.ZIP and web != null and web.is_zipping:
		web.end_zip(false)
	state = next
	_state_timer = 0.0
	match next:
		State.DODGE:
			_dodge_timer = dodge_duration
			_invuln = maxf(_invuln, dodge_invulnerable_time)
		State.WALL_RUN:
			_wall_run_timer = wall_run_max_time
	Events.player_state_changed.emit(state_name())

func state_name() -> String:
	return State.keys()[state].to_lower()

# --- ground / air -------------------------------------------------------------

func _process_locomotion(delta: float) -> void:
	var dir: Vector3 = _world_input_dir()
	var target_speed: float = (run_speed if _sprinting else walk_speed) * dir.length()
	var horizontal := Vector3(velocity.x, 0.0, velocity.z)

	if is_on_floor():
		var accel: float = acceleration if dir.length() > 0.01 else deceleration
		horizontal = horizontal.move_toward(dir * target_speed, accel * delta)
		velocity.x = horizontal.x
		velocity.z = horizontal.z
		velocity.y = minf(velocity.y, 0.0)

		if _jump_buffered > 0.0 and _coyote > 0.0:
			_do_jump()
		elif state != State.LAND or _state_timer > 0.22:
			if horizontal.length() > 0.6:
				_enter(State.RUN)
			else:
				_enter(State.IDLE)
	else:
		# Air control: less authority than on the ground, plus mild drag so the
		# hero does not float forever.
		var air_target: Vector3 = dir * target_speed
		horizontal = horizontal.move_toward(air_target, acceleration * air_control * delta)
		horizontal = horizontal.move_toward(Vector3.ZERO, air_drag * delta)
		velocity.x = horizontal.x
		velocity.z = horizontal.z
		velocity.y = maxf(velocity.y - gravity * delta, -terminal_velocity)

		if _jump_buffered > 0.0:
			if _coyote > 0.0:
				_do_jump()
			elif _wall_available():
				_do_wall_jump()
			elif _air_jumps > 0:
				_do_double_jump()

		# Wall moves take over automatically when hugging a surface.
		if _wall_available() and dir.length() > 0.2:
			var into_wall: float = -dir.dot(_wall_normal)
			if into_wall > 0.45:
				var lateral := Vector3(velocity.x, 0.0, velocity.z).length()
				if lateral > 7.0:
					_enter(State.WALL_RUN)
				else:
					_enter(State.WALL_CLIMB)
				return

		if state != State.JUMP and state != State.DOUBLE_JUMP and state != State.TRICK:
			_enter(State.FALL)
		elif velocity.y < 0.0 and state == State.JUMP:
			_enter(State.FALL)

func _do_jump() -> void:
	velocity.y = sqrt(2.0 * gravity * jump_height)
	_jump_buffered = 0.0
	_coyote = 0.0
	_enter(State.JUMP)
	AudioManager.play("jump", randf_range(0.95, 1.06))

func _do_double_jump() -> void:
	_air_jumps -= 1
	velocity.y = sqrt(2.0 * gravity * double_jump_height)
	# A double jump also redirects momentum towards the stick: it should feel
	# like a decision, not a nudge.
	var dir: Vector3 = _world_input_dir()
	if dir.length() > 0.1:
		var speed: float = maxf(Vector3(velocity.x, 0.0, velocity.z).length(), walk_speed)
		velocity.x = dir.x * speed
		velocity.z = dir.z * speed
	_jump_buffered = 0.0
	_enter(State.DOUBLE_JUMP)
	AudioManager.play("double_jump", randf_range(0.95, 1.05))

func _do_wall_jump() -> void:
	velocity = _wall_normal * wall_jump_push + Vector3.UP * wall_jump_force
	_jump_buffered = 0.0
	_air_jumps = 1
	_enter(State.JUMP)
	AudioManager.play("jump", 1.15)
	GameState.shake_camera(0.08, 0.12)

# --- wall moves ---------------------------------------------------------------

func _wall_available() -> bool:
	if is_on_wall():
		_wall_normal = get_wall_normal()
		return true
	if wall_probe != null and wall_probe.is_colliding():
		_wall_normal = wall_probe.get_collision_normal()
		return absf(_wall_normal.y) < 0.4
	return false

func _process_wall_climb(delta: float) -> void:
	if not _wall_available() or is_on_floor():
		_enter(State.FALL if not is_on_floor() else State.IDLE)
		return
	var dir: Vector3 = _world_input_dir()
	if dir.length() < 0.15 or -dir.dot(_wall_normal) < 0.2:
		_enter(State.FALL)
		return
	# Climb up the wall, gently pressed into it so contact is never lost.
	velocity.y = wall_climb_speed
	var into: Vector3 = -_wall_normal * wall_stick_force
	velocity.x = into.x
	velocity.z = into.z
	# Slide sideways when the stick is pushed along the wall.
	var side: Vector3 = _wall_normal.cross(Vector3.UP).normalized()
	velocity += side * dir.dot(side) * walk_speed * 0.5
	if _jump_buffered > 0.0:
		_do_wall_jump()
	_step_accum += delta
	if _step_accum > 0.28:
		_step_accum = 0.0
		AudioManager.play("step", randf_range(0.8, 1.0), -14.0)

func _process_wall_run(delta: float) -> void:
	_wall_run_timer -= delta
	if not _wall_available() or is_on_floor() or _wall_run_timer <= 0.0:
		_enter(State.FALL if not is_on_floor() else State.IDLE)
		return
	var along: Vector3 = _wall_normal.cross(Vector3.UP).normalized()
	var dir: Vector3 = _world_input_dir()
	# Run along whichever way the player is leaning.
	var sign_dir: float = signf(dir.dot(along))
	if absf(dir.dot(along)) < 0.15:
		sign_dir = signf(Vector3(velocity.x, 0.0, velocity.z).dot(along))
	if sign_dir == 0.0:
		sign_dir = 1.0
	var run_vec: Vector3 = along * sign_dir * wall_run_speed
	velocity.x = run_vec.x - _wall_normal.x * wall_stick_force
	velocity.z = run_vec.z - _wall_normal.z * wall_stick_force
	# Reduced gravity: a wall run should read as a burst of momentum.
	velocity.y = maxf(velocity.y - gravity * 0.28 * delta, -8.0)
	if _jump_buffered > 0.0:
		_do_wall_jump()
	_step_accum += delta
	if _step_accum > 0.18:
		_step_accum = 0.0
		AudioManager.play("wall_run", randf_range(0.9, 1.15), -12.0)

# --- swing / zip --------------------------------------------------------------

## Fires a swing web (or releases the current one). Public so cutscenes, the
## tutorial and tests drive the hero exactly like a player would.
func try_web_swing() -> bool:
	if web == null:
		return false
	if web.is_attached:
		release_web()
		return false
	if web.try_attach():
		_enter(State.SWING)
		return true
	return false

func release_web() -> void:
	if web != null and web.is_attached:
		web.release(true)
		_enter(State.FALL)

func try_web_zip() -> bool:
	if web == null:
		return false
	if web.try_zip():
		_enter(State.ZIP)
		return true
	return false

## Buffers a jump: the state machine consumes it on the next tick where a jump
## is legal (ground, coyote time, wall or air jump).
func request_jump() -> void:
	_jump_buffered = jump_buffer

func _process_swing(delta: float) -> void:
	var reel: bool = Input.is_action_pressed("sprint") and _can_act()
	var alive: bool = web.apply_swing_physics(delta, _input_dir.y, _input_dir.x, reel)
	if not alive:
		web.release(false)
		_enter(State.FALL)
		return
	if _jump_buffered > 0.0:
		# Jumping off the web is the "boost out of the arc" move.
		_jump_buffered = 0.0
		web.release(true)
		velocity.y += 4.0
		_enter(State.TRICK if _trick_available else State.FALL)
		_trick_available = false
		return
	# Only end the swing on ground contact once it has actually started -- the
	# first frames after a standing launch are still touching the pavement.
	if is_on_floor() and velocity.y <= 0.1 and _state_timer > 0.3:
		web.release(false)
		_enter(State.LAND)

func _process_zip(delta: float) -> void:
	if not web.apply_zip_physics(delta):
		_enter(State.FALL)

# --- dodge / attack / damage --------------------------------------------------

func try_dodge() -> void:
	if _dodge_cd > 0.0:
		return
	if state == State.SWING or state == State.ZIP:
		# In the air a dodge becomes an acrobatic roll that keeps momentum.
		if _trick_available:
			_trick_available = false
			velocity += Vector3(velocity.x, 0.0, velocity.z).normalized() * 6.0
			_enter(State.TRICK)
			AudioManager.play("dodge", 1.2)
		return
	_dodge_cd = dodge_cooldown
	var dir: Vector3 = _world_input_dir()
	if dir.length() < 0.1:
		dir = -global_transform.basis.z
	velocity.x = dir.x * dodge_speed
	velocity.z = dir.z * dodge_speed
	if not is_on_floor():
		velocity.y = maxf(velocity.y, 2.0)
	_enter(State.DODGE)
	AudioManager.play("dodge", randf_range(0.95, 1.1))
	if combat != null:
		combat.open_counter_window()

func _process_dodge(delta: float) -> void:
	_dodge_timer -= delta
	velocity.y = maxf(velocity.y - gravity * delta, -terminal_velocity)
	var horizontal := Vector3(velocity.x, 0.0, velocity.z)
	horizontal = horizontal.move_toward(Vector3.ZERO, deceleration * 0.55 * delta)
	velocity.x = horizontal.x
	velocity.z = horizontal.z
	if _dodge_timer <= 0.0:
		_enter(State.IDLE if is_on_floor() else State.FALL)

## The combat component owns the attack timeline; the player just holds still-ish.
func _process_attack(delta: float) -> void:
	velocity.y = maxf(velocity.y - gravity * delta, -terminal_velocity)
	var horizontal := Vector3(velocity.x, 0.0, velocity.z)
	horizontal = horizontal.move_toward(Vector3.ZERO, deceleration * 1.4 * delta)
	velocity.x = horizontal.x
	velocity.z = horizontal.z
	if combat == null or not combat.is_attacking():
		_enter(State.IDLE if is_on_floor() else State.FALL)

func _process_hurt(delta: float) -> void:
	velocity.y = maxf(velocity.y - gravity * delta, -terminal_velocity)
	var horizontal := Vector3(velocity.x, 0.0, velocity.z)
	horizontal = horizontal.move_toward(Vector3.ZERO, deceleration * delta)
	velocity.x = horizontal.x
	velocity.z = horizontal.z
	if _state_timer > 0.32:
		_enter(State.IDLE if is_on_floor() else State.FALL)

func _process_dead(delta: float) -> void:
	velocity.x = move_toward(velocity.x, 0.0, deceleration * delta)
	velocity.z = move_toward(velocity.z, 0.0, deceleration * delta)
	velocity.y = maxf(velocity.y - gravity * delta, -terminal_velocity)

func _process_victory(delta: float) -> void:
	velocity.x = move_toward(velocity.x, 0.0, deceleration * delta)
	velocity.z = move_toward(velocity.z, 0.0, deceleration * delta)
	velocity.y = maxf(velocity.y - gravity * delta, -terminal_velocity)
	if _state_timer > 2.0 or _input_dir.length() > 0.2:
		_enter(State.IDLE)

# =============================================================================
#  POST-MOVE  (landing detection, footsteps, safe ground)
# =============================================================================

func _post_move(delta: float, was_on_floor: bool, vy_before: float) -> void:
	if not was_on_floor and is_on_floor():
		_on_land(absf(vy_before))
	if not is_on_floor():
		_last_fall_speed = absf(minf(velocity.y, 0.0))
	elif state == State.RUN:
		# Footsteps scale with speed so sprinting sounds urgent.
		var speed := Vector3(velocity.x, 0.0, velocity.z).length()
		_step_accum += speed * delta
		if _step_accum > 3.2:
			_step_accum = 0.0
			AudioManager.play("step", randf_range(0.9, 1.15), -10.0)

	# Remember the last solid, low-danger spot for respawns.
	if is_on_floor() and global_position.y > -20.0:
		_safe_ground = global_position

func _on_land(impact_speed: float) -> void:
	if state == State.DEAD:
		return
	Events.player_landed.emit(impact_speed)
	if impact_speed > 22.0:
		AudioManager.play("land_hard", randf_range(0.92, 1.02))
		GameState.shake_camera(0.16, 0.25)
		_spawn_land_dust()
	elif impact_speed > 6.0:
		AudioManager.play("land", randf_range(0.95, 1.1), -4.0)
	if impact_speed > fall_damage_speed:
		take_damage((impact_speed - fall_damage_speed) * fall_damage_scale, global_position)
	if state != State.ATTACK and state != State.DODGE:
		_enter(State.LAND if impact_speed > 9.0 else State.IDLE)

func _spawn_land_dust() -> void:
	if not ObjectPool.is_registered("impact_fx"):
		return
	var fx: Node = ObjectPool.acquire("impact_fx", GameState.world if GameState.world != null else get_parent())
	if fx != null and fx is Node3D:
		(fx as Node3D).global_position = global_position
		if fx.has_method("burst"):
			fx.call("burst", Vector3.UP, Color(0.8, 0.8, 0.78), 1.4)

# =============================================================================
#  VISUALS
# =============================================================================

func _update_visuals(delta: float) -> void:
	if animator == null:
		return

	# --- facing -------------------------------------------------------------
	var flat := Vector3(velocity.x, 0.0, velocity.z)
	var face_dir: Vector3 = Vector3.ZERO
	if state == State.WALL_CLIMB or state == State.WALL_RUN:
		face_dir = -_wall_normal if state == State.WALL_CLIMB else _wall_normal.cross(Vector3.UP)
		if state == State.WALL_RUN and flat.length() > 0.5:
			face_dir = flat
	elif state == State.SWING or state == State.ZIP:
		face_dir = flat
	elif flat.length() > 0.4:
		face_dir = flat
	elif _input_dir.length() > 0.1:
		face_dir = _world_input_dir()
	if face_dir.length_squared() > 0.01:
		var want: float = atan2(-face_dir.x, -face_dir.z)
		_facing = lerp_angle(_facing, want, clampf(turn_speed * delta, 0.0, 1.0))
	rotation.y = _facing

	# --- animation state ----------------------------------------------------
	var anim_state := "idle"
	match state:
		State.IDLE:
			anim_state = "idle"
		State.RUN:
			anim_state = "run" if flat.length() > walk_speed * 0.85 else "walk"
		State.JUMP:
			anim_state = "jump"
		State.DOUBLE_JUMP:
			anim_state = "double_jump"
		State.FALL:
			anim_state = "fall"
		State.LAND:
			anim_state = "land"
		State.SWING:
			anim_state = "swing"
		State.ZIP:
			anim_state = "zip"
		State.WALL_CLIMB:
			anim_state = "wall_climb"
		State.WALL_RUN:
			anim_state = "wall_run"
		State.TRICK:
			anim_state = "trick"
		State.DODGE:
			anim_state = "dodge"
		State.HURT:
			anim_state = "hurt"
		State.DEAD:
			anim_state = "defeat"
		State.VICTORY:
			anim_state = "victory"
		State.ATTACK:
			anim_state = combat.current_attack_anim() if combat != null else "attack_a"
	if state != State.ATTACK:
		animator.play_state(anim_state)

	# Timescale: running animation speed follows real speed.
	var scale := 1.0
	if state == State.RUN:
		scale = clampf(flat.length() / run_speed + 0.35, 0.6, 1.6)
	animator.set_speed_scale(scale)

	# --- procedural lean ----------------------------------------------------
	var local_v: Vector3 = global_transform.basis.inverse() * flat
	animator.set_lean(clampf(-local_v.z / run_speed, -1.2, 1.2), clampf(local_v.x / run_speed, -1.2, 1.2))
	if state != State.SWING and web != null and not web.is_attached:
		animator.clear_arm_aim()

	# --- trick / air state exit --------------------------------------------
	if state == State.TRICK and _state_timer > 0.8:
		_enter(State.FALL if not is_on_floor() else State.IDLE)
	if state == State.LAND and _state_timer > 0.34:
		_enter(State.IDLE)

	# --- speed FX -----------------------------------------------------------
	if speed_fx != null and speed_fx.has_method("set_speed"):
		speed_fx.call("set_speed", velocity.length())
	Events.player_speed_changed.emit(velocity.length())

# =============================================================================
#  PUBLIC API
# =============================================================================

func get_health() -> float:
	return health

func set_health(value: float) -> void:
	health = clampf(value, 0.0, max_health)
	Events.player_health_changed.emit(health, max_health)
	if health <= 0.0 and state != State.DEAD:
		_die()

func heal(amount: float) -> void:
	set_health(health + amount)
	AudioManager.play("reward", 1.1, -4.0)

func take_damage(amount: float, from_position: Vector3 = Vector3.ZERO) -> void:
	if state == State.DEAD or _invuln > 0.0:
		return
	_time_since_damage = 0.0
	_invuln = 0.35
	set_health(health - amount)
	if health <= 0.0:
		return
	# Knock the hero away from the hit so damage always reads physically.
	if from_position != Vector3.ZERO:
		var push: Vector3 = (global_position - from_position)
		push.y = 0.0
		if push.length() > 0.01:
			push = push.normalized() * clampf(amount * 0.35, 2.0, 9.0)
			velocity.x = push.x
			velocity.z = push.z
			velocity.y = maxf(velocity.y, 3.0)
	AudioManager.play("hit", randf_range(0.85, 1.0))
	GameState.shake_camera(0.12 + amount * 0.004, 0.22)
	if state != State.SWING and state != State.ZIP:
		_enter(State.HURT)
	if combat != null:
		combat.notify_hit_taken(from_position)

func is_invulnerable() -> bool:
	return _invuln > 0.0

func _die() -> void:
	_enter(State.DEAD)
	velocity = Vector3.ZERO
	Events.player_died.emit()
	AudioManager.play("enemy_down", 0.7)
	await get_tree().create_timer(2.0).timeout
	if is_instance_valid(self):
		respawn_at(_safe_ground + Vector3.UP * 2.0)

func respawn_at(where: Vector3) -> void:
	velocity = Vector3.ZERO
	global_position = where
	health = max_health
	_invuln = 1.5
	_enter(State.IDLE)
	Events.player_health_changed.emit(health, max_health)
	Transition.fade_in(0.4)

## Used by the camera to decide when to widen the view and add roll.
func is_airborne_traversal() -> bool:
	return state == State.SWING or state == State.ZIP or state == State.WALL_RUN \
		or (state == State.FALL and velocity.length() > 22.0)

func is_swinging() -> bool:
	return state == State.SWING

## True while a melee move is playing -- enemies read this to time their dodges.
func is_attacking() -> bool:
	return state == State.ATTACK

## Called by PlayerCombat when a move starts, so the attack state owns movement.
func enter_attack_state() -> void:
	_enter(State.ATTACK)

func get_speed() -> float:
	return velocity.length()

func add_impulse(v: Vector3) -> void:
	velocity += v

func launch(v: Vector3) -> void:
	velocity = v
	_enter(State.FALL)

## Cutscene / mission control.
func set_control_enabled(enabled: bool) -> void:
	control_enabled = enabled
	if not enabled:
		_input_dir = Vector2.ZERO
		if web != null and web.is_attached:
			web.release(false)
		_enter(State.IDLE)

func celebrate() -> void:
	_enter(State.VICTORY)

func get_camera_rig() -> Node3D:
	return camera_rig
