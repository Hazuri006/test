class_name EnemyProjectile
extends Area3D
## EnemyProjectile -- the gunner's energy bolt (pooled).
##
## Deliberately slow, bright and easy to read: it is a toy prop, not a bullet,
## and the player is expected to dodge or web-swing around it. Pooled through
## ObjectPool so a firefight never allocates.
##
## Collision: layer 16 (hitbox), mask = player | world -- it hits the hero and
## dies on scenery.

const LIFETIME := 3.2
const RADIUS := 0.28

var damage: float = 8.0
var velocity: Vector3 = Vector3.ZERO
var _life: float = 0.0
var _mesh: MeshInstance3D
var _trail: MeshInstance3D
var _light: OmniLight3D
var _active: bool = false

func _ready() -> void:
	collision_layer = BrickKit.L_HITBOX
	collision_mask = BrickKit.L_PLAYER | BrickKit.L_WORLD
	monitorable = false

	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = RADIUS
	shape.shape = sphere
	add_child(shape)

	_mesh = MeshInstance3D.new()
	_mesh.mesh = BrickKit.unit_box()
	_mesh.scale = Vector3(0.34, 0.34, 0.34)
	add_child(_mesh)

	# A stretched box behind the bolt reads as a trail for free.
	_trail = MeshInstance3D.new()
	_trail.mesh = BrickKit.unit_box()
	_trail.scale = Vector3(0.16, 0.16, 1.6)
	_trail.position = Vector3(0, 0, 0.9)
	add_child(_trail)

	_light = OmniLight3D.new()
	_light.omni_range = 5.0
	_light.light_energy = 2.5
	_light.shadow_enabled = false
	add_child(_light)

	body_entered.connect(_on_body_entered)

func launch(from: Vector3, vel: Vector3, dmg: float, color: Color) -> void:
	global_position = from
	velocity = vel
	damage = dmg
	_life = 0.0
	_active = true
	var mat := BrickKit.neon(color, 4.0)
	_mesh.material_override = mat
	_trail.material_override = BrickKit.neon(color, 1.6)
	_light.light_color = color
	if vel.length() > 0.01:
		look_at(from + vel.normalized(), Vector3.UP)

func _physics_process(delta: float) -> void:
	if not _active:
		return
	_life += delta
	global_position += velocity * delta
	_mesh.rotate_y(delta * 8.0)
	if _life >= LIFETIME:
		_expire(false)

func _on_body_entered(body: Node3D) -> void:
	if not _active:
		return
	if body.has_method("take_damage") and body == GameState.get_player():
		body.call("take_damage", damage, global_position)
		_expire(true)
		return
	# Anything else solid stops the bolt.
	_expire(true)

func _expire(hit: bool) -> void:
	_active = false
	if hit and ObjectPool.is_registered("impact_fx"):
		var host: Node = GameState.world if GameState.world != null else get_parent()
		var fx: Node = ObjectPool.acquire("impact_fx", host)
		if fx != null:
			(fx as Node3D).global_position = global_position
			if fx.has_method("burst"):
				fx.call("burst", -velocity.normalized(), _light.light_color, 0.8)
		AudioManager.play_at("hit", global_position, 1.3, 40.0)
	ObjectPool.release(self)

func pool_acquired() -> void:
	_active = false
	_life = 0.0

func pool_released() -> void:
	_active = false
	velocity = Vector3.ZERO
