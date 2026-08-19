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
