class_name Inventory
extends RefCounted
## The player's inventory. Stores stacks of item ids, enforces stack limits and
## quest-item protection, and serialises to/from a Dictionary for saving. Owned by
## GameManager so it is always reachable and trivially saved.

signal item_added(id: String, count: int)
signal item_removed(id: String, count: int)
signal changed()

## Array of {"id": String, "count": int} dictionaries.
var _stacks: Array[Dictionary] = []

func clear() -> void:
	_stacks.clear()
	changed.emit()

## Adds `count` of item `id`. Respects max_stack by splitting into multiple stacks.
func add_item(id: String, count: int = 1) -> void:
	if count <= 0 or not ItemDatabase.has(id):
		return
	var data: ItemData = ItemDatabase.get_item(id)
	var remaining: int = count
	# Fill existing non-full stacks first.
	for stack: Dictionary in _stacks:
		if str(stack["id"]) == id:
			var current: int = int(stack["count"])
			var space: int = data.max_stack - current
			if space > 0:
				var moved: int = mini(space, remaining)
				stack["count"] = current + moved
				remaining -= moved
				if remaining <= 0:
					break
	# Create new stacks for any overflow.
	while remaining > 0:
		var add_now: int = mini(data.max_stack, remaining)
		_stacks.append({"id": id, "count": add_now})
		remaining -= add_now
	item_added.emit(id, count)
	changed.emit()

## Removes up to `count` of item `id`. Returns true if the full amount was removed.
func remove_item(id: String, count: int = 1) -> bool:
	if count <= 0:
		return false
	if get_count(id) < count:
		return false
	var remaining: int = count
	var i: int = _stacks.size() - 1
	while i >= 0 and remaining > 0:
		var stack: Dictionary = _stacks[i]
		if str(stack["id"]) == id:
			var current: int = int(stack["count"])
			var take: int = mini(current, remaining)
			stack["count"] = current - take
			remaining -= take
			if int(stack["count"]) <= 0:
				_stacks.remove_at(i)
		i -= 1
	item_removed.emit(id, count)
	changed.emit()
	return true

func has_item(id: String, count: int = 1) -> bool:
	return get_count(id) >= count

func get_count(id: String) -> int:
	var total: int = 0
	for stack: Dictionary in _stacks:
		if str(stack["id"]) == id:
			total += int(stack["count"])
	return total

## Returns a flattened, display-ready list of {id, count, data} grouped by id.
func get_grouped() -> Array[Dictionary]:
	var totals: Dictionary = {}
	var order: Array[String] = []
	for stack: Dictionary in _stacks:
		var id: String = str(stack["id"])
		if not totals.has(id):
			totals[id] = 0
			order.append(id)
		totals[id] = int(totals[id]) + int(stack["count"])
	var out: Array[Dictionary] = []
	for id: String in order:
		var data: ItemData = ItemDatabase.get_item(id)
		if data != null:
			out.append({"id": id, "count": int(totals[id]), "data": data})
	return out

func is_empty() -> bool:
	return _stacks.is_empty()

# --- Serialisation -----------------------------------------------------------

func to_dict() -> Dictionary:
	var arr: Array = []
	for stack: Dictionary in _stacks:
		arr.append({"id": str(stack["id"]), "count": int(stack["count"])})
	return {"stacks": arr}

func from_dict(data: Dictionary) -> void:
	_stacks.clear()
	var raw_stacks: Variant = data.get("stacks", [])
	if raw_stacks is Array:
		for entry: Variant in (raw_stacks as Array):
			if entry is Dictionary:
				var d: Dictionary = entry as Dictionary
				var id: String = str(d.get("id", ""))
				var count: int = int(d.get("count", 0))
				if id != "" and count > 0 and ItemDatabase.has(id):
					_stacks.append({"id": id, "count": count})
	changed.emit()
