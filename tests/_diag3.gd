extends Node
## Apercu rapide multi-vues (outil de developpement jetable).
var _main: Node
var _n := 0

func _ready() -> void:
	_main = load("res://scenes/main.tscn").instantiate()
	add_child(_main)

func _process(_d: float) -> void:
	_n += 1
	if _n < 70:
		return
	set_process(false)
	_run()

func _run() -> void:
	var player: Node = _main.get("player")
	player.set_physics_process(false)
	player.set_process(false)
	var wm: WorldManager = _main.get("world_manager")
	wm.time_scale_enabled = false
	GameState.time_of_day = 0.36
	var cam: Camera3D = player.get("camera")
	cam.top_level = true
	cam.cull_mask = 0xFFFFF
	await _wait(20)
	DirAccess.make_dir_recursive_absolute("/tmp/shots")
	await _snap(cam, "q1_fond", Vector3(30.0, -9.5, 26.0), Vector3(-0.42, 0.9, 0.0))
	await _snap(cam, "q2_recif", Vector3(-46.0, -10.5, 34.0), Vector3(-0.16, -0.9, 0.0))
	await _snap(cam, "q3_haut", Vector3(24.0, -6.0, 18.0), Vector3(0.85, 1.2, 0.0))
	var pod: Node3D = (_main.get("lifepod") as Node).get("hull")
	await _snap(cam, "q4_capsule", pod.global_position + Vector3(8.0, 0.8, 8.0),
		Vector3(0.02, 0.79, 0.0))
	# Diagnostic : ou la surface de l'eau est-elle reellement dessinee ?
	var ocean: Node = _main.get("ocean")
	(ocean.get("material") as ShaderMaterial).set_shader_parameter("debug_flat", 1.0)
	await _snap(cam, "q5_ocean_aplat", pod.global_position + Vector3(8.0, 0.8, 8.0),
		Vector3(0.02, 0.79, 0.0))
	get_tree().quit()

func _snap(cam: Camera3D, name_str: String, pos: Vector3, rot: Vector3) -> void:
	cam.global_position = pos
	cam.global_rotation = rot
	await _wait(14)
	cam.global_position = pos
	cam.global_rotation = rot
	await _wait(2)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/shots/%s.png" % name_str)
	print("  %s" % name_str)

func _wait(f: int) -> void:
	for i in f:
		await get_tree().process_frame
