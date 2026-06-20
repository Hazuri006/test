class_name RitualDial
extends Interactable
## One rotating symbol dial for the ritual puzzle. Cycles eye → spiral → broken
## circle. Reports its value to the parent RitualPuzzle.

const SYMBOLS: PackedStringArray = ["the Eye", "the Spiral", "the Broken Circle"]
const COLORS: Array[Color] = [Color(0.8, 0.65, 0.3), Color(0.4, 0.7, 0.45), Color(0.8, 0.3, 0.3)]

var value: int = 0
var _face: MeshInstance3D
var puzzle: Node = null

func _setup() -> void:
	prompt_verb = "Turn"
	_add_box(Vector3(0.5, 0.5, 0.3), MaterialLibrary.rusted_metal(), Vector3(0, 0.25, 0))
	_face = _add_box(Vector3(0.36, 0.36, 0.06), MaterialLibrary.get_emissive("dial_face_%d" % get_instance_id(), COLORS[0], 1.4), Vector3(0, 0.25, 0.16))
	_add_box_collision(Vector3(0.55, 0.6, 0.4), Vector3(0, 0.25, 0))
	_refresh()

func get_prompt() -> String:
	return "E — Turn dial (%s)" % SYMBOLS[value]

func _on_interact(_player: Node) -> void:
	value = (value + 1) % SYMBOLS.size()
	_refresh()
	AudioManager.play_at("metal", global_position, -8.0)
	GameManager.notify("Symbol set to %s." % SYMBOLS[value])

func _refresh() -> void:
	if _face != null:
		_face.material_override = MaterialLibrary.get_emissive("dial_face_%d" % get_instance_id(), COLORS[value], 1.4)
		_face.rotation.z = value * (TAU / 3.0)

func _capture_state() -> Variant:
	return value

func _restore_state(data: Variant) -> void:
	if data is int or data is float:
		value = int(data)
		_refresh()
