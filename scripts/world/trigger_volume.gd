class_name TriggerVolume
extends Area3D
## An invisible volume that fires when the player enters: completes a quest step,
## sets a flag, shows a subtitle, raises an EventManager event, and/or runs a
## custom callback. Supports one-shot persistence via GameManager.world_state.

signal entered(player: Node)

@export var box_size: Vector3 = Vector3(4, 3, 4)
@export var quest_id: String = ""
@export var quest_step: String = ""
@export var flag_id: String = ""
@export var flag_value: bool = true
@export var subtitle: String = ""
@export var subtitle_time: float = 4.0
@export var event_id: String = ""
@export var once: bool = true
@export var persistent_id: String = ""

## Optional code-set callback invoked with the player on trigger.
var on_enter: Callable = Callable()
var _fired: bool = false

func _ready() -> void:
	collision_layer = 0
	collision_mask = GameTypes.LAYER_PLAYER
	monitoring = true
	var cs: CollisionShape3D = CollisionShape3D.new()
	var shape: BoxShape3D = BoxShape3D.new()
	shape.size = box_size
	cs.shape = shape
	add_child(cs)
	body_entered.connect(_on_body_entered)
	if persistent_id != "" and bool(GameManager.get_object_state(persistent_id, false)):
		_fired = true

func _on_body_entered(body: Node3D) -> void:
	if not (body is Player):
		return
	if _fired and once:
		return
	_fired = true
	if persistent_id != "":
		GameManager.set_object_state(persistent_id, true)
	if quest_id != "" and quest_step != "":
		QuestManager.complete_step(quest_id, quest_step)
	if flag_id != "":
		GameManager.set_flag(flag_id, flag_value)
	if subtitle != "":
		GameManager.show_subtitle(subtitle, subtitle_time)
	if event_id != "":
		EventManager.trigger_event(event_id, {"position": global_position}, 6.0, true)
	if on_enter.is_valid():
		on_enter.call(body)
	entered.emit(body)
