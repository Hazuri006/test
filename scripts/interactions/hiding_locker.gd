class_name HidingLocker
extends Interactable
## A tall metal locker the player can hide inside. Closes its door, hides the player
## from the monster's vision, and can be searched (and opened) by the monster.

@export var locker_color: Color = Color(0.20, 0.30, 0.32)

var _occupied: bool = false
var _door_pivot: Node3D
var _door_open: bool = true

func _setup() -> void:
	blocks_movement = true
	collision_layer |= GameTypes.LAYER_HIDEABLE
	prompt_verb = "Hide"
	add_to_group("hiding_spot")

	var mat: StandardMaterial3D = MaterialLibrary.get_material("locker_%s" % locker_color.to_html(false), locker_color, 0.5, 0.6)
	# Body shell (back + sides) built from thin boxes so there is an interior.
	_add_box(Vector3(0.7, 1.9, 0.05), mat, Vector3(0, 0.95, -0.28))
	_add_box(Vector3(0.05, 1.9, 0.6), mat, Vector3(-0.34, 0.95, 0))
	_add_box(Vector3(0.05, 1.9, 0.6), mat, Vector3(0.34, 0.95, 0))
	_add_box(Vector3(0.7, 0.05, 0.6), mat, Vector3(0, 1.9, 0))
	_add_box(Vector3(0.7, 0.05, 0.6), mat, Vector3(0, 0.02, 0))

	_door_pivot = Node3D.new()
	_door_pivot.position = Vector3(-0.34, 0.0, 0.28)
	add_child(_door_pivot)
	var door: MeshInstance3D = MeshInstance3D.new()
	var dm: BoxMesh = BoxMesh.new()
	dm.size = Vector3(0.68, 1.86, 0.04)
	door.mesh = dm
	door.material_override = mat
	door.position = Vector3(0.34, 0.95, 0)
	_door_pivot.add_child(door)

	# Solid outer collision so you cannot walk through the locker.
	_add_box_collision(Vector3(0.74, 1.9, 0.62), Vector3(0, 0.95, 0))

func get_verb() -> String:
	return "Leave" if _occupied else "Hide"

func _on_interact(player: Node) -> void:
	if _occupied:
		exit(player)
	else:
		_enter(player)

func _enter(player: Node) -> void:
	if not (player is Player):
		return
	_occupied = true
	_animate_door(false)
	(player as Player).enter_hiding(self, global_position)
	AudioManager.play_at("door", global_position, -8.0)

func exit(player: Node) -> void:
	if not (player is Player):
		return
	_occupied = false
	_animate_door(true)
	var exit_point: Vector3 = global_position + global_transform.basis * Vector3(0, 0, 0.9)
	exit_point.y = global_position.y
	(player as Player).exit_hiding(exit_point)
	AudioManager.play_at("door", global_position, -8.0)

func _animate_door(open: bool) -> void:
	_door_open = open
	var tween: Tween = create_tween()
	tween.tween_property(_door_pivot, "rotation:y", 0.0 if open else deg_to_rad(85.0), 0.4)

func is_occupied() -> bool:
	return _occupied

## Called by the monster when it searches this locker. Returns true if the player
## was inside (the monster then reveals and attacks them).
func search() -> bool:
	_animate_door(true)
	AudioManager.play_at("metal", global_position, -2.0)
	return _occupied
