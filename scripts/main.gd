extends Node
## Bootstrap root (run_main_scene). Builds the persistent layer structure in code
## — world host, HUD/menu/debug/transition CanvasLayers and the fade rect — then
## hands references to GameManager which drives everything else. Also owns the few
## truly global inputs (pause toggle, debug overlay) so they work in any state.

const DEBUG_OVERLAY_SCENE: String = "res://scenes/UI/DebugOverlay.tscn"

var _world_host: Node3D
var _hud_layer: CanvasLayer
var _menu_layer: CanvasLayer
var _debug_layer: CanvasLayer
var _fade: ColorRect
var _debug_overlay: Control

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

	_world_host = Node3D.new()
	_world_host.name = "WorldHost"
	add_child(_world_host)

	_hud_layer = CanvasLayer.new()
	_hud_layer.name = "HUDLayer"
	_hud_layer.layer = 2
	add_child(_hud_layer)

	_menu_layer = CanvasLayer.new()
	_menu_layer.name = "MenuLayer"
	_menu_layer.layer = 5
	add_child(_menu_layer)

	_debug_layer = CanvasLayer.new()
	_debug_layer.name = "DebugLayer"
	_debug_layer.layer = 8
	add_child(_debug_layer)

	var transition_layer: CanvasLayer = CanvasLayer.new()
	transition_layer.name = "TransitionLayer"
	transition_layer.layer = 12
	add_child(transition_layer)

	_fade = ColorRect.new()
	_fade.name = "Fade"
	_fade.color = Color(0, 0, 0, 0)
	_fade.anchor_right = 1.0
	_fade.anchor_bottom = 1.0
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.visible = false
	transition_layer.add_child(_fade)

	_setup_debug_overlay()
	GameManager.bind_main(_world_host, _menu_layer, _hud_layer, _fade)

func _setup_debug_overlay() -> void:
	if not ResourceLoader.exists(DEBUG_OVERLAY_SCENE):
		return
	var packed: PackedScene = ResourceLoader.load(DEBUG_OVERLAY_SCENE) as PackedScene
	_debug_overlay = packed.instantiate() as Control
	_debug_overlay.visible = false
	_debug_layer.add_child(_debug_overlay)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if GameManager.state == GameTypes.GameState.PLAYING or GameManager.state == GameTypes.GameState.PAUSED:
			GameManager.toggle_pause()
			get_viewport().set_input_as_handled()
	elif event.is_action_pressed("debug_overlay"):
		if is_instance_valid(_debug_overlay):
			_debug_overlay.visible = not _debug_overlay.visible
			GameLog.debug_enabled = _debug_overlay.visible
	elif event.is_action_pressed("debug_ai"):
		_toggle_ai_debug()

func _toggle_ai_debug() -> void:
	var monsters: Array[Node] = get_tree().get_nodes_in_group("monster")
	for m: Node in monsters:
		if m.has_method("toggle_debug"):
			m.call("toggle_debug")
