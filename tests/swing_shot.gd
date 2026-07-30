extends Node
## Renders the hero mid-swing from the side, to check that the web strand really
## starts at the hand and that the figure faces its direction of travel.

func _ready() -> void:
	var world: Node3D = (load("res://scenes/world/game_world.tscn") as PackedScene).instantiate()
	world.set("show_loading", false)
	add_child(world)
	var waited := 0.0
	while GameState.get_player() == null and waited < 60.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
	for i in 40:
		await get_tree().physics_frame

	var player := GameState.get_player() as CharacterBody3D
	var rig: Node3D = player.get_node("CameraRig")
	var web: Node3D = player.get_node("WebSystem")

	# Shot 0: running, seen from the gameplay camera (checks facing + strafe).
	player.global_position = CityLayout.intersection_center(3, 3) + Vector3(0, 2.0, 0)
	player.velocity = Vector3.ZERO
	rig.call("set_look", 200.0, -8.0)
	for i in 30:
		await get_tree().physics_frame
	Input.action_press("move_forward")
	Input.action_press("sprint")
	for i in 50:
		await get_tree().physics_frame
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://run_behind.png")
	print("wrote run_behind.png")
	Input.action_release("move_forward")
	Input.action_release("sprint")

	var cam := Camera3D.new()
	cam.fov = 55.0
	cam.far = 1200.0
	add_child(cam)
	cam.current = true

	player.global_position = CityLayout.intersection_center(4, 4) + Vector3(0, 16.0, 0)
	player.velocity = Vector3(0, 2.0, -14.0)
	for i in 20:
		await get_tree().physics_frame
		player.velocity = Vector3(0, 2.0, -14.0)
		player.global_position = CityLayout.intersection_center(4, 4) + Vector3(0, 16.0, 0)
	var attached := false
	for yaw in [0.0, 90.0, 180.0, 270.0, 45.0, 135.0, 225.0, 315.0]:
		rig.call("set_look", yaw, 34.0)
		for i in 8:
			await get_tree().physics_frame
			player.velocity = Vector3(0, 2.0, -14.0)
			player.global_position = CityLayout.intersection_center(4, 4) + Vector3(0, 16.0, 0)
		web.call("update_aim")
		if bool(web.get("aim_valid")) and bool(player.call("try_web_swing")):
			attached = true
			break
	print("attached=", attached)

	for shot in range(3):
		for i in 22:
			await get_tree().physics_frame
		# Frame the hero from the side so the strand and the hand are both visible.
		var side: Vector3 = player.velocity.normalized().cross(Vector3.UP).normalized()
		cam.global_position = player.global_position + side * 9.0 + Vector3(0, 2.5, 0)
		cam.look_at(player.global_position + Vector3(0, 0.9, 0), Vector3.UP)
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("user://swing_%d.png" % shot)
		print("wrote swing_%d.png  state=%d  attached=%s" % [shot, int(player.get("state")),
				bool(web.get("is_attached"))])
	get_tree().quit()
