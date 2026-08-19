extends Interactable
class_name StorageLocker

## Casier de rangement de la capsule : un inventaire secondaire.

@export var capacity: int = 12
var slots: Array[Dictionary] = []

func _ready() -> void:
	super()
	prompt = "Ouvrir le casier"
	slots.resize(capacity)
	for i in capacity:
		slots[i] = {}
	_build()

func _build() -> void:
	var mat := MeshBuilder.metal(Color(0.2, 0.23, 0.27), 0.45, 0.6)
	var door_mat := MeshBuilder.metal(Color(0.28, 0.32, 0.36), 0.35, 0.7)
	var box := BoxMesh.new()
	box.size = Vector3(0.62, 0.72, 0.36)
	add_child(MeshBuilder.mesh_node("Body", box, mat, Vector3(0, 0.36, 0)))
	var door := BoxMesh.new()
	door.size = Vector3(0.56, 0.62, 0.04)
	add_child(MeshBuilder.mesh_node("Door", door, door_mat, Vector3(0, 0.38, -0.19)))
	var handle := BoxMesh.new()
	handle.size = Vector3(0.2, 0.03, 0.03)
	add_child(MeshBuilder.mesh_node("Handle", handle,
		MeshBuilder.emissive(Color(0.9, 0.55, 0.15), 0.6), Vector3(0, 0.38, -0.23)))
	add_child(MeshBuilder.box_collider(Vector3(0.66, 0.76, 0.4), Vector3(0, 0.38, 0)))

func interact(_player: Node) -> void:
	SoundBank.play("ui_click", -12.0)
	GameState.request_storage.emit(self)

## Remplit le casier au demarrage.
func fill(contents: Dictionary) -> void:
	for id in contents:
		add(id, contents[id])

func is_empty() -> bool:
	for s in slots:
		if not s.is_empty():
			return false
	return true

func add(id: StringName, amount: int) -> int:
	var item: Resource = ItemDB.get_item(id)
	if item == null:
		return 0
	var left := amount
	for i in slots.size():
		if left <= 0:
			break
		var s: Dictionary = slots[i]
		if s.is_empty():
			var take: int = mini(item.stack_size, left)
			slots[i] = {"id": id, "amount": take}
			left -= take
		elif s["id"] == id and s["amount"] < item.stack_size:
			var take2: int = mini(item.stack_size - s["amount"], left)
			s["amount"] += take2
			left -= take2
	return amount - left

func take(index: int) -> Dictionary:
	if index < 0 or index >= slots.size() or slots[index].is_empty():
		return {}
	var s: Dictionary = slots[index]
	slots[index] = {}
	return s
