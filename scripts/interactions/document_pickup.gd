class_name DocumentPickup
extends Interactable
## A readable document in the world. Opens the document reader, records evidence,
## and optionally advances a quest. Stays in the world so it can be re-read; the
## journal also keeps a copy.

@export var document_id: String = ""
@export var quest_id: String = ""
@export var quest_step: String = ""

func _setup() -> void:
	prompt_verb = "Read"
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = Vector3(0.24, 0.02, 0.32)
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = MaterialLibrary.get_material("paper", Color(0.78, 0.75, 0.66), 0.9, 0.0, false)
	mi.position = Vector3(0, 0.03, 0)
	mi.rotation.y = randf_range(-0.4, 0.4)
	add_child(mi)
	_add_box_collision(Vector3(0.34, 0.2, 0.4), Vector3(0, 0.1, 0))

func get_prompt() -> String:
	var doc: DocumentData = DocumentDatabase.get_doc(document_id)
	var t: String = doc.title if doc != null else "document"
	return "E — Read %s" % t

func _on_interact(_player: Node) -> void:
	GameManager.show_document(document_id)
	if quest_id != "" and quest_step != "":
		QuestManager.complete_step(quest_id, quest_step)
	AudioManager.play_at("page", global_position, -8.0)
