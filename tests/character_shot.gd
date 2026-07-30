extends Node
## Renders the hero and a crook on a neutral backdrop, front and three-quarter,
## so the figures can be checked without generating the whole city.
##   xvfb-run -a godot --rendering-driver opengl3 --path . res://tests/character_shot.tscn

func _ready() -> void:
	var env := WorldEnvironment.new()
	env.set_script(load("res://scripts/systems/graphics_env.gd"))
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-42, 35, 0)
	sun.light_energy = 1.6
	sun.shadow_enabled = true
	add_child(sun)

	var ground := MeshInstance3D.new()
	ground.mesh = BrickKit.unit_box()
	ground.scale = Vector3(40, 1, 40)
	ground.position = Vector3(0, -0.5, 0)
	ground.material_override = BrickKit.brick(Color(0.62, 0.62, 0.6), true, 0.5)
	add_child(ground)

	# Hero, facing -Z (towards the camera placed at -Z).
	var hero := Node3D.new()
	add_child(hero)
	hero.position = Vector3(-0.7, 0, 0)
	PlayerRig.new().build(hero)

	# Crook, same construction.
	var crook := Node3D.new()
	add_child(crook)
	crook.position = Vector3(0.9, 0, 0)
	EnemyRig.new().build(crook, {
		"suit": Color(0.32, 0.34, 0.42), "trim": Color(0.18, 0.19, 0.24),
		"skin": Color(0.90, 0.74, 0.52), "accent": Color(0.78, 0.42, 0.16)}, 1.0)

	var cam := Camera3D.new()
	cam.fov = 40.0
	add_child(cam)
	cam.current = true

	for shot in [{"pos": Vector3(0, 1.0, -3.4), "name": "hero_front.png"},
			{"pos": Vector3(2.6, 1.6, -2.6), "name": "hero_three_quarter.png"},
			{"pos": Vector3(0, 1.0, 3.4), "name": "hero_back.png"}]:
		cam.global_position = shot["pos"]
		cam.look_at(Vector3(0.1, 0.9, 0), Vector3.UP)
		for i in 8:
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("user://%s" % shot["name"])
		print("wrote ", shot["name"])
	get_tree().quit()
