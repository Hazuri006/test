extends Control
## Developer performance + AI overlay (section 24). Hidden by default; toggled with
## F3 by Main. Shows FPS, frame time, node/object counts, draw calls, the active
## graphics preset and the monster's AI state. Never shown in normal play.

var _label: RichTextLabel
var _accum: float = 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	var panel: PanelContainer = PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _box())
	panel.position = Vector2(-360, 16)
	panel.custom_minimum_size = Vector2(340, 0)
	add_child(panel)
	_label = RichTextLabel.new()
	_label.bbcode_enabled = true
	_label.fit_content = true
	_label.custom_minimum_size = Vector2(320, 0)
	_label.add_theme_font_size_override("normal_font_size", 14)
	panel.add_child(_label)

func _process(delta: float) -> void:
	if not visible:
		return
	_accum += delta
	if _accum < 0.2:
		return
	_accum = 0.0
	_label.text = _gather()

func _gather() -> String:
	var fps: float = Performance.get_monitor(Performance.TIME_FPS)
	var frame_ms: float = Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	var phys_ms: float = Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
	var nodes: int = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	var objects: int = int(Performance.get_monitor(Performance.OBJECT_COUNT))
	var draw_calls: int = int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var prims: int = int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
	var mem_mb: float = Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0
	var preset: String = SettingsManager.get_string("graphics", "preset")
	var level: String = GameManager.current_level_id
	var ai: String = _monster_debug()

	var color: String = "#7ec77e" if fps >= 58.0 else ("#d8c24a" if fps >= 45.0 else "#d05050")
	var out: String = "[b]THE LAST WARD — DEBUG[/b]\n"
	out += "[color=%s]FPS: %d  (%.2f ms)[/color]\n" % [color, int(round(fps)), frame_ms]
	out += "Physics: %.2f ms\n" % phys_ms
	out += "Draw calls: %d\nPrimitives: %d\n" % [draw_calls, prims]
	out += "Nodes: %d   Objects: %d\n" % [nodes, objects]
	out += "Static mem: %.1f MB\n" % mem_mb
	out += "Preset: %s   Level: %s\n" % [preset, level]
	out += "[color=#c79b5a]Monster: %s[/color]\n" % ai
	out += "[color=#666666]F3 overlay · F4 AI gizmos[/color]"
	return out

func _monster_debug() -> String:
	for m: Node in get_tree().get_nodes_in_group("monster"):
		if m.has_method("get_debug_summary"):
			return str(m.call("get_debug_summary"))
	return "—"

func _box() -> StyleBoxFlat:
	var box: StyleBoxFlat = StyleBoxFlat.new()
	box.bg_color = Color(0.0, 0.0, 0.0, 0.7)
	box.set_corner_radius_all(3)
	box.set_content_margin_all(10.0)
	return box
