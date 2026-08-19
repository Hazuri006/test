extends CharacterBody3D
class_name Player

## Controleur du joueur : nage libre a six degres de liberte, marche a
## l'interieur de la capsule et sur l'ilot, et toute la boucle de survie.
##
## Le pilotage reprend les sensations de Subnautica :
##  * on nage dans la direction du regard (les touches sont relatives a la
##    camera, y compris son inclinaison) ;
##  * l'inertie est forte et la trainee visqueuse, jamais un arret net ;
##  * en surface, la flottabilite ramene le corps vers l'air ;
##  * la respiration, la nage et le sprint pilotent le bruit, les bulles et
##    l'oscillation de la camera.

signal interact_target_changed(target: Node, prompt: String)
signal tool_changed(id: StringName)

const EYE_HEIGHT := 1.62
const BODY_PIVOT := 1.55

@export_group("Nage")
@export var swim_speed: float = 3.4
@export var sprint_multiplier: float = 1.65
@export var swim_acceleration: float = 9.0
@export var water_drag: float = 2.6
@export var buoyancy: float = 2.2

@export_group("Marche")
@export var walk_speed: float = 3.4
@export var run_speed: float = 5.2
@export var jump_velocity: float = 4.0
@export var ground_acceleration: float = 14.0

@export_group("Camera")
@export var min_pitch: float = -89.0
@export var max_pitch: float = 89.0

enum Mode { SWIM, WALK }

var mode: int = Mode.SWIM
var stats: PlayerStats
var inventory: Inventory
var body: ProcBody
var animator: BodyAnimator

var ocean: Ocean
var world: WorldManager

var camera: Camera3D
var cam_pivot: Node3D
var body_root: Node3D
var tool_mount: Node3D
var interact_ray: RayCast3D
var ground_ray: RayCast3D
var bubbles: GPUParticles3D
var flashlight: SpotLight3D

var pitch: float = 0.0
var head_submerged: bool = false
var depth: float = 0.0
var in_shelter: bool = false
var third_person: bool = false
var sprinting: bool = false

var _bob_phase: float = 0.0
var _sway: Vector2 = Vector2.ZERO
var _target_sway: Vector2 = Vector2.ZERO
var _fov_current: float = 78.0
var _current_target: Node = null
var _stroke_timer: float = 0.0
var _breath_timer: float = 0.0
var _held_tool: StringName = &""
var _tool_visual: Node3D = null
var _dead: bool = false
var climb_zones: int = 0
var _respawn_point: Vector3 = Vector3(0, 3, 0)
var _mouse_delta: Vector2 = Vector2.ZERO

func _ready() -> void:
	collision_layer = 1 << 1
	collision_mask = 1
	_build_nodes()
	GameState.player = self
	stats.died.connect(_on_died)
	stats.warning.connect(func(text, sev): GameState.notify.emit(text, sev))
	inventory.equipment_changed.connect(_on_equipment_changed)
	_on_equipment_changed()
	set_third_person(false)

func bind_world(p_ocean: Ocean, p_world: WorldManager) -> void:
	ocean = p_ocean
	world = p_world

func set_respawn_point(p: Vector3) -> void:
	_respawn_point = p

# =============================================================================
#  Construction de la hierarchie
# =============================================================================
func _build_nodes() -> void:
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.34
	capsule.height = 1.75
	var col := CollisionShape3D.new()
	col.name = "Collision"
	col.shape = capsule
	col.position = Vector3(0, 0.88, 0)
	add_child(col)

	stats = PlayerStats.new()
	stats.name = "Stats"
	add_child(stats)

	inventory = Inventory.new()
	inventory.name = "Inventory"
	add_child(inventory)

	cam_pivot = Node3D.new()
	cam_pivot.name = "CamPivot"
	cam_pivot.position = Vector3(0, EYE_HEIGHT, 0)
	add_child(cam_pivot)

	camera = Camera3D.new()
	camera.name = "Camera"
	camera.fov = Settings.fov
	camera.near = 0.05
	camera.far = 8000.0
	# le calque 2 porte la tete du joueur : invisible en vue subjective
	camera.cull_mask = 0xFFFFF & ~(1 << 1)
	cam_pivot.add_child(camera)
	_fov_current = camera.fov

	tool_mount = Node3D.new()
	tool_mount.name = "ToolMount"
	tool_mount.position = Vector3(0.28, -0.22, -0.42)
	camera.add_child(tool_mount)

	flashlight = SpotLight3D.new()
	flashlight.name = "Flashlight"
	flashlight.light_energy = 6.0
	flashlight.light_color = Color(0.85, 0.94, 1.0)
	flashlight.spot_range = 42.0
	flashlight.spot_angle = 32.0
	flashlight.spot_angle_attenuation = 0.6
	flashlight.spot_attenuation = 1.2
	flashlight.shadow_enabled = true
	flashlight.visible = false
	flashlight.position = Vector3(0, 0, 0.05)
	tool_mount.add_child(flashlight)

	interact_ray = RayCast3D.new()
	interact_ray.name = "InteractRay"
	interact_ray.target_position = Vector3(0, 0, -3.4)
	interact_ray.collision_mask = 1 << 2
	interact_ray.collide_with_areas = false
	camera.add_child(interact_ray)

	ground_ray = RayCast3D.new()
	ground_ray.name = "GroundRay"
	ground_ray.position = Vector3(0, 0.2, 0)
	ground_ray.target_position = Vector3(0, -0.55, 0)
	ground_ray.collision_mask = 1
	add_child(ground_ray)

	body_root = Node3D.new()
	body_root.name = "BodyRoot"
	body_root.position = Vector3(0, BODY_PIVOT, 0)
	add_child(body_root)

	body = ProcBody.new()
	body.name = "ProcBody"
	body.position = Vector3(0, -BODY_PIVOT, 0)
	body_root.add_child(body)

	animator = BodyAnimator.new()
	animator.name = "Animator"
	add_child(animator)
	# ProcBody s'est deja construit au moment ou add_child l'a mis dans
	# l'arbre : son squelette est pret, on peut brancher l'animateur tout de
	# suite (attendre son signal `ready` serait trop tard).
	animator.setup(body)

	bubbles = _make_bubbles()
	cam_pivot.add_child(bubbles)

func _make_bubbles() -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.name = "Bubbles"
	p.amount = 48
	p.lifetime = 3.5
	p.emitting = false
	p.local_coords = false
	p.explosiveness = 0.0
	p.position = Vector3(0, -0.1, -0.32)

	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, 1, 0)
	mat.spread = 22.0
	mat.initial_velocity_min = 0.35
	mat.initial_velocity_max = 0.9
	mat.gravity = Vector3(0, 1.6, 0)          # les bulles remontent
	mat.damping_min = 0.4
	mat.damping_max = 0.9
	mat.scale_min = 0.35
	mat.scale_max = 1.0
	mat.turbulence_enabled = true
	mat.turbulence_noise_strength = 0.4
	mat.turbulence_noise_scale = 2.0
	p.process_material = mat

	var draw := QuadMesh.new()
	draw.size = Vector2(0.035, 0.035)
	var dm := StandardMaterial3D.new()
	dm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	dm.albedo_texture = ProcTextures.bubble_sprite(64)
	dm.albedo_color = Color(1, 1, 1, 0.75)
	dm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	dm.vertex_color_use_as_albedo = true
	draw.material = dm
	p.draw_pass_1 = draw
	return p

# =============================================================================
#  Entrees
# =============================================================================
func _unhandled_input(event: InputEvent) -> void:
	if GameState.ui_open or GameState.paused or _dead:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm := event as InputEventMouseMotion
		_mouse_delta += mm.relative
	elif event.is_action_pressed("flashlight"):
		_toggle_flashlight()
	elif event.is_action_pressed("slot_next"):
		inventory.cycle_slot(1)
	elif event.is_action_pressed("slot_prev"):
		inventory.cycle_slot(-1)
	elif event.is_action_pressed("interact"):
		_try_interact()
	elif event.is_action_pressed("use_tool"):
		_use_tool()
	elif event is InputEventKey and event.pressed and not event.echo \
			and (event as InputEventKey).keycode == KEY_V:
		set_third_person(not third_person)
	else:
		for i in 5:
			if event.is_action_pressed("slot_%d" % (i + 1)):
				inventory.set_active_slot(i)
				break

func _apply_look() -> void:
	if _mouse_delta == Vector2.ZERO:
		return
	var sens := Settings.mouse_sensitivity
	rotate_y(-_mouse_delta.x * sens)
	var dy := _mouse_delta.y * sens * (-1.0 if Settings.invert_y else 1.0)
	pitch = clampf(pitch - dy, deg_to_rad(min_pitch), deg_to_rad(max_pitch))
	# le mouvement horizontal de la souris incline legerement le corps
	_target_sway.x = clampf(-_mouse_delta.x * 0.06, -1.0, 1.0)
	_target_sway.y = clampf(_mouse_delta.y * 0.05, -1.0, 1.0)
	_mouse_delta = Vector2.ZERO

# =============================================================================
#  Boucle physique
# =============================================================================
func _physics_process(delta: float) -> void:
	_apply_look()
	_update_water_state()

	var input_vec := Vector3.ZERO
	if not GameState.ui_open and not GameState.paused and not _dead:
		input_vec.x = Input.get_axis("move_left", "move_right")
		input_vec.z = Input.get_axis("move_forward", "move_back")
		if Input.is_action_pressed("swim_up"):
			input_vec.y += 1.0
		if Input.is_action_pressed("swim_down"):
			input_vec.y -= 1.0
		sprinting = Input.is_action_pressed("sprint") and input_vec.length() > 0.1 \
			and stats.oxygen > 1.0
	else:
		sprinting = false

	if mode == Mode.SWIM:
		_swim(delta, input_vec)
	else:
		_walk(delta, input_vec)

	move_and_slide()

	stats.tick(delta, head_submerged, depth, sprinting, in_shelter)
	_update_camera(delta)
	_update_body(delta)
	_update_bubbles(delta)
	_update_interaction()

func _update_water_state() -> void:
	var surface := -1000.0
	if ocean != null:
		surface = ocean.get_wave_height(global_position.x, global_position.z)
	var feet_depth := surface - global_position.y
	depth = maxf(surface - (global_position.y + EYE_HEIGHT), 0.0)
	head_submerged = (global_position.y + EYE_HEIGHT) < surface

	var grounded := ground_ray.is_colliding()
	# on nage des que les pieds sont assez profonds pour decoller
	var should_swim := feet_depth > 1.25 or (feet_depth > 0.4 and not grounded)
	var new_mode: int = Mode.SWIM if should_swim else Mode.WALK
	if new_mode != mode:
		mode = new_mode
		motion_mode = CharacterBody3D.MOTION_MODE_FLOATING if mode == Mode.SWIM \
			else CharacterBody3D.MOTION_MODE_GROUNDED
		up_direction = Vector3.UP

func _swim(delta: float, input_vec: Vector3) -> void:
	# direction souhaitee, exprimee dans le repere de la camera : nager
	# revient a "aller ou l'on regarde"
	var basis_cam := camera.global_transform.basis
	var wish := basis_cam.x * input_vec.x + basis_cam.z * input_vec.z
	# monter / descendre reste vertical dans le repere du monde
	wish.y += input_vec.y
	if wish.length() > 1.0:
		wish = wish.normalized()

	var speed := swim_speed * (1.0 + stats.swim_speed_bonus)
	if sprinting:
		speed *= sprint_multiplier
	var target := wish * speed

	velocity = velocity.lerp(target, 1.0 - exp(-swim_acceleration * delta))
	# trainee visqueuse : jamais d'arret net
	velocity *= exp(-water_drag * delta * (0.35 if wish.length() > 0.05 else 1.0))

	# flottabilite : legerement positive pres de la surface pour pouvoir respirer
	if ocean != null:
		var surface: float = ocean.get_wave_height(global_position.x, global_position.z)
		var submerge_amount: float = clampf(
			(surface - (global_position.y + EYE_HEIGHT)) / 0.8, -1.0, 1.0)
		if submerge_amount > 0.0 and input_vec.y <= 0.0:
			velocity.y += buoyancy * submerge_amount * delta \
				* clampf(1.0 - depth * 0.5, 0.0, 1.0)
		elif submerge_amount < 0.0:
			# la tete est sortie : on retombe doucement
			velocity.y -= 5.5 * delta

		# le clapot berce le corps a proximite de la surface
		if depth < 3.0:
			var orbital: Vector3 = ocean.get_orbital_velocity(
				global_position.x, global_position.z)
			velocity += orbital * 0.28 * delta * (1.0 - depth / 3.0)

func _walk(delta: float, input_vec: Vector3) -> void:
	if climb_zones > 0:
		# echelle : deplacement vertical libre, appuis horizontaux ralentis
		velocity.y = input_vec.y * 2.4
		if is_zero_approx(input_vec.y):
			velocity.y = 0.0
		var climb_dir := (global_transform.basis.x * input_vec.x
			+ global_transform.basis.z * input_vec.z)
		climb_dir.y = 0.0
		velocity.x = move_toward(velocity.x, climb_dir.x * 1.4, 12.0 * delta)
		velocity.z = move_toward(velocity.z, climb_dir.z * 1.4, 12.0 * delta)
		return
	if not is_on_floor():
		velocity.y -= 9.81 * delta
	elif Input.is_action_just_pressed("swim_up"):
		velocity.y = jump_velocity

	var dir := (global_transform.basis.x * input_vec.x
		+ global_transform.basis.z * input_vec.z)
	dir.y = 0.0
	if dir.length() > 1.0:
		dir = dir.normalized()
	var speed := run_speed if sprinting else walk_speed
	var target := dir * speed
	var accel := ground_acceleration if is_on_floor() else ground_acceleration * 0.25
	velocity.x = move_toward(velocity.x, target.x, accel * delta)
	velocity.z = move_toward(velocity.z, target.z, accel * delta)

# =============================================================================
#  Rendu / ressenti
# =============================================================================
func _update_camera(delta: float) -> void:
	var speed01: float = clampf(velocity.length() / (swim_speed * sprint_multiplier),
		0.0, 1.0)

	# --- oscillation de marche / de nage ------------------------------------
	var bob_rate: float = lerpf(4.0, 9.0, speed01)
	_bob_phase = wrapf(_bob_phase + delta * bob_rate, 0.0, TAU)
	var bob_amount: float = speed01 * Settings.head_bob \
		* (0.028 if mode == Mode.WALK else 0.016)
	var bob := Vector3(
		cos(_bob_phase * 0.5) * bob_amount * 1.1,
		sin(_bob_phase) * bob_amount,
		0.0)
	# respiration : toujours presente, meme a l'arret
	var breath: float = sin(Time.get_ticks_msec() * 0.0011) * 0.006
	bob.y += breath

	# --- inertie de la visee -------------------------------------------------
	_sway = _sway.lerp(_target_sway, 1.0 - exp(-delta * 6.0))
	_target_sway = _target_sway.lerp(Vector2.ZERO, 1.0 - exp(-delta * 4.0))

	cam_pivot.position = Vector3(0, EYE_HEIGHT, 0) + bob
	var roll := _sway.x * 0.05
	if mode == Mode.SWIM:
		# en nage, le roulis suit aussi la vitesse laterale
		var lateral: float = camera.global_transform.basis.x.dot(velocity)
		roll += -lateral * 0.012
	cam_pivot.rotation = Vector3(pitch, 0.0, roll)

	if third_person:
		camera.position = camera.position.lerp(Vector3(0.45, 0.35, 3.1),
			1.0 - exp(-delta * 8.0))
	else:
		camera.position = camera.position.lerp(Vector3.ZERO, 1.0 - exp(-delta * 10.0))

	# --- champ de vision -----------------------------------------------------
	var fov_target: float = Settings.fov + (9.0 if sprinting else 0.0)
	if head_submerged:
		# l'indice de refraction de l'eau reduit le champ percu (~1/1.333)
		fov_target *= 0.93
	_fov_current = lerpf(_fov_current, fov_target, 1.0 - exp(-delta * 5.0))
	camera.fov = _fov_current

func _update_body(delta: float) -> void:
	if animator == null or animator.skeleton == null:
		return
	var speed01: float = clampf(velocity.length() / (swim_speed * sprint_multiplier),
		0.0, 1.0)
	var state := BodyAnimator.State.FLOAT
	if mode == Mode.WALK:
		state = BodyAnimator.State.WALK
	elif not head_submerged and velocity.length() < 1.2:
		state = BodyAnimator.State.TREAD
	elif speed01 > 0.08:
		state = BodyAnimator.State.SWIM

	animator.update(delta, state, speed01, velocity.y, pitch, _sway.x,
		sprinting, _held_tool != &"")

	# le corps s'aligne sur la direction de nage : couche a plat quand on
	# avance, redresse quand on fait du surplace
	var target_pitch := 0.0
	if mode == Mode.SWIM:
		target_pitch = pitch * clampf(speed01 * 2.2 + 0.25, 0.0, 1.0)
	body_root.rotation.x = lerpf(body_root.rotation.x, target_pitch,
		1.0 - exp(-delta * 5.0))
	body_root.rotation.z = lerpf(body_root.rotation.z, _sway.x * 0.15,
		1.0 - exp(-delta * 4.0))

func _update_bubbles(delta: float) -> void:
	bubbles.emitting = head_submerged and not _dead
	if not head_submerged:
		return
	_breath_timer -= delta
	if _breath_timer <= 0.0:
		_breath_timer = randf_range(2.6, 4.4) / (1.6 if sprinting else 1.0)
		SoundBank.play("bubble", -22.0, randf_range(0.8, 1.25))
	_stroke_timer -= delta
	if velocity.length() > 1.4 and _stroke_timer <= 0.0:
		_stroke_timer = 1.1 / maxf(velocity.length() / swim_speed, 0.4)
		SoundBank.play("swim", -26.0, randf_range(0.9, 1.1))

# =============================================================================
#  Interaction et outils
# =============================================================================
func _update_interaction() -> void:
	var target: Node = null
	if interact_ray.is_colliding():
		var hit := interact_ray.get_collider()
		if hit is Interactable and (hit as Interactable).can_interact(self):
			target = hit
	if target != _current_target:
		if _current_target != null and is_instance_valid(_current_target) \
				and _current_target.has_method("set_highlight"):
			_current_target.set_highlight(false)
		_current_target = target
		var text := ""
		if target != null:
			if target.has_method("set_highlight"):
				target.set_highlight(true)
			text = target.get_prompt(self)
		interact_target_changed.emit(target, text)

func _try_interact() -> void:
	if _current_target != null and is_instance_valid(_current_target):
		_current_target.interact(self)

func _use_tool() -> void:
	var tool_id := inventory.active_tool()
	if tool_id == &"":
		return
	match tool_id:
		&"flashlight":
			_toggle_flashlight()
		&"knife":
			_swing_knife()
		&"scanner":
			_scan()
		&"beacon":
			_place_beacon()

func _toggle_flashlight() -> void:
	if inventory.count(&"flashlight") <= 0:
		GameState.notify_warning("Aucune lampe torche")
		return
	flashlight.visible = not flashlight.visible
	SoundBank.play("ui_click", -14.0)

func _swing_knife() -> void:
	if _current_target != null and is_instance_valid(_current_target) \
			and _current_target.has_method("harvest"):
		_current_target.harvest(self)
	SoundBank.play("swim", -20.0, 1.6)

func _scan() -> void:
	if _current_target == null or not is_instance_valid(_current_target):
		GameState.notify_info("Rien a analyser")
		return
	var id := StringName(_current_target.name)
	if _current_target.has_method("scan_id"):
		id = _current_target.scan_id()
	if GameState.mark_discovered(id):
		GameState.notify_success("Analyse enregistree : %s" % String(id))
		SoundBank.play("ui_confirm", -10.0)
	else:
		GameState.notify_info("Deja analyse")

func _place_beacon() -> void:
	if not inventory.remove(&"beacon", 1):
		return
	GameState.notify_success("Balise deployee")
	SoundBank.play("ui_confirm", -10.0)

func _on_equipment_changed() -> void:
	stats.apply_modifiers(inventory.collect_modifiers())
	if body != null:
		body.set_fins_visible(inventory.equipped.get(&"feet", &"") == &"fins")
		body.set_tank_visible(inventory.equipped.has(&"tank"))
	var tool_id := inventory.active_tool()
	if tool_id != _held_tool:
		_held_tool = tool_id
		_rebuild_tool_visual()
		tool_changed.emit(tool_id)
	if _held_tool != &"flashlight":
		flashlight.visible = false

func _rebuild_tool_visual() -> void:
	if _tool_visual != null:
		_tool_visual.queue_free()
		_tool_visual = null
	if _held_tool == &"":
		return
	var item: Resource = ItemDB.get_item(_held_tool)
	if item == null:
		return
	var holder := Node3D.new()
	var mesh := MeshInstance3D.new()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = item.color
	mat.metallic = 0.65
	mat.roughness = 0.3
	match _held_tool:
		&"knife":
			var blade := BoxMesh.new()
			blade.size = Vector3(0.02, 0.05, 0.26)
			mesh.mesh = blade
		&"flashlight":
			var body_mesh := CylinderMesh.new()
			body_mesh.top_radius = 0.035
			body_mesh.bottom_radius = 0.028
			body_mesh.height = 0.19
			mesh.mesh = body_mesh
			mesh.rotation_degrees = Vector3(-90, 0, 0)
		_:
			var box := BoxMesh.new()
			box.size = Vector3(0.08, 0.12, 0.04)
			mesh.mesh = box
	mat.emission_enabled = true
	mat.emission = item.accent
	mat.emission_energy_multiplier = 0.35
	mesh.material_override = mat
	holder.add_child(mesh)
	tool_mount.add_child(holder)
	_tool_visual = holder

func set_third_person(on: bool) -> void:
	third_person = on
	if body != null:
		body.set_first_person(not on)
	camera.cull_mask = 0xFFFFF if on else (0xFFFFF & ~(1 << 1))

# =============================================================================
#  Vie et mort
# =============================================================================
func _on_died() -> void:
	if _dead:
		return
	_dead = true
	velocity = Vector3.ZERO
	GameState.player_died.emit()
	SoundBank.play("alarm", -6.0, 0.6)
	get_tree().create_timer(4.0).timeout.connect(respawn)

func respawn() -> void:
	_dead = false
	global_position = _respawn_point
	velocity = Vector3.ZERO
	pitch = 0.0
	stats.reset()
	GameState.player_respawned.emit()
	GameState.notify_info("Reanimation dans la capsule de survie")

func enter_climb() -> void:
	climb_zones += 1

func exit_climb() -> void:
	climb_zones = maxi(climb_zones - 1, 0)

func set_in_shelter(value: bool) -> void:
	in_shelter = value

func is_dead() -> bool:
	return _dead

# =============================================================================
#  Sauvegarde
# =============================================================================
func serialize() -> Dictionary:
	return {"stats": stats.serialize(), "inventory": inventory.serialize(),
		"pitch": pitch, "yaw": rotation.y}

func deserialize(d: Dictionary) -> void:
	if d.has("stats"):
		stats.deserialize(d["stats"])
	if d.has("inventory"):
		inventory.deserialize(d["inventory"])
	pitch = d.get("pitch", 0.0)
	rotation.y = d.get("yaw", 0.0)
