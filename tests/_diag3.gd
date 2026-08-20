extends Node
var _main: Node
var _n := 0
func _ready() -> void:
	_main = load("res://scenes/main.tscn").instantiate()
	add_child(_main)
func _process(_d: float) -> void:
	_n += 1
	if _n < 120: return
	set_process(false)
	var player: Node = _main.get("player")
	player.set_physics_process(false)
	player.set_process(false)
	var cam: Camera3D = player.get("camera")
	cam.top_level = true
	cam.global_position = Vector3(24.0, -6.0, 18.0)
	await _wait(20)
	var wm: WorldManager = _main.get("world_manager")
	var wm: WorldManager = _main.get("world_manager")
	print("submersion %.2f  masque %s" % [wm.submersion,
		str(wm.post_material.get_shader_parameter("mask_strength"))])
	DirAccess.make_dir_recursive_absolute("/tmp/shots")

	await _snap(cam, "q1_fond", Vector3(30.0, -9.5, 26.0), Vector3(-0.42, 0.9, 0.0))
	await _snap(cam, "q2_haut", Vector3(24.0, -6.0, 18.0), Vector3(0.85, 1.2, 0.0))
	await _snap(cam, "q3_recif", Vector3(-46.0, -10.5, 34.0), Vector3(-0.16, -0.9, 0.0))
	var pod: Node3D = (_main.get("lifepod") as Node).get("hull")
	await _snap(cam, "q4_capsule", pod.global_position + Vector3(7.5, 0.4, 7.5),
		Vector3(0.06, 0.79, 0.0))
	await _snap(cam, "q5_surface", Vector3(0.0, 6.0, -14.0), Vector3(-0.06, 0.5, 0.0))
	get_tree().quit()

func _snap(cam: Camera3D, name_str: String, pos: Vector3, rot: Vector3) -> void:
	cam.global_position = pos
	cam.global_rotation = rot
	await _wait(26)
	cam.global_position = pos
	cam.global_rotation = rot
	await _wait(2)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/shots/%s.png" % name_str)
	print("  %s" % name_str)

func _wait(f: int) -> void:
	for i in f:
		await get_tree().process_frame
