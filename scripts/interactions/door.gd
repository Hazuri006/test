class_name Door
extends Interactable
## A hinged door. The visual panel swings on a pivot; the blocking collision is
## simply toggled disabled when fully open (robust, no moving static collision).
## Opening/closing emits a noise event the monster can hear.

@export var open_angle_deg: float = -95.0
@export var swing_time: float = 0.6
@export var start_open: bool = false
@export var door_color: Color = Color(0.30, 0.22, 0.14)

var _open: bool = false
var pivot: Node3D
var _door_collision: CollisionShape3D
var _tween: Tween

func _setup() -> void:
	blocks_movement = true
	prompt_verb = "Open"

	pivot = Node3D.new()
	add_child(pivot)

	var panel: BoxMesh = BoxMesh.new()
	panel.size = Vector3(0.92, 2.04, 0.07)
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = panel
	mi.material_override = MaterialLibrary.get_material("door_%s" % door_color.to_html(false), door_color, 0.7, 0.05)
	mi.position = Vector3(0.46, 1.02, 0.0)
	pivot.add_child(mi)

	var handle: BoxMesh = BoxMesh.new()
	handle.size = Vector3(0.08, 0.08, 0.16)
	var hmi: MeshInstance3D = MeshInstance3D.new()
	hmi.mesh = handle
	hmi.material_override = MaterialLibrary.rusted_metal()
	hmi.position = Vector3(0.82, 1.0, 0.08)
	pivot.add_child(hmi)

	var shape: BoxShape3D = BoxShape3D.new()
	shape.size = Vector3(0.92, 2.04, 0.09)
	_door_collision = CollisionShape3D.new()
	_door_collision.shape = shape
	_door_collision.position = Vector3(0.46, 1.02, 0.0)
	add_child(_door_collision)

	if start_open:
		_apply_open_instant(true)

func get_verb() -> String:
	return "Close" if _open else "Open"

func _on_interact(_player: Node) -> void:
	set_open(not _open)

## Opens/closes with a swing animation and a heard noise.
func set_open(value: bool) -> void:
	if _open == value:
		return
	_open = value
	if is_instance_valid(_tween):
		_tween.kill()
	_tween = create_tween()
	var target: float = deg_to_rad(open_angle_deg) if _open else 0.0
	_tween.tween_property(pivot, "rotation:y", target, swing_time).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	# Collision is removed only once fully open so you cannot clip through mid-swing.
	if _open:
		_tween.tween_callback(_set_collision_enabled.bind(false))
	else:
		_set_collision_enabled(true)
	AudioManager.play_at("door", global_position, -5.0)
	get_tree().call_group("monster", "hear_noise", global_position, 0.55)

func _set_collision_enabled(enabled: bool) -> void:
	if is_instance_valid(_door_collision):
		_door_collision.set_deferred("disabled", not enabled)

func _apply_open_instant(value: bool) -> void:
	_open = value
	pivot.rotation.y = deg_to_rad(open_angle_deg) if value else 0.0
	_set_collision_enabled(not value)

## Used by the monster to barge through.
func force_open() -> void:
	if not _open:
		set_open(true)

func is_open() -> bool:
	return _open

func _capture_state() -> Variant:
	return _open

func _restore_state(data: Variant) -> void:
	if data is bool:
		_apply_open_instant(data as bool)
