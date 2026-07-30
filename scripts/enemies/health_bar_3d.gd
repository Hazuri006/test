class_name HealthBar3D
extends Node3D
## HealthBar3D -- floating health bar above an enemy.
##
## Two billboarded quads (background + fill), no textures, no Viewport, no
## Control nodes. It hides itself at full health and after a few seconds of
## calm, so a busy street is not covered in bars.
##
## Scene requirements: created in code by EnemyBase.

@export var width: float = 1.0
@export var height: float = 0.12
@export var hide_delay: float = 3.5
@export var max_view_distance: float = 45.0

var _fill: MeshInstance3D
var _back: MeshInstance3D
var _timer: float = 0.0
var _ratio: float = 1.0

func setup(bar_width: float = 1.0, fill_color: Color = Color(0.9, 0.25, 0.2)) -> void:
	width = bar_width
	_back = _make_quad(Color(0.05, 0.05, 0.08, 0.85), Vector3(width, height, 1.0))
	_fill = _make_quad(fill_color, Vector3(width - 0.06, height - 0.04, 1.0))
	_fill.position.z = 0.01
	visible = false

func _make_quad(color: Color, size: Vector3) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(1.0, 1.0)
	mi.mesh = quad
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.no_depth_test = false
	mat.disable_receive_shadows = true
	mi.material_override = mat
	mi.scale = size
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi

func set_ratio(ratio: float) -> void:
	_ratio = clampf(ratio, 0.0, 1.0)
	if _fill == null:
		return
	_fill.scale.x = (width - 0.06) * _ratio
	# Shrink from the right so the bar drains like a real gauge.
	_fill.position.x = -(width - 0.06) * (1.0 - _ratio) * 0.5
	var mat := _fill.material_override as StandardMaterial3D
	if mat != null:
		mat.albedo_color = Color(0.9, 0.25, 0.2).lerp(Color(1.0, 0.75, 0.15), 1.0 - _ratio)
	visible = _ratio < 0.999
	_timer = hide_delay

func _process(delta: float) -> void:
	if not visible:
		return
	_timer -= delta
	if _timer <= 0.0 and _ratio >= 0.999:
		visible = false
		return
	# Cheap distance cull: bars are noise once the enemy is far away.
	var cam := get_viewport().get_camera_3d()
	if cam != null:
		visible = global_position.distance_to(cam.global_position) < max_view_distance
