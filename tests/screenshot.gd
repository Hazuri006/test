extends Node
## Screenshot harness -- renders a few frames of the real scenes and writes PNGs.
##
## Run with a display (or Xvfb) and the compatibility renderer:
##   xvfb-run -a godot --rendering-driver opengl3 --path . res://tests/screenshot.tscn
##
## Files land in the user data directory (printed on start). Handy for eyeballing
## the city, the hero and the lighting without a desktop session.

const SHOTS := [
	{"scene": "res://scenes/ui/main_menu.tscn", "wait": 90, "name": "menu.png"},
	{"scene": "res://scenes/world/game_world.tscn", "wait": 420, "name": "city.png"},
	{"scene": "res://scenes/world/game_world.tscn", "wait": 420, "name": "skyline.png",
		"camera": Vector3(-40, 190, 330), "look_at": Vector3(0, 40, 0)},
	{"scene": "res://scenes/world/game_world.tscn", "wait": 420, "name": "street.png",
		"camera": Vector3(-87, 9, -40), "look_at": Vector3(-20, 30, 40)},
]

func _ready() -> void:
	print("screenshot dir: ", OS.get_user_data_dir())
	for shot in SHOTS:
		var scene := load(shot["scene"]) as PackedScene
		if scene == null:
			continue
		var instance := scene.instantiate()
		if instance.has_method("set"):
			instance.set("show_loading", false)
		add_child(instance)
		for i in int(shot["wait"]):
			await get_tree().process_frame
		# Optional fixed vantage point, so a shot never depends on where the
		# gameplay camera happens to be.
		if shot.has("camera"):
			var cam := Camera3D.new()
			cam.far = 2000.0
			cam.fov = 62.0
			add_child(cam)
			cam.global_position = shot["camera"]
			cam.look_at(shot["look_at"], Vector3.UP)
			cam.current = true
			for i in 4:
				await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		var path := "user://%s" % shot["name"]
		image.save_png(path)
		print("wrote ", ProjectSettings.globalize_path(path))
		instance.queue_free()
		await get_tree().process_frame
	get_tree().quit()
