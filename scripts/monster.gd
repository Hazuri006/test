extends CharacterBody3D
## The entity. Server-authoritative pursuit AI driven by the navigation mesh.
## States: PATROL (wander) -> CHASE (saw / heard a survivor) -> ATTACK (caught one).
## Plays the hazmat model's baked-in mocap clip, sped up while hunting.

enum State { PATROL, CHASE, ATTACK }

@export var patrol_speed := 2.4
@export var chase_speed := 6.8
@export var sight_range := 26.0
@export var hearing_range := 7.0
@export var attack_range := 1.7
@export var turn_speed := 7.0
@export var target_height := 2.25

var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 18.0)
var state: State = State.PATROL
var active := false
var target: Node3D = null
var last_seen := Vector3.ZERO
var lost_timer := 0.0
var repath := 0.0
var attack_cooldown := 0.0

@onready var agent: NavigationAgent3D = $NavigationAgent3D
@onready var model_root: Node3D = $ModelRoot
@onready var glow: OmniLight3D = $Glow
var anim: AnimationPlayer
var clip_name := ""

func _ready() -> void:
	add_to_group("monster")
	anim = model_root.find_child("AnimationPlayer", true, false)
	if anim:
		var list := anim.get_animation_list()
		if list.size() > 0:
			clip_name = list[0]
			var a := anim.get_animation(clip_name)
			a.loop_mode = Animation.LOOP_LINEAR
			anim.play(clip_name)
	_fit_model_height(target_height)
	agent.path_desired_distance = 0.6
	agent.target_desired_distance = 0.8
	agent.radius = 0.5
	_configure_sync()
	# Only the server thinks; clients receive the transform via the synchronizer.
	set_physics_process(true)

func _configure_sync() -> void:
	var sync := get_node_or_null("MultiplayerSynchronizer") as MultiplayerSynchronizer
	if sync == null:
		return
	var cfg := SceneReplicationConfig.new()
	for prop in [".:position", "ModelRoot:rotation"]:
		var np := NodePath(prop)
		cfg.add_property(np)
		cfg.property_set_replication_mode(np, SceneReplicationConfig.REPLICATION_MODE_ALWAYS)
	sync.replication_config = cfg

func _fit_model_height(h: float) -> void:
	var aabb := AABB()
	var first := true
	for m in model_root.find_children("*", "MeshInstance3D", true, false):
		var a: AABB = (m as MeshInstance3D).global_transform * (m as MeshInstance3D).get_aabb()
		if first: aabb = a; first = false
		else: aabb = aabb.merge(a)
	if first or aabb.size.y < 0.01:
		return
	var s := h / aabb.size.y
	model_root.scale *= s
	# Re-measure to ground the feet at the body origin.
	var low := aabb.position.y * s
	model_root.position.y -= low

func set_active(v: bool) -> void:
	active = v

func _physics_process(delta: float) -> void:
	if multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		# Remote copy: just keep the clip playing; transform is synchronised.
		return
	if not active or Game.state != Game.State.PLAYING:
		# Settle on the floor but don't think until navigation is ready.
		if not is_on_floor():
			velocity.y -= gravity * delta
		else:
			velocity.x = 0.0
			velocity.z = 0.0
		move_and_slide()
		return

	attack_cooldown = maxf(0.0, attack_cooldown - delta)
	_sense(delta)
	match state:
		State.PATROL: _patrol(delta)
		State.CHASE: _chase(delta)
		State.ATTACK: _attack(delta)

	if not is_on_floor():
		velocity.y -= gravity * delta
	move_and_slide()
	_publish_fear()

# --- perception ------------------------------------------------------------

func _sense(delta: float) -> void:
	var nearest: Node3D = null
	var nearest_d := INF
	for p in get_tree().get_nodes_in_group("players"):
		if not is_instance_valid(p) or (p.get("is_dead") == true):
			continue
		var d := global_position.distance_to(p.global_position)
		if d < nearest_d:
			nearest_d = d
			nearest = p
	if nearest == null:
		target = null
		return

	var visible := nearest_d <= hearing_range
	if not visible and nearest_d <= sight_range:
		visible = _has_line_of_sight(nearest)
	if visible:
		target = nearest
		last_seen = nearest.global_position
		lost_timer = 0.0
		if state == State.PATROL:
			state = State.CHASE
			Game.notify("It heard you.", 2.0)
	elif state == State.CHASE:
		lost_timer += delta
		if lost_timer > 5.0:
			state = State.PATROL
			target = null

func _has_line_of_sight(p: Node3D) -> bool:
	var space := get_world_3d().direct_space_state
	var from := global_position + Vector3.UP * 1.6
	var to := p.global_position + Vector3.UP * 1.2
	var q := PhysicsRayQueryParameters3D.create(from, to, 1) # environment layer only
	q.collide_with_areas = false
	var hit := space.intersect_ray(q)
	return hit.is_empty()

# --- behaviours ------------------------------------------------------------

func _patrol(delta: float) -> void:
	repath -= delta
	if agent.is_navigation_finished() or repath <= 0.0:
		repath = randf_range(3.0, 6.0)
		agent.target_position = _random_nav_point()
	_move_along_path(patrol_speed, delta)
	_set_clip_speed(0.85)

func _chase(delta: float) -> void:
	repath -= delta
	if repath <= 0.0:
		repath = 0.25
		agent.target_position = last_seen if target == null else target.global_position
	if target and global_position.distance_to(target.global_position) <= attack_range:
		state = State.ATTACK
		return
	_move_along_path(chase_speed, delta)
	_set_clip_speed(1.5)

func _attack(delta: float) -> void:
	velocity.x = 0.0
	velocity.z = 0.0
	_set_clip_speed(1.7)
	if target == null or not is_instance_valid(target):
		state = State.PATROL
		return
	_face(target.global_position, delta * 2.0)
	if attack_cooldown <= 0.0 and global_position.distance_to(target.global_position) <= attack_range + 0.4:
		if target.has_method("kill"):
			target.kill()
		Game.on_player_caught(target)
		attack_cooldown = 2.0
	elif global_position.distance_to(target.global_position) > attack_range + 0.6:
		state = State.CHASE

func _move_along_path(speed: float, delta: float) -> void:
	if agent.is_navigation_finished():
		velocity.x = move_toward(velocity.x, 0, speed * 4.0 * delta)
		velocity.z = move_toward(velocity.z, 0, speed * 4.0 * delta)
		return
	var next := agent.get_next_path_position()
	var dir := (next - global_position)
	dir.y = 0.0
	dir = dir.normalized()
	velocity.x = dir.x * speed
	velocity.z = dir.z * speed
	if dir.length() > 0.01:
		_face(global_position + dir, delta)

func _face(point: Vector3, delta: float) -> void:
	var to := point - global_position
	to.y = 0.0
	if to.length() < 0.01:
		return
	# Model rest-forward is -Z, so aim -to to face the target.
	var want := atan2(-to.x, -to.z)
	model_root.rotation.y = lerp_angle(model_root.rotation.y, want, turn_speed * delta)

func _set_clip_speed(s: float) -> void:
	if anim and clip_name != "":
		anim.speed_scale = s

func _random_nav_point() -> Vector3:
	var map := agent.get_navigation_map()
	if map.is_valid():
		return NavigationServer3D.map_get_random_point(map, 1, false)
	return global_position

func _publish_fear() -> void:
	# Drive the dread post-FX/audio from distance to the closest survivor.
	var nd := INF
	for p in get_tree().get_nodes_in_group("players"):
		if is_instance_valid(p) and not (p.get("is_dead") == true):
			nd = minf(nd, global_position.distance_to(p.global_position))
	if nd == INF:
		return
	var fear := clampf(1.0 - (nd / sight_range), 0.0, 1.0)
	if state == State.CHASE or state == State.ATTACK:
		fear = maxf(fear, 0.55)
	Game.set_fear(fear)
