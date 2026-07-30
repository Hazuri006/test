extends Node

func _ready() -> void:
	var scene := load("res://scenes/world/game_world.tscn") as PackedScene
	var world: Node3D = scene.instantiate()
	world.set("show_loading", false)
	add_child(world)
	var waited := 0.0
	while GameState.get_player() == null and waited < 60.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
	for i in 120:
		await get_tree().physics_frame

	var city: Node3D = GameState.city
	var total := 0
	var mmi_count := 0
	for block in city.call("all_blocks"):
		for child in (block as Node3D).get_children():
			if child is MultiMeshInstance3D:
				mmi_count += 1
				total += (child as MultiMeshInstance3D).multimesh.instance_count
	print("blocks=", (city.get("blocks") as Dictionary).size(), " multimeshes=", mmi_count, " instances=", total)

	var first: Node3D = city.call("all_blocks")[0]
	print("block pos=", first.global_position, " visible=", first.visible)
	for child in first.get_children():
		if child is MultiMeshInstance3D:
			var m := child as MultiMeshInstance3D
			print("  ", m.name, " count=", m.multimesh.instance_count,
				" aabb=", m.get_aabb(), " visible=", m.visible,
				" range_end=", m.visibility_range_end, " layers=", m.layers)
			if m.multimesh.instance_count > 0:
				print("     xform0=", m.multimesh.get_instance_transform(0))
	var player := GameState.get_player()
	print("player=", player.global_position)
	var cam: Camera3D = player.get_node("CameraRig/Yaw/Pitch/SpringArm3D/ShakeRoot/Camera3D")
	print("camera=", cam.global_position, " fwd=", -cam.global_transform.basis.z, " far=", cam.far, " current=", cam.current)
	print("ground child count=", city.get_child_count())

	# What does the gameplay camera actually see straight ahead?
	var space := (player as CharacterBody3D).get_world_3d().direct_space_state
	var from := cam.global_position
	var to := from - cam.global_transform.basis.z * 400.0
	var q := PhysicsRayQueryParameters3D.create(from, to, 0xFFFFFFFF)
	var hit := space.intersect_ray(q)
	print("camera ray hit=", hit.get("position", "nothing"), " collider=",
		(hit["collider"].name if hit.has("collider") else "-"))
	var down := PhysicsRayQueryParameters3D.create(from, from + Vector3.DOWN * 400.0, 0xFFFFFFFF)
	var hit2 := space.intersect_ray(down)
	print("camera down hit=", hit2.get("position", "nothing"), " collider=",
		(hit2["collider"].name if hit2.has("collider") else "-"))
	print("spring length=", player.get_node("CameraRig/Yaw/Pitch/SpringArm3D").spring_length,
		" cam local=", cam.position, " rig pos=", player.get_node("CameraRig").global_position)
	get_tree().quit()
