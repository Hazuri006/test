extends Node
## Capture d'images de reference (outil de developpement).
##
##   godot --path . --rendering-driver vulkan --resolution 960x540 \
##         res://tests/capture.tscn
##
## Place successivement la camera a plusieurs endroits caracteristiques et
## enregistre un PNG pour chacun, afin de controler le rendu sans avoir a
## lancer le jeu a la main.

const OUT_DIR := "/tmp/shots"

var _main: Node
var _player: Node3D

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(OUT_DIR)
	_main = load("res://scenes/main.tscn").instantiate()
	add_child(_main)
	_run.call_deferred()

func _run() -> void:
	_player = _main.get("player")
	# Le controleur du joueur repositionne sa camera a chaque image : on le
	# gele, sinon la camera revient se coller sur lui pendant la pose.
	if _player != null:
		_player.set_physics_process(false)
		_player.set_process(false)
	var wm: WorldManager = _main.get("world_manager")
	if wm != null:
		wm.time_scale_enabled = false
	GameState.time_of_day = 0.36          # matinee : soleil bas mais franc
	await _wait(150)                      # chargement du terrain et des textures

	var pod_root: Node3D = _main.get("lifepod")
	# c'est la coque qui flotte, pas le noeud racine de la capsule
	var pod: Node3D = pod_root.get("hull")

	# 1. Depuis la capsule, vers l'horizon : ciel, houle, ecume
	await _shot("01_surface", pod.global_position + Vector3(0.0, 6.0, -14.0),
		Vector3(-0.06, 0.5, 0.0), 60)

	# 2. Vue rasante au ras de l'eau : ligne de flottaison
	await _shot("02_ligne_eau", pod.global_position + Vector3(-8.0, 0.05, -8.0),
		Vector3(0.02, 2.4, 0.0), 40)

	# 3. Sous l'eau, regard vers la surface : fenetre de Snell et rais de lumiere
	await _shot("03_sous_surface", Vector3(24.0, -6.0, 18.0),
		Vector3(0.85, 1.2, 0.0), 40)

	# 4. Le fond marin : caustiques, sable, roche
	await _shot("04_fond", Vector3(30.0, -9.5, 26.0), Vector3(-0.42, 0.9, 0.0), 40)

	# 4b. Meme vue, ombres coupees : plan de controle pour distinguer une
	#     acne d'ombrage d'un defaut de geometrie.
	if wm != null and wm.get("sun") != null:
		wm.sun.shadow_enabled = false
		await _shot("04b_fond_sans_ombres", Vector3(30.0, -9.5, 26.0),
			Vector3(-0.42, 0.9, 0.0), 12)
		wm.sun.shadow_enabled = true

	# 4c. Terrain repeint en blanc plat : si le sol proche apparait, la
	#     geometrie et la visibilite sont saines et le probleme est dans
	#     l'ombrage ; s'il reste sombre, c'est qu'il n'est pas dessine.
	var terrain: Node = _main.get("terrain")
	var flat := StandardMaterial3D.new()
	flat.albedo_color = Color(1, 1, 1)
	flat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var saved: Array = []
	for c in terrain.get_children():
		if c is MeshInstance3D:
			saved.append([c, c.material_override])
			c.material_override = flat
	await _shot("04c_fond_blanc", Vector3(30.0, -9.5, 26.0),
		Vector3(-0.42, 0.9, 0.0), 12)
	for entry in saved:
		entry[0].material_override = entry[1]

	# 5. La foret d'algues
	await _shot("05_algues", Vector3(120.0, -18.0, 60.0), Vector3(-0.1, 2.2, 0.0), 40)

	# 6. Interieur de la capsule : fabricateur
	# hauteur d'yeux d'un joueur debout sur le plancher, sous le hublot
	await _shot("06_capsule", pod.global_position + Vector3(0.0, 1.25, 1.1),
		Vector3(-0.12, 0.0, 0.0), 40)

	# 7. Le joueur en vue exterieure, en train de nager
	if _player != null:
		_player.global_position = Vector3(24.0, -8.0, 18.0)
		_player.set("pitch", -0.35)
		_player.velocity = Vector3(0.0, 0.0, -3.0)
		_player.call("set_third_person", true)
		# on relance juste l'animation du corps, pas le deplacement
		var anim: Node = _player.get("animator")
		if anim != null:
			for i in 40:
				anim.call("update", 0.05, 1, 0.8, 0.0, -0.35, 0.1, false, false)
	# la camera se place devant le nageur et regarde vers lui
	var swim_pos := Vector3(24.0, -8.0, 18.0)
	var cam_pos := swim_pos + Vector3(2.4, 0.9, 2.4)
	var to_player := (swim_pos + Vector3(0, 1.1, 0)) - cam_pos
	await _shot("07_nageur", cam_pos,
		Vector3(asin(clampf(to_player.normalized().y, -1.0, 1.0)),
			atan2(-to_player.x, -to_player.z), 0.0), 30)

	print("Captures enregistrees dans %s" % OUT_DIR)
	get_tree().quit()

func _shot(name_str: String, pos: Vector3, rot: Vector3, frames: int) -> void:
	var cam: Camera3D = _find_camera()
	if cam == null:
		return
	# on detache la camera de la hierarchie du joueur le temps de la prise
	cam.top_level = true
	cam.global_position = pos
	cam.global_rotation = rot
	await _wait(frames)
	# la houle a bouge pendant l'attente : on se replace exactement
	cam.global_position = pos
	cam.global_rotation = rot
	await _wait(2)
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png("%s/%s.png" % [OUT_DIR, name_str])
	print("  capture : %s" % name_str)

func _find_camera() -> Camera3D:
	return get_viewport().get_camera_3d()

func _wait(frames: int) -> void:
	for i in frames:
		await get_tree().process_frame
