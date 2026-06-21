class_name ItemData
extends Resource
## Definition of a single inventory item. Instances are produced by ItemDatabase
## (the runtime source of truth) and may also be authored as .tres files.

@export var id: String = ""
@export var display_name: String = "Unknown Item"
@export_multiline var description: String = ""
@export var category: GameTypes.ItemCategory = GameTypes.ItemCategory.QUEST
@export var stackable: bool = false
@export var max_stack: int = 1
## Quest items cannot be discarded and are highlighted in the inventory.
@export var is_quest_item: bool = false
## Consumables (batteries, medical) are removed from the inventory when used.
@export var consumable: bool = false
## Tint used for the generated placeholder icon when no texture is supplied.
@export var icon_color: Color = Color(0.7, 0.7, 0.7)
## Optional path to an icon texture; the UI falls back to a coloured panel if empty.
@export var icon_path: String = ""
## Message shown when the item is used (e.g. "You bandaged your wounds.").
@export_multiline var use_message: String = ""
## For document / audio-log items, the id of the data entry they unlock on use.
@export var linked_data_id: String = ""
