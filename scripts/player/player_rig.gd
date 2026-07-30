class_name PlayerRig
extends RefCounted
## PlayerRig -- builds the hero "Web Hero" as a real toy MINIFIGURE.
##
## Construction language (this is what makes it read as a brick figure rather
## than a blocky human):
##   * cylindrical head with a stud on top and a domed crown
##   * short neck peg
##   * trapezoid torso -- wider at the waist, sloped shoulders
##   * straight arms with a slight elbow bend and OPEN C-SHAPED HANDS
##   * one-piece hip block, short flat legs, forward-pointing boots
##   * minifigure proportions: legs ~36 %, torso ~36 %, head ~28 % of the height
##
## ORIENTATION: the figure is built facing -Z, which is Godot's forward. Getting
## this wrong makes the hero run backwards (and inverts the whole walk cycle),
## so every face/boot detail below uses NEGATIVE Z for "front".
##
## DESIGN: crimson mask with large angular white eye plates, blue limbs, red
## boots and gloves, and an original diamond-spark chest emblem. There is no
## web pattern, no spider motif and no existing character's markings -- the toy
## CONSTRUCTION is generic, the costume design is this project's own.
##
## The builder returns:
##   bones  : name -> Node3D   (joint nodes, safe to rotate)
##   paths  : name -> String   (NodePath prefix relative to the rig's parent,
##                              consumed by PlayerAnimator to author tracks)
##
## Scene requirements: a Node3D to parent the rig to (Player/Visual).

const SUIT_RED := Color(0.84, 0.11, 0.15)
const SUIT_BLUE := Color(0.09, 0.22, 0.66)
const SUIT_DARK := Color(0.05, 0.07, 0.16)
const TRIM_WHITE := Color(0.95, 0.97, 1.0)
const EMBLEM_BLUE := Color(0.20, 0.55, 1.0)

## Whole-rig scale. The figure is authored at "one brick = big" proportions and
## then scaled to a 1.85 m hero, so the joint offsets below stay readable.
const RIG_SCALE := 0.83

# Joint offsets (metres, BEFORE rig scale, origin at the soles).
const HIP_HEIGHT := 0.92        ## PlayerAnimator keyframes Hips:position at this
const CHEST_OFFSET := 0.12
const HEAD_OFFSET := 0.58
const SHOULDER_X := 0.355
const SHOULDER_Y := 0.47
const UPPER_ARM := 0.34
const FOREARM := 0.28
const HIP_X := 0.17
const LEG_DROP := 0.12          ## hips joint -> top of the legs
const THIGH := 0.44
const SHIN := 0.24

var bones: Dictionary = {}
var paths: Dictionary = {}
var root: Node3D

## Builds the figure under `parent` and returns self for chaining.
func build(parent: Node3D) -> PlayerRig:
	var red := BrickKit.brick(SUIT_RED, false, 0.16)
	var blue := BrickKit.brick(SUIT_BLUE, false, 0.16)
	var dark := BrickKit.brick(SUIT_DARK, false, 0.24)
	var white := BrickKit.brick(TRIM_WHITE, false, 0.10)
	var emblem := BrickKit.neon(EMBLEM_BLUE, 1.0)

	root = _joint(parent, "Rig", Vector3.ZERO, "")
	root.scale = Vector3.ONE * RIG_SCALE

	# --- hip block ----------------------------------------------------------
	# One solid piece, like a minifigure's hips, straddling the joint.
	var hips := _joint(root, "Hips", Vector3(0, HIP_HEIGHT, 0), "Rig")
	BrickKit.add_box(hips, Vector3(0.66, 0.24, 0.42), Vector3(0, -0.02, 0), blue, "HipBlock")
	# The vertical seam between the legs, and the belt lip on top.
	BrickKit.add_box(hips, Vector3(0.07, 0.24, 0.44), Vector3(0, -0.02, 0), dark, "HipSeam")
	BrickKit.add_box(hips, Vector3(0.70, 0.07, 0.46), Vector3(0, 0.11, 0), dark, "Belt")
	BrickKit.add_box(hips, Vector3(0.16, 0.09, 0.05), Vector3(0, 0.11, -0.24), white, "Buckle")

	# --- torso: a trapezoid, widest at the waist ----------------------------
	var chest := _joint(hips, "Chest", Vector3(0, CHEST_OFFSET, 0), "Rig/Hips")
	BrickKit.add_box(chest, Vector3(0.70, 0.20, 0.44), Vector3(0, 0.09, 0), red, "TorsoLow")
	BrickKit.add_box(chest, Vector3(0.66, 0.20, 0.42), Vector3(0, 0.28, 0), red, "TorsoMid")
	BrickKit.add_box(chest, Vector3(0.60, 0.20, 0.40), Vector3(0, 0.47, 0), red, "TorsoTop")
	# Blue yoke over the shoulders -> the two-tone suit reads instantly.
	BrickKit.add_box(chest, Vector3(0.615, 0.09, 0.415), Vector3(0, 0.545, 0), blue, "Yoke")
	# Neck peg -- short, so the head sits almost straight on the shoulders.
	BrickKit.add_shape(chest, BrickKit.unit_cylinder(10), Vector3(0.19, 0.07, 0.19),
			Vector3(0, 0.60, 0), red, "NeckPeg")

	# Original emblem: a diamond spark with two crossing struts, on the FRONT.
	var em := _joint(chest, "Emblem", Vector3(0, 0.30, -0.225), "Rig/Hips/Chest")
	var diamond := BrickKit.add_box(em, Vector3(0.19, 0.19, 0.03), Vector3.ZERO, emblem, "Diamond")
	diamond.rotation.z = PI * 0.25
	var strut_a := BrickKit.add_box(em, Vector3(0.34, 0.04, 0.025), Vector3.ZERO, white, "StrutA")
	strut_a.rotation.z = PI * 0.25
	var strut_b := BrickKit.add_box(em, Vector3(0.34, 0.04, 0.025), Vector3.ZERO, white, "StrutB")
	strut_b.rotation.z = -PI * 0.25

	# --- head: cylinder + domed crown + stud --------------------------------
	var head := _joint(chest, "Head", Vector3(0, HEAD_OFFSET, 0), "Rig/Hips/Chest")
	BrickKit.add_shape(head, BrickKit.unit_cylinder(16), Vector3(0.54, 0.36, 0.54),
			Vector3(0, 0.18, 0), red, "HeadMesh")
	BrickKit.add_shape(head, BrickKit.unit_sphere(8, 16), Vector3(0.54, 0.15, 0.54),
			Vector3(0, 0.36, 0), red, "Crown")
	# The stud on top -- the single most recognisable minifigure feature.
	BrickKit.add_shape(head, BrickKit.unit_cylinder(12), Vector3(0.19, 0.08, 0.19),
			Vector3(0, 0.43, 0), red, "HeadStud")

	# Face, on -Z. Large angular eye plates, dark brow bar, no other markings.
	for side in [-1.0, 1.0]:
		var tag := "L" if side < 0 else "R"
		var eye := BrickKit.add_box(head, Vector3(0.16, 0.115, 0.03),
				Vector3(0.115 * side, 0.20, -0.262), white, "Eye%s" % tag)
		eye.rotation.z = deg_to_rad(16.0 * side)
		var outline := BrickKit.add_box(head, Vector3(0.185, 0.145, 0.02),
				Vector3(0.115 * side, 0.20, -0.258), dark, "EyeOutline%s" % tag)
		outline.rotation.z = deg_to_rad(16.0 * side)
	BrickKit.add_box(head, Vector3(0.06, 0.115, 0.03), Vector3(0, 0.20, -0.264), dark, "Bridge")
	BrickKit.add_box(head, Vector3(0.30, 0.028, 0.02), Vector3(0, 0.29, -0.262), dark, "BrowBar")
	BrickKit.add_box(head, Vector3(0.028, 0.14, 0.02), Vector3(0, 0.08, -0.262), dark, "Crest")

	# --- arms ---------------------------------------------------------------
	for side in [-1.0, 1.0]:
		var tag := "L" if side < 0 else "R"
		var arm := _joint(chest, "Arm%s" % tag, Vector3(SHOULDER_X * side, SHOULDER_Y, 0),
				"Rig/Hips/Chest")
		# Minifigure arms are straight, slightly flared, with a rounded shoulder.
		var upper := BrickKit.add_box(arm, Vector3(0.185, UPPER_ARM, 0.225),
				Vector3(0, -UPPER_ARM * 0.5, 0), blue, "UpperMesh")
		upper.rotation.z = deg_to_rad(5.0 * side)
		# Rounded shoulder cap, sunk into the sleeve so it reads as one moulded
		# piece instead of a ball stuck on the side.
		BrickKit.add_shape(arm, BrickKit.unit_sphere(8, 12), Vector3(0.185, 0.185, 0.225),
				Vector3(0, -0.02, 0), blue, "ShoulderCap")

		var fore := _joint(arm, "Forearm%s" % tag, Vector3(0, -UPPER_ARM, 0),
				"Rig/Hips/Chest/Arm%s" % tag)
		# The forearm angles inwards and forwards, like the moulded piece.
		var fore_mesh := BrickKit.add_box(fore, Vector3(0.175, FOREARM, 0.21),
				Vector3(0, -FOREARM * 0.5, -0.03), blue, "ForeMesh")
		fore_mesh.rotation.x = deg_to_rad(-10.0)
		BrickKit.add_box(fore, Vector3(0.195, 0.05, 0.23), Vector3(0, -FOREARM + 0.02, -0.02),
				dark, "Cuff")

		var hand := _joint(fore, "Hand%s" % tag, Vector3(0, -FOREARM, -0.04),
				"Rig/Hips/Chest/Arm%s/Forearm%s" % [tag, tag])
		_build_c_hand(hand, red, side)
		# Web spinner on the inside of the wrist.
		BrickKit.add_box(hand, Vector3(0.11, 0.06, 0.09), Vector3(0, 0.02, -0.08), white, "Spinner")
		var origin := Marker3D.new()
		origin.name = "WebOrigin%s" % tag
		origin.position = Vector3(0, -0.07, -0.13)
		hand.add_child(origin)

	# --- legs ---------------------------------------------------------------
	for side in [-1.0, 1.0]:
		var tag := "L" if side < 0 else "R"
		var leg := _joint(hips, "Leg%s" % tag, Vector3(HIP_X * side, -LEG_DROP, 0), "Rig/Hips")
		# Flat rectangular legs, exactly like the moulded pieces.
		BrickKit.add_box(leg, Vector3(0.29, THIGH, 0.36), Vector3(0, -THIGH * 0.5, 0), blue, "ThighMesh")
		BrickKit.add_box(leg, Vector3(0.30, 0.06, 0.37), Vector3(0, -0.03, 0), dark, "HipJoint")

		var shin := _joint(leg, "Shin%s" % tag, Vector3(0, -THIGH, 0), "Rig/Hips/Leg%s" % tag)
		BrickKit.add_box(shin, Vector3(0.28, SHIN, 0.35), Vector3(0, -SHIN * 0.5, 0), blue, "ShinMesh")

		var foot := _joint(shin, "Foot%s" % tag, Vector3(0, -SHIN, 0),
				"Rig/Hips/Leg%s/Shin%s" % [tag, tag])
		# Boot: the moulded foot juts FORWARD (-Z).
		BrickKit.add_box(foot, Vector3(0.30, 0.13, 0.44), Vector3(0, -0.065, -0.06), red, "BootMesh")
		BrickKit.add_box(foot, Vector3(0.31, 0.04, 0.20), Vector3(0, -0.02, -0.20), dark, "BootTrim")

	return self

## The open C-shaped hand: an arc of small blocks with a gap at the front, which
## is the minifigure grip. Six segments read cleanly at gameplay distance.
func _build_c_hand(parent: Node3D, material: Material, side: float) -> void:
	var radius := 0.10
	var segments := 8
	var start := deg_to_rad(32.0)
	var sweep := deg_to_rad(296.0)
	var holder := Node3D.new()
	holder.name = "Grip"
	holder.position = Vector3(0, -0.09, 0)
	holder.rotation.x = deg_to_rad(90.0)     # the ring opening points forward
	holder.rotation.z = deg_to_rad(8.0 * side)
	parent.add_child(holder)
	for i in segments:
		var angle: float = start + sweep * (float(i) + 0.5) / float(segments)
		# Local X is radial and local Z tangential (see the rotation below), so the
		# tangential size must exceed the segment spacing or the C falls apart
		# into floating chips.
		var piece := BrickKit.add_box(holder, Vector3(0.08, 0.115, 0.145),
				Vector3(cos(angle) * radius, 0.0, sin(angle) * radius), material, "Clip%d" % i)
		piece.rotation.y = -angle
	# Wrist collar so the hand joins the sleeve cleanly.
	BrickKit.add_shape(parent, BrickKit.unit_cylinder(10), Vector3(0.17, 0.08, 0.17),
			Vector3(0, -0.03, 0), material, "Wrist")

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
