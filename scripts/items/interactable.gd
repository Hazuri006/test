extends StaticBody3D
class_name Interactable

## Base de tout ce avec quoi le joueur peut interagir (touche E).
## Les objets interactifs vivent sur le calque physique 3.

signal used(by: Node)

@export var prompt: String = "Utiliser"
@export var enabled: bool = true
@export var hold_time: float = 0.0        # > 0 = maintien requis

func _ready() -> void:
	collision_layer = 1 << 2
	collision_mask = 0
	add_to_group(&"interactable")

func get_prompt(_player: Node) -> String:
	return prompt

func can_interact(_player: Node) -> bool:
	return enabled

func interact(player: Node) -> void:
	used.emit(player)

## Surbrillance quand le joueur vise l'objet.
func set_highlight(on: bool) -> void:
	for child in get_children():
		if child is MeshInstance3D:
			var mat: Material = (child as MeshInstance3D).material_override
			if mat is ShaderMaterial and mat.shader != null:
				(mat as ShaderMaterial).set_shader_parameter("highlight",
					1.0 if on else 0.0)
			elif mat is StandardMaterial3D:
				var sm := mat as StandardMaterial3D
				sm.emission_enabled = on
				if on:
					sm.emission = Color(0.2, 0.9, 1.0)
					sm.emission_energy_multiplier = 0.5
