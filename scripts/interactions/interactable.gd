class_name Interactable
extends StaticBody3D
## Base class for every interactable object. It is a StaticBody3D placed on the
## Interactable physics layer so the player's interaction ray can detect it
## directly (collider is Interactable). Optionally it also occupies the World
## layer so it blocks movement (doors, crates). Subclasses override `_on_interact`.
##
## Persistent objects (persistent_id set) save/restore a small state Variant via
## GameManager.world_state, so picked-up items / opened doors survive save+reload
## and level revisits.

signal interacted(player: Node)
signal state_restored()

@export var prompt_verb: String = "Use"
@export var enabled: bool = true
## Also blocks player/monster movement (adds the World layer).
@export var blocks_movement: bool = false
## When true the interactable disables itself after a single successful use.
@export var one_shot: bool = false
## Unique id for save persistence. Leave empty for non-persistent objects.
@export var persistent_id: String = ""
## Optional requirement message shown when can_interact() is false (e.g. needs key).
@export var locked_prompt: String = ""

var _used: bool = false

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = GameTypes.LAYER_INTERACTABLE
	if blocks_movement:
		collision_layer |= GameTypes.LAYER_WORLD
	# Interactables do not need to detect collisions themselves.
	collision_mask = 0
	input_ray_pickable = true
	_setup()
	if persistent_id != "":
		var saved: Variant = GameManager.get_object_state(persistent_id, null)
		if saved != null:
			_restore_state(saved)
			state_restored.emit()

## Subclasses build their meshes/shapes here.
func _setup() -> void:
	pass

## Returns the contextual prompt string, e.g. "E — Open". Subclasses may override
## get_verb() for dynamic verbs.
func get_prompt() -> String:
	if not can_interact(null) and locked_prompt != "":
		return locked_prompt
	return "E — %s" % get_verb()

func get_verb() -> String:
	return prompt_verb

## Whether the player may interact right now. Subclasses extend (e.g. key checks).
func can_interact(_player: Node) -> bool:
	return enabled and not (_used and one_shot)

## Entry point called by the player. Handles one-shot bookkeeping then dispatches.
func interact(player: Node) -> void:
	if not can_interact(player):
		_on_interact_blocked(player)
		return
	_used = true
	_on_interact(player)
	interacted.emit(player)
	if one_shot:
		enabled = false
	_save_state()

## Main behaviour hook. Subclasses override this.
func _on_interact(_player: Node) -> void:
	pass

## Called when interaction is attempted but not allowed (e.g. locked door).
func _on_interact_blocked(_player: Node) -> void:
	if locked_prompt != "":
		GameManager.notify(locked_prompt)
		AudioManager.play_at("deny", global_position, -6.0)

# --- Persistence helpers -----------------------------------------------------

func _save_state() -> void:
	if persistent_id != "":
		GameManager.set_object_state(persistent_id, _capture_state())

## Subclasses return a serialisable snapshot (bool/int/float/String/Dictionary).
func _capture_state() -> Variant:
	return _used

## Subclasses apply a snapshot produced by _capture_state().
func _restore_state(data: Variant) -> void:
	if data is bool:
		_used = data as bool
		if _used and one_shot:
			enabled = false

# --- Small build helpers shared by subclasses --------------------------------

func _add_box(size: Vector3, mat: Material, offset: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = size
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = offset
	add_child(mi)
	return mi

func _add_box_collision(size: Vector3, offset: Vector3 = Vector3.ZERO) -> CollisionShape3D:
	var shape: BoxShape3D = BoxShape3D.new()
	shape.size = size
	var cs: CollisionShape3D = CollisionShape3D.new()
	cs.shape = shape
	cs.position = offset
	add_child(cs)
	return cs
