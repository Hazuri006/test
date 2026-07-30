extends Node3D
## SpeedFX -- node name "SpeedFX", child of Player.
##
## Sells velocity. Two layers:
##   1. a full-screen additive streak overlay (speed_lines.gdshader) that fades in
##      above `fade_in_speed` -- this is what makes swinging feel fast,
##   2. GPUParticles3D wind streaks trailing the hero at high speed.
##
## Both are driven by a single `set_speed()` call from the player, so there is no
## polling and nothing to keep in sync.
##
## Scene requirements: none (builds its own nodes).
##
## Inspector parameters: fade_in_speed, full_speed, max_intensity, particle_speed.

@export var fade_in_speed: float = 17.0
@export var full_speed: float = 46.0
@export var max_intensity: float = 0.55
@export var particle_speed: float = 24.0
@export var blur_smoothing: float = 5.0

var _overlay: ColorRect
var _overlay_mat: ShaderMaterial
var _particles: GPUParticles3D
var _intensity: float = 0.0
var _target_intensity: float = 0.0
var _wind_timer: float = 0.0

func _ready() -> void:
	var layer := CanvasLayer.new()
	layer.name = "SpeedLayer"
	layer.layer = 5
	add_child(layer)

	_overlay = ColorRect.new()
	_overlay.name = "SpeedLines"
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay_mat = ShaderMaterial.new()
	_overlay_mat.shader = load("res://assets/shaders/speed_lines.gdshader") as Shader
	_overlay_mat.set_shader_parameter("intensity", 0.0)
	_overlay.material = _overlay_mat
	layer.add_child(_overlay)

	_particles = GPUParticles3D.new()
	_particles.name = "WindStreaks"
	_particles.amount = 48
	_particles.lifetime = 0.45
	_particles.explosiveness = 0.0
	_particles.local_coords = false
	_particles.emitting = false
	_particles.draw_order = GPUParticles3D.DRAW_ORDER_LIFETIME

	# Thin white streaks: a stretched box is cheaper than a textured quad and
	# matches the brick look better than a soft puff.
	var streak := BoxMesh.new()
	streak.size = Vector3(0.05, 0.05, 1.1)
	var streak_mat := StandardMaterial3D.new()
	streak_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	streak_mat.albedo_color = Color(0.85, 0.94, 1.0, 0.55)
	streak_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	streak_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	streak_mat.billboard_mode = BaseMaterial3D.BILLBOARD_DISABLED
	streak.material = streak_mat
	_particles.draw_pass_1 = streak

	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 1.6
	pm.direction = Vector3(0, 0, 1)
	pm.spread = 12.0
	pm.initial_velocity_min = particle_speed * 0.5
	pm.initial_velocity_max = particle_speed
	pm.gravity = Vector3.ZERO
	pm.scale_min = 0.6
	pm.scale_max = 1.6
	pm.damping_min = 2.0
	pm.damping_max = 6.0
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1, 1, 1, 0.0))
	ramp.set_color(1, Color(0.8, 0.9, 1.0, 0.0))
	ramp.add_point(0.35, Color(1, 1, 1, 0.7))
	var tex := GradientTexture1D.new()
	tex.gradient = ramp
	pm.color_ramp = tex
	_particles.process_material = pm
	add_child(_particles)

func set_speed(speed: float) -> void:
	var t: float = clampf((speed - fade_in_speed) / maxf(full_speed - fade_in_speed, 0.001), 0.0, 1.0)
	_target_intensity = t * max_intensity

func _process(delta: float) -> void:
	_intensity = lerpf(_intensity, _target_intensity, 1.0 - exp(-blur_smoothing * delta))
	_overlay_mat.set_shader_parameter("intensity", _intensity)

	var want_particles: bool = _intensity > 0.12
	if _particles.emitting != want_particles:
		_particles.emitting = want_particles
	if want_particles:
		# Streaks fly backwards past the hero: aim them along -velocity.
		var body := get_parent() as CharacterBody3D
		if body != null and body.velocity.length() > 1.0:
			var back: Vector3 = -body.velocity.normalized()
			var basis := _basis_from_forward(back)
			global_transform = Transform3D(basis, body.global_position + Vector3.UP * 1.0)
		_wind_timer -= delta
		if _wind_timer <= 0.0:
			_wind_timer = 0.42
			AudioManager.play("swing_wind", randf_range(0.9, 1.2), -18.0 + _intensity * 10.0)

func _basis_from_forward(forward: Vector3) -> Basis:
	var z: Vector3 = forward.normalized()
	var up: Vector3 = Vector3.UP
	if absf(z.dot(up)) > 0.95:
		up = Vector3.FORWARD
	var x: Vector3 = up.cross(z).normalized()
	var y: Vector3 = z.cross(x).normalized()
	return Basis(x, y, z)
