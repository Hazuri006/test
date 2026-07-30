class_name EnemyRig
extends RefCounted
## EnemyRig -- minifigure builder for the city's crooks and citizens.
##
## Same toy construction as the hero (cylindrical head with a stud, trapezoid
## torso, C-shaped hands, one-piece hips, flat legs, forward boots) but with
## fewer parts and no AnimationTree: enemies are animated procedurally in
## enemy_base.gd, which is far cheaper with a dozen of them on screen.
##
## ORIENTATION: built facing -Z (Godot forward). Faces and boots use negative Z.
##
## `bulk` scales the torso and limbs, so the same builder covers the skinny
## runner and the enormous brute.

const RIG_SCALE := 0.83
const HIP_HEIGHT := 0.92

var bones: Dictionary = {}
var root: Node3D

## palette keys: suit, trim, skin, accent
func build(parent: Node3D, palette: Dictionary, bulk: float = 1.0, helmet: bool = false,
		visor_color: Color = Color(0.9, 0.3, 0.2)) -> EnemyRig:
	var suit: Color = palette.get("suit", Color(0.24, 0.26, 0.32))
	var trim: Color = palette.get("trim", Color(0.16, 0.17, 0.2))
	var skin: Color = palette.get("skin", Color(0.92, 0.78, 0.52))
	var accent: Color = palette.get("accent", Color(0.8, 0.5, 0.1))

	var m_suit := BrickKit.brick(suit, false, 0.22)
	var m_trim := BrickKit.brick(trim, false, 0.28)
	var m_skin := BrickKit.brick(skin, false, 0.2)
	var m_accent := BrickKit.brick(accent, false, 0.2)
	var m_dark := BrickKit.brick(Color(0.08, 0.08, 0.11), false, 0.3)
	var m_visor := BrickKit.neon(visor_color, 1.4)

	root = _joint(parent, "Rig", Vector3.ZERO)
	root.scale = Vector3.ONE * RIG_SCALE

	# --- hips ---------------------------------------------------------------
	var hips := _joint(root, "Hips", Vector3(0, HIP_HEIGHT, 0))
	BrickKit.add_box(hips, Vector3(0.64 * bulk, 0.24, 0.42), Vector3(0, -0.02, 0), m_trim, "HipBlock")
	BrickKit.add_box(hips, Vector3(0.07, 0.24, 0.44), Vector3(0, -0.02, 0), m_dark, "HipSeam")
	BrickKit.add_box(hips, Vector3(0.68 * bulk, 0.07, 0.46), Vector3(0, 0.11, 0), m_accent, "Belt")

	# --- torso --------------------------------------------------------------
	var chest := _joint(hips, "Chest", Vector3(0, 0.12, 0))
	BrickKit.add_box(chest, Vector3(0.68 * bulk, 0.20, 0.44 * bulk), Vector3(0, 0.09, 0), m_suit, "TorsoLow")
	BrickKit.add_box(chest, Vector3(0.64 * bulk, 0.20, 0.42 * bulk), Vector3(0, 0.28, 0), m_suit, "TorsoMid")
	BrickKit.add_box(chest, Vector3(0.58 * bulk, 0.20, 0.40 * bulk), Vector3(0, 0.47, 0), m_suit, "TorsoTop")
	# Open jacket front, painted on with two darker panels.
	for side in [-1.0, 1.0]:
		BrickKit.add_box(chest, Vector3(0.16 * bulk, 0.46, 0.03),
				Vector3(side * 0.19 * bulk, 0.30, -0.215 * bulk), m_trim, "Lapel")
		BrickKit.add_box(chest, Vector3(0.08, 0.32, 0.40 * bulk),
				Vector3(side * 0.29 * bulk, 0.36, 0), m_trim, "SideSeam")
	BrickKit.add_shape(chest, BrickKit.unit_cylinder(10), Vector3(0.20, 0.10, 0.20),
			Vector3(0, 0.61, 0), m_skin, "NeckPeg")

	# --- head ---------------------------------------------------------------
	var head := _joint(chest, "Head", Vector3(0, 0.58, 0))
	BrickKit.add_shape(head, BrickKit.unit_cylinder(16), Vector3(0.52, 0.36, 0.52),
			Vector3(0, 0.18, 0), m_skin, "HeadMesh")
	BrickKit.add_shape(head, BrickKit.unit_sphere(8, 14), Vector3(0.52, 0.14, 0.52),
			Vector3(0, 0.36, 0), m_skin, "Crown")
	BrickKit.add_shape(head, BrickKit.unit_cylinder(12), Vector3(0.18, 0.07, 0.18),
			Vector3(0, 0.43, 0), m_skin, "HeadStud")
	# Face on -Z: two dot eyes, a brow, and a scowl line.
	for side in [-1.0, 1.0]:
		BrickKit.add_box(head, Vector3(0.065, 0.065, 0.03), Vector3(0.10 * side, 0.21, -0.252),
				m_dark, "Eye")
		var brow := BrickKit.add_box(head, Vector3(0.105, 0.025, 0.02),
				Vector3(0.10 * side, 0.28, -0.254), m_dark, "Brow")
		brow.rotation.z = deg_to_rad(-12.0 * side)
	BrickKit.add_box(head, Vector3(0.12, 0.025, 0.02), Vector3(0, 0.10, -0.254), m_dark, "Mouth")

	if helmet:
		BrickKit.add_shape(head, BrickKit.unit_cylinder(14), Vector3(0.58, 0.22, 0.58),
				Vector3(0, 0.32, 0), m_accent, "Helmet")
		BrickKit.add_shape(head, BrickKit.unit_sphere(8, 14), Vector3(0.58, 0.18, 0.58),
				Vector3(0, 0.41, 0), m_accent, "HelmetDome")
		BrickKit.add_box(head, Vector3(0.44, 0.10, 0.06), Vector3(0, 0.23, -0.25), m_visor, "Visor")
	else:
		# Flat cap: crown plate + peak, the classic crook headgear.
		BrickKit.add_shape(head, BrickKit.unit_cylinder(14), Vector3(0.56, 0.11, 0.56),
				Vector3(0, 0.39, 0), m_accent, "Cap")
		BrickKit.add_box(head, Vector3(0.42, 0.045, 0.20), Vector3(0, 0.36, -0.29), m_accent, "Peak")

	# --- arms ---------------------------------------------------------------
	for side in [-1.0, 1.0]:
		var tag := "L" if side < 0 else "R"
		var arm := _joint(chest, "Arm%s" % tag, Vector3(0.345 * bulk * side, 0.47, 0))
		var upper := BrickKit.add_box(arm, Vector3(0.18 * bulk, 0.32, 0.22 * bulk),
				Vector3(0, -0.16, 0), m_suit, "Upper")
		upper.rotation.z = deg_to_rad(5.0 * side)
		BrickKit.add_shape(arm, BrickKit.unit_sphere(8, 10), Vector3(0.18 * bulk, 0.18, 0.22 * bulk),
				Vector3(0, -0.02, 0), m_suit, "ShoulderCap")

		var fore := _joint(arm, "Forearm%s" % tag, Vector3(0, -0.32, 0))
		var fore_mesh := BrickKit.add_box(fore, Vector3(0.17 * bulk, 0.26, 0.20 * bulk),
				Vector3(0, -0.13, -0.03), m_suit, "Fore")
		fore_mesh.rotation.x = deg_to_rad(-10.0)
		BrickKit.add_box(fore, Vector3(0.19 * bulk, 0.05, 0.22 * bulk), Vector3(0, -0.24, -0.02),
				m_trim, "Cuff")

		var hand := _joint(fore, "Hand%s" % tag, Vector3(0, -0.26, -0.04))
		_build_c_hand(hand, m_skin, side)

	# --- legs ---------------------------------------------------------------
	for side in [-1.0, 1.0]:
		var tag := "L" if side < 0 else "R"
		var leg := _joint(hips, "Leg%s" % tag, Vector3(0.17 * side, -0.12, 0))
		BrickKit.add_box(leg, Vector3(0.28, 0.44, 0.35), Vector3(0, -0.22, 0), m_trim, "Thigh")
		BrickKit.add_box(leg, Vector3(0.29, 0.06, 0.36), Vector3(0, -0.03, 0), m_dark, "HipJoint")

		var shin := _joint(leg, "Shin%s" % tag, Vector3(0, -0.44, 0))
		BrickKit.add_box(shin, Vector3(0.27, 0.24, 0.34), Vector3(0, -0.12, 0), m_trim, "Shin")

		var foot := _joint(shin, "Foot%s" % tag, Vector3(0, -0.24, 0))
		BrickKit.add_box(foot, Vector3(0.29, 0.13, 0.43), Vector3(0, -0.065, -0.06), m_dark, "Boot")

	return self

## Open C grip, same construction as the hero's hand.
func _build_c_hand(parent: Node3D, material: Material, side: float) -> void:
	var radius := 0.098
	var holder := Node3D.new()
	holder.name = "Grip"
	holder.position = Vector3(0, -0.09, 0)
	holder.rotation.x = deg_to_rad(90.0)
	holder.rotation.z = deg_to_rad(8.0 * side)
	parent.add_child(holder)
	for i in 8:
		var angle: float = deg_to_rad(32.0) + deg_to_rad(296.0) * (float(i) + 0.5) / 8.0
		# Tangential size (local Z) must exceed the segment spacing, or the C
		# breaks up into floating chips.
		var piece := BrickKit.add_box(holder, Vector3(0.078, 0.11, 0.14),
				Vector3(cos(angle) * radius, 0.0, sin(angle) * radius), material, "Clip%d" % i)
		piece.rotation.y = -angle
	BrickKit.add_shape(parent, BrickKit.unit_cylinder(10), Vector3(0.165, 0.075, 0.165),
			Vector3(0, -0.03, 0), material, "Wrist")

## Adds a chunky toy blaster to the right hand (the ranged enemy).
## The muzzle points FORWARD (-Z), matching the rig's orientation.
func add_blaster(color: Color) -> Node3D:
	var hand: Node3D = bones.get("HandR")
	if hand == null:
		return null
	var gun := Node3D.new()
	gun.name = "Blaster"
	gun.position = Vector3(0, -0.14, -0.10)
	hand.add_child(gun)
	BrickKit.add_box(gun, Vector3(0.16, 0.16, 0.5), Vector3(0, 0, -0.2),
			BrickKit.brick(Color(0.22, 0.24, 0.3), false, 0.3), "Body")
	BrickKit.add_box(gun, Vector3(0.12, 0.24, 0.14), Vector3(0, -0.12, -0.02),
			BrickKit.brick(Color(0.16, 0.17, 0.22), false, 0.35), "Grip")
	BrickKit.add_shape(gun, BrickKit.unit_cylinder(8), Vector3(0.13, 0.16, 0.13),
			Vector3(0, 0, -0.5), BrickKit.neon(color, 2.5), "Muzzle").rotation.x = PI * 0.5
	var muzzle := Marker3D.new()
	muzzle.name = "Muzzle"
	muzzle.position = Vector3(0, 0, -0.62)
	gun.add_child(muzzle)
	bones["Muzzle"] = muzzle
	return gun

## Adds a big brick mallet to the right hand (the brute).
func add_mallet() -> void:
	var hand: Node3D = bones.get("HandR")
	if hand == null:
		return
	var mallet := Node3D.new()
	mallet.name = "Mallet"
	mallet.position = Vector3(0, -0.1, -0.05)
	mallet.rotation.x = deg_to_rad(70.0)
	hand.add_child(mallet)
	BrickKit.add_shape(mallet, BrickKit.unit_cylinder(8), Vector3(0.12, 1.1, 0.12),
			Vector3(0, 0.55, 0), BrickKit.brick(Color(0.45, 0.3, 0.18), false, 0.5), "Handle")
	BrickKit.add_box(mallet, Vector3(0.5, 0.5, 0.8), Vector3(0, 1.15, 0),
			BrickKit.brick(Color(0.5, 0.52, 0.56), true, 0.35), "Head")

func _joint(parent: Node3D, joint_name: String, pos: Vector3) -> Node3D:
	var n := Node3D.new()
	n.name = joint_name
	n.position = pos
	parent.add_child(n)
	bones[joint_name] = n
	return n

func bone(bone_name: String) -> Node3D:
	return bones.get(bone_name)
