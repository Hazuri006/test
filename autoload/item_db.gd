extends Node
## Base de donnees des objets et des recettes du fabricateur.
## Autoload : accessible partout via `ItemDB`.

const ItemDataScript := preload("res://scripts/items/item_data.gd")
const RecipeScript := preload("res://scripts/systems/recipe.gd")

var items: Dictionary = {}          # StringName -> ItemData
var recipes: Dictionary = {}        # StringName (output) -> Recipe
var groups: Dictionary = {}         # StringName -> { name, icon_color, recipes[] }

func _ready() -> void:
	_build_items()
	_build_recipes()

func get_item(id: StringName) -> Resource:
	return items.get(id)

func item_name(id: StringName) -> String:
	var it: Resource = items.get(id)
	return it.name if it != null else String(id)

func item_color(id: StringName) -> Color:
	var it: Resource = items.get(id)
	return it.color if it != null else Color(0.6, 0.6, 0.6)

func has_recipe(id: StringName) -> bool:
	return recipes.has(id)

func get_recipe(id: StringName) -> Resource:
	return recipes.get(id)

func recipes_in_group(group: StringName) -> Array:
	var out: Array = []
	for key in recipes:
		var r: Resource = recipes[key]
		if r.group == group:
			out.append(r)
	out.sort_custom(func(a, b): return item_name(a.output) < item_name(b.output))
	return out

# -----------------------------------------------------------------------------
func _add(cfg: Dictionary) -> void:
	var item: Resource = ItemDataScript.make(cfg)
	items[item.id] = item

func _build_items() -> void:
	var C := ItemDataScript.Category
	var S := ItemDataScript.Shape

	# ------------------------------------------------------- matieres brutes --
	_add({
		"id": &"titanium", "name": "Titane", "category": C.RAW, "shape": S.INGOT,
		"color": Color(0.72, 0.75, 0.79), "accent": Color(0.92, 0.95, 1.0),
		"stack_size": 10, "mass": 1.0,
		"description": "Metal leger extrait des affleurements calcaires. Base de presque tout."})
	_add({
		"id": &"copper", "name": "Minerai de cuivre", "category": C.RAW,
		"shape": S.CHUNK, "color": Color(0.72, 0.38, 0.16),
		"accent": Color(1.0, 0.62, 0.3), "stack_size": 10,
		"description": "Conducteur. Necessaire aux batteries et au cablage."})
	_add({
		"id": &"quartz", "name": "Quartz", "category": C.RAW, "shape": S.CRYSTAL,
		"color": Color(0.82, 0.9, 0.95, 0.9), "accent": Color(1, 1, 1),
		"stack_size": 10,
		"description": "Cristal translucide. Fondu, il donne du verre."})
	_add({
		"id": &"silver", "name": "Minerai d'argent", "category": C.RAW,
		"shape": S.CHUNK, "color": Color(0.82, 0.84, 0.88),
		"accent": Color(1, 1, 1), "stack_size": 10,
		"description": "Extrait du gres. Indispensable au cablage."})
	_add({
		"id": &"gold", "name": "Or", "category": C.RAW, "shape": S.CHUNK,
		"color": Color(0.95, 0.76, 0.2), "accent": Color(1.0, 0.92, 0.55),
		"stack_size": 10,
		"description": "Metal noble, inalterable. Electronique de precision."})
	_add({
		"id": &"lead", "name": "Plomb", "category": C.RAW, "shape": S.CHUNK,
		"color": Color(0.36, 0.38, 0.44), "accent": Color(0.6, 0.62, 0.7),
		"stack_size": 10,
		"description": "Dense. Fait ecran aux rayonnements."})
	_add({
		"id": &"diamond", "name": "Diamant", "category": C.RAW, "shape": S.CRYSTAL,
		"color": Color(0.85, 0.95, 1.0), "accent": Color(1, 1, 1), "stack_size": 5,
		"description": "Carbone pur cristallise. Se trouve dans le schiste."})
	_add({
		"id": &"lithium", "name": "Lithium", "category": C.RAW, "shape": S.CRYSTAL,
		"color": Color(0.85, 0.85, 0.92), "accent": Color(1, 0.95, 0.9),
		"stack_size": 10,
		"description": "Alcalin leger. Alliages haute performance."})
	_add({
		"id": &"salt", "name": "Cristal de sel", "category": C.RAW, "shape": S.CRYSTAL,
		"color": Color(0.94, 0.94, 0.9), "accent": Color(1, 1, 1), "stack_size": 10,
		"description": "Recolte sur les fonds sableux. Sert a purifier l'eau."})
	_add({
		"id": &"coral", "name": "Echantillon de corail", "category": C.RAW,
		"shape": S.PLANT, "color": Color(0.92, 0.55, 0.45),
		"accent": Color(1.0, 0.8, 0.7), "stack_size": 10,
		"description": "Preleve sur les coraux en table. Riche en calcaire."})
	_add({
		"id": &"creepvine", "name": "Echantillon de liane", "category": C.RAW,
		"shape": S.PLANT, "color": Color(0.3, 0.55, 0.2),
		"accent": Color(0.6, 0.85, 0.35), "stack_size": 10,
		"description": "Fibre vegetale des forets d'algues geantes."})
	_add({
		"id": &"creepvine_seed", "name": "Grappe de spores", "category": C.RAW,
		"shape": S.SEED, "color": Color(0.85, 0.78, 0.3),
		"accent": Color(1.0, 0.95, 0.5), "stack_size": 10,
		"description": "Grappe luminescente gorgee d'huile."})
	_add({
		"id": &"acid_mushroom", "name": "Champignon acide", "category": C.RAW,
		"shape": S.PLANT, "color": Color(0.55, 0.3, 0.72),
		"accent": Color(0.85, 0.5, 1.0), "stack_size": 10,
		"description": "Sa seve corrosive fait un excellent electrolyte."})
	_add({
		"id": &"ribbon_plant", "name": "Plante-ruban", "category": C.RAW,
		"shape": S.PLANT, "color": Color(0.35, 0.65, 0.55),
		"accent": Color(0.6, 0.95, 0.8), "stack_size": 10,
		"description": "Longue lame souple. Comestible apres traitement."})

	# ------------------------------------------------------ matieres raffinees -
	_add({
		"id": &"glass", "name": "Verre", "category": C.REFINED, "shape": S.INGOT,
		"color": Color(0.7, 0.88, 0.92, 0.85), "accent": Color(1, 1, 1),
		"stack_size": 10,
		"description": "Quartz fondu. Transparent et resistant a la pression."})
	_add({
		"id": &"silicone", "name": "Caoutchouc de silicone", "category": C.REFINED,
		"shape": S.INGOT, "color": Color(0.9, 0.9, 0.86),
		"accent": Color(1, 1, 1), "stack_size": 10,
		"description": "Elastomere issu de la seve de liane."})
	_add({
		"id": &"fiber_mesh", "name": "Maille de fibres", "category": C.REFINED,
		"shape": S.INGOT, "color": Color(0.55, 0.62, 0.42),
		"accent": Color(0.8, 0.9, 0.6), "stack_size": 10,
		"description": "Tissu tresse serre, souple et tres resistant."})
	_add({
		"id": &"lubricant", "name": "Lubrifiant", "category": C.REFINED,
		"shape": S.CANISTER, "color": Color(0.85, 0.72, 0.25),
		"accent": Color(1.0, 0.9, 0.5), "stack_size": 10,
		"description": "Huile pressee des grappes de spores."})
	_add({
		"id": &"bleach", "name": "Javel", "category": C.REFINED, "shape": S.BOTTLE,
		"color": Color(0.85, 0.92, 0.95), "accent": Color(0.6, 0.9, 1.0),
		"stack_size": 5,
		"description": "Desinfectant. Etape obligatoire pour rendre l'eau potable."})
	_add({
		"id": &"battery", "name": "Batterie", "category": C.REFINED, "shape": S.DEVICE,
		"color": Color(0.2, 0.24, 0.3), "accent": Color(0.3, 0.95, 0.6),
		"stack_size": 5,
		"description": "Cellule electrochimique de 200 unites d'energie."})
	_add({
		"id": &"wiring_kit", "name": "Kit de cablage", "category": C.REFINED,
		"shape": S.DEVICE, "color": Color(0.3, 0.32, 0.36),
		"accent": Color(0.95, 0.75, 0.2), "stack_size": 5,
		"description": "Faisceau de conducteurs en argent."})
	_add({
		"id": &"titanium_ingot", "name": "Lingot de titane", "category": C.REFINED,
		"shape": S.INGOT, "color": Color(0.78, 0.81, 0.86),
		"accent": Color(1, 1, 1), "stack_size": 5,
		"description": "Dix unites de titane compactees."})

	# ------------------------------------------------------------ equipements --
	_add({
		"id": &"fins", "name": "Palmes", "category": C.EQUIPMENT, "shape": S.DEVICE,
		"color": Color(0.2, 0.35, 0.5), "accent": Color(0.4, 0.8, 1.0),
		"stack_size": 1, "equip_slot": &"feet",
		"modifiers": {"swim_speed": 0.4},
		"description": "Augmente la vitesse de nage de 40 %."})
	_add({
		"id": &"tank", "name": "Bouteille d'oxygene", "category": C.EQUIPMENT,
		"shape": S.CANISTER, "color": Color(0.75, 0.78, 0.8),
		"accent": Color(0.3, 0.85, 1.0), "stack_size": 1, "equip_slot": &"tank",
		"modifiers": {"oxygen_capacity": 30.0},
		"description": "+30 s d'autonomie en plongee."})
	_add({
		"id": &"tank_high", "name": "Bouteille haute capacite",
		"category": C.EQUIPMENT, "shape": S.CANISTER,
		"color": Color(0.85, 0.6, 0.2), "accent": Color(1.0, 0.85, 0.3),
		"stack_size": 1, "equip_slot": &"tank",
		"modifiers": {"oxygen_capacity": 75.0},
		"description": "+75 s d'autonomie. Alourdit legerement la nage."})
	_add({
		"id": &"rebreather", "name": "Recycleur d'air", "category": C.EQUIPMENT,
		"shape": S.DEVICE, "color": Color(0.28, 0.3, 0.34),
		"accent": Color(0.4, 0.95, 0.8), "stack_size": 1, "equip_slot": &"head",
		"modifiers": {"depth_o2_penalty": -1.0},
		"description": "Supprime la surconsommation d'oxygene en profondeur."})
	_add({
		"id": &"suit", "name": "Combinaison renforcee", "category": C.EQUIPMENT,
		"shape": S.DEVICE, "color": Color(0.18, 0.22, 0.28),
		"accent": Color(0.9, 0.55, 0.15), "stack_size": 1, "equip_slot": &"body",
		"modifiers": {"damage_resist": 0.35, "cold_resist": 0.5},
		"description": "Reduit les degats de 35 % et protege du froid."})
	_add({
		"id": &"compass", "name": "Compas", "category": C.EQUIPMENT,
		"shape": S.DEVICE, "color": Color(0.25, 0.28, 0.32),
		"accent": Color(0.3, 0.9, 1.0), "stack_size": 1, "equip_slot": &"wrist",
		"modifiers": {"compass": 1.0},
		"description": "Affiche le cap et la profondeur exacte."})

	# ----------------------------------------------------------------- outils --
	_add({
		"id": &"knife", "name": "Couteau de survie", "category": C.TOOL,
		"shape": S.DEVICE, "color": Color(0.6, 0.63, 0.68),
		"accent": Color(0.9, 0.35, 0.2), "stack_size": 1, "is_holdable": true,
		"description": "Tranche la vegetation et defend contre la faune."})
	_add({
		"id": &"flashlight", "name": "Lampe torche", "category": C.TOOL,
		"shape": S.DEVICE, "color": Color(0.25, 0.27, 0.3),
		"accent": Color(1.0, 0.95, 0.7), "stack_size": 1, "is_holdable": true,
		"description": "Faisceau puissant. Indispensable au-dela de 60 m."})
	_add({
		"id": &"scanner", "name": "Scanner", "category": C.TOOL, "shape": S.DEVICE,
		"color": Color(0.22, 0.26, 0.3), "accent": Color(0.3, 1.0, 0.85),
		"stack_size": 1, "is_holdable": true,
		"description": "Analyse la faune, la flore et les epaves."})
	_add({
		"id": &"repair_tool", "name": "Outil de reparation", "category": C.TOOL,
		"shape": S.DEVICE, "color": Color(0.3, 0.3, 0.32),
		"accent": Color(1.0, 0.7, 0.2), "stack_size": 1, "is_holdable": true,
		"description": "Soude les breches de la capsule et des vehicules."})
	_add({
		"id": &"beacon", "name": "Balise", "category": C.TOOL, "shape": S.DEVICE,
		"color": Color(0.85, 0.5, 0.15), "accent": Color(1.0, 0.85, 0.4),
		"stack_size": 5, "is_holdable": true,
		"description": "Marque une position, visible a travers l'eau."})

	# --------------------------------------------------- nourriture et eau -----
	_add({
		"id": &"peeper", "name": "Peeper", "category": C.FOOD, "shape": S.FISH,
		"color": Color(0.35, 0.6, 0.85), "accent": Color(1.0, 0.75, 0.2),
		"stack_size": 5, "food_value": 12.0, "water_value": -3.0,
		"description": "Poisson vif. Cru, il fait plus de mal que de bien."})
	_add({
		"id": &"cooked_peeper", "name": "Peeper cuit", "category": C.FOOD,
		"shape": S.FISH, "color": Color(0.8, 0.55, 0.3),
		"accent": Color(1.0, 0.8, 0.4), "stack_size": 5, "food_value": 32.0,
		"water_value": -5.0,
		"description": "Nourrissant, mais deshydratant."})
	_add({
		"id": &"cured_peeper", "name": "Peeper sale", "category": C.FOOD,
		"shape": S.FISH, "color": Color(0.85, 0.72, 0.5),
		"accent": Color(1, 1, 1), "stack_size": 10, "food_value": 21.0,
		"description": "Se conserve indefiniment."})
	_add({
		"id": &"water", "name": "Eau desalinisee", "category": C.WATER,
		"shape": S.BOTTLE, "color": Color(0.45, 0.8, 0.95),
		"accent": Color(0.9, 1.0, 1.0), "stack_size": 5, "water_value": 35.0,
		"description": "Enfin potable."})
	_add({
		"id": &"nutrient_block", "name": "Bloc nutritif", "category": C.FOOD,
		"shape": S.INGOT, "color": Color(0.55, 0.6, 0.35),
		"accent": Color(0.8, 0.9, 0.5), "stack_size": 10, "food_value": 40.0,
		"water_value": -8.0,
		"description": "Compact, calorique, sans aucune saveur."})
	_add({
		"id": &"first_aid", "name": "Trousse de secours", "category": C.TOOL,
		"shape": S.DEVICE, "color": Color(0.9, 0.92, 0.92),
		"accent": Color(0.9, 0.2, 0.2), "stack_size": 5, "health_value": 45.0,
		"description": "Restaure 45 points de sante."})

func _build_recipes() -> void:
	groups = {
		&"basic": {"name": "Materiaux de base", "color": Color(0.35, 0.8, 1.0)},
		&"survival": {"name": "Survie", "color": Color(0.4, 0.9, 0.5)},
		&"equipment": {"name": "Equipement", "color": Color(1.0, 0.65, 0.2)},
		&"tools": {"name": "Outils", "color": Color(0.8, 0.5, 1.0)},
	}

	var defs: Array = [
		# --- materiaux de base ------------------------------------------------
		[&"glass", {&"quartz": 2}, &"basic", 1, 2.0],
		[&"titanium_ingot", {&"titanium": 10}, &"basic", 1, 3.0],
		[&"silicone", {&"creepvine": 1}, &"basic", 1, 2.0],
		[&"fiber_mesh", {&"creepvine": 2}, &"basic", 1, 2.2],
		[&"lubricant", {&"creepvine_seed": 1}, &"basic", 1, 2.0],
		[&"bleach", {&"salt": 1, &"coral": 1}, &"basic", 1, 2.4],
		[&"battery", {&"acid_mushroom": 2, &"copper": 1}, &"basic", 1, 3.0],
		[&"wiring_kit", {&"silver": 2}, &"basic", 1, 2.6],
		# --- survie -----------------------------------------------------------
		[&"water", {&"bleach": 1, &"salt": 1}, &"survival", 2, 2.6],
		[&"cooked_peeper", {&"peeper": 1}, &"survival", 1, 1.8],
		[&"cured_peeper", {&"peeper": 1, &"salt": 1}, &"survival", 1, 1.8],
		[&"nutrient_block", {&"ribbon_plant": 2, &"coral": 1}, &"survival", 1, 2.6],
		[&"first_aid", {&"fiber_mesh": 1, &"acid_mushroom": 1}, &"survival", 1, 2.8],
		# --- equipement -------------------------------------------------------
		[&"fins", {&"silicone": 2}, &"equipment", 1, 3.0],
		[&"tank", {&"titanium": 3}, &"equipment", 1, 3.2],
		[&"tank_high", {&"tank": 1, &"glass": 2, &"titanium": 1}, &"equipment", 1, 4.0],
		[&"rebreather", {&"fiber_mesh": 1, &"wiring_kit": 1}, &"equipment", 1, 3.6],
		[&"suit", {&"fiber_mesh": 2, &"silicone": 1}, &"equipment", 1, 3.8],
		[&"compass", {&"wiring_kit": 1, &"copper": 1}, &"equipment", 1, 2.8],
		# --- outils -----------------------------------------------------------
		[&"knife", {&"titanium": 1, &"silicone": 1}, &"tools", 1, 2.6],
		[&"flashlight", {&"titanium": 1, &"battery": 1, &"glass": 1}, &"tools", 1, 3.0],
		[&"scanner", {&"titanium": 1, &"battery": 1, &"wiring_kit": 1}, &"tools", 1, 3.4],
		[&"repair_tool", {&"titanium": 1, &"wiring_kit": 1, &"silicone": 1},
			&"tools", 1, 3.4],
		[&"beacon", {&"titanium": 1, &"wiring_kit": 1}, &"tools", 1, 2.8],
	]

	for d in defs:
		var r: Resource = RecipeScript.make(d[0], d[1], d[2], d[3], d[4])
		recipes[r.output] = r
