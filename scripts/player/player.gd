class_name Player
extends CharacterBody3D
## First-person survival-horror controller. Builds its own node tree in code so
## every reference is typed and there are no fragile node paths. Handles movement
## (walk/sprint/crouch with acceleration), mouse look with configurable sensitivity,
## head bob + camera sway, stamina, breathing/fear, footsteps with surface-based
## noise emission to the monster, the flashlight, health/death, hiding, object
## inspection and the interaction ray. State serialises via get_state/set_state.

signal interaction_prompt_changed(text: String)
signal health_changed(value: float, max_value: float)
signal stamina_changed(value: float, max_value: float)
signal battery_changed(value: float)
signal flashlight_toggled(is_on: bool)
signal fear_changed(value: float)
signal noise_emitted(loudness: float)
signal hidden_changed(is_hidden: bool)
signal died()

enum MoveMode { NORMAL, CROUCH, HIDDEN, INSPECT, DISABLED }

# --- Tunables ----------------------------------------------------------------
const WALK_SPEED: float = 2.7
const SPRINT_SPEED: float = 4.7
const CROUCH_SPEED: float = 1.4
const ACCEL: float = 10.0
const DECEL: float = 13.0
const GRAVITY: float = 18.0
const STAND_HEIGHT: float = 1.8
const CROUCH_HEIGHT: float = 1.05
const STAND_EYE: float = 1.62
const CROUCH_EYE: float = 0.9
const BASE_MOUSE_SENS: float = 0.0022
const MAX_PITCH: float = 1.45

const MAX_STAMINA: float = 100.0
const STAMINA_DRAIN: float = 20.0
const STAMINA_REGEN: float = 14.0
const STAMINA_EXHAUST_RECOVER: float = 35.0

const MAX_HEALTH: float = 100.0
const FLASHLIGHT_DRAIN: float = 0.0125
const FLASHLIGHT_LOW: float = 0.16

# --- Nodes (built in _ready) -------------------------------------------------
var head: Node3D
var camera: Camera3D
var flashlight: Node                       # Flashlight script node (SpotLight3D)
var interaction_ray: RayCast3D
var ground_ray: RayCast3D
var collision: CollisionShape3D
var _capsule: CapsuleShape3D
var _step_player: AudioStreamPlayer3D
var _breath_player: AudioStreamPlayer
var _heartbeat_player: AudioStreamPlayer
var _inspect_holder: Node3D
var _inspect_mesh: MeshInstance3D

# --- Runtime state -----------------------------------------------------------
var move_mode: int = MoveMode.NORMAL
var health: float = MAX_HEALTH
var stamina: float = MAX_STAMINA
var battery: float = 1.0
var fear: float = 0.0
var _exhausted: bool = false
var _flashlight_on: bool = false
var _yaw: float = 0.0
var _pitch: float = 0.0
var _look_delta: Vector2 = Vector2.ZERO
var _bob_time: float = 0.0
var _step_distance: float = 0.0
var _sway: Vector2 = Vector2.ZERO
var _current_surface: int = GameTypes.SurfaceType.CONCRETE
var _hide_spot: Node = null
var _holding_breath: bool = false
var _dead: bool = false
var _hold_sprint: bool = true
var _hold_crouch: bool = true
var _sprint_toggled: bool = false
var _crouch_toggled: bool = false
var _heartbeat_accum: float = 0.0

func _ready() -> void:
	add_to_group("player")
	collision_layer = GameTypes.LAYER_PLAYER
	collision_mask = GameTypes.LAYER_WORLD | GameTypes.LAYER_MONSTER | GameTypes.LAYER_DYNAMIC_PROP
	floor_max_angle = deg_to_rad(52.0)
	floor_snap_length = 0.4
	wall_min_slide_angle = deg_to_rad(15.0)
	_build_tree()
	_read_accessibility_settings()
	_yaw = rotation.y
	battery = GameManager.difficulty_config.starting_battery
	_emit_all_stats()

func _build_tree() -> void:
	_capsule = CapsuleShape3D.new()
	_capsule.height = STAND_HEIGHT
	_capsule.radius = 0.32
	collision = CollisionShape3D.new()
	collision.shape = _capsule
	collision.position = Vector3(0, STAND_HEIGHT * 0.5, 0)
	add_child(collision)

	head = Node3D.new()
	head.name = "Head"
	head.position = Vector3(0, STAND_EYE, 0)
	add_child(head)

	camera = Camera3D.new()
	camera.fov = 74.0
	camera.current = true
	camera.near = 0.05
	head.add_child(camera)

	# Flashlight lives on the camera so it follows the look direction (with lag).
	var fl_script: GDScript = load("res://scripts/player/flashlight.gd") as GDScript
	flashlight = fl_script.new()
	flashlight.name = "Flashlight"
	camera.add_child(flashlight)

	interaction_ray = RayCast3D.new()
	interaction_ray.target_position = Vector3(0, 0, -2.8)
	interaction_ray.collision_mask = GameTypes.LAYER_INTERACTABLE
	interaction_ray.collide_with_areas = false
	interaction_ray.collide_with_bodies = true
	camera.add_child(interaction_ray)

	ground_ray = RayCast3D.new()
	ground_ray.target_position = Vector3(0, -1.3, 0)
	ground_ray.collision_mask = GameTypes.LAYER_WORLD
	add_child(ground_ray)

	_inspect_holder = Node3D.new()
	_inspect_holder.position = Vector3(0, 0, -0.6)
	camera.add_child(_inspect_holder)

	_step_player = AudioStreamPlayer3D.new()
	_step_player.bus = "SFX"
	add_child(_step_player)

	_breath_player = AudioStreamPlayer.new()
	_breath_player.bus = "Voice"
	add_child(_breath_player)

	_heartbeat_player = AudioStreamPlayer.new()
	_heartbeat_player.bus = "SFX"
	add_child(_heartbeat_player)

func _read_accessibility_settings() -> void:
	_hold_sprint = SettingsManager.get_bool("gameplay", "hold_to_sprint")
	_hold_crouch = SettingsManager.get_bool("gameplay", "hold_to_crouch")

# --- Input -------------------------------------------------------------------

## Mouse look is handled in _input (not _unhandled_input) so HUD Control nodes
## under the captured cursor (e.g. the centred crosshair) cannot swallow the motion.
func _input(event: InputEvent) -> void:
	if _dead:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm: InputEventMouseMotion = event as InputEventMouseMotion
		if move_mode == MoveMode.INSPECT:
			_rotate_inspect(mm.relative)
		else:
			_look_delta += mm.relative

func _unhandled_input(event: InputEvent) -> void:
	if _dead:
		return

	if move_mode == MoveMode.INSPECT:
		if event.is_action_pressed("secondary_action") or event.is_action_pressed("interact"):
			_end_inspection()
		return

	# Ignore world actions while a menu/overlay is open (mouse released).
	if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED or GameManager.state != GameTypes.GameState.PLAYING:
		return

	if event.is_action_pressed("interact") or event.is_action_pressed("primary_action"):
		_try_interact()
	elif event.is_action_pressed("flashlight"):
		toggle_flashlight()
	elif event.is_action_pressed("sprint") and not _hold_sprint:
		_sprint_toggled = not _sprint_toggled
	elif event.is_action_pressed("crouch") and not _hold_crouch:
		_crouch_toggled = not _crouch_toggled

func _can_control() -> bool:
	return (not _dead
		and GameManager.state == GameTypes.GameState.PLAYING
		and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
		and move_mode != MoveMode.DISABLED
		and move_mode != MoveMode.INSPECT)

# --- Look (frame) ------------------------------------------------------------

func _process(delta: float) -> void:
	_apply_look(delta)
	_update_head_bob(delta)
	_update_flashlight(delta)
	_update_interaction()
	_update_fear(delta)
	_update_breathing(delta)

func _update_head_bob(delta: float) -> void:
	if camera == null:
		return
	var target: Vector3 = Vector3.ZERO
	var speed: float = Vector2(velocity.x, velocity.z).length()
	if SettingsManager.head_bob_enabled() and is_on_floor() and speed > 0.4:
		_bob_time += delta * speed * 1.8
		var amp: float = 0.035 if move_mode != MoveMode.CROUCH else 0.02
		target = Vector3(cos(_bob_time) * amp, absf(sin(_bob_time)) * amp, 0.0)
	camera.position = camera.position.lerp(target, clampf(delta * 10.0, 0.0, 1.0))

func _apply_look(delta: float) -> void:
	var sens: float = BASE_MOUSE_SENS * maxf(SettingsManager.mouse_sensitivity(), 0.05)
	if _can_control() and _look_delta != Vector2.ZERO:
		var invert: float = -1.0 if SettingsManager.invert_y() else 1.0
		_yaw -= _look_delta.x * sens
		_pitch = clampf(_pitch - _look_delta.y * sens * invert, -MAX_PITCH, MAX_PITCH)
		# Camera sway: a soft counter-motion that eases back to centre.
		_sway.x = lerpf(_sway.x, clampf(-_look_delta.x * 0.0006, -0.05, 0.05), 0.2)
		_sway.y = lerpf(_sway.y, clampf(-_look_delta.y * 0.0006, -0.05, 0.05), 0.2)
	else:
		_sway = _sway.lerp(Vector2.ZERO, clampf(delta * 6.0, 0.0, 1.0))
	_look_delta = Vector2.ZERO
	rotation.y = _yaw
	head.rotation.x = _pitch + _sway.y
	head.rotation.z = _sway.x

# --- Movement (physics) ------------------------------------------------------

func _physics_process(delta: float) -> void:
	if _dead or move_mode == MoveMode.HIDDEN or move_mode == MoveMode.DISABLED or move_mode == MoveMode.INSPECT:
		velocity = Vector3.ZERO
		return

	if not is_on_floor():
		velocity.y -= GRAVITY * delta

	var input_dir: Vector2 = Vector2.ZERO
	if _can_control():
		input_dir = Input.get_vector("move_left", "move_right", "move_forward", "move_back")

	var wants_crouch: bool = _wants_crouch()
	_update_stance(wants_crouch)

	var wants_sprint: bool = _wants_sprint(input_dir)
	var target_speed: float = _resolve_speed(wants_sprint, wants_crouch, input_dir)

	var direction: Vector3 = (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
	var horizontal: Vector3 = Vector3(velocity.x, 0.0, velocity.z)
	if direction != Vector3.ZERO:
		horizontal = horizontal.move_toward(direction * target_speed, ACCEL * delta)
	else:
		horizontal = horizontal.move_toward(Vector3.ZERO, DECEL * delta)
	velocity.x = horizontal.x
	velocity.z = horizontal.z

	move_and_slide()
	_update_stamina(delta, wants_sprint, input_dir != Vector2.ZERO)
	_update_footsteps(delta, horizontal.length(), wants_sprint, wants_crouch)

func _wants_crouch() -> bool:
	if not _can_control():
		return move_mode == MoveMode.CROUCH
	if _hold_crouch:
		return Input.is_action_pressed("crouch")
	return _crouch_toggled

func _wants_sprint(input_dir: Vector2) -> bool:
	if not _can_control() or input_dir == Vector2.ZERO or _exhausted:
		return false
	var pressed: bool = Input.is_action_pressed("sprint") if _hold_sprint else _sprint_toggled
	return pressed and input_dir.y < 0.0  # only sprint moving forward

func _resolve_speed(sprint: bool, crouch: bool, input_dir: Vector2) -> float:
	if input_dir == Vector2.ZERO:
		return 0.0
	if crouch:
		return CROUCH_SPEED
	if sprint:
		return SPRINT_SPEED
	return WALK_SPEED

func _update_stance(crouch: bool) -> void:
	var target_height: float = CROUCH_HEIGHT if crouch else STAND_HEIGHT
	var target_eye: float = CROUCH_EYE if crouch else STAND_EYE
	# Block standing up if something is directly overhead.
	if not crouch and move_mode == MoveMode.CROUCH and _blocked_above():
		target_height = CROUCH_HEIGHT
		target_eye = CROUCH_EYE
		crouch = true
	_capsule.height = lerpf(_capsule.height, target_height, 0.25)
	collision.position.y = _capsule.height * 0.5
	head.position.y = lerpf(head.position.y, target_eye, 0.25)
	move_mode = MoveMode.CROUCH if crouch else MoveMode.NORMAL

func _blocked_above() -> bool:
	var space: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var from: Vector3 = global_position + Vector3(0, CROUCH_HEIGHT, 0)
	var to: Vector3 = global_position + Vector3(0, STAND_HEIGHT + 0.1, 0)
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(from, to, GameTypes.LAYER_WORLD)
	query.exclude = [get_rid()]
	return not get_world_3d().direct_space_state.intersect_ray(query).is_empty()

func _update_stamina(delta: float, sprinting: bool, _moving: bool) -> void:
	if sprinting:
		stamina = maxf(0.0, stamina - STAMINA_DRAIN * delta)
		if stamina <= 0.0:
			_exhausted = true
	else:
		stamina = minf(MAX_STAMINA, stamina + STAMINA_REGEN * delta)
		if _exhausted and stamina >= STAMINA_EXHAUST_RECOVER:
			_exhausted = false
	stamina_changed.emit(stamina, MAX_STAMINA)

# --- Footsteps + noise -------------------------------------------------------

func _update_footsteps(delta: float, speed: float, sprinting: bool, crouching: bool) -> void:
	if speed < 0.4 or not is_on_floor():
		return
	_detect_surface()
	_step_distance += speed * delta
	var stride: float = 2.4 if not sprinting else 1.8
	if crouching:
		stride = 3.0
	if _step_distance >= stride:
		_step_distance = 0.0
		_play_footstep(sprinting, crouching)

func _detect_surface() -> void:
	if ground_ray.is_colliding():
		var collider: Object = ground_ray.get_collider()
		if collider != null and collider.has_meta("surface_type"):
			_current_surface = int(collider.get_meta("surface_type"))

func _play_footstep(sprinting: bool, crouching: bool) -> void:
	var loudness: float = 0.6
	if crouching:
		loudness = 0.28
	elif sprinting:
		loudness = 1.0
	loudness *= _surface_loudness(_current_surface)
	var volume_db: float = lerpf(-22.0, -6.0, clampf(loudness, 0.0, 1.0))
	_step_player.stream = AudioManager._resolve("step")
	_step_player.pitch_scale = randf_range(0.85, 1.15) * _surface_pitch(_current_surface)
	_step_player.volume_db = volume_db
	_step_player.play()
	emit_noise(loudness)

## Broadcasts a noise event to every monster (their hearing system reacts).
func emit_noise(loudness: float) -> void:
	if loudness <= 0.05:
		return
	noise_emitted.emit(loudness)
	get_tree().call_group("monster", "hear_noise", global_position, loudness)

func _surface_loudness(surface: int) -> float:
	match surface:
		GameTypes.SurfaceType.METAL: return 1.3
		GameTypes.SurfaceType.WATER: return 1.2
		GameTypes.SurfaceType.TILE: return 1.0
		GameTypes.SurfaceType.CONCRETE: return 0.9
		GameTypes.SurfaceType.WOOD: return 1.05
		GameTypes.SurfaceType.GRASS: return 0.5
		GameTypes.SurfaceType.DIRT: return 0.6
		GameTypes.SurfaceType.CARPET: return 0.4
		_: return 1.0

func _surface_pitch(surface: int) -> float:
	match surface:
		GameTypes.SurfaceType.METAL: return 1.25
		GameTypes.SurfaceType.WATER: return 0.9
		GameTypes.SurfaceType.WOOD: return 1.1
		_: return 1.0

func _update_breathing(delta: float) -> void:
	_heartbeat_accum += delta
	var rate: float = lerpf(1.4, 0.45, clampf(fear, 0.0, 1.0))
	if _heartbeat_accum >= rate and (fear > 0.25 or _holding_breath):
		_heartbeat_accum = 0.0
		_heartbeat_player.stream = AudioManager._resolve("heartbeat")
		_heartbeat_player.volume_db = lerpf(-20.0, -4.0, clampf(fear, 0.0, 1.0))
		_heartbeat_player.play()

# --- Flashlight --------------------------------------------------------------

func toggle_flashlight() -> void:
	if not GameManager.inventory.has_item("flashlight"):
		GameManager.notify("You have no flashlight.")
		return
	if battery <= 0.0 and not _flashlight_on:
		GameManager.notify("The flashlight is dead. You need a battery.")
		AudioManager.play_2d("deny", -8.0)
		return
	_flashlight_on = not _flashlight_on
	if flashlight != null and flashlight.has_method("set_on"):
		flashlight.call("set_on", _flashlight_on)
	flashlight_toggled.emit(_flashlight_on)
	AudioManager.play_2d("click", -10.0)

func _update_flashlight(delta: float) -> void:
	if flashlight == null:
		return
	if flashlight.has_method("update_lag"):
		flashlight.call("update_lag", delta, camera.global_transform)
	if _flashlight_on and battery > 0.0:
		var drain: float = FLASHLIGHT_DRAIN * GameManager.difficulty_config.battery_drain_mult * delta
		battery = maxf(0.0, battery - drain)
		if flashlight.has_method("set_low"):
			flashlight.call("set_low", battery <= FLASHLIGHT_LOW)
		if battery <= 0.0:
			_flashlight_on = false
			if flashlight.has_method("set_on"):
				flashlight.call("set_on", false)
			flashlight_toggled.emit(false)
			GameManager.notify("The flashlight dies.")
		battery_changed.emit(battery)

func add_battery(amount: float) -> void:
	battery = clampf(battery + amount, 0.0, 1.0)
	battery_changed.emit(battery)

func is_flashlight_on() -> bool:
	return _flashlight_on and battery > 0.0

# --- Interaction -------------------------------------------------------------

func _update_interaction() -> void:
	if move_mode == MoveMode.INSPECT or move_mode == MoveMode.HIDDEN:
		return
	var target: Interactable = _current_interactable()
	if target != null and SettingsManager.prompts_enabled():
		interaction_prompt_changed.emit(target.get_prompt())
	else:
		interaction_prompt_changed.emit("")

func _current_interactable() -> Interactable:
	if not interaction_ray.is_colliding():
		return null
	var collider: Object = interaction_ray.get_collider()
	if collider is Interactable:
		return collider as Interactable
	return null

func _try_interact() -> void:
	if move_mode == MoveMode.HIDDEN:
		if _hide_spot != null and _hide_spot.has_method("exit"):
			_hide_spot.call("exit", self)
		return
	var target: Interactable = _current_interactable()
	if target != null:
		target.interact(self)

# --- Object inspection -------------------------------------------------------

func begin_inspection(mesh: Mesh, label: String) -> void:
	if mesh == null:
		return
	move_mode = MoveMode.INSPECT
	_inspect_mesh = MeshInstance3D.new()
	_inspect_mesh.mesh = mesh
	_inspect_holder.add_child(_inspect_mesh)
	_inspect_holder.rotation = Vector3.ZERO
	GameManager.show_subtitle(label, 4.0)
	AudioManager.play_2d("page", -8.0)

func _rotate_inspect(rel: Vector2) -> void:
	_inspect_holder.rotation.y += rel.x * 0.01
	_inspect_holder.rotation.x += rel.y * 0.01

func _end_inspection() -> void:
	if is_instance_valid(_inspect_mesh):
		_inspect_mesh.queue_free()
	_inspect_mesh = null
	move_mode = MoveMode.NORMAL

# --- Hiding ------------------------------------------------------------------

func enter_hiding(spot: Node, view_point: Vector3) -> void:
	_hide_spot = spot
	move_mode = MoveMode.HIDDEN
	velocity = Vector3.ZERO
	global_position = view_point
	hidden_changed.emit(true)
	interaction_prompt_changed.emit("E — Leave")

func exit_hiding(exit_point: Vector3) -> void:
	_hide_spot = null
	move_mode = MoveMode.NORMAL
	global_position = exit_point
	hidden_changed.emit(false)

func is_hidden() -> bool:
	return move_mode == MoveMode.HIDDEN

# --- Fear / detection feedback ----------------------------------------------

func _update_fear(delta: float) -> void:
	var nearest: float = _nearest_monster_distance()
	var target_fear: float = 0.0
	if nearest >= 0.0:
		target_fear = clampf(1.0 - (nearest / 14.0), 0.0, 1.0)
	fear = lerpf(fear, target_fear, clampf(delta * 2.5, 0.0, 1.0))
	EventManager.tension = maxf(EventManager.tension * 0.999, fear)
	fear_changed.emit(fear)

func _nearest_monster_distance() -> float:
	var best: float = -1.0
	for m: Node in get_tree().get_nodes_in_group("monster"):
		if m is Node3D:
			var d: float = global_position.distance_to((m as Node3D).global_position)
			if best < 0.0 or d < best:
				best = d
	return best

# --- Visibility / stealth queries (used by the monster) ----------------------

## 0..1 estimate of how visible the player is (light + stance). The monster's
## vision check scales detection by this.
func visibility_level() -> float:
	if move_mode == MoveMode.HIDDEN:
		return 0.0
	var v: float = 0.55
	if is_flashlight_on():
		v += 0.35
	if move_mode == MoveMode.CROUCH:
		v -= 0.25
	# Standing in lit areas would add more; approximated by flashlight here.
	return clampf(v, 0.05, 1.0)

func is_holding_breath() -> bool:
	return _holding_breath

# --- Health / death ----------------------------------------------------------

func apply_damage(amount: float, _source: Node = null) -> void:
	if _dead or amount <= 0.0:
		return
	health = maxf(0.0, health - amount * GameManager.difficulty_config.player_damage_mult)
	health_changed.emit(health, MAX_HEALTH)
	AudioManager.play_2d("sting", -6.0)
	if health <= 0.0:
		_die("The Hollow Attendant found you.")

func heal(amount: float) -> void:
	health = minf(MAX_HEALTH, health + amount)
	health_changed.emit(health, MAX_HEALTH)

func _die(cause: String) -> void:
	if _dead:
		return
	_dead = true
	move_mode = MoveMode.DISABLED
	velocity = Vector3.ZERO
	died.emit()
	GameManager.player_died(cause)

func is_dead() -> bool:
	return _dead

# --- Persistence -------------------------------------------------------------

func get_state() -> Dictionary:
	return {
		"health": health,
		"stamina": stamina,
		"battery": battery,
		"flashlight_on": _flashlight_on,
	}

func set_state(data: Dictionary) -> void:
	health = float(data.get("health", MAX_HEALTH))
	stamina = float(data.get("stamina", MAX_STAMINA))
	battery = float(data.get("battery", battery))
	_flashlight_on = bool(data.get("flashlight_on", false))
	if flashlight != null and flashlight.has_method("set_on"):
		flashlight.call("set_on", _flashlight_on)
	_emit_all_stats()

func _emit_all_stats() -> void:
	health_changed.emit(health, MAX_HEALTH)
	stamina_changed.emit(stamina, MAX_STAMINA)
	battery_changed.emit(battery)
	flashlight_toggled.emit(_flashlight_on)
