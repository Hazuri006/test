class_name HospitalAssets
extends RefCounted
## Spawns individual pieces from the imported modular hospital GLB
## (res://assets/environment/hospital_pack.glb). The pack is instanced once into a
## cached template; each spawn duplicates a named piece (shared meshes, cheap),
## re-centres it at the holder origin and places it. Visual décor by default — the
## blockout still owns collision/navigation, so mis-oriented pieces never trap the
## player. Returns null (no-op) if the pack is absent, so the game still runs.

const PACK_PATH: String = "res://assets/environment/hospital_pack.glb"

static var _template: Node = null
static var _pieces: Dictionary = {}
static var _checked: bool = false

static func available() -> bool:
	_ensure()
	return not _pieces.is_empty()

static func _ensure() -> void:
	if _checked:
		return
	_checked = true
	if not ResourceLoader.exists(PACK_PATH):
		return
	var packed: PackedScene = ResourceLoader.load(PACK_PATH) as PackedScene
	if packed == null:
		return
	_template = packed.instantiate()
	var root: Node = _template.find_child("RootNode", true, false)
	if root == null:
		root = _template
	for child: Node in root.get_children():
		_pieces[child.name] = child

## Spawns a named piece under `parent`. Returns the holder Node3D (or null).
static func spawn(parent: Node, piece: String, pos: Vector3, yaw_deg: float = 0.0, scale: float = 1.0) -> Node3D:
	_ensure()
	if not _pieces.has(piece):
		return null
	var src: Node = _pieces[piece]
	var dup: Node = src.duplicate()
	if dup is Node3D:
		(dup as Node3D).transform = Transform3D.IDENTITY
	var holder: Node3D = Node3D.new()
	holder.position = pos
	holder.rotation.y = deg_to_rad(yaw_deg)
	holder.scale = Vector3(scale, scale, scale)
	holder.add_child(dup)
	parent.add_child(holder)
	return holder

## Spawns the first available piece whose name starts with any of `prefixes`.
static func spawn_any(parent: Node, prefixes: Array, pos: Vector3, yaw_deg: float = 0.0, scale: float = 1.0) -> Node3D:
	_ensure()
	for prefix: Variant in prefixes:
		for name_key: Variant in _pieces.keys():
			if str(name_key).begins_with(str(prefix)):
				return spawn(parent, str(name_key), pos, yaw_deg, scale)
	return null
