class_name PickupItem
extends Interactable
## A collectable world item. Adds an item to the inventory, optionally completes a
## quest step and records evidence, then removes itself. Persists "collected" so it
## stays gone across save/reload and level revisits.

@export var item_id: String = ""
@export var amount: int = 1
@export var quest_id: String = ""
@export var quest_step: String = ""
@export var evidence_id: String = ""
## Optional override label; otherwise uses the item's display name.
@export var custom_label: String = ""

var _collected: bool = false

func _setup() -> void:
	prompt_verb = "Pick up"
	_build_visual()

func _build_visual() -> void:
	var data: ItemData = ItemDatabase.get_item(item_id)
	var color: Color = data.icon_color if data != null else Color(0.8, 0.8, 0.6)
	var category: int = data.category if data != null else GameTypes.ItemCategory.TOOL
	var mat: StandardMaterial3D = MaterialLibrary.get_emissive("pickup_%s" % item_id, color, 0.6)
	var mesh: Mesh = _mesh_for_category(category)
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = Vector3(0, 0.12, 0)
	add_child(mi)
	_add_box_collision(Vector3(0.4, 0.4, 0.4), Vector3(0, 0.2, 0))
	# Gentle hover so pickups read as interactable.
	var tween: Tween = create_tween().set_loops()
	tween.tween_property(mi, "position:y", 0.22, 1.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(mi, "position:y", 0.12, 1.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var spin: Tween = create_tween().set_loops()
	spin.tween_property(mi, "rotation:y", TAU, 6.0)

func _mesh_for_category(category: int) -> Mesh:
	match category:
		GameTypes.ItemCategory.KEY:
			var key: BoxMesh = BoxMesh.new()
			key.size = Vector3(0.06, 0.06, 0.26)
			return key
		GameTypes.ItemCategory.BATTERY, GameTypes.ItemCategory.FUSE:
			var cyl: CylinderMesh = CylinderMesh.new()
			cyl.top_radius = 0.07
			cyl.bottom_radius = 0.07
			cyl.height = 0.2
			return cyl
		GameTypes.ItemCategory.DOCUMENT:
			var doc: BoxMesh = BoxMesh.new()
			doc.size = Vector3(0.22, 0.02, 0.3)
			return doc
		_:
			var box: BoxMesh = BoxMesh.new()
			box.size = Vector3(0.18, 0.18, 0.18)
			return box

func get_prompt() -> String:
	if custom_label != "":
		return "E — %s" % custom_label
	var data: ItemData = ItemDatabase.get_item(item_id)
	var label: String = data.display_name if data != null else item_id
	return "E — Take %s" % label

func _on_interact(_player: Node) -> void:
	if item_id != "" and ItemDatabase.has(item_id):
		GameManager.inventory.add_item(item_id, amount)
		var data: ItemData = ItemDatabase.get_item(item_id)
		GameManager.notify("Picked up: %s" % data.display_name)
	if quest_id != "" and quest_step != "":
		QuestManager.complete_step(quest_id, quest_step)
	if evidence_id != "":
		GameManager.add_evidence(evidence_id)
	AudioManager.play_at("pickup", global_position, -4.0)
	_collected = true
	queue_free()

func _capture_state() -> Variant:
	return _collected

func _restore_state(data: Variant) -> void:
	if data is bool and (data as bool):
		_collected = true
		call_deferred("queue_free")
