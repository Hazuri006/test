class_name DebrisChunk
extends Area3D
## DebrisChunk -- a lump of the arena thrown by Docteur Mecanix (pooled).
##
## Flies on a real ballistic arc towards a predicted position, tumbles on the
## way, and explodes on impact with a shockwave that damages the hero. Also used
## when the boss tears the arena apart in phase 2.
##
## Collision: layer 16 (hitbox), mask = player | world.

const GRAVITY := 22.0
const LIFETIME := 6.0

var damage: float = 16.0
var velocity: Vector3 = Vector3.ZERO
var _spin: Vector3 = Vector3.ZERO
var _life: float = 0.0
var _active: bool = false
var _mesh: MeshInstance3D

func _ready() -> void:
	collision_layer = BrickKit.L_HITBOX
	collision_mask = BrickKit.L_PLAYER | BrickKit.L_WORLD
	monitorable = false
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.8, 1.8, 1.8)
	shape.shape = box
	add_child(shape)

	_mesh = MeshInstance3D.new()
	_mesh.mesh = BrickKit.unit_box()
	_mesh.scale = Vector3(1.8, 1.8, 1.8)
	_mesh.material_override = BrickKit.brick(Color(0.45, 0.47, 0.52), true, 0.5)
	add_child(_mesh)

	body_entered.connect(_on_body_entered)

## Ballistic launch: solves the arc that reaches `to` in a fixed flight time.
func launch_at(from: Vector3, to: Vector3, flight_speed: float = 18.0) -> void:
	global_position = from
	var delta_pos: Vector3 = to - from
	var flat: Vector3 = Vector3(delta_pos.x, 0.0, delta_pos.z)
	var time: float = maxf(flat.length() / maxf(flight_speed, 1.0), 0.4)
	velocity = flat / time
	velocity.y = delta_pos.y / time + 0.5 * GRAVITY * time
	_spin = Vector3(randf_range(-6.0, 6.0), randf_range(-6.0, 6.0), randf_range(-6.0, 6.0))
	_life = 0.0
	_active = true
	var scale_factor: float = randf_range(0.8, 1.6)
	_mesh.scale = Vector3.ONE * 1.8 * scale_factor

func _physics_process(delta: float) -> void:
	if not _active:
		return
	_life += delta
	velocity.y -= GRAVITY * delta
	global_position += velocity * delta
	_mesh.rotation += _spin * delta
	if _life > LIFETIME or global_position.y < -20.0:
		_explode(false)

func _on_body_entered(body: Node3D) -> void:
	if not _active:
		return
	if body == GameState.get_player() and body.has_method("take_damage"):
		body.call("take_damage", damage, global_position)
	_explode(true)

func _explode(loud: bool) -> void:
	_active = false
	if loud:
		AudioManager.play_at("explosion", global_position, randf_range(1.1, 1.4), 80.0)
		GameState.shake_camera(0.18, 0.25)
		if ObjectPool.is_registered("impact_fx"):
			var host: Node = GameState.world if GameState.world != null else get_parent()
			var fx: Node = ObjectPool.acquire("impact_fx", host)
			if fx != null:
				(fx as Node3D).global_position = global_position
				if fx.has_method("burst"):
					fx.call("burst", Vector3.UP, Color(0.9, 0.75, 0.5), 1.6)
	ObjectPool.release(self)

func pool_acquired() -> void:
	_active = false
	_life = 0.0

func pool_released() -> void:
	_active = false
	velocity = Vector3.ZERO
