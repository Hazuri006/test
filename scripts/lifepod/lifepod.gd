extends Node3D
class_name Lifepod

## Capsule de survie n°5.
##
## Coque batie par revolution : partie basse opaque, bandeau vitre a hauteur
## d'yeux, calotte percee d'une ecoutille. La capsule flotte reellement : sa
## hauteur et son assiette sont recalculees a chaque pas physique a partir de
## la houle echantillonnee en quatre points, ce qui la fait rouler et tanguer
## comme une bouee. Le joueur qui marche a l'interieur est porte par elle
## (AnimatableBody3D synchronise avec la physique).

const FLOAT_OFFSET := 0.38          # hauteur du plancher au-dessus de l'eau
const INNER_RADIUS := 2.0

var hull: AnimatableBody3D
var fabricator: Fabricator
var locker: StorageLocker
var medkit: Interactable

var ocean: Ocean
var _player: Node = null
var _tilt := Vector3.ZERO
var _bob_velocity := 0.0
var _medkit_timer := 0.0

func _ready() -> void:
	_build()
	GameState.lifepod = self

func bind_ocean(p_ocean: Ocean) -> void:
	ocean = p_ocean

## Point d'apparition du joueur : debout sur le plancher interieur.
func get_spawn_point() -> Vector3:
	return hull.global_position + Vector3(0.0, 0.05, -0.9)

# =============================================================================
#  Construction
# =============================================================================
func _build() -> void:
	hull = AnimatableBody3D.new()
	hull.name = "Hull"
	hull.sync_to_physics = true
	hull.collision_layer = 1
	hull.collision_mask = 0
	add_child(hull)

	var shell_mat := MeshBuilder.metal(Color(0.86, 0.82, 0.74), 0.42, 0.55)
	shell_mat.normal_enabled = true
	shell_mat.normal_texture = ProcTextures.normal_map(512, 0.06, 4, 909, 0.5)
	shell_mat.normal_scale = 0.5

	var inner_mat := MeshBuilder.metal(Color(0.72, 0.74, 0.76), 0.55, 0.35)
	var trim_mat := MeshBuilder.metal(Color(0.92, 0.48, 0.10), 0.35, 0.7)

	var glass_mat := StandardMaterial3D.new()
	glass_mat.albedo_color = Color(0.55, 0.75, 0.82, 0.22)
	glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	glass_mat.roughness = 0.03
	glass_mat.metallic = 0.2
	glass_mat.refraction_enabled = true
	glass_mat.refraction_scale = 0.03

	# --- coque exterieure, du fond jusqu'au bandeau vitre --------------------
	var lower := PackedVector2Array([
		Vector2(0.02, -1.45), Vector2(0.85, -1.32), Vector2(1.55, -0.95),
		Vector2(2.05, -0.30), Vector2(2.24, 0.45), Vector2(2.28, 1.10),
		Vector2(2.28, 1.55),
	])
	hull.add_child(MeshBuilder.mesh_node("ShellLower",
		MeshBuilder.lathe(lower, 40, false, Vector2(4, 2)), shell_mat))

	# --- bandeau vitre : la seule ouverture sur l'exterieur ------------------
	var band := PackedVector2Array([Vector2(2.28, 1.55), Vector2(2.30, 1.95),
		Vector2(2.28, 2.32)])
	var band_mesh := MeshBuilder.lathe(band, 40, false, Vector2(4, 1))
	hull.add_child(MeshBuilder.mesh_node("Window", band_mesh, glass_mat))

	# --- calotte superieure percee de l'ecoutille ----------------------------
	var upper := PackedVector2Array([
		Vector2(2.28, 2.32), Vector2(2.18, 2.75), Vector2(1.78, 3.12),
		Vector2(1.10, 3.38), Vector2(0.62, 3.46), Vector2(0.58, 3.55),
	])
	hull.add_child(MeshBuilder.mesh_node("ShellUpper",
		MeshBuilder.lathe(upper, 40, false, Vector2(4, 1)), shell_mat))

	# --- paroi interieure ----------------------------------------------------
	var inner_low := PackedVector2Array([
		Vector2(INNER_RADIUS, 0.0), Vector2(2.12, 0.5), Vector2(2.16, 1.0),
		Vector2(2.16, 1.55),
	])
	hull.add_child(MeshBuilder.mesh_node("InnerLower",
		MeshBuilder.lathe(inner_low, 40, true, Vector2(4, 2)), inner_mat))
	var inner_up := PackedVector2Array([
		Vector2(2.16, 2.32), Vector2(2.06, 2.72), Vector2(1.68, 3.06),
		Vector2(1.02, 3.30), Vector2(0.60, 3.40),
	])
	hull.add_child(MeshBuilder.mesh_node("InnerUpper",
		MeshBuilder.lathe(inner_up, 40, true, Vector2(4, 1)), inner_mat))

	# --- plancher et jonctions ----------------------------------------------
	hull.add_child(MeshBuilder.mesh_node("Floor",
		MeshBuilder.annulus(0.0, INNER_RADIUS, 0.0, 40, true), inner_mat))
	hull.add_child(MeshBuilder.mesh_node("FloorRing",
		MeshBuilder.annulus(INNER_RADIUS, 2.16, 0.0, 40, true), trim_mat))
	hull.add_child(MeshBuilder.mesh_node("HatchRim",
		MeshBuilder.annulus(0.58, 0.68, 3.55, 32, true), trim_mat))

	_build_interior(trim_mat, inner_mat)
	_build_collision()
	_build_lights()

func _build_interior(trim_mat: Material, inner_mat: Material) -> void:
	# --- echelle -------------------------------------------------------------
	var ladder := Node3D.new()
	ladder.name = "Ladder"
	ladder.position = Vector3(0, 0, 1.75)
	hull.add_child(ladder)
	var rail := BoxMesh.new()
	rail.size = Vector3(0.05, 3.4, 0.05)
	for side in [-0.22, 0.22]:
		ladder.add_child(MeshBuilder.mesh_node("Rail", rail, trim_mat,
			Vector3(side, 1.7, 0.0)))
	var rung := BoxMesh.new()
	rung.size = Vector3(0.46, 0.035, 0.035)
	for i in 11:
		ladder.add_child(MeshBuilder.mesh_node("Rung%d" % i, rung, trim_mat,
			Vector3(0, 0.25 + i * 0.30, 0.0)))

	var climb := Area3D.new()
	climb.name = "ClimbZone"
	climb.collision_layer = 0
	climb.collision_mask = 1 << 1
	var climb_shape := CollisionShape3D.new()
	var cbox := BoxShape3D.new()
	cbox.size = Vector3(1.0, 3.8, 0.9)
	climb_shape.shape = cbox
	climb_shape.position = Vector3(0, 1.8, -0.25)
	climb.add_child(climb_shape)
	ladder.add_child(climb)
	climb.body_entered.connect(_on_climb_entered)
	climb.body_exited.connect(_on_climb_exited)

	# --- zone abritee : l'oxygene se recharge ici ---------------------------
	var shelter := Area3D.new()
	shelter.name = "Shelter"
	shelter.collision_layer = 0
	shelter.collision_mask = 1 << 1
	var sh := CollisionShape3D.new()
	var scyl := CylinderShape3D.new()
	scyl.radius = INNER_RADIUS
	scyl.height = 3.2
	sh.shape = scyl
	sh.position = Vector3(0, 1.6, 0)
	shelter.add_child(sh)
	hull.add_child(shelter)
	shelter.body_entered.connect(_on_shelter_entered)
	shelter.body_exited.connect(_on_shelter_exited)

	# --- fabricateur ---------------------------------------------------------
	fabricator = Fabricator.new()
	fabricator.name = "Fabricator"
	fabricator.position = Vector3(0, 0.0, -1.72)
	fabricator.rotation.y = 0.0
	hull.add_child(fabricator)
	# l'impact a rompu son alimentation : il faudra la ressouder
	fabricator.set_powered(false)

	# --- casier --------------------------------------------------------------
	locker = StorageLocker.new()
	locker.name = "Locker"
	locker.position = Vector3(-1.55, 0.0, 0.75)
	locker.rotation.y = deg_to_rad(-115.0)
	hull.add_child(locker)
	# Le naufrage a laisse de quoi tenir la premiere plongee, et surtout
	# l'outil qui permettra de remettre le fabricateur en route.
	locker.fill({&"repair_tool": 1, &"water": 2, &"nutrient_block": 2})

	# --- distributeur medical ------------------------------------------------
	medkit = Interactable.new()
	medkit.name = "MedKit"
	medkit.prompt = "Prendre une trousse de secours"
	medkit.position = Vector3(1.55, 1.0, 0.7)
	medkit.rotation.y = deg_to_rad(115.0)
	var mbox := BoxMesh.new()
	mbox.size = Vector3(0.34, 0.42, 0.16)
	medkit.add_child(MeshBuilder.mesh_node("Case", mbox,
		MeshBuilder.metal(Color(0.9, 0.92, 0.92), 0.4, 0.2)))
	var cross := BoxMesh.new()
	cross.size = Vector3(0.2, 0.06, 0.02)
	medkit.add_child(MeshBuilder.mesh_node("Cross", cross,
		MeshBuilder.emissive(Color(0.9, 0.15, 0.15), 1.2), Vector3(0, 0, -0.09)))
	var cross2 := BoxMesh.new()
	cross2.size = Vector3(0.06, 0.2, 0.02)
	medkit.add_child(MeshBuilder.mesh_node("Cross2", cross2,
		MeshBuilder.emissive(Color(0.9, 0.15, 0.15), 1.2), Vector3(0, 0, -0.09)))
	medkit.add_child(MeshBuilder.box_collider(Vector3(0.38, 0.46, 0.2), Vector3.ZERO))
	medkit.used.connect(_on_medkit_used)
	hull.add_child(medkit)

	# --- banquette et panneau radio -----------------------------------------
	var bench := BoxMesh.new()
	bench.size = Vector3(1.5, 0.12, 0.5)
	hull.add_child(MeshBuilder.mesh_node("Bench", bench, inner_mat,
		Vector3(0.0, 0.45, 1.25)))
	for x in [-0.6, 0.6]:
		var leg := BoxMesh.new()
		leg.size = Vector3(0.08, 0.45, 0.4)
		hull.add_child(MeshBuilder.mesh_node("BenchLeg", leg, inner_mat,
			Vector3(x, 0.22, 1.25)))

	var radio := BoxMesh.new()
	radio.size = Vector3(0.4, 0.28, 0.14)
	hull.add_child(MeshBuilder.mesh_node("Radio", radio,
		MeshBuilder.metal(Color(0.2, 0.22, 0.26), 0.5, 0.5),
		Vector3(-1.55, 1.35, -0.85)))
	var radio_led := BoxMesh.new()
	radio_led.size = Vector3(0.06, 0.03, 0.02)
	hull.add_child(MeshBuilder.mesh_node("RadioLed", radio_led,
		MeshBuilder.emissive(Color(1.0, 0.35, 0.1), 3.0),
		Vector3(-1.44, 1.42, -0.85)))

func _build_collision() -> void:
	# La collision reprend la geometrie reelle de la coque : l'ecoutille reste
	# donc franchissable, sans avoir a la traiter comme un cas particulier.
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for child in hull.get_children():
		if not (child is MeshInstance3D):
			continue
		var mi := child as MeshInstance3D
		if mi.name == "Window":
			continue
		var mesh: Mesh = mi.mesh
		if mesh == null:
			continue
		var arrays := mesh.surface_get_arrays(0)
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		var xform := mi.transform
		if idx.size() > 0:
			for i in idx.size():
				st.add_vertex(xform * verts[idx[i]])
		else:
			for v in verts:
				st.add_vertex(xform * v)
	var collision_mesh := st.commit()
	var shape := collision_mesh.create_trimesh_shape()
	var cs := CollisionShape3D.new()
	cs.name = "HullCollision"
	cs.shape = shape
	hull.add_child(cs)

func _build_lights() -> void:
	var main := OmniLight3D.new()
	main.name = "InteriorLight"
	main.position = Vector3(0, 2.55, 0)
	main.light_color = Color(1.0, 0.92, 0.8)
	main.light_energy = 2.6
	main.omni_range = 6.5
	main.shadow_enabled = true
	hull.add_child(main)

	var accent := OmniLight3D.new()
	accent.name = "AccentLight"
	accent.position = Vector3(0, 0.9, -1.4)
	accent.light_color = Color(0.25, 0.75, 1.0)
	accent.light_energy = 1.2
	accent.omni_range = 4.0
	hull.add_child(accent)

	# bandeau lumineux au plafond
	var strip := TorusMesh.new()
	strip.inner_radius = 1.42
	strip.outer_radius = 1.5
	hull.add_child(MeshBuilder.mesh_node("LightStrip", strip,
		MeshBuilder.emissive(Color(0.9, 0.95, 1.0), 2.2), Vector3(0, 2.9, 0)))

	# feu de detresse exterieur : visible de loin sous l'eau
	var beacon := OmniLight3D.new()
	beacon.name = "Beacon"
	beacon.position = Vector3(0, 3.7, 0)
	beacon.light_color = Color(1.0, 0.4, 0.1)
	beacon.light_energy = 4.0
	beacon.omni_range = 30.0
	hull.add_child(beacon)

# =============================================================================
#  Flottaison
# =============================================================================
func _physics_process(delta: float) -> void:
	if ocean == null:
		return
	var base := global_position
	# quatre points de sondage : on en deduit la hauteur ET l'assiette
	var probes := [
		Vector2(1.8, 0.0), Vector2(-1.8, 0.0),
		Vector2(0.0, 1.8), Vector2(0.0, -1.8)]
	var heights: Array[float] = []
	var sum := 0.0
	for p in probes:
		var h: float = ocean.get_wave_height(base.x + p.x, base.z + p.y)
		heights.append(h)
		sum += h
	var avg := sum / probes.size()

	# ressort amorti vertical : la capsule ne colle pas a la vague, elle la suit
	var target_y := avg + FLOAT_OFFSET
	var dy := target_y - hull.global_position.y
	_bob_velocity += dy * 22.0 * delta
	_bob_velocity *= exp(-4.5 * delta)
	var new_y: float = hull.global_position.y + _bob_velocity * delta

	# assiette : pente entre les sondes opposees, volontairement adoucie
	var pitch: float = atan2(heights[3] - heights[2], 3.6) * 0.55
	var roll: float = atan2(heights[0] - heights[1], 3.6) * 0.55
	_tilt = _tilt.lerp(Vector3(pitch, 0.0, -roll), 1.0 - exp(-3.0 * delta))

	var basis := Basis.from_euler(_tilt)
	hull.global_transform = Transform3D(basis,
		Vector3(base.x, new_y, base.z))

	if _medkit_timer > 0.0:
		_medkit_timer -= delta

# =============================================================================
#  Interactions
# =============================================================================
func _on_shelter_entered(body: Node3D) -> void:
	if body is Player:
		_player = body
		(body as Player).set_in_shelter(true)
		GameState.notify_info("Capsule de survie — oxygene en recharge")

func _on_shelter_exited(body: Node3D) -> void:
	if body is Player:
		(body as Player).set_in_shelter(false)

func _on_climb_entered(body: Node3D) -> void:
	if body is Player:
		(body as Player).enter_climb()

func _on_climb_exited(body: Node3D) -> void:
	if body is Player:
		(body as Player).exit_climb()

func _on_medkit_used(by: Node) -> void:
	if _medkit_timer > 0.0:
		GameState.notify_info("Distributeur en recharge (%d s)" % ceili(_medkit_timer))
		SoundBank.play("ui_deny", -12.0)
		return
	if by == null or not ("inventory" in by):
		return
	if by.inventory.add(&"first_aid", 1) > 0:
		_medkit_timer = 120.0
		GameState.notify_success("Trousse de secours recuperee")
		SoundBank.play("pickup", -10.0)
	else:
		GameState.notify_warning("Inventaire plein")
