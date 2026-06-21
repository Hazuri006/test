class_name Lever
extends Interactable
## A switch / valve / breaker that sets a world flag and optionally advances a quest.
## Generic enough for light switches, security overrides and valves.

@export var flag_id: String = ""
@export var flag_value: bool = true
@export var success_message: String = ""
@export var quest_id: String = ""
@export var quest_step: String = ""
@export var requires_flag: String = ""
@export var requires_message: String = "It will not budge."
@export var verb: String = "Activate"
@export var handle_color: Color = Color(0.6, 0.1, 0.1)
## Optional item requirement (e.g. three access seals). Consumed when consume_required.
@export var required_item_id: String = ""
@export var required_item_count: int = 0
@export var consume_required: bool = false

var _handle: MeshInstance3D

func _setup() -> void:
	prompt_verb = verb
	var base: BoxMesh = BoxMesh.new()
	base.size = Vector3(0.3, 0.4, 0.12)
	var bmi: MeshInstance3D = MeshInstance3D.new()
	bmi.mesh = base
	bmi.material_override = MaterialLibrary.painted_metal()
	bmi.position = Vector3(0, 0, 0)
	add_child(bmi)

	var handle_mesh: BoxMesh = BoxMesh.new()
	handle_mesh.size = Vector3(0.06, 0.26, 0.06)
	_handle = MeshInstance3D.new()
	_handle.mesh = handle_mesh
	_handle.material_override = MaterialLibrary.get_material("lever_%s" % handle_color.to_html(false), handle_color, 0.4, 0.5)
	_handle.position = Vector3(0, 0.13, 0.1)
	add_child(_handle)
	_add_box_collision(Vector3(0.36, 0.5, 0.3), Vector3(0, 0, 0.05))

func can_interact(_player: Node) -> bool:
	if not enabled:
		return false
	if requires_flag != "" and not GameManager.get_flag_bool(requires_flag):
		return false
	if required_item_id != "" and required_item_count > 0 and not GameManager.inventory.has_item(required_item_id, required_item_count):
		return false
	return true

func get_prompt() -> String:
	if not can_interact(null):
		return requires_message
	return "E — %s" % verb

func _on_interact(_player: Node) -> void:
	if consume_required and required_item_id != "" and required_item_count > 0:
		GameManager.inventory.remove_item(required_item_id, required_item_count)
	if flag_id != "":
		GameManager.set_flag(flag_id, flag_value)
	if quest_id != "" and quest_step != "":
		QuestManager.complete_step(quest_id, quest_step)
	if success_message != "":
		GameManager.notify(success_message)
	AudioManager.play_at("metal", global_position, -5.0)
	if is_instance_valid(_handle):
		var tween: Tween = create_tween()
		tween.tween_property(_handle, "rotation:x", deg_to_rad(45.0), 0.25)
	enabled = false

func _on_interact_blocked(_player: Node) -> void:
	GameManager.notify(requires_message)
	AudioManager.play_at("deny", global_position, -6.0)
