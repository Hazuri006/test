extends Resource
class_name ItemData

## Definition d'un objet du jeu. Aucune texture n'est necessaire : chaque objet
## porte une couleur et une forme, et les icones sont dessinees a la volee par
## `IconPainter` (scripts/ui/icon_painter.gd).

enum Category { RAW, REFINED, EQUIPMENT, TOOL, FOOD, WATER, BUILDABLE }

enum Shape { CHUNK, CRYSTAL, INGOT, PLANT, CANISTER, DEVICE, FISH, BOTTLE, SEED }

@export var id: StringName = &""
@export var name: String = ""
@export var description: String = ""
@export var category: Category = Category.RAW
@export var shape: Shape = Shape.CHUNK
@export var color: Color = Color(0.7, 0.7, 0.7)
@export var accent: Color = Color(1, 1, 1)
@export var stack_size: int = 5
@export var mass: float = 1.0

## Equipement : emplacement occupe une fois equipe ("" = non equipable)
@export var equip_slot: StringName = &""
## Modificateurs appliques au joueur lorsque l'objet est equipe.
@export var modifiers: Dictionary = {}
## Nourriture / eau restaurees a la consommation.
@export var food_value: float = 0.0
@export var water_value: float = 0.0
@export var health_value: float = 0.0
## Vrai si l'objet peut etre tenu en main (outil actif).
@export var is_holdable: bool = false

static func make(cfg: Dictionary) -> ItemData:
	var item := ItemData.new()
	for key in cfg:
		item.set(key, cfg[key])
	return item

func is_edible() -> bool:
	return food_value > 0.0 or water_value > 0.0
