class_name EnemyRig
extends RefCounted
## EnemyRig -- procedural brick figure for the city's crooks.
##
## Same construction idea as the hero's rig but simpler: fewer joints, no
## AnimationTree. Enemies are animated procedurally in enemy_base.gd (leg swing
## from speed, arm swing, attack lunge), which is far cheaper when a dozen of
## them are on screen at once.
##
## `bulk` scales the torso and limbs so one builder covers the skinny runner and
## the enormous brute.

var bones: Dictionary = {}
var root: Node3D

## palette keys: suit, trim, skin, accent
func build(parent: Node3D, palette: Dictionary, bulk: float = 1.0, helmet: bool = false,
		visor_color: Color = Color(0.9, 0.3, 0.2)) -> EnemyRig:
	var suit: Color = palette.get("suit", Color(0.24, 0.26, 0.32))
	var trim: Color = palette.get("trim", Color(0.16, 0.17, 0.2))
	var skin: Color = palette.get("skin", Color(0.92, 0.78, 0.52))
	var accent: Color = palette.get("accent", Color(0.8, 0.5, 0.1))

	var m_suit := BrickKit.brick(suit, true, 0.35)
	var m_trim := BrickKit.brick(trim, false, 0.4)
	var m_skin := BrickKit.brick(skin, false, 0.3)
	var m_accent := BrickKit.brick(accent, true, 0.3)
	var m_visor := BrickKit.neon(visor_color, 1.4)

	root = _joint(parent, "Rig", Vector3.ZERO)
	var hips := _joint(root, "Hips", Vector3(0, 0.86 * bulk, 0))
	BrickKit.add_box(hips, Vector3(0.5 * bulk, 0.26, 0.32 * bulk), Vector3(0, -0.04, 0), m_trim, "Pelvis")

	var chest := _joint(hips, "Chest", Vector3(0, 0.14, 0))
	BrickKit.add_box(chest, Vector3(0.58 * bulk, 0.54 * bulk, 0.34 * bulk),
			Vector3(0, 0.26 * bulk, 0), m_suit, "Torso")
	BrickKit.add_box(chest, Vector3(0.62 * bulk, 0.1, 0.36 * bulk),
			Vector3(0, 0.1, 0), m_accent, "Sash")

	var head := _joint(chest, "Head", Vector3(0, 0.54 * bulk, 0))
	BrickKit.add_box(head, Vector3(0.36, 0.36, 0.36), Vector3(0, 0.04, 0), m_skin, "Head")
	if helmet:
		BrickKit.add_box(head, Vector3(0.42, 0.22, 0.42), Vector3(0, 0.16, 0), m_accent, "Helmet")
		BrickKit.add_box(head, Vector3(0.34, 0.09, 0.04), Vector3(0, 0.04, 0.19), m_visor, "Visor")
	else:
		BrickKit.add_box(head, Vector3(0.38, 0.14, 0.38), Vector3(0, 0.16, 0), m_trim, "Cap")
		BrickKit.add_box(head, Vector3(0.38, 0.06, 0.12), Vector3(0, 0.11, 0.16), m_trim, "Brim")
		for s in [-1.0, 1.0]:
			BrickKit.add_box(head, Vector3(0.09, 0.05, 0.03), Vector3(0.08 * s, 0.03, 0.19),
					BrickKit.brick(Color(0.1, 0.1, 0.12), false, 0.3), "Eye")

	for s in [-1.0, 1.0]:
		var tag := "L" if s < 0 else "R"
		var arm := _joint(chest, "Arm%s" % tag, Vector3(0.33 * bulk * s, 0.4 * bulk, 0))
		BrickKit.add_shape(arm, BrickKit.unit_cylinder(8), Vector3(0.19 * bulk, 0.32, 0.19 * bulk),
				Vector3(0, -0.16, 0), m_suit, "Upper")
		var fore := _joint(arm, "Forearm%s" % tag, Vector3(0, -0.32, 0))
		BrickKit.add_shape(fore, BrickKit.unit_cylinder(8), Vector3(0.17 * bulk, 0.3, 0.17 * bulk),
				Vector3(0, -0.15, 0), m_skin, "Fore")
		var hand := _joint(fore, "Hand%s" % tag, Vector3(0, -0.3, 0))
		BrickKit.add_box(hand, Vector3(0.17, 0.15, 0.17), Vector3(0, -0.05, 0), m_trim, "Fist")

		var leg := _joint(hips, "Leg%s" % tag, Vector3(0.16 * bulk * s, -0.08, 0))
		BrickKit.add_shape(leg, BrickKit.unit_cylinder(8), Vector3(0.24 * bulk, 0.42, 0.24 * bulk),
				Vector3(0, -0.21, 0), m_trim, "Thigh")
		var shin := _joint(leg, "Shin%s" % tag, Vector3(0, -0.42, 0))
		BrickKit.add_shape(shin, BrickKit.unit_cylinder(8), Vector3(0.21 * bulk, 0.4, 0.21 * bulk),
				Vector3(0, -0.2, 0), m_trim, "Shin")
		var foot := _joint(shin, "Foot%s" % tag, Vector3(0, -0.4, 0))
		BrickKit.add_box(foot, Vector3(0.24, 0.12, 0.36), Vector3(0, 0, 0.06), m_suit, "Boot")

	return self

## Adds a chunky toy blaster to the right hand (the ranged enemy).
func add_blaster(color: Color) -> Node3D:
	var hand: Node3D = bones.get("HandR")
	if hand == null:
		return null
	var gun := Node3D.new()
	gun.name = "Blaster"
	gun.position = Vector3(0, -0.15, 0.1)
	hand.add_child(gun)
	BrickKit.add_box(gun, Vector3(0.16, 0.16, 0.5), Vector3(0, 0, 0.2),
			BrickKit.brick(Color(0.22, 0.24, 0.3), true, 0.3), "Body")
	BrickKit.add_box(gun, Vector3(0.12, 0.24, 0.14), Vector3(0, -0.12, 0.02),
			BrickKit.brick(Color(0.16, 0.17, 0.22), false, 0.35), "Grip")
	BrickKit.add_shape(gun, BrickKit.unit_cylinder(8), Vector3(0.13, 0.16, 0.13),
			Vector3(0, 0, 0.5), BrickKit.neon(color, 2.5), "Muzzle")
	var muzzle := Marker3D.new()
	muzzle.name = "Muzzle"
	muzzle.position = Vector3(0, 0, 0.62)
	gun.add_child(muzzle)
	bones["Muzzle"] = muzzle
	return gun

## Adds a big brick mallet to both hands (the brute).
func add_mallet() -> void:
	var hand: Node3D = bones.get("HandR")
	if hand == null:
		return
	var mallet := Node3D.new()
	mallet.name = "Mallet"
	mallet.position = Vector3(0, -0.1, 0.05)
	mallet.rotation.x = deg_to_rad(-70.0)
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
