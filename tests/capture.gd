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
	await _wait(150)                      # chargement du terrain et des textures

	var pod: Node3D = _main.get("lifepod")

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

	# 5. La foret d'algues
	await _shot("05_algues", Vector3(120.0, -18.0, 60.0), Vector3(-0.1, 2.2, 0.0), 40)

	# 6. Interieur de la capsule : fabricateur
	await _shot("06_capsule", pod.global_position + Vector3(0.0, 1.6, 0.9),
		Vector3(-0.08, 0.0, 0.0), 40)

	# 7. Le joueur en vue exterieure, en train de nager
	if _player != null:
		_player.global_position = Vector3(24.0, -8.0, 18.0)
		_player.set("pitch", -0.35)
		_player.velocity = Vector3(0, 0, -3.0)
		await _wait(30)
	await _shot("07_nageur", Vector3(26.5, -7.4, 21.0), Vector3(-0.1, 3.6, 0.0), 30)

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
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png("%s/%s.png" % [OUT_DIR, name_str])
	print("  capture : %s" % name_str)

func _find_camera() -> Camera3D:
	return get_viewport().get_camera_3d()

func _wait(frames: int) -> void:
	for i in frames:
		await get_tree().process_frame
