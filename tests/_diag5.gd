extends Node
var _main: Node
var _n := 0
func _ready() -> void:
	_main = load("res://scenes/main.tscn").instantiate()
	add_child(_main)
func _process(_d: float) -> void:
	_n += 1
	if _n < 100: return
	set_process(false)
	var player: Node = _main.get("player")
	player.set_physics_process(false)
	player.set_process(false)
	var pod: Node3D = (_main.get("lifepod") as Node).get("hull")
	var cam_pos: Vector3 = pod.global_position + Vector3(8.0, 0.8, 8.0)
	var yaw := 0.79
	print("camera en %s (coque a %s)" % [cam_pos, pod.global_position])
	var space := get_viewport().world_3d.direct_space_state
	for elev: float in [-35.0, -25.0, -15.0, -8.0, -3.0]:
		var b := Basis.from_euler(Vector3(deg_to_rad(elev), yaw, 0.0))
		var dir: Vector3 = b * Vector3(0, 0, -1)
		var q := PhysicsRayQueryParameters3D.create(cam_pos, cam_pos + dir * 300.0)
		q.collision_mask = 0xFFFFFFFF
		var hit: Dictionary = space.intersect_ray(q)
		if hit.is_empty():
			print("  %+5.1f deg : rien" % elev)
		else:
			var n: Node = hit["collider"]
			print("  %+5.1f deg : %-28s a %6.1f m, y=%7.2f"
				% [elev, n.get_parent().name + "/" + n.name,
					cam_pos.distance_to(hit["position"]), hit["position"].y])
	# ou est la surface de l'eau juste devant ?
	var ocean: Node = _main.get("ocean")
	print("ocean node = %s" % str((ocean as Node3D).global_position))
	for d: float in [3.0, 8.0, 20.0]:
		var p: Vector3 = cam_pos + Vector3(-sin(yaw), 0, -cos(yaw)) * d
		print("  a %4.1f m : vague y = %6.2f   fond y = %7.2f"
			% [d, ocean.call("get_wave_height", p.x, p.z), Biome.height(p.x, p.z)])
	get_tree().quit()
