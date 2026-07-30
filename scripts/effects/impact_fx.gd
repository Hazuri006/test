class_name ImpactFX
extends Node3D
## ImpactFX -- pooled one-shot hit effect (scenes/effects/impact_fx.tscn).
##
## Every punch, bullet hit, landing and explosion in the game reuses this node
## through ObjectPool, so heavy combat never allocates. It combines:
##   * a burst of brick-shard particles (boxes, matching the toy look)
##   * a short-lived OmniLight3D flash
##   * an expanding shockwave ring for big impacts
##
## API: burst(direction, color, scale)  then it releases itself back to the pool.
##
## Scene requirements: Node3D root with this script (children are built here).

const LIFETIME := 0.9

var _particles: GPUParticles3D
var _light: OmniLight3D
var _ring: MeshInstance3D
var _ring_mat: ShaderMaterial
var _timer: float = 0.0
var _active: bool = false

func _ready() -> void:
	_particles = GPUParticles3D.new()
	_particles.amount = 20
	_particles.lifetime = 0.55
	_particles.one_shot = true
	_particles.explosiveness = 1.0
	_particles.local_coords = false
	_particles.emitting = false

	var shard := BoxMesh.new()
	shard.size = Vector3(0.11, 0.11, 0.11)
	var shard_mat := StandardMaterial3D.new()
	shard_mat.vertex_color_use_as_albedo = true
	shard_mat.albedo_color = Color(1, 1, 1)
	shard_mat.roughness = 0.4
	shard.material = shard_mat
	_particles.draw_pass_1 = shard

	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 0.18
	pm.direction = Vector3(0, 0, 1)
	pm.spread = 55.0
	pm.initial_velocity_min = 4.0
	pm.initial_velocity_max = 11.0
	pm.gravity = Vector3(0, -16.0, 0)
	pm.angular_velocity_min = -720.0
	pm.angular_velocity_max = 720.0
	pm.scale_min = 0.5
	pm.scale_max = 1.5
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1, 1, 1, 1))
	ramp.set_color(1, Color(1, 1, 1, 0))
	var tex := GradientTexture1D.new()
	tex.gradient = ramp
	pm.color_ramp = tex
	_particles.process_material = pm
	add_child(_particles)

	_light = OmniLight3D.new()
	_light.light_energy = 0.0
	_light.omni_range = 7.0
	_light.shadow_enabled = false
	add_child(_light)

	_ring = MeshInstance3D.new()
	_ring.mesh = BrickKit.unit_torus(20, 6)
	_ring.visible = false
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_ring_mat = BrickKit.neon(Color(1.0, 0.9, 0.6), 3.0).duplicate() as ShaderMaterial
	_ring.material_override = _ring_mat
	add_child(_ring)

## Fires the effect. `direction` biases the shards, `scale` drives size/energy.
func burst(direction: Vector3 = Vector3.UP, color: Color = Color(1, 0.9, 0.6),
		size: float = 1.0) -> void:
	_active = true
	_timer = 0.0
	var pm := _particles.process_material as ParticleProcessMaterial
	if direction.length() > 0.01:
		pm.direction = direction.normalized()
	pm.initial_velocity_min = 4.0 * size
	pm.initial_velocity_max = 11.0 * size
	pm.color = color
	_particles.amount = clampi(int(16 * size), 8, 48)
	_particles.restart()
	_particles.emitting = true

	_light.light_color = color
	_light.light_energy = 6.0 * size
	_light.omni_range = 6.0 * size

	if size >= 1.5:
		_ring.visible = true
		_ring.scale = Vector3.ONE * 0.4
		_ring_mat.set_shader_parameter("base_color", color)
		_ring_mat.set_shader_parameter("emission_tint", color)
	else:
		_ring.visible = false

func _process(delta: float) -> void:
	if not _active:
		return
	_timer += delta
	var t: float = _timer / LIFETIME
	_light.light_energy = maxf(_light.light_energy - delta * 26.0, 0.0)
	if _ring.visible:
		_ring.scale = Vector3.ONE * lerpf(0.4, 7.0, clampf(t * 2.2, 0.0, 1.0))
		_ring_mat.set_shader_parameter("emission_energy", maxf(3.0 * (1.0 - t * 2.2), 0.0))
	if _timer >= LIFETIME:
		_active = false
		ObjectPool.release(self)

# --- pool hooks ---------------------------------------------------------------

func pool_acquired() -> void:
	_active = false
	_timer = 0.0
	_light.light_energy = 0.0
	_ring.visible = false

func pool_released() -> void:
	_active = false
	_particles.emitting = false
	_light.light_energy = 0.0
	_ring.visible = false
