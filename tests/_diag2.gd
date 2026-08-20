extends Node
var _main: Node
var _n := 0
func _ready() -> void:
	_main = load("res://scenes/main.tscn").instantiate()
	add_child(_main)
func _process(_d: float) -> void:
	_n += 1
	if _n < 150: return
	set_process(false)
	var player: Node = _main.get("player")
	player.set_physics_process(false)
	player.set_process(false)
	var cam: Camera3D = player.get("camera")
	cam.top_level = true
	cam.global_position = Vector3(30.0, -9.5, 26.0)
	cam.global_rotation = Vector3(-0.42, 0.9, 0.0)
	await _wait(60)
	cam.global_position = Vector3(30.0, -9.5, 26.0)
	cam.global_rotation = Vector3(-0.42, 0.9, 0.0)

	print("camera : pos=%s rot=%s fov=%.1f near=%.3f keep=%d"
		% [cam.global_position, cam.global_rotation, cam.fov, cam.near,
			cam.keep_aspect])
	var terrain: Node = _main.get("terrain")
	for name_str in ["Chunk_0_0", "Chunk_-1_0", "Chunk_0_-1", "Chunk_-1_-1"]:
		var c: MeshInstance3D = terrain.get_node_or_null(name_str)
		if c == null:
			print("%s : ABSENT" % name_str)
			continue
		var m: ArrayMesh = c.mesh
		var idx := 0
		if m != null and m.get_surface_count() > 0:
			idx = m.surface_get_arrays(0)[Mesh.ARRAY_INDEX].size()
		print("%s : visible=%s surfaces=%d indices=%d aabb=%s pos=%s"
			% [name_str, c.is_visible_in_tree(),
				0 if m == null else m.get_surface_count(), idx,
				c.get_aabb(), c.position])

	# rendu de controle : terrain blanc, post-traitement et brouillard coupes
	var wm: WorldManager = _main.get("world_manager")


	DirAccess.make_dir_recursive_absolute("/tmp/shots")
	await _snap("verif_fond")

	cam.global_position = Vector3(0.0, 6.0, -14.0)
	cam.global_rotation = Vector3(-0.06, 0.5, 0.0)
	await _snap("verif_surface")

	var pod: Node3D = (_main.get("lifepod") as Node).get("hull")
	cam.global_position = pod.global_position + Vector3(0.0, 1.25, 1.1)
	cam.global_rotation = Vector3(-0.12, 0.0, 0.0)
	await _snap("verif_capsule")
	get_tree().quit()

func _snap(name_str: String) -> void:
	await _wait(6)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/shots/%s.png" % name_str)
	print("  %s.png ecrit" % name_str)
func _wait(f: int) -> void:
	for i in f:
		await get_tree().process_frame
