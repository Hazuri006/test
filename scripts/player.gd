extends CharacterBody3D
## Third-person survivor controller.
## - Camera-relative WASD movement with a SpringArm boom camera.
## - Script-driven animation blending (Idle/Walk/Run/Jump/Fall) on the injected clips.
## - Multiplayer aware: only the authority peer reads input and owns the camera.

@export var walk_speed := 3.2
@export var run_speed := 6.4
@export var acceleration := 12.0
@export var rotation_speed := 11.0
@export var jump_velocity := 6.2
@export var mouse_sensitivity := 0.0026
@export var target_height := 1.82

# Synchronised state (written by the authority, read by remotes).
@export var sync_state := 0       ## 0 idle, 1 walk, 2 run, 3 jump, 4 fall
@export var sync_facing := 0.0
@export var is_dead := false

var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 18.0)
var cam_yaw := 0.0
var cam_pitch := -0.25
var stamina := 1.0
var face_angle := 0.0
var anim_speed := 1.0

@onready var model_root: Node3D = $ModelRoot
@onready var cam_pivot: Node3D = $CameraPivot
@onready var spring: SpringArm3D = $CameraPivot/SpringArm3D
@onready var camera: Camera3D = $CameraPivot/SpringArm3D/Camera3D
@onready var flashlight: SpotLight3D = $CameraPivot/SpringArm3D/Camera3D/Flashlight
@onready var nameplate: Label3D = $Nameplate

var anim: AnimationPlayer
var _cur_clip := ""

func _enter_tree() -> void:
	# Node is named after the owning peer id when spawned.
	var n := str(name)
	set_multiplayer_authority(n.to_int() if n.is_valid_int() else 1)

func _ready() -> void:
	add_to_group("players")
	anim = model_root.find_child("AnimationPlayer", true, false)
	_fit_model_height()
	if anim and anim.has_animation("Idle"):
		anim.play("Idle")

	_configure_sync()

	var authority := is_multiplayer_authority()
	camera.current = authority
	flashlight.visible = true
	nameplate.visible = not authority
	if authority:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	set_physics_process(true)

func _configure_sync() -> void:
	var sync := get_node_or_null("MultiplayerSynchronizer") as MultiplayerSynchronizer
	if sync == null:
		return
	var cfg := SceneReplicationConfig.new()
	for prop in [".:position", ".:sync_state", ".:sync_facing", ".:is_dead"]:
		var np := NodePath(prop)
		cfg.add_property(np)
		cfg.property_set_spawn(np, true)
		cfg.property_set_replication_mode(np, SceneReplicationConfig.REPLICATION_MODE_ALWAYS)
	sync.replication_config = cfg

func setup(display_name: String) -> void:
	nameplate.text = display_name

func _fit_model_height() -> void:
	# The raw model is ~1.52 units tall; scale ModelRoot so the survivor reads ~1.8 m.
	var aabb := AABB()
	var first := true
	for m in model_root.find_children("*", "MeshInstance3D", true, false):
		var a: AABB = (m as MeshInstance3D).get_aabb()
		a = (m as MeshInstance3D).transform * a
		if first:
			aabb = a
			first = false
		else:
			aabb = aabb.merge(a)
	if not first and aabb.size.y > 0.01:
		var s := target_height / aabb.size.y
		model_root.scale = Vector3(s, s, s)

func _unhandled_input(event: InputEvent) -> void:
	if not is_multiplayer_authority():
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		cam_yaw -= event.relative.x * mouse_sensitivity
		cam_pitch = clampf(cam_pitch - event.relative.y * mouse_sensitivity, -1.2, 0.5)
	elif event.is_action_pressed("flashlight"):
		flashlight.visible = not flashlight.visible
	elif event.is_action_pressed("interact") and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	if is_multiplayer_authority():
		_authority_step(delta)
	else:
		_remote_step(delta)
	_drive_animation()

func _authority_step(delta: float) -> void:
	if is_dead or Game.state != Game.State.PLAYING:
		velocity.x = move_toward(velocity.x, 0, acceleration * delta)
		velocity.z = move_toward(velocity.z, 0, acceleration * delta)
		if not is_on_floor():
			velocity.y -= gravity * delta
		move_and_slide()
		_apply_camera()
		return

	# Gravity
	if not is_on_floor():
		velocity.y -= gravity * delta

	# Input -> world direction relative to camera yaw.
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var basis := Basis(Vector3.UP, cam_yaw)
	var dir := (basis * Vector3(input.x, 0, input.y)).normalized()

	var sprinting := Input.is_action_pressed("sprint") and stamina > 0.05 and input != Vector2.ZERO
	var speed := run_speed if sprinting else walk_speed
	if sprinting:
		stamina = maxf(0.0, stamina - delta * 0.32)
	else:
		stamina = minf(1.0, stamina + delta * 0.22)

	if dir != Vector3.ZERO:
		velocity.x = move_toward(velocity.x, dir.x * speed, acceleration * delta)
		velocity.z = move_toward(velocity.z, dir.z * speed, acceleration * delta)
		# Model rest-forward is -Z, so aim -dir to face travel direction.
		face_angle = atan2(-dir.x, -dir.z)
	else:
		velocity.x = move_toward(velocity.x, 0, acceleration * 1.6 * delta)
		velocity.z = move_toward(velocity.z, 0, acceleration * 1.6 * delta)

	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = jump_velocity

	move_and_slide()

	# Smoothly turn the model toward travel direction.
	model_root.rotation.y = lerp_angle(model_root.rotation.y, face_angle, rotation_speed * delta)
	_apply_camera()

	# Decide animation state for sync.
	var planar := Vector2(velocity.x, velocity.z).length()
	if not is_on_floor():
		sync_state = 3 if velocity.y > 0.6 else 4
	elif planar > 0.35:
		sync_state = 2 if planar > walk_speed + 0.6 else 1
	else:
		sync_state = 0
	sync_facing = model_root.rotation.y
	anim_speed = clampf(planar / maxf(walk_speed, 0.1), 0.65, 1.7)

func _remote_step(delta: float) -> void:
	# MultiplayerSynchronizer already moved us; just smooth the facing.
	model_root.rotation.y = lerp_angle(model_root.rotation.y, sync_facing, rotation_speed * delta)

func _apply_camera() -> void:
	cam_pivot.global_position = global_position + Vector3.UP * 1.5
	cam_pivot.rotation.y = cam_yaw
	spring.rotation.x = cam_pitch

func _drive_animation() -> void:
	if anim == null:
		return
	var clip := "Idle"
	match sync_state:
		1: clip = "Walk"
		2: clip = "Run"
		3: clip = "Jump"
		4: clip = "Fall"
		_: clip = "Idle"
	if clip != _cur_clip and anim.has_animation(clip):
		anim.play(clip, 0.18)
		_cur_clip = clip
	# Sync footfall cadence to movement speed for grounded locomotion.
	if _cur_clip == "Walk" or _cur_clip == "Run":
		anim.speed_scale = anim_speed if is_multiplayer_authority() else 1.0
	else:
		anim.speed_scale = 1.0

func kill() -> void:
	if is_dead:
		return
	is_dead = true
	sync_state = 0
