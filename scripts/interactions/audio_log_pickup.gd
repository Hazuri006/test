class_name AudioLogPickup
extends Interactable
## A playable recording device in the world. Opens the audio-log player (timed
## transcript), records evidence and can advance a quest.

@export var audio_log_id: String = ""
@export var quest_id: String = ""
@export var quest_step: String = ""
## Optional flag that must be set before this recording can be played.
@export var requires_flag: String = ""
@export var locked_message: String = "It's locked away."

func _setup() -> void:
	prompt_verb = "Play"
	var body: BoxMesh = BoxMesh.new()
	body.size = Vector3(0.12, 0.04, 0.2)
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = body
	mi.material_override = MaterialLibrary.get_material("recorder", Color(0.12, 0.12, 0.14), 0.5, 0.2)
	mi.position = Vector3(0, 0.04, 0)
	add_child(mi)
	var led: BoxMesh = BoxMesh.new()
	led.size = Vector3(0.02, 0.02, 0.02)
	var lmi: MeshInstance3D = MeshInstance3D.new()
	lmi.mesh = led
	lmi.material_override = MaterialLibrary.get_emissive("recorder_led", Color(0.9, 0.1, 0.1), 2.0)
	lmi.position = Vector3(0.04, 0.07, 0.07)
	add_child(lmi)
	_add_box_collision(Vector3(0.24, 0.2, 0.3), Vector3(0, 0.1, 0))

func can_interact(_player: Node) -> bool:
	if not enabled:
		return false
	return requires_flag == "" or GameManager.get_flag_bool(requires_flag)

func get_prompt() -> String:
	if not can_interact(null):
		return locked_message
	var log_data: AudioLogData = AudioLogDatabase.get_log(audio_log_id)
	var t: String = log_data.title if log_data != null else "recording"
	return "E — Play %s" % t

func _on_interact(_player: Node) -> void:
	GameManager.show_audio_log(audio_log_id)
	if quest_id != "" and quest_step != "":
		QuestManager.complete_step(quest_id, quest_step)
