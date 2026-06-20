class_name Flashlight
extends SpotLight3D
## Realistic hand flashlight. Parented to the camera but eased toward the camera's
## orientation each frame so it lags slightly behind fast turns. Flickers when the
## battery is low and can be forced to fail during scripted events.

const BASE_ENERGY: float = 4.2

var _on: bool = false
var _low: bool = false
var _flicker_timer: float = 0.0
var _forced_out: float = 0.0
var _smoothed_quat: Quaternion = Quaternion.IDENTITY
var _initialised: bool = false

func _ready() -> void:
	light_color = Color(1.0, 0.96, 0.86)
	light_energy = BASE_ENERGY
	spot_range = 15.0
	spot_angle = 32.0
	spot_angle_attenuation = 1.2
	spot_attenuation = 1.4
	shadow_enabled = true
	shadow_bias = 0.04
	shadow_normal_bias = 1.5
	light_specular = 0.4
	position = Vector3(0.18, -0.12, -0.1)
	visible = false

func set_on(value: bool) -> void:
	_on = value
	visible = value

func is_on() -> bool:
	return _on

func set_low(value: bool) -> void:
	_low = value

## Briefly kills the light for scripted scares.
func force_flicker(duration: float) -> void:
	_forced_out = maxf(_forced_out, duration)

## Eases the light toward the camera basis to produce hand-held lag.
func update_lag(delta: float, camera_xf: Transform3D) -> void:
	var target: Quaternion = camera_xf.basis.get_rotation_quaternion()
	if not _initialised:
		_smoothed_quat = target
		_initialised = true
	_smoothed_quat = _smoothed_quat.slerp(target, clampf(delta * 12.0, 0.0, 1.0))
	global_transform = Transform3D(Basis(_smoothed_quat), camera_xf.origin + camera_xf.basis * Vector3(0.18, -0.12, 0.0))

func _process(delta: float) -> void:
	if not _on:
		return
	if _forced_out > 0.0:
		_forced_out -= delta
		light_energy = 0.0 if randf() < 0.7 else BASE_ENERGY * 0.3
		visible = randf() < 0.2
		if _forced_out <= 0.0:
			visible = true
		return
	visible = true
	if _low:
		_flicker_timer -= delta
		if _flicker_timer <= 0.0:
			_flicker_timer = randf_range(0.05, 0.25)
			light_energy = BASE_ENERGY * randf_range(0.2, 0.8)
	else:
		light_energy = lerpf(light_energy, BASE_ENERGY, clampf(delta * 8.0, 0.0, 1.0))
