extends CanvasLayer
## Transition (autoload)
##
## Full-screen fade used for every scene change plus a lightweight loading label.
## Also owns the "letterbox" bars that slide in during cutscenes, which is what
## makes the boss intro and the bank-heist reveal feel cinematic.
##
## Scene requirements: none (autoload; builds its own Control nodes).

var _fade: ColorRect
var _label: Label
var _bar_top: ColorRect
var _bar_bottom: ColorRect
var _busy: bool = false

func _ready() -> void:
	layer = 128
	process_mode = Node.PROCESS_MODE_ALWAYS

	_fade = ColorRect.new()
	_fade.color = Color(0.02, 0.02, 0.04, 1.0)
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.modulate.a = 0.0
	add_child(_fade)

	_label = Label.new()
	_label.text = ""
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	_label.offset_top = 140
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.modulate = Color(0.85, 0.9, 1.0, 0.0)
	add_child(_label)

	_bar_top = _make_bar(true)
	_bar_bottom = _make_bar(false)

func _make_bar(top: bool) -> ColorRect:
	var bar := ColorRect.new()
	bar.color = Color(0, 0, 0, 1)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if top:
		bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
		bar.offset_bottom = 0.0
	else:
		bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
		bar.offset_top = 0.0
	add_child(bar)
	return bar

# =============================================================================
#  FADES
# =============================================================================

func fade_out(duration: float = 0.4) -> void:
	var t := create_tween()
	t.tween_property(_fade, "modulate:a", 1.0, duration)
	await t.finished

func fade_in(duration: float = 0.5) -> void:
	var t := create_tween()
	t.tween_property(_fade, "modulate:a", 0.0, duration)
	await t.finished

func flash(color: Color = Color(1, 1, 1, 1), duration: float = 0.25) -> void:
	var rect := ColorRect.new()
	rect.color = color
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(rect)
	var t := create_tween()
	t.tween_property(rect, "modulate:a", 0.0, duration)
	t.tween_callback(rect.queue_free)

## Fade to black, swap scenes, fade back in. Safe against double clicks.
func change_scene(path: String, message: String = "") -> void:
	if _busy:
		return
	_busy = true
	_label.text = message
	if message != "":
		create_tween().tween_property(_label, "modulate:a", 1.0, 0.3)
	await fade_out(0.35)
	# One idle frame so the fade is definitely on screen before the hitch.
	await get_tree().process_frame
	var err := get_tree().change_scene_to_file(path)
	if err != OK:
		push_error("Transition: could not load scene %s (error %d)" % [path, err])
	await get_tree().process_frame
	await get_tree().process_frame
	create_tween().tween_property(_label, "modulate:a", 0.0, 0.2)
	await fade_in(0.5)
	_busy = false

# =============================================================================
#  CINEMATIC BARS
# =============================================================================

func cinematic_bars(active: bool, duration: float = 0.5) -> void:
	var target: float = 90.0 if active else 0.0
	var t := create_tween().set_parallel(true)
	t.tween_property(_bar_top, "offset_bottom", target, duration)
	t.tween_property(_bar_bottom, "offset_top", -target, duration)
