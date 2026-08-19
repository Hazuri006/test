extends Interactable
class_name Fabricator

## Fabricateur : transforme les matieres premieres en objets finis.
## L'interaction ouvre l'arborescence de recettes ; la fabrication elle-meme
## est jouee ici (bourdon, halo, hologramme qui se materialise).

const HologramShader := preload("res://shaders/hologram.gdshader")

signal craft_started(recipe: Resource)
signal craft_finished(output: StringName, amount: int)

var busy: bool = false
## Faux tant que le circuit n'a pas ete ressoude a l'outil de reparation.
var powered: bool = true
var _progress: float = 0.0
var _recipe: Resource = null
var _player: Node = null

var _holo: MeshInstance3D
var _holo_mat: ShaderMaterial
var _light: OmniLight3D
var _loop_player: AudioStreamPlayer3D
var _screen_mat: StandardMaterial3D
var _sparks: GPUParticles3D
var _flicker: float = 0.0

func _ready() -> void:
	super()
	prompt = "Ouvrir le fabricateur"
	_build()

func _build() -> void:
	var frame_mat := MeshBuilder.metal(Color(0.16, 0.18, 0.22), 0.4, 0.7)
	var trim_mat := MeshBuilder.metal(Color(0.85, 0.5, 0.12), 0.35, 0.8)

	# --- corps : un caisson mural incline ------------------------------------
	var body := BoxMesh.new()
	body.size = Vector3(0.72, 1.02, 0.34)
	add_child(MeshBuilder.mesh_node("Body", body, frame_mat, Vector3(0, 1.1, 0)))

	var visor := BoxMesh.new()
	visor.size = Vector3(0.62, 0.44, 0.06)
	_screen_mat = MeshBuilder.emissive(Color(0.15, 0.75, 0.95), 1.4)
	_screen_mat.albedo_color = Color(0.05, 0.2, 0.28)
	add_child(MeshBuilder.mesh_node("Screen", visor, _screen_mat,
		Vector3(0, 1.42, -0.19)))

	var tray := BoxMesh.new()
	tray.size = Vector3(0.62, 0.05, 0.3)
	add_child(MeshBuilder.mesh_node("Tray", tray, trim_mat, Vector3(0, 0.78, -0.14)))

	var pillar := CylinderMesh.new()
	pillar.top_radius = 0.05
	pillar.bottom_radius = 0.06
	pillar.height = 0.75
	add_child(MeshBuilder.mesh_node("Pillar", pillar, frame_mat,
		Vector3(0, 0.38, 0.02)))

	# --- hologramme de fabrication ------------------------------------------
	_holo_mat = ShaderMaterial.new()
	_holo_mat.shader = HologramShader
	_holo_mat.set_shader_parameter("build_progress", 0.0)
	var holo_mesh := BoxMesh.new()
	holo_mesh.size = Vector3(0.2, 0.2, 0.2)
	_holo = MeshBuilder.mesh_node("Hologram", holo_mesh, _holo_mat,
		Vector3(0, 1.0, -0.16))
	_holo.visible = false
	add_child(_holo)

	_light = OmniLight3D.new()
	_light.light_color = Color(0.3, 0.9, 1.0)
	_light.light_energy = 0.0
	_light.omni_range = 3.2
	_light.position = Vector3(0, 1.15, -0.3)
	add_child(_light)

	var col := MeshBuilder.box_collider(Vector3(0.8, 1.6, 0.45), Vector3(0, 0.9, 0))
	add_child(col)

	_sparks = _build_sparks()
	add_child(_sparks)

func _build_sparks() -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.name = "Sparks"
	p.amount = 24
	p.lifetime = 0.7
	p.emitting = false
	p.position = Vector3(0.0, 1.42, -0.22)
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, -0.4, -1)
	mat.spread = 42.0
	mat.initial_velocity_min = 1.2
	mat.initial_velocity_max = 3.4
	mat.gravity = Vector3(0, -6.0, 0)
	mat.damping_min = 2.0
	mat.damping_max = 5.0
	mat.scale_min = 0.3
	mat.scale_max = 0.9
	p.process_material = mat
	var q := QuadMesh.new()
	q.size = Vector2(0.012, 0.05)
	var qm := StandardMaterial3D.new()
	qm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	qm.emission_enabled = true
	qm.emission = Color(1.0, 0.75, 0.35)
	qm.emission_energy_multiplier = 6.0
	qm.albedo_color = Color(1.0, 0.8, 0.4)
	qm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	q.material = qm
	p.draw_pass_1 = q
	return p

## Remet le fabricateur en service. Renvoie faux s'il fonctionnait deja.
func repair() -> bool:
	if powered:
		return false
	powered = true
	_sparks.emitting = false
	_screen_mat.emission = Color(0.15, 0.75, 0.95)
	_screen_mat.emission_energy_multiplier = 1.4
	_light.light_color = Color(0.3, 0.9, 1.0)
	SoundBank.play_at("craft_done", self, -6.0, 0.7)
	GameState.notify_success("Fabricateur remis en service")
	return true

func set_powered(value: bool) -> void:
	powered = value
	if not value:
		_sparks.emitting = true
		_screen_mat.emission = Color(0.6, 0.1, 0.05)
		_screen_mat.emission_energy_multiplier = 0.4
		_light.light_color = Color(1.0, 0.3, 0.1)

func interact(player: Node) -> void:
	if not powered:
		GameState.notify_warning(
			"Circuit rompu — utilisez l'outil de reparation (clic gauche)")
		SoundBank.play("ui_deny", -10.0)
		return
	if busy:
		GameState.notify_info("Fabrication en cours")
		return
	_player = player
	GameState.request_fabricator.emit(self)

## Lance la fabrication apres validation par l'interface.
func start_craft(recipe: Resource, player: Node) -> bool:
	if busy or recipe == null:
		return false
	if not player.inventory.has_all(recipe.ingredients):
		GameState.notify_warning("Materiaux manquants")
		SoundBank.play("ui_deny", -8.0)
		return false
	if not player.inventory.consume(recipe.ingredients):
		return false
	busy = true
	_recipe = recipe
	_player = player
	_progress = 0.0
	_holo.visible = true
	_holo_mat.set_shader_parameter("holo_color",
		ItemDB.item_color(recipe.output))
	_holo.mesh = _holo_mesh_for(recipe.output)
	if _loop_player == null:
		_loop_player = AudioStreamPlayer3D.new()
		_loop_player.stream = SoundBank.streams.get("craft_loop")
		_loop_player.unit_size = 4.0
		_loop_player.max_distance = 18.0
		add_child(_loop_player)
	_loop_player.play()
	craft_started.emit(recipe)
	return true

func _holo_mesh_for(id: StringName) -> Mesh:
	var item: Resource = ItemDB.get_item(id)
	var shape: int = 0 if item == null else int(item.shape)
	match shape:
		2:      # INGOT
			var b := BoxMesh.new()
			b.size = Vector3(0.24, 0.1, 0.14)
			return b
		1:      # CRYSTAL
			var pr := PrismMesh.new()
			pr.size = Vector3(0.16, 0.26, 0.16)
			return pr
		4, 7:   # CANISTER / BOTTLE
			var c := CapsuleMesh.new()
			c.radius = 0.07
			c.height = 0.28
			return c
		5:      # DEVICE
			var d := BoxMesh.new()
			d.size = Vector3(0.2, 0.16, 0.08)
			return d
		6:      # FISH
			var s := SphereMesh.new()
			s.radius = 0.09
			s.height = 0.18
			return s
	var g := SphereMesh.new()
	g.radius = 0.1
	g.height = 0.2
	return g

func _process(delta: float) -> void:
	if not powered:
		# court-circuit : la dalle clignote au rythme des etincelles
		_flicker = wrapf(_flicker + delta * 11.0, 0.0, TAU)
		var f: float = 0.25 + 0.75 * maxf(sin(_flicker) * sin(_flicker * 2.7), 0.0)
		_screen_mat.emission_energy_multiplier = f * 1.2
		_light.light_energy = f * 2.0
		return
	if not busy:
		if _light.light_energy > 0.01:
			_light.light_energy = lerpf(_light.light_energy, 0.0, delta * 4.0)
		return
	_progress += delta / maxf(_recipe.craft_time, 0.1)
	var t: float = clampf(_progress, 0.0, 1.0)
	_holo_mat.set_shader_parameter("build_progress", t)
	_holo.rotation.y += delta * 2.4
	_light.light_energy = lerpf(0.5, 3.5, sin(t * PI))
	_screen_mat.emission_energy_multiplier = lerpf(1.4, 4.0, sin(t * PI))

	if _progress >= 1.0:
		_finish()

func _finish() -> void:
	busy = false
	_holo.visible = false
	_holo_mat.set_shader_parameter("build_progress", 0.0)
	if _loop_player != null:
		_loop_player.stop()
	SoundBank.play_at("craft_done", self, -6.0)
	var output: StringName = _recipe.output
	var amount: int = _recipe.amount
	if _player != null and is_instance_valid(_player):
		var added: int = _player.inventory.add(output, amount)
		if added < amount:
			GameState.notify_warning("Inventaire plein : objet perdu")
		else:
			GameState.notify_success("Fabrique : %s" % ItemDB.item_name(output))
	craft_finished.emit(output, amount)
	_recipe = null

func get_prompt(_player: Node) -> String:
	if not powered:
		return "Fabricateur hors service — reparation requise"
	return "Fabrication en cours..." if busy else prompt
