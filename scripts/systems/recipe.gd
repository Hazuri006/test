extends Resource
class_name Recipe

## Une recette du fabricateur : des ingredients, un resultat, une categorie
## d'arborescence et une duree de fabrication.

@export var output: StringName = &""
@export var amount: int = 1
## { StringName (id d'objet) : int (quantite) }
@export var ingredients: Dictionary = {}
@export var group: StringName = &"basic"
@export var craft_time: float = 2.4

static func make(output_id: StringName, ingredients: Dictionary,
		group: StringName = &"basic", amount: int = 1,
		craft_time: float = 2.4) -> Recipe:
	var r := Recipe.new()
	r.output = output_id
	r.ingredients = ingredients
	r.group = group
	r.amount = amount
	r.craft_time = craft_time
	return r
