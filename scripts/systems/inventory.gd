extends Node
class_name Inventory

## Inventaire a emplacements avec empilement, plus les emplacements
## d'equipement (tete, torse, pieds, bouteille, poignet) et la barre d'outils.

signal changed()
signal equipment_changed()
signal full()

@export var capacity: int = 24

## Chaque emplacement : { "id": StringName, "amount": int } ou {} si vide
var slots: Array[Dictionary] = []
## slot d'equipement -> id d'objet
var equipped: Dictionary = {}
## barre d'acces rapide : 5 ids d'outils (ou &"")
var quickbar: Array[StringName] = [&"", &"", &"", &"", &""]
var active_slot: int = -1

func _ready() -> void:
	slots.resize(capacity)
	for i in capacity:
		slots[i] = {}

# =============================================================================
#  Stockage
# =============================================================================
func add(id: StringName, amount: int = 1) -> int:
	var item: Resource = ItemDB.get_item(id)
	if item == null:
		return 0
	var remaining := amount
	# on complete d'abord les piles existantes
	for i in slots.size():
		if remaining <= 0:
			break
		var s: Dictionary = slots[i]
		if s.is_empty() or s["id"] != id:
			continue
		var space: int = item.stack_size - s["amount"]
		if space <= 0:
			continue
		var take: int = mini(space, remaining)
		s["amount"] += take
		remaining -= take
	# puis on ouvre de nouveaux emplacements
	for i in slots.size():
		if remaining <= 0:
			break
		if not slots[i].is_empty():
			continue
		var take: int = mini(item.stack_size, remaining)
		slots[i] = {"id": id, "amount": take}
		remaining -= take
	var added := amount - remaining
	if added > 0:
		changed.emit()
		GameState.item_collected.emit(id, added)
		_auto_assign_quickbar(id)
	if remaining > 0:
		full.emit()
	return added

func remove(id: StringName, amount: int = 1) -> bool:
	if count(id) < amount:
		return false
	var remaining := amount
	for i in range(slots.size() - 1, -1, -1):
		if remaining <= 0:
			break
		var s: Dictionary = slots[i]
		if s.is_empty() or s["id"] != id:
			continue
		var take: int = mini(s["amount"], remaining)
		s["amount"] -= take
		remaining -= take
		if s["amount"] <= 0:
			slots[i] = {}
	changed.emit()
	return true

func count(id: StringName) -> int:
	var total := 0
	for s in slots:
		if not s.is_empty() and s["id"] == id:
			total += s["amount"]
	return total

func has_all(ingredients: Dictionary) -> bool:
	for id in ingredients:
		if count(id) < ingredients[id]:
			return false
	return true

func consume(ingredients: Dictionary) -> bool:
	if not has_all(ingredients):
		return false
	for id in ingredients:
		remove(id, ingredients[id])
	return true

func free_slots() -> int:
	var n := 0
	for s in slots:
		if s.is_empty():
			n += 1
	return n

func total_items() -> int:
	var n := 0
	for s in slots:
		if not s.is_empty():
			n += s["amount"]
	return n

# =============================================================================
#  Equipement
# =============================================================================
func can_equip(id: StringName) -> bool:
	var item: Resource = ItemDB.get_item(id)
	return item != null and item.equip_slot != &""

func equip(id: StringName) -> bool:
	var item: Resource = ItemDB.get_item(id)
	if item == null or item.equip_slot == &"":
		return false
	if count(id) <= 0:
		return false
	var slot: StringName = item.equip_slot
	if equipped.has(slot):
		unequip(slot)
	remove(id, 1)
	equipped[slot] = id
	equipment_changed.emit()
	changed.emit()
	return true

func unequip(slot: StringName) -> void:
	if not equipped.has(slot):
		return
	var id: StringName = equipped[slot]
	equipped.erase(slot)
	add(id, 1)
	equipment_changed.emit()

func is_equipped(id: StringName) -> bool:
	for slot in equipped:
		if equipped[slot] == id:
			return true
	return false

## Somme des modificateurs de tout l'equipement porte.
func collect_modifiers() -> Dictionary:
	var mods: Dictionary = {}
	for slot in equipped:
		var item: Resource = ItemDB.get_item(equipped[slot])
		if item == null:
			continue
		for key in item.modifiers:
			mods[key] = mods.get(key, 0.0) + item.modifiers[key]
	return mods

# =============================================================================
#  Barre d'outils
# =============================================================================
func _auto_assign_quickbar(id: StringName) -> void:
	var item: Resource = ItemDB.get_item(id)
	if item == null or not item.is_holdable:
		return
	if quickbar.has(id):
		return
	for i in quickbar.size():
		if quickbar[i] == &"":
			quickbar[i] = id
			if active_slot < 0:
				active_slot = i
			equipment_changed.emit()
			return

func set_active_slot(index: int) -> void:
	if index < 0 or index >= quickbar.size():
		active_slot = -1
	elif quickbar[index] == &"":
		active_slot = -1
	else:
		active_slot = index
	equipment_changed.emit()

func cycle_slot(direction: int) -> void:
	var n := quickbar.size()
	for step in range(1, n + 1):
		var i: int = posmod(active_slot + direction * step, n)
		if quickbar[i] != &"":
			set_active_slot(i)
			return
	set_active_slot(-1)

func active_tool() -> StringName:
	if active_slot < 0 or active_slot >= quickbar.size():
		return &""
	var id: StringName = quickbar[active_slot]
	if id != &"" and count(id) <= 0:
		quickbar[active_slot] = &""
		return &""
	return id

# =============================================================================
#  Sauvegarde
# =============================================================================
func serialize() -> Dictionary:
	var out_slots: Array = []
	for s in slots:
		if s.is_empty():
			out_slots.append(null)
		else:
			out_slots.append({"id": String(s["id"]), "amount": s["amount"]})
	var eq: Dictionary = {}
	for k in equipped:
		eq[String(k)] = String(equipped[k])
	return {"slots": out_slots, "equipped": eq,
		"quickbar": quickbar.map(func(q): return String(q)),
		"active": active_slot}

func deserialize(d: Dictionary) -> void:
	var in_slots: Array = d.get("slots", [])
	for i in slots.size():
		if i < in_slots.size() and in_slots[i] != null:
			slots[i] = {"id": StringName(in_slots[i]["id"]),
				"amount": int(in_slots[i]["amount"])}
		else:
			slots[i] = {}
	equipped.clear()
	for k in d.get("equipped", {}):
		equipped[StringName(k)] = StringName(d["equipped"][k])
	var qb: Array = d.get("quickbar", [])
	for i in quickbar.size():
		quickbar[i] = StringName(qb[i]) if i < qb.size() else &""
	active_slot = int(d.get("active", -1))
	changed.emit()
	equipment_changed.emit()
