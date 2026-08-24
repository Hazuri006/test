extends Node
## Test de fumee : charge la scene principale, laisse tourner quelques
## secondes de temps simule, puis verifie que le monde s'est reellement
## construit (terrain, gisements, joueur, houle, inventaire, craft, shaders).
##
## Lancement :
##   godot --headless --path . res://tests/smoke_test.tscn
## Code de sortie 0 si tout passe, 1 sinon.

const FRAMES := 240

var _frames := 0
var _main: Node = null
var _failures: Array[String] = []

func _ready() -> void:
	var packed: PackedScene = load("res://scenes/main.tscn")
	if packed == null:
		_fail("scenes/main.tscn introuvable")
		_report()
		get_tree().quit(1)
		return
	_main = packed.instantiate()
	add_child(_main)

func _process(_delta: float) -> void:
	_frames += 1
	if _frames < FRAMES:
		return
	set_process(false)
	_run_checks()
	_report()
	get_tree().quit(0 if _failures.is_empty() else 1)

func _run_checks() -> void:
	_check("scene principale instanciee", _main != null)
	if _main == null:
		return

	var player: Node = _main.get("player")
	_check("joueur present", player != null)
	var ocean: Node = _main.get("ocean")
	_check("ocean present", ocean != null)
	var terrain: Node = _main.get("terrain")
	_check("terrain present", terrain != null)
	var lifepod: Node = _main.get("lifepod")
	_check("capsule presente", lifepod != null)

	# --- houle : hauteur finie, et coherente entre deux appels --------------
	if ocean != null:
		var h: float = ocean.get_wave_height(12.0, -7.0)
		_check("hauteur de vague finie", is_finite(h))
		_check("hauteur de vague plausible", absf(h) < 20.0,
			"h = %f" % h)
		var n: Vector3 = ocean.get_wave_normal(12.0, -7.0)
		_check("normale de vague unitaire", absf(n.length() - 1.0) < 0.01)
		_check("normale de vague vers le haut", n.y > 0.5)

	# --- relief : le cratere doit descendre en s'eloignant ------------------
	var h_center: float = Biome.height(0.0, 0.0)
	var h_far: float = Biome.height(700.0, 0.0)
	_check("fond immerge au centre", h_center < -5.0, "h = %f" % h_center)
	_check("le fond s'enfonce au large", h_far < h_center - 50.0,
		"centre %f / large %f" % [h_center, h_far])
	var island: float = Biome.height(Biome.ISLAND_CENTER.x, Biome.ISLAND_CENTER.y)
	_check("ilot emerge", island > 5.0, "altitude %f" % island)

	# --- chunks de terrain generes ------------------------------------------
	if terrain != null:
		var chunks := 0
		for c in terrain.get_children():
			if c is MeshInstance3D:
				chunks += 1
		_check("chunks de terrain generes", chunks > 0, "%d chunks" % chunks)

		# Le sol sous les pieds du joueur doit exister en priorite : c'est lui
		# qui porte la collision et sans lui on tombe dans le vide.
		if player != null:
			var cs: float = terrain.chunk_size
			var here := Vector2i(floori(player.global_position.x / cs),
				floori(player.global_position.z / cs))
			var found := false
			for c in terrain.get_children():
				if c is MeshInstance3D \
						and c.name == "Chunk_%d_%d" % [here.x, here.y]:
					found = true
					break
			_check("chunk sous le joueur genere en priorite", found,
				"chunk %d,%d" % [here.x, here.y])

	# --- le fond doit reellement arreter le joueur ---------------------------
	# Un maillage concave n'est solide que d'un cote par defaut : sans le
	# reglage adequat, le fond marin est traverse sans rien heurter.
	var space := get_viewport().world_3d.direct_space_state
	var probe := Vector2(30.0, 26.0)
	var expected := Biome.height(probe.x, probe.y)
	var query := PhysicsRayQueryParameters3D.create(
		Vector3(probe.x, expected + 12.0, probe.y),
		Vector3(probe.x, expected - 25.0, probe.y))
	query.collision_mask = 1
	var hit: Dictionary = space.intersect_ray(query)
	_check("le fond marin est solide", not hit.is_empty())
	if not hit.is_empty():
		_check("collision alignee sur le relief",
			absf(hit["position"].y - expected) < 1.5,
			"collision %.2f / relief %.2f" % [hit["position"].y, expected])

	# --- gisements ------------------------------------------------------------
	var field: Node = _main.get("resources")
	if field != null:
		var nodes := field.get_children().filter(func(n): return n is ResourceNode)
		_check("gisements repartis", nodes.size() > 0, "%d gisements" % nodes.size())

	# --- base de donnees ------------------------------------------------------
	_check("objets charges", ItemDB.items.size() >= 30,
		"%d objets" % ItemDB.items.size())
	_check("recettes chargees", ItemDB.recipes.size() >= 20,
		"%d recettes" % ItemDB.recipes.size())
	for id in ItemDB.recipes:
		var recipe: Resource = ItemDB.recipes[id]
		_check("recette %s : sortie connue" % id, ItemDB.items.has(recipe.output))
		for ing in recipe.ingredients:
			_check("recette %s : ingredient %s connu" % [id, ing],
				ItemDB.items.has(ing))

	# --- inventaire et craft ---------------------------------------------------
	if player != null:
		var inv: Node = player.get("inventory")
		_check("inventaire present", inv != null)
		if inv != null:
			inv.add(&"quartz", 4)
			_check("ajout d'objet", inv.count(&"quartz") == 4,
				"compte = %d" % inv.count(&"quartz"))
			var recipe: Resource = ItemDB.get_recipe(&"glass")
			_check("ingredients disponibles", inv.has_all(recipe.ingredients))
			inv.consume(recipe.ingredients)
			_check("ingredients consommes", inv.count(&"quartz") == 2,
				"reste = %d" % inv.count(&"quartz"))
			inv.add(&"fins", 1)
			inv.equip(&"fins")
			_check("equipement pris en compte",
				player.stats.swim_speed_bonus > 0.0)

	# --- corps du joueur ------------------------------------------------------
	if player != null:
		var body: Node = player.get("body")
		_check("corps genere", body != null)
		if body != null and body.get("skeleton") != null:
			var skel: Skeleton3D = body.get("skeleton")
			_check("squelette complet", skel.get_bone_count() == 19,
				"%d os" % skel.get_bone_count())
			var mesh_node: MeshInstance3D = body.get("body_mesh")
			_check("maillage de peau genere",
				mesh_node != null and mesh_node.mesh != null
				and mesh_node.mesh.get_surface_count() > 0)
			var arrays: Array = mesh_node.mesh.surface_get_arrays(0)
			var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			_check("poids de peau presents",
				weights.size() == verts.size() * 4,
				"%d poids / %d sommets" % [weights.size(), verts.size()])

		# l'animateur doit etre branche, sinon le corps reste fige
		var anim: Node = player.get("animator")
		_check("animateur branche",
			anim != null and anim.get("skeleton") != null)
		if anim != null and anim.get("skeleton") != null:
			var skel2: Skeleton3D = anim.get("skeleton")
			var moved := false
			for i in skel2.get_bone_count():
				if skel2.get_bone_pose_rotation(i) != Quaternion.IDENTITY:
					moved = true
					break
			_check("le corps s'anime", moved)

	# --- sens d'enroulement de TOUS les maillages generes ---------------------
	# Godot tient pour face AVANT celle dont la normale calculee par la regle
	# de la main droite s'ECARTE de l'observateur : c'est l'inverse de la
	# convention OpenGL. Un maillage enroule "naturellement" est donc elimine
	# par le culling et devient purement et simplement invisible. L'invariant
	# a respecter est que cette normale geometrique soit toujours opposee a la
	# normale d'ombrage fournie.
	if _main != null:
		var meshes: Array = []
		var terrain_node: Node = _main.get("terrain")
		if terrain_node != null:
			for c in terrain_node.get_children():
				if c is MeshInstance3D and c.mesh != null:
					meshes.append(["terrain", c.mesh])
					break
		var ocean_node: Node = _main.get("ocean")
		if ocean_node != null:
			for c in ocean_node.get_children():
				if c is MeshInstance3D and c.mesh != null:
					meshes.append(["ocean/" + c.name, c.mesh])
		var flora_node: Node = _main.get("flora")
		if flora_node != null and flora_node.get("_kelp_mesh") != null:
			meshes.append(["algue", flora_node.get("_kelp_mesh")])
		if player != null and player.get("body") != null:
			var bm: MeshInstance3D = player.get("body").get("body_mesh")
			if bm != null and bm.mesh != null:
				meshes.append(["corps du joueur", bm.mesh])
		var pod: Node = _main.get("lifepod")
		if pod != null and pod.get("hull") != null:
			for c in (pod.get("hull") as Node).get_children():
				if c is MeshInstance3D and c.mesh != null \
						and c.name in ["Keel", "Barrel", "InnerLower", "Floor"]:
					meshes.append(["capsule/" + c.name, c.mesh])
		meshes.append(["poisson", FishSchool._get_mesh()])
		meshes.append(["gisement", ResourceNode._get_rock_mesh(0)])
		# Formes du recif : la sphere et le tube n'ont pas le meme ordre de
		# sommets, c'est exactement la ou l'erreur se glisse.
		meshes.append(["recif/dalle", ReefMeshes.rock_slab(1)])
		meshes.append(["recif/massif", ReefMeshes.coral_mound(2)])
		meshes.append(["recif/tube", ReefMeshes.tube_coral(3)])
		meshes.append(["recif/anemone", ReefMeshes.anemone(4)])
		meshes.append(["recif/eventail", ReefMeshes.sea_flower(5)])
		meshes.append(["recif/table", ReefMeshes.table_coral(6)])
		for entry in meshes:
			_check_winding(entry[0], entry[1])

	# --- sons synthetises -----------------------------------------------------
	_check("banque sonore generee", SoundBank.streams.size() >= 10,
		"%d sons" % SoundBank.streams.size())

	# --- shaders ---------------------------------------------------------------
	for path in ["res://shaders/ocean.gdshader", "res://shaders/sky.gdshader",
			"res://shaders/underwater_post.gdshader",
			"res://shaders/terrain.gdshader", "res://shaders/kelp.gdshader",
			"res://shaders/outcrop.gdshader", "res://shaders/fish.gdshader",
			"res://shaders/hologram.gdshader"]:
		var sh: Shader = load(path)
		_check("shader charge : %s" % path.get_file(), sh != null)
		_check("shader compile : %s" % path.get_file(),
			sh != null and sh.get_shader_uniform_list().size() > 0)

	# Le decor solide doit rester OPAQUE. Godot bascule dans la file
	# transparente tout shader qui affecte ALPHA ; un materiau transparent
	# n'ecrit plus la profondeur, et le post-traitement sous-marin, qui lit
	# le tampon de profondeur, prend alors ces pixels pour du vide a l'infini
	# et les noie entierement dans le brouillard. Le decor devenait invisible
	# des que la camera passait sous l'eau.
	for path in ["res://shaders/terrain.gdshader", "res://shaders/coral.gdshader",
			"res://shaders/kelp.gdshader", "res://shaders/outcrop.gdshader",
			"res://shaders/fish.gdshader"]:
		var src := FileAccess.get_file_as_string(path)
		_check("decor opaque (pas d'ALPHA) : %s" % path.get_file(),
			not src.contains("ALPHA ="))

## Verifie que l'enroulement d'un maillage s'accorde a ses normales.
func _check_winding(label: String, mesh: Mesh) -> void:
	if mesh.get_surface_count() == 0:
		return
	var arr: Array = mesh.surface_get_arrays(0)
	var vs: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var ns: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
	var ids: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
	if ns.is_empty() or ids.is_empty():
		return
	var wrong := 0
	var tested := 0
	for t in range(0, mini(ids.size(), 1800), 3):
		var av: Vector3 = vs[ids[t]]
		var bv: Vector3 = vs[ids[t + 1]]
		var cv: Vector3 = vs[ids[t + 2]]
		var geo: Vector3 = (bv - av).cross(cv - av)
		if geo.length_squared() < 1e-10:
			continue
		var n: Vector3 = (ns[ids[t]] + ns[ids[t + 1]] + ns[ids[t + 2]])
		if n.length_squared() < 1e-10:
			continue
		tested += 1
		if geo.normalized().dot(n.normalized()) > 0.05:
			wrong += 1
	if tested == 0:
		return
	_check("enroulement correct : %s" % label,
		wrong * 10 < tested, "%d / %d triangles a l'envers" % [wrong, tested])

func _check(label: String, ok: bool, detail: String = "") -> void:
	if ok:
		print("  [OK]   %s%s" % [label, "" if detail == "" else "  (%s)" % detail])
	else:
		_fail("%s%s" % [label, "" if detail == "" else "  (%s)" % detail])

func _fail(text: String) -> void:
	_failures.append(text)
	printerr("  [ECHEC] %s" % text)

func _report() -> void:
	print("")
	if _failures.is_empty():
		print("=== TEST DE FUMEE : SUCCES ===")
	else:
		print("=== TEST DE FUMEE : %d ECHEC(S) ===" % _failures.size())
		for f in _failures:
			print("  - %s" % f)
