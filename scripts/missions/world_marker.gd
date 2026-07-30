class_name WorldMarker
extends Node3D
## WorldMarker -- the glowing objective beacon.
##
## A tall translucent light column plus a spinning ring and a floating diamond.
## Visible from across the city (that is the point), with the ring pulsing so it
## reads even against a bright skyline. The HUD draws the metre distance; this
## node is purely the world-space half.
##
## Scene requirements: created in code (MissionDirector, side activities).
##
## Inspector parameters: beam_height, beam_radius, color, spin_speed, pulse_speed.

@export var beam_height: float = 90.0
@export var beam_radius: float = 1.5
@export var color: Color = Color(1.0, 0.82, 0.25)
@export var spin_speed: float = 1.6
@export var pulse_speed: float = 2.4
@export var show_beam: bool = true

var _beam: MeshInstance3D
var _ring: MeshInstance3D
var _diamond: MeshInstance3D
var _mat: ShaderMaterial
var _time: float = 0.0

func _ready() -> void:
	_mat = BrickKit.neon(color, 2.6).duplicate() as ShaderMaterial

	if show_beam:
		_beam = MeshInstance3D.new()
		_beam.mesh = BrickKit.unit_cylinder(10)
		_beam.scale = Vector3(beam_radius, beam_height, beam_radius)
		_beam.position = Vector3(0, beam_height * 0.5, 0)
		_beam.material_override = _mat
		_beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(_beam)

	_ring = MeshInstance3D.new()
	_ring.mesh = BrickKit.unit_torus(24, 8)
	_ring.scale = Vector3(4.0, 4.0, 4.0)
	_ring.position = Vector3(0, 1.2, 0)
	_ring.material_override = _mat
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_ring)

	_diamond = MeshInstance3D.new()
	_diamond.mesh = BrickKit.unit_box()
	_diamond.scale = Vector3(1.2, 1.2, 1.2)
	_diamond.position = Vector3(0, 3.2, 0)
	_diamond.material_override = _mat
	_diamond.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_diamond)

	var light := OmniLight3D.new()
	light.light_color = color
	light.light_energy = 3.0
	light.omni_range = 18.0
	light.shadow_enabled = false
	light.position = Vector3(0, 2.0, 0)
	add_child(light)

func _process(delta: float) -> void:
	_time += delta
	_ring.rotate_y(spin_speed * delta)
	_ring.scale = Vector3.ONE * (4.0 + sin(_time * pulse_speed) * 0.35)
	_diamond.rotation.y += delta * 2.2
	_diamond.rotation.x = PI * 0.25
	_diamond.position.y = 3.2 + sin(_time * 1.8) * 0.35
	if _mat != null:
		_mat.set_shader_parameter("emission_energy", 2.2 + sin(_time * pulse_speed) * 0.8)

func set_color(new_color: Color) -> void:
	color = new_color
	if _mat != null:
		_mat.set_shader_parameter("base_color", new_color)
		_mat.set_shader_parameter("emission_tint", new_color)
