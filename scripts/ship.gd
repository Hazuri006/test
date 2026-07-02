class_name PlayerShip
extends Node3D

## Vaisseau en vue première personne : la souris oriente, les actions
## clavier translatent. Accélération et amortissement dépendent de delta,
## donc indépendants du framerate.

const ACCELERATION := 55.0
const MAX_SPEED := 130.0
const BOOST_MULTIPLIER := 2.8
const IDLE_DAMPING := 1.1
const OVERSPEED_DAMPING := 2.5
const MOUSE_SENSITIVITY := 0.0022

var velocity := Vector3.ZERO

@onready var camera: Camera3D = $Camera3D


func _ready() -> void:
	camera.fov = 75.0
	camera.near = 0.5
	camera.far = 9000.0
	camera.current = true


## Replace le vaisseau au point de départ avec le système en vue.
func reset_to_start() -> void:
	velocity = Vector3.ZERO
	global_position = Vector3(0.0, 140.0, 560.0)
	look_at(Vector3.ZERO, Vector3.UP)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
		var motion := event as InputEventMouseMotion
		rotate_object_local(Vector3.UP, -motion.relative.x * MOUSE_SENSITIVITY)
		rotate_object_local(Vector3.RIGHT, -motion.relative.y * MOUSE_SENSITIVITY)
		orthonormalize()


func _process(delta: float) -> void:
	var input_dir := Vector3.ZERO
	if Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
		input_dir.z = Input.get_action_strength("move_back") - Input.get_action_strength("move_forward")
		input_dir.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
		input_dir.y = Input.get_action_strength("move_up") - Input.get_action_strength("move_down")

	var boost := BOOST_MULTIPLIER if Input.is_action_pressed("boost") else 1.0
	if input_dir.length_squared() > 0.0001:
		velocity += (global_transform.basis * input_dir.normalized()) * ACCELERATION * boost * delta
	else:
		velocity *= exp(-IDLE_DAMPING * delta)

	# Plafond de vitesse : franc en poussée, adouci quand le boost retombe.
	var speed_cap := MAX_SPEED * boost
	var speed := velocity.length()
	if speed > speed_cap:
		var eased := maxf(speed_cap, speed * exp(-OVERSPEED_DAMPING * delta))
		velocity = velocity * (eased / speed)

	global_position += velocity * delta
