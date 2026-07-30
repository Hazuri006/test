extends Node
func _ready() -> void:
	RenderingServer.viewport_set_use_occlusion_culling(get_viewport().get_viewport_rid(), false)
	var scene := load("res://scenes/world/game_world.tscn") as PackedScene
	var w: Node3D = scene.instantiate()
	w.set("show_loading", false)
	add_child(w)
	var waited := 0.0
	while GameState.get_player() == null and waited < 60.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
	for i in 120:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://probe_noocclusion.png")
	print("wrote probe_noocclusion.png")

	var player := GameState.get_player()
	var cam: Camera3D = player.get_node("CameraRig/Yaw/Pitch/SpringArm3D/ShakeRoot/Camera3D")
	print("player=", player.global_position, " cam=", cam.global_position)
	var city: Node3D = GameState.city
	var blocks: Array = city.call("all_blocks")
	print("blocks=", blocks.size())
	for b in blocks.slice(0, 3):
		var block := b as Node3D
		var st := block.get_node_or_null("Structure") as MultiMeshInstance3D
		if st == null:
			continue
		print(block.name, " gpos=", block.global_position, " count=", st.multimesh.instance_count,
			" custom_aabb=", st.custom_aabb, " aabb=", st.get_aabb(),
			" gaabb_center=", block.global_position + st.get_aabb().get_center(),
			" visible_in_tree=", st.is_visible_in_tree())
	# nearest block to the camera
	var nearest: Node3D = null
	var best := 1e9
	for b in blocks:
		var d: float = (b as Node3D).global_position.distance_to(cam.global_position)
		if d < best:
			best = d
			nearest = b
	print("nearest block=", nearest.name, " at ", nearest.global_position, " dist=", best)
	var st2 := nearest.get_node_or_null("Structure") as MultiMeshInstance3D
	print("  nearest structure aabb=", st2.get_aabb(), " custom=", st2.custom_aabb,
		" visible=", st2.is_visible_in_tree(), " layers=", st2.layers,
		" in frustum=", cam.is_position_in_frustum(nearest.global_position + Vector3(0, 20, 0)))
	var space := (player as CharacterBody3D).get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(cam.global_position + Vector3(0, 6, 0),
		cam.global_position + Vector3(0, 6, 0) - cam.global_transform.basis.z * 300.0, 1)
	var hit := space.intersect_ray(q)
	print("horizontal ray hit=", hit.get("position", "nothing"), " collider=",
		(hit["collider"].get_parent().name if hit.has("collider") else "-"))
	get_tree().quit()
