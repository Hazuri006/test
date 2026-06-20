class_name InspectClue
extends Interactable
## A small environmental object the player can pick up and rotate in front of the
## camera. Can reveal a subtitle line, record evidence, or open a document.

@export var label: String = "An object."
@export var evidence_id: String = ""
@export var document_id: String = ""
@export var mesh_kind: String = "box"
@export var tint: Color = Color(0.6, 0.6, 0.6)

func _setup() -> void:
	prompt_verb = "Examine"
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = _build_mesh()
	mi.material_override = MaterialLibrary.get_material("clue_%s" % tint.to_html(false), tint, 0.6, 0.1)
	mi.position = Vector3(0, 0.1, 0)
	add_child(mi)
	_add_box_collision(Vector3(0.3, 0.3, 0.3), Vector3(0, 0.15, 0))

func _build_mesh() -> Mesh:
	match mesh_kind:
		"sphere":
			var s: SphereMesh = SphereMesh.new()
			s.radius = 0.1
			s.height = 0.2
			return s
		"vial":
			var c: CylinderMesh = CylinderMesh.new()
			c.top_radius = 0.04
			c.bottom_radius = 0.05
			c.height = 0.22
			return c
		_:
			var b: BoxMesh = BoxMesh.new()
			b.size = Vector3(0.16, 0.16, 0.16)
			return b

func _on_interact(player: Node) -> void:
	if player is Player:
		(player as Player).begin_inspection(_build_mesh(), label)
	else:
		GameManager.show_subtitle(label, 4.0)
	if evidence_id != "":
		GameManager.add_evidence(evidence_id)
	if document_id != "":
		GameManager.show_document(document_id)
