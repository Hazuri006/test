class_name PlayerRig
extends RefCounted
## PlayerRig -- builds the hero "Web Hero" out of shared brick primitives.
##
## There is no imported character model in this project: the figure is assembled
## at runtime from boxes, cylinders and spheres, using an ORIGINAL design --
## crimson suit, deep-blue limbs, angular white eye plates and a diamond-spark
## chest emblem. Nothing here is traced from an existing character.
##
## The builder returns:
##   bones  : name -> Node3D   (joint nodes, safe to rotate)
##   paths  : name -> String   (NodePath prefix relative to the rig's parent,
##                              consumed by PlayerAnimator to author tracks)
##
## Joint layout (metres, rig origin at the feet):
##   Hips 0.92 -> Chest +0.16 -> Head +0.56
##   Arms: shoulder +-0.34 / +0.42, upper 0.34, forearm 0.32
##   Legs: hip +-0.17, thigh 0.46, shin 0.44
##
## Scene requirements: a Node3D to parent the rig to (Player/Visual).

const SUIT_RED := Color(0.84, 0.11, 0.15)
const SUIT_BLUE := Color(0.09, 0.22, 0.66)
const SUIT_DARK := Color(0.05, 0.07, 0.16)
const TRIM_WHITE := Color(0.95, 0.97, 1.0)
const EMBLEM_BLUE := Color(0.20, 0.55, 1.0)

# Joint offsets, exposed so gameplay code (IK-ish arm aiming) can reason about them.
const HIP_HEIGHT := 0.92
const CHEST_OFFSET := 0.16
const HEAD_OFFSET := 0.56
const SHOULDER_X := 0.34
const SHOULDER_Y := 0.42
const UPPER_ARM := 0.34
const FOREARM := 0.32
const HIP_X := 0.17
const THIGH := 0.46
const SHIN := 0.44

var bones: Dictionary = {}
var paths: Dictionary = {}
var root: Node3D

## Builds the figure under `parent` and returns self for chaining.
func build(parent: Node3D) -> PlayerRig:
	var red := BrickKit.brick(SUIT_RED, true, 0.22)
	var blue := BrickKit.brick(SUIT_BLUE, true, 0.22)
	var dark := BrickKit.brick(SUIT_DARK, false, 0.3)
	var white := BrickKit.brick(TRIM_WHITE, false, 0.12)
	var emblem := BrickKit.neon(EMBLEM_BLUE, 1.1)

	root = _joint(parent, "Rig", Vector3.ZERO, "")

	# --- pelvis -------------------------------------------------------------
	var hips := _joint(root, "Hips", Vector3(0, HIP_HEIGHT, 0), "Rig")
	BrickKit.add_box(hips, Vector3(0.52, 0.26, 0.34), Vector3(0, -0.05, 0), blue, "HipMesh")
	# Utility belt: a thin band of accent bricks, an original silhouette touch.
	BrickKit.add_box(hips, Vector3(0.56, 0.07, 0.38), Vector3(0, 0.06, 0), dark, "Belt")

	# --- chest --------------------------------------------------------------
	var chest := _joint(hips, "Chest", Vector3(0, CHEST_OFFSET, 0), "Rig/Hips")
	BrickKit.add_box(chest, Vector3(0.60, 0.56, 0.36), Vector3(0, 0.26, 0), red, "ChestMesh")
	BrickKit.add_box(chest, Vector3(0.62, 0.14, 0.38), Vector3(0, 0.50, 0), red, "Collar")
	# Blue shoulder yoke -> reads instantly as a two-tone hero suit.
	BrickKit.add_box(chest, Vector3(0.64, 0.12, 0.40), Vector3(0, 0.44, 0), blue, "Yoke")
	# Original emblem: a diamond spark with two crossing struts.
	var em := _joint(chest, "Emblem", Vector3(0, 0.28, 0.19), "Rig/Hips/Chest")
	var d1 := BrickKit.add_box(em, Vector3(0.17, 0.17, 0.03), Vector3.ZERO, emblem, "Diamond")
	d1.rotation.z = PI * 0.25
	var s1 := BrickKit.add_box(em, Vector3(0.30, 0.035, 0.025), Vector3.ZERO, white, "StrutA")
	s1.rotation.z = PI * 0.25
	var s2 := BrickKit.add_box(em, Vector3(0.30, 0.035, 0.025), Vector3.ZERO, white, "StrutB")
	s2.rotation.z = -PI * 0.25

	# --- head ---------------------------------------------------------------
	var head := _joint(chest, "Head", Vector3(0, HEAD_OFFSET, 0), "Rig/Hips/Chest")
	BrickKit.add_box(head, Vector3(0.40, 0.40, 0.40), Vector3(0, 0.02, 0), red, "HeadMesh")
	# Slightly domed crown so the head is not a plain cube.
	BrickKit.add_shape(head, BrickKit.unit_sphere(8, 14), Vector3(0.40, 0.22, 0.40),
			Vector3(0, 0.19, 0), red, "Crown")
	# Angular white eye plates -- large, expressive, original shape.
	for side in [-1.0, 1.0]:
		var eye := BrickKit.add_box(head, Vector3(0.15, 0.11, 0.03),
				Vector3(0.10 * side, 0.04, 0.205), white, "Eye%s" % ("L" if side < 0 else "R"))
		eye.rotation.z = deg_to_rad(-14.0 * side)
		var brow := BrickKit.add_box(head, Vector3(0.17, 0.03, 0.02),
				Vector3(0.10 * side, 0.115, 0.208), dark, "Brow%s" % ("L" if side < 0 else "R"))
		brow.rotation.z = deg_to_rad(-16.0 * side)
	# Dark visor bridge between the eyes.
	BrickKit.add_box(head, Vector3(0.06, 0.09, 0.02), Vector3(0, 0.02, 0.207), dark, "Bridge")

	# --- arms ---------------------------------------------------------------
	for side in [-1.0, 1.0]:
		var tag := "L" if side < 0 else "R"
		var arm := _joint(chest, "Arm%s" % tag, Vector3(SHOULDER_X * side, SHOULDER_Y, 0),
				"Rig/Hips/Chest")
		BrickKit.add_shape(arm, BrickKit.unit_cylinder(10), Vector3(0.20, UPPER_ARM, 0.20),
				Vector3(0, -UPPER_ARM * 0.5, 0), red, "UpperMesh")
		BrickKit.add_shape(arm, BrickKit.unit_sphere(6, 10), Vector3(0.22, 0.22, 0.22),
				Vector3.ZERO, red, "ShoulderBall")
		var fore := _joint(arm, "Forearm%s" % tag, Vector3(0, -UPPER_ARM, 0),
				"Rig/Hips/Chest/Arm%s" % tag)
		BrickKit.add_shape(fore, BrickKit.unit_cylinder(10), Vector3(0.185, FOREARM, 0.185),
				Vector3(0, -FOREARM * 0.5, 0), blue, "ForeMesh")
		var hand := _joint(fore, "Hand%s" % tag, Vector3(0, -FOREARM, 0),
				"Rig/Hips/Chest/Arm%s/Forearm%s" % [tag, tag])
		BrickKit.add_box(hand, Vector3(0.19, 0.16, 0.19), Vector3(0, -0.06, 0), blue, "HandMesh")
		# Web spinner: the little device the strands leave from.
		BrickKit.add_shape(hand, BrickKit.unit_cylinder(8), Vector3(0.09, 0.06, 0.09),
				Vector3(0, -0.02, 0.09), white, "Spinner")
		var origin := Marker3D.new()
		origin.name = "WebOrigin%s" % tag
		origin.position = Vector3(0, -0.10, 0.14)
		hand.add_child(origin)

	# --- legs ---------------------------------------------------------------
	for side in [-1.0, 1.0]:
		var tag := "L" if side < 0 else "R"
		var leg := _joint(hips, "Leg%s" % tag, Vector3(HIP_X * side, -0.10, 0), "Rig/Hips")
		BrickKit.add_shape(leg, BrickKit.unit_cylinder(10), Vector3(0.26, THIGH, 0.26),
				Vector3(0, -THIGH * 0.5, 0), blue, "ThighMesh")
		var shin := _joint(leg, "Shin%s" % tag, Vector3(0, -THIGH, 0), "Rig/Hips/Leg%s" % tag)
		BrickKit.add_shape(shin, BrickKit.unit_cylinder(10), Vector3(0.23, SHIN, 0.23),
				Vector3(0, -SHIN * 0.5, 0), blue, "ShinMesh")
		var foot := _joint(shin, "Foot%s" % tag, Vector3(0, -SHIN, 0),
				"Rig/Hips/Leg%s/Shin%s" % [tag, tag])
		BrickKit.add_box(foot, Vector3(0.26, 0.12, 0.40), Vector3(0, 0.0, 0.07), red, "BootMesh")

	return self

## Creates a joint node, registers it in `bones` / `paths`.
func _joint(parent: Node3D, joint_name: String, pos: Vector3, parent_path: String) -> Node3D:
	var n := Node3D.new()
	n.name = joint_name
	n.position = pos
	parent.add_child(n)
	bones[joint_name] = n
	paths[joint_name] = joint_name if parent_path == "" else "%s/%s" % [parent_path, joint_name]
	return n

func bone(bone_name: String) -> Node3D:
	return bones.get(bone_name)

func path(bone_name: String) -> String:
	return paths.get(bone_name, "")

## Marker the web strand is drawn from.
func web_origin(right_hand: bool = true) -> Node3D:
	var hand: Node3D = bones.get("HandR" if right_hand else "HandL")
	if hand == null:
		return root
	var m := hand.get_node_or_null("WebOrigin%s" % ("R" if right_hand else "L"))
	return m if m != null else hand
