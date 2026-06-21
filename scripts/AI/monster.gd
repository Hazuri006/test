class_name Monster
extends CharacterBody3D
## THE HOLLOW ATTENDANT — a NavigationAgent3D-driven CharacterBody3D with a full
## sense + state machine (section 10). Vision is a cone with a line-of-sight check
## (never sees through walls or closed doors); hearing reacts to noise events pushed
## by the player and doors. A detection meter escalates suspicion → stalk → chase →
## attack, and decays when the player breaks contact. Debug gizmos toggle with F4.

signal state_changed(state: int)

@export var config_path: String = "res://data/monster/hollow_attendant.tres"
## The Hollow Attendant model. Falls back to procedural geometry if absent.
@export var model_path: String = "res://assets/monster/zombie_hazmat.glb"
@export var model_scale: float = 1.12
## Y rotation applied to the model so its visual front aligns with the monster's
## forward (-Z). Flip to 0.0 if the model walks backward.
@export var model_yaw_offset: float = PI

const ANIM_IDLE: String = "Zombie_Idle"
const ANIM_WALK: String = "Zombie_Walk_Root"
const ANIM_SPOTTED: String = "Zombie_EnemySpotted"
const ANIM_ATTACK: String = "Zombie_Skill"

var _anim: AnimationPlayer
var _current_anim: String = ""
var _anim_lock: float = 0.0

var config: MonsterConfig
var agent: NavigationAgent3D
var _mesh_root: Node3D
var _eye: Node3D
var _vision_ray: RayCast3D
var _breath_player: AudioStreamPlayer3D
var _debug_label: Label3D
var _debug_draw: MeshInstance3D
var _debug_enabled: bool = false

var state: int = GameTypes.MonsterState.DORMANT
var _state_time: float = 0.0
var detection: float = 0.0
var aggression: float = 1.0
## Instant-chase radius (0 = disabled). Initialised from config; settable per-spawn.
var proximity_aggro_range: float = 0.0

var _player: Player
var _last_known_pos: Vector3 = Vector3.ZERO
var _heard_pos: Vector3 = Vector3.ZERO
var _has_target: bool = false
var _chase_timer: float = 0.0
var _search_timer: float = 0.0
var _attack_timer: float = 0.0
var _attack_phase: int = 0          # 0 = winding up, 1 = recovering
var _repath_timer: float = 0.0
var _idle_anim_time: float = 0.0

var patrol_points: Array[Vector3] = []
var _patrol_index: int = 0

func _ready() -> void:
	add_to_group("monster")
	collision_layer = GameTypes.LAYER_MONSTER
	collision_mask = GameTypes.LAYER_WORLD | GameTypes.LAYER_DYNAMIC_PROP
	floor_max_angle = deg_to_rad(60.0)
	_load_config()
	_build_body()
	_build_agent()
	aggression = config.base_aggression * GameManager.difficulty_config.monster_aggression_mult
	proximity_aggro_range = config.proximity_aggro_range
	# Wake when the power comes on; some encounters force it directly.
	if GameManager.get_flag_bool("power_on"):
		_set_state(GameTypes.MonsterState.PATROL)
	GameManager.flag_changed.connect(_on_flag_changed)

func _load_config() -> void:
	if ResourceLoader.exists(config_path):
		var res: Resource = ResourceLoader.load(config_path)
		if res is MonsterConfig:
			config = res as MonsterConfig
	if config == null:
		config = MonsterConfig.new()

func _build_body() -> void:
	var capsule: CapsuleShape3D = CapsuleShape3D.new()
	capsule.height = 2.1
	capsule.radius = 0.32
	var cs: CollisionShape3D = CollisionShape3D.new()
	cs.shape = capsule
	cs.position = Vector3(0, 1.05, 0)
	add_child(cs)

	_mesh_root = Node3D.new()
	_mesh_root.rotation.y = model_yaw_offset
	add_child(_mesh_root)
	_setup_model()

	_eye = Node3D.new()
	_eye.position = Vector3(0, config.eye_height, 0)
	add_child(_eye)
	_vision_ray = RayCast3D.new()
	_vision_ray.collision_mask = GameTypes.MASK_VISION_OBSTRUCTION
	_vision_ray.collide_with_areas = false
	_eye.add_child(_vision_ray)

	_breath_player = AudioStreamPlayer3D.new()
	_breath_player.bus = "SFX"
	_breath_player.stream = AudioManager._resolve("breath")
	_breath_player.max_distance = 14.0
	add_child(_breath_player)

	_debug_label = Label3D.new()
	_debug_label.position = Vector3(0, 2.5, 0)
	_debug_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_debug_label.no_depth_test = true
	_debug_label.visible = false
	add_child(_debug_label)

	_debug_draw = MeshInstance3D.new()
	_debug_draw.visible = false
	add_child(_debug_draw)

## Instances the rigged GLB model and grabs its AnimationPlayer. Falls back to the
## procedural humanoid if the model is missing, so the game still runs without it.
func _setup_model() -> void:
	if model_path != "" and ResourceLoader.exists(model_path):
		var packed: PackedScene = ResourceLoader.load(model_path) as PackedScene
		if packed != null:
			var model: Node3D = packed.instantiate() as Node3D
			model.scale = Vector3(model_scale, model_scale, model_scale)
			_mesh_root.add_child(model)
			_anim = model.find_child("AnimationPlayer", true, false) as AnimationPlayer
			if _anim != null:
				_anim.playback_default_blend_time = 0.2
				_ensure_loop(ANIM_IDLE)
				_ensure_loop(ANIM_WALK)
				# Neutralise the Mixamo hip root motion so the walk plays in place
				# (the NavigationAgent drives the actual movement) instead of sliding.
				_anim.root_motion_track = _find_root_motion_path()
				_play_anim(ANIM_IDLE)
			GameLog.debug("Monster: loaded GLB model (anim=%s, root_motion=%s)." % [str(_anim != null), str(_anim.root_motion_track) if _anim != null else "-"])
			return
	_build_fallback_body()

func _ensure_loop(anim_name: String) -> void:
	if _anim != null and _anim.has_animation(anim_name):
		_anim.get_animation(anim_name).loop_mode = Animation.LOOP_LINEAR

## Finds the skeleton's hip position track (Mixamo root) to use as the root-motion
## track, which the AnimationPlayer then extracts instead of applying.
func _find_root_motion_path() -> NodePath:
	if _anim == null or not _anim.has_animation(ANIM_WALK):
		return NodePath()
	var a: Animation = _anim.get_animation(ANIM_WALK)
	for t: int in range(a.get_track_count()):
		if a.track_get_type(t) == Animation.TYPE_POSITION_3D:
			var p: String = str(a.track_get_path(t))
			if p.contains("Hips"):
				return a.track_get_path(t)
	return NodePath()

## Procedural fallback humanoid (tall, thin, overlong arms, pale masked head).
func _build_fallback_body() -> void:
	var skin: StandardMaterial3D = MaterialLibrary.monster_skin()
	var uniform: StandardMaterial3D = MaterialLibrary.monster_uniform()
	_box(_mesh_root, Vector3(0, 1.15, 0), Vector3(0.42, 1.1, 0.28), uniform)
	_box(_mesh_root, Vector3(0, 0.45, 0), Vector3(0.18, 0.95, 0.18), uniform)
	var arm_l: Node3D = _box(_mesh_root, Vector3(-0.34, 0.95, 0), Vector3(0.12, 1.35, 0.12), skin)
	var arm_r: Node3D = _box(_mesh_root, Vector3(0.34, 0.95, 0), Vector3(0.12, 1.35, 0.12), skin)
	arm_l.name = "ArmL"
	arm_r.name = "ArmR"
	_box(_mesh_root, Vector3(0, 1.95, 0), Vector3(0.24, 0.3, 0.24), skin)
	_box(_mesh_root, Vector3(0, 1.95, 0.12), Vector3(0.2, 0.24, 0.05), MaterialLibrary.get_material("mask", Color(0.7, 0.68, 0.62), 0.5, 0.0, false))

func _box(parent: Node, pos: Vector3, size: Vector3, mat: Material) -> MeshInstance3D:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = size
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)
	return mi

# --- Animation ---------------------------------------------------------------

func _play_anim(anim_name: String) -> void:
	if _anim == null or _current_anim == anim_name or not _anim.has_animation(anim_name):
		return
	_current_anim = anim_name
	_anim.play(anim_name, 0.25)

## Plays a one-shot clip and locks state-driven animation for `lock` seconds.
func _play_oneshot(anim_name: String, lock: float) -> void:
	if _anim == null or not _anim.has_animation(anim_name):
		return
	_current_anim = anim_name
	_anim.play(anim_name, 0.15)
	_anim_lock = lock

func _build_agent() -> void:
	agent = NavigationAgent3D.new()
	agent.path_desired_distance = 0.6
	agent.target_desired_distance = 0.8
	agent.radius = 0.35
	agent.avoidance_enabled = false
	agent.max_speed = config.chase_speed
	add_child(agent)

# --- Patrol setup (called by the level) -------------------------------------

func set_patrol_points(points: Array[Vector3]) -> void:
	patrol_points = points
	_patrol_index = 0

# --- Main loop ---------------------------------------------------------------

func _physics_process(delta: float) -> void:
	_state_time += delta
	_player = GameManager.get_player() as Player
	if _player == null or _player.is_dead():
		_idle(delta)
		return

	_update_senses(delta)
	_run_state(delta)
	_apply_gravity(delta)
	move_and_slide()
	_update_animation(delta)
	if _debug_enabled:
		_update_debug()
	GameManager.report_detection(detection)

func _idle(delta: float) -> void:
	velocity = Vector3(0, velocity.y, 0)
	_apply_gravity(delta)
	move_and_slide()

func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= 18.0 * delta
	else:
		velocity.y = 0.0

# --- Senses ------------------------------------------------------------------

func _update_senses(delta: float) -> void:
	if state == GameTypes.MonsterState.DORMANT or state == GameTypes.MonsterState.SCRIPTED_EVENT or state == GameTypes.MonsterState.STUNNED:
		return
	var sees: bool = _can_see_player()
	if sees:
		var vis: float = _player.visibility_level()
		var gain: float = config.detection_gain_rate * vis * aggression * GameManager.difficulty_config.detection_speed_mult
		detection = clampf(detection + gain * delta, 0.0, 1.5)
		_last_known_pos = _player.global_position
		_has_target = true
		_chase_timer = 0.0
	else:
		detection = maxf(0.0, detection - config.detection_decay_rate * delta)

	# Proximity aggro: it hunts you the moment you get close, cone or not.
	if proximity_aggro_range > 0.0 and not _player.is_hidden():
		if global_position.distance_to(_player.global_position) <= proximity_aggro_range:
			detection = maxf(detection, config.chase_threshold)
			_last_known_pos = _player.global_position
			_has_target = true
			_chase_timer = 0.0

	# Escalation based on the meter.
	if detection >= config.chase_threshold and state != GameTypes.MonsterState.CHASE and state != GameTypes.MonsterState.ATTACK:
		_set_state(GameTypes.MonsterState.CHASE)
	elif detection >= config.suspicion_threshold and state in [GameTypes.MonsterState.PATROL, GameTypes.MonsterState.RETURN_TO_PATROL]:
		_set_state(GameTypes.MonsterState.SUSPICIOUS)

func _can_see_player() -> bool:
	if _player.is_hidden():
		return false
	var eye_pos: Vector3 = global_position + Vector3(0, config.eye_height, 0)
	var target: Vector3 = _player.global_position + Vector3(0, 1.4, 0)
	var to_target: Vector3 = target - eye_pos
	var dist: float = to_target.length()
	if dist > config.vision_range:
		return false
	var forward: Vector3 = -global_transform.basis.z
	var flat_dir: Vector3 = Vector3(to_target.x, 0, to_target.z).normalized()
	var angle: float = rad_to_deg(forward.angle_to(flat_dir))
	var within_cone: bool = angle <= config.vision_angle_deg
	var within_close: bool = dist <= config.vision_close_range
	# Flashlight in the monster's face gives it away even outside the cone.
	var lit: bool = _player.is_flashlight_on() and dist < config.vision_range * 0.6
	if not (within_cone or within_close or lit):
		return false
	return _has_line_of_sight(eye_pos, target)

func _has_line_of_sight(from: Vector3, to: Vector3) -> bool:
	var space: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(from, to, GameTypes.MASK_VISION_OBSTRUCTION)
	query.exclude = [get_rid()]
	var hit: Dictionary = space.intersect_ray(query)
	return hit.is_empty()

## Noise events from the player / doors (section 10 hearing).
func hear_noise(world_pos: Vector3, loudness: float) -> void:
	if state == GameTypes.MonsterState.DORMANT or state == GameTypes.MonsterState.SCRIPTED_EVENT:
		return
	var dist: float = global_position.distance_to(world_pos)
	if dist > config.hearing_range:
		return
	var effective: float = loudness * (1.0 - dist / config.hearing_range) * config.hearing_sensitivity
	if effective < 0.12:
		return
	_heard_pos = world_pos
	detection = clampf(detection + effective * 0.4, 0.0, config.chase_threshold)
	if state in [GameTypes.MonsterState.PATROL, GameTypes.MonsterState.RETURN_TO_PATROL, GameTypes.MonsterState.SUSPICIOUS]:
		_set_state(GameTypes.MonsterState.INVESTIGATE)

# --- State machine -----------------------------------------------------------

func _set_state(new_state: int) -> void:
	if state == new_state:
		return
	state = new_state
	_state_time = 0.0
	state_changed.emit(new_state)
	GameManager.report_monster_state(GameTypes.monster_state_name(new_state))
	match new_state:
		GameTypes.MonsterState.INVESTIGATE:
			_set_nav_target(_heard_pos)
		GameTypes.MonsterState.SEARCH:
			_search_timer = config.search_duration
			_set_nav_target(_last_known_pos)
		GameTypes.MonsterState.CHASE:
			AudioManager.play_at("sting", global_position, -8.0)
			_play_oneshot(ANIM_SPOTTED, 0.8)
		GameTypes.MonsterState.ATTACK:
			_attack_timer = 0.0
			_attack_phase = 0
			_play_oneshot(ANIM_ATTACK, config.attack_windup + 0.2)
		GameTypes.MonsterState.STUNNED:
			velocity = Vector3.ZERO

func _run_state(delta: float) -> void:
	match state:
		GameTypes.MonsterState.DORMANT:
			velocity.x = 0.0
			velocity.z = 0.0
		GameTypes.MonsterState.PATROL:
			_state_patrol(delta)
		GameTypes.MonsterState.SUSPICIOUS:
			_state_suspicious(delta)
		GameTypes.MonsterState.INVESTIGATE:
			_state_goto(delta, _heard_pos, GameTypes.MonsterState.SEARCH)
		GameTypes.MonsterState.SEARCH:
			_state_search(delta)
		GameTypes.MonsterState.STALK:
			_state_chase(delta, config.stalk_speed)
		GameTypes.MonsterState.CHASE:
			_state_chase(delta, config.chase_speed)
		GameTypes.MonsterState.ATTACK:
			_state_attack(delta)
		GameTypes.MonsterState.LOST_TARGET:
			_state_goto(delta, _last_known_pos, GameTypes.MonsterState.SEARCH)
		GameTypes.MonsterState.RETURN_TO_PATROL:
			_state_goto(delta, _current_patrol_point(), GameTypes.MonsterState.PATROL)
		GameTypes.MonsterState.STUNNED:
			velocity.x = 0.0
			velocity.z = 0.0
			if _state_time > 3.0:
				_set_state(GameTypes.MonsterState.SEARCH)

func _state_patrol(delta: float) -> void:
	if patrol_points.is_empty():
		velocity.x = 0.0
		velocity.z = 0.0
		return
	var target: Vector3 = _current_patrol_point()
	_set_nav_target(target)
	_move_along_path(delta, config.patrol_speed)
	# Advance when reached, or when the point is unreachable (path finished short).
	if global_position.distance_to(target) < 1.4 or (agent.is_navigation_finished() and _state_time > 1.0):
		_patrol_index = (_patrol_index + 1) % patrol_points.size()
		_state_time = 0.0
	# Occasional ambient breath.
	if _breath_player != null and not _breath_player.playing and randf() < 0.003:
		_breath_player.play()

func _state_suspicious(delta: float) -> void:
	# Stop and face the disturbance, building or shedding detection.
	velocity.x = 0.0
	velocity.z = 0.0
	if _has_target:
		_face_towards(_last_known_pos, delta)
	if detection < config.suspicion_threshold * 0.5:
		_set_state(GameTypes.MonsterState.RETURN_TO_PATROL)
	elif _state_time > 3.0:
		_set_state(GameTypes.MonsterState.INVESTIGATE)

func _state_goto(delta: float, target: Vector3, on_arrive: int) -> void:
	_set_nav_target(target)
	_move_along_path(delta, config.search_speed)
	if global_position.distance_to(target) < 1.3 or agent.is_navigation_finished():
		_set_state(on_arrive)

func _state_search(delta: float) -> void:
	_search_timer -= delta
	# Wander around the last known position.
	if agent.is_navigation_finished():
		var offset: Vector3 = Vector3(randf_range(-3, 3), 0, randf_range(-3, 3))
		_set_nav_target(_last_known_pos + offset)
	_move_along_path(delta, config.search_speed)
	_maybe_search_locker()
	if _search_timer <= 0.0:
		_has_target = false
		_set_state(GameTypes.MonsterState.RETURN_TO_PATROL)

func _state_chase(delta: float, speed: float) -> void:
	_chase_timer += delta
	if _can_see_player():
		_last_known_pos = _player.global_position
		_chase_timer = 0.0
	_set_nav_target(_last_known_pos)
	_move_along_path(delta, speed)
	_open_doors_ahead()
	var dist: float = global_position.distance_to(_player.global_position)
	if dist <= config.attack_range and _has_line_of_sight(global_position + Vector3(0, 1.4, 0), _player.global_position + Vector3(0, 1.4, 0)):
		_set_state(GameTypes.MonsterState.ATTACK)
	elif _chase_timer > config.chase_give_up_time:
		_set_state(GameTypes.MonsterState.LOST_TARGET)

func _state_attack(delta: float) -> void:
	velocity.x = 0.0
	velocity.z = 0.0
	_face_towards(_player.global_position, delta * 2.0)
	_attack_timer += delta
	var dist: float = global_position.distance_to(_player.global_position)
	if _attack_phase == 0:
		# Winding up the strike.
		if _attack_timer >= config.attack_windup:
			_attack_timer = 0.0
			_attack_phase = 1
			if dist <= config.attack_range * 1.2 and _has_line_of_sight(global_position + Vector3(0, 1.4, 0), _player.global_position + Vector3(0, 1.4, 0)):
				_player.apply_damage(config.attack_damage, self)
	else:
		# Recovering, then deciding what to do next.
		if _attack_timer >= config.attack_cooldown:
			_attack_timer = 0.0
			_attack_phase = 0
			if _player.is_dead():
				_set_state(GameTypes.MonsterState.RETURN_TO_PATROL)
			elif dist <= config.attack_range and _can_see_player():
				pass  # swing again
			elif _can_see_player():
				_set_state(GameTypes.MonsterState.CHASE)
			else:
				_set_state(GameTypes.MonsterState.SEARCH)

# --- Navigation helpers ------------------------------------------------------

func _set_nav_target(target: Vector3) -> void:
	_repath_timer -= get_physics_process_delta_time()
	if _repath_timer <= 0.0 or agent.target_position.distance_to(target) > 1.0:
		agent.target_position = target
		_repath_timer = 0.4

func _move_along_path(delta: float, speed: float) -> void:
	if agent.is_navigation_finished():
		velocity.x = 0.0
		velocity.z = 0.0
		return
	var next: Vector3 = agent.get_next_path_position()
	var dir: Vector3 = (next - global_position)
	dir.y = 0.0
	if dir.length() < 0.05:
		return
	dir = dir.normalized()
	velocity.x = dir.x * speed
	velocity.z = dir.z * speed
	_face_dir(dir, delta)

func _face_dir(dir: Vector3, delta: float) -> void:
	if dir.length() < 0.01:
		return
	# Align the monster's forward (-Z) with the movement direction so the vision cone
	# (which uses -basis.z) points where it walks.
	var target_yaw: float = atan2(-dir.x, -dir.z)
	rotation.y = lerp_angle(rotation.y, target_yaw, clampf(config.turn_speed * delta, 0.0, 1.0))

func _face_towards(point: Vector3, delta: float) -> void:
	var dir: Vector3 = point - global_position
	dir.y = 0.0
	_face_dir(dir.normalized(), delta)

func _current_patrol_point() -> Vector3:
	if patrol_points.is_empty():
		return global_position
	return patrol_points[_patrol_index % patrol_points.size()]

func _open_doors_ahead() -> void:
	if not config.can_open_doors:
		return
	var space: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var forward: Vector3 = -global_transform.basis.z
	var from: Vector3 = global_position + Vector3(0, 1.0, 0)
	var to: Vector3 = from + forward * 1.2
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(from, to, GameTypes.LAYER_WORLD | GameTypes.LAYER_INTERACTABLE)
	query.exclude = [get_rid()]
	var hit: Dictionary = space.intersect_ray(query)
	if hit.has("collider") and hit["collider"] is Door:
		(hit["collider"] as Door).force_open()

func _maybe_search_locker() -> void:
	for spot: Node in get_tree().get_nodes_in_group("hiding_spot"):
		if spot is HidingLocker and (spot as HidingLocker).is_occupied():
			var locker: HidingLocker = spot as HidingLocker
			if global_position.distance_to(locker.global_position) < 1.6:
				if randf() < config.locker_check_chance * 0.05:
					if locker.search():
						_last_known_pos = locker.global_position
						_set_state(GameTypes.MonsterState.CHASE)

# --- Animation / external ----------------------------------------------------

func _update_animation(delta: float) -> void:
	if _anim != null:
		_update_glb_animation(delta)
	else:
		_update_fallback_animation(delta)

func _update_glb_animation(delta: float) -> void:
	_anim_lock = maxf(0.0, _anim_lock - delta)
	if _anim_lock > 0.0:
		return
	var speed: float = Vector2(velocity.x, velocity.z).length()
	if state == GameTypes.MonsterState.ATTACK:
		_play_anim(ANIM_ATTACK)
	elif speed > 0.25:
		_play_anim(ANIM_WALK)
	else:
		_play_anim(ANIM_IDLE)
	# Faster gait while hunting.
	_anim.speed_scale = 1.5 if state == GameTypes.MonsterState.CHASE else 1.0

func _update_fallback_animation(delta: float) -> void:
	_idle_anim_time += delta
	var speed: float = Vector2(velocity.x, velocity.z).length()
	var arm_l: Node3D = _mesh_root.get_node_or_null("ArmL")
	var arm_r: Node3D = _mesh_root.get_node_or_null("ArmR")
	var swing: float = sin(_idle_anim_time * (3.0 + speed)) * (0.1 + speed * 0.08)
	if arm_l != null:
		arm_l.rotation.x = swing
	if arm_r != null:
		arm_r.rotation.x = -swing
	_mesh_root.position.y = sin(_idle_anim_time * 1.5) * 0.02

## Forces a scripted appearance/behaviour (used by horror events / encounters).
func force_state(new_state: int) -> void:
	_set_state(new_state)

func wake() -> void:
	if state == GameTypes.MonsterState.DORMANT:
		_set_state(GameTypes.MonsterState.PATROL)

func set_aggression(value: float) -> void:
	aggression = value

func set_proximity_aggro(value: float) -> void:
	proximity_aggro_range = value

func stun(_duration: float = 3.0) -> void:
	_set_state(GameTypes.MonsterState.STUNNED)

func _on_flag_changed(key: String, value: Variant) -> void:
	if key == "power_on" and bool(value):
		wake()

# --- Debug -------------------------------------------------------------------

func toggle_debug() -> void:
	_debug_enabled = not _debug_enabled
	_debug_label.visible = _debug_enabled
	_debug_draw.visible = _debug_enabled

func get_debug_summary() -> String:
	return "%s  det=%.2f  aggr=%.2f" % [GameTypes.monster_state_name(state), detection, aggression]

func _update_debug() -> void:
	_debug_label.text = "%s\ndet %.2f" % [GameTypes.monster_state_name(state), detection]
	var im: ImmediateMesh = ImmediateMesh.new()
	im.surface_begin(Mesh.PRIMITIVE_LINES)
	# Path
	if not agent.is_navigation_finished():
		im.surface_set_color(Color.YELLOW)
		im.surface_add_vertex(Vector3(0, 1, 0))
		im.surface_add_vertex(to_local(agent.get_next_path_position()) + Vector3(0, 1, 0))
	# Last known
	im.surface_set_color(Color.RED)
	im.surface_add_vertex(Vector3(0, 1, 0))
	im.surface_add_vertex(to_local(_last_known_pos) + Vector3(0, 1, 0))
	im.surface_end()
	_debug_draw.mesh = im
