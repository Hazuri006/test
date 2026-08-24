extends Node
var _main: Node
var _n := 0
func _ready() -> void:
	_main = load("res://scenes/main.tscn").instantiate()
	add_child(_main)
func _process(_d: float) -> void:
	_n += 1
	if _n < 90: return
	set_process(false)
	var ocean: Node = _main.get("ocean")
	var pod: Node3D = (_main.get("lifepod") as Node).get("hull")
	print("coque y = %.2f   vague y = %.2f" % [pod.global_position.y,
		ocean.call("get_wave_height", pod.global_position.x, pod.global_position.z)])
	print("--- relief autour de l'origine ---")
	for p in [Vector2(0, 0), Vector2(6, 6), Vector2(12, 12), Vector2(20, 20),
			Vector2(-10, 8), Vector2(30, 26)]:
		print("  (%5.0f,%5.0f) fond = %7.2f" % [p.x, p.y, Biome.height(p.x, p.y)])
	print("--- ocean ---")
	var near: Node3D = ocean.get_node_or_null("NearSurface")
	print("  noeud Ocean y = %.2f   NearSurface visible = %s"
		% [(ocean as Node3D).global_position.y,
			str(near != null and near.is_visible_in_tree())])
	get_tree().quit()
