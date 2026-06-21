class_name ItemDatabase
extends RefCounted
## Runtime source of truth for every item definition. Lazily builds a dictionary
## of ItemData instances the first time it is queried. Authored .tres item files
## (if present under res://data/items) override the built-in definition of the
## same id, so designers can tweak data without editing code.

static var _items: Dictionary = {}
static var _initialised: bool = false

static func _ensure_initialised() -> void:
	if _initialised:
		return
	_initialised = true
	_define()
	_load_overrides()

static func _define() -> void:
	var c := GameTypes.ItemCategory
	_add("maintenance_key", "Maintenance Key", "A heavy iron key tagged 'MAINT'. Smells of oil.", c.KEY, {"quest": true, "color": Color(0.7, 0.6, 0.3)})
	_add("basement_key", "Basement Key", "A short brass key. The plastic fob reads 'SUB-LEVEL'.", c.KEY, {"quest": true, "color": Color(0.8, 0.7, 0.4)})
	_add("archive_key", "Archive Key", "A small filing-cabinet key on a frayed red cord.", c.KEY, {"quest": true, "color": Color(0.8, 0.2, 0.2)})
	_add("morgue_key", "Morgue Key", "A cold steel key. The teeth are caked with something dark.", c.KEY, {"quest": true, "color": Color(0.6, 0.6, 0.65)})

	_add("generator_fuse_a", "Generator Fuse A", "A 30-amp ceramic fuse stamped 'A-LINE'.", c.FUSE, {"quest": true, "color": Color(0.85, 0.55, 0.2)})
	_add("generator_fuse_b", "Generator Fuse B", "A 30-amp ceramic fuse stamped 'B-LINE'.", c.FUSE, {"quest": true, "color": Color(0.85, 0.45, 0.15)})
	_add("fuel_can", "Fuel Can", "A dented red jerrycan, about half full of diesel.", c.TOOL, {"quest": true, "color": Color(0.7, 0.15, 0.12)})

	_add("flashlight_battery", "Flashlight Battery", "A bulky industrial cell. Restores flashlight charge.", c.BATTERY, {"stack": 6, "consumable": true, "color": Color(0.2, 0.6, 0.3), "use": "You replaced the flashlight battery."})
	_add("medical_bandage", "Medical Bandage", "A field dressing in a crinkled wrapper. Stops the bleeding.", c.MEDICAL, {"stack": 3, "consumable": true, "color": Color(0.85, 0.85, 0.8), "use": "You bound your wounds. The pain dulls."})

	_add("security_access_seal", "Security Access Seal", "A magnetic lockdown seal. Three disable the lower-ward security.", c.QUEST, {"stack": 3, "quest": true, "color": Color(0.2, 0.5, 0.7)})
	_add("containment_coil", "Containment Coil", "A coil of copper wound around a blackened core. It hums faintly.", c.QUEST, {"quest": true, "color": Color(0.6, 0.35, 0.1)})
	_add("lena_recorder", "Lena's Recorder", "Your sister's battered voice recorder. Still holds one file.", c.AUDIO_LOG, {"quest": true, "color": Color(0.7, 0.2, 0.2), "use": "You press play on Lena's recorder.", "linked": "log_lena_final"})
	_add("flashlight", "Flashlight", "A rubberised work flashlight. Reliable, if the batteries last.", c.TOOL, {"quest": true, "color": Color(0.9, 0.85, 0.5)})
	_add("electrical_map", "Electrical Map", "A laminated schematic of the hospital's power grid.", c.DOCUMENT, {"quest": true, "color": Color(0.4, 0.6, 0.8), "use": "You study the electrical map.", "linked": "doc_electrical_map"})
	_add("bolt_cutters", "Bolt Cutters", "Long-handled cutters. Strong enough for a rusted chain.", c.TOOL, {"quest": true, "color": Color(0.5, 0.2, 0.2)})

	# --- Backrooms ---
	_add("exit_sigil", "Exit Sigil", "A scrawled symbol on a torn page. Three of them mark the way out.", c.QUEST, {"stack": 3, "quest": true, "color": Color(0.9, 0.85, 0.3)})
	_add("almond_water", "Almond Water", "A carton of off-tasting almond water. Steadies the mind.", c.MEDICAL, {"stack": 5, "consumable": true, "color": Color(0.85, 0.8, 0.6), "use": "You drink the almond water. The walls feel a little less wrong."})
	_add("level_key", "Level Key", "A heavy industrial keycard stamped 'M.E.G.'. Three open the freight door.", c.QUEST, {"stack": 3, "quest": true, "color": Color(0.3, 0.7, 0.9)})

static func _add(id: String, display_name: String, description: String, category: GameTypes.ItemCategory, opts: Dictionary = {}) -> void:
	var item: ItemData = ItemData.new()
	item.id = id
	item.display_name = display_name
	item.description = description
	item.category = category
	item.is_quest_item = bool(opts.get("quest", false))
	item.consumable = bool(opts.get("consumable", false))
	var stack: int = int(opts.get("stack", 1))
	item.stackable = stack > 1
	item.max_stack = maxi(stack, 1)
	item.icon_color = opts.get("color", Color(0.7, 0.7, 0.7))
	item.use_message = str(opts.get("use", ""))
	item.linked_data_id = str(opts.get("linked", ""))
	_items[id] = item

## Scans res://data/items for .tres ItemData overrides.
static func _load_overrides() -> void:
	var dir: DirAccess = DirAccess.open("res://data/items")
	if dir == null:
		return
	dir.list_dir_begin()
	var file_name: String = dir.get_next()
	while file_name != "":
		if file_name.ends_with(".tres") or file_name.ends_with(".res"):
			var res: Resource = ResourceLoader.load("res://data/items/" + file_name)
			if res is ItemData:
				var data: ItemData = res as ItemData
				if data.id != "":
					_items[data.id] = data
		file_name = dir.get_next()
	dir.list_dir_end()

static func get_item(id: String) -> ItemData:
	_ensure_initialised()
	if _items.has(id):
		return _items[id] as ItemData
	return null

static func has(id: String) -> bool:
	_ensure_initialised()
	return _items.has(id)

static func all_ids() -> Array[String]:
	_ensure_initialised()
	var out: Array[String] = []
	for k: Variant in _items.keys():
		out.append(str(k))
	return out
