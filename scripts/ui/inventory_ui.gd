extends Control
## Inventory overlay. Lists grouped items with placeholder coloured icons, shows the
## selected item's description, and uses consumables (batteries / medical).

var _list: ItemList
var _name: Label
var _desc: RichTextLabel
var _use_button: Button
var _grouped: Array[Dictionary] = []

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(UITheme.dim_background(0.88))

	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)
	var panel: PanelContainer = UITheme.panel()
	panel.custom_minimum_size = Vector2(820, 520)
	center.add_child(panel)
	var root: VBoxContainer = VBoxContainer.new()
	panel.add_child(root)
	root.add_child(UITheme.title("INVENTORY", 30))
	root.add_child(UITheme.hsep(8))

	var hb: HBoxContainer = HBoxContainer.new()
	hb.add_theme_constant_override("separation", 16)
	hb.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(hb)

	_list = ItemList.new()
	_list.custom_minimum_size = Vector2(360, 400)
	_list.add_theme_color_override("font_color", UITheme.TEXT)
	_list.item_selected.connect(_on_select)
	hb.add_child(_list)

	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	hb.add_child(right)
	_name = UITheme.label("", 22, UITheme.ACCENT)
	right.add_child(_name)
	_desc = RichTextLabel.new()
	_desc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_desc.add_theme_color_override("default_color", UITheme.TEXT)
	_desc.add_theme_font_size_override("normal_font_size", 17)
	right.add_child(_desc)
	_use_button = UITheme.button("Use", 200)
	_use_button.disabled = true
	_use_button.pressed.connect(_on_use)
	right.add_child(_use_button)

	var close: Button = UITheme.button("Close  (Tab / Esc)", 240)
	close.pressed.connect(_close)
	root.add_child(close)

	_refresh()

func _refresh() -> void:
	_grouped = GameManager.inventory.get_grouped()
	_list.clear()
	for entry: Dictionary in _grouped:
		var data: ItemData = entry["data"]
		var count: int = int(entry["count"])
		var suffix: String = "  x%d" % count if count > 1 else ""
		var idx: int = _list.add_item("%s%s" % [data.display_name, suffix])
		_list.set_item_custom_fg_color(idx, UITheme.ACCENT if data.is_quest_item else UITheme.TEXT)
	if _grouped.is_empty():
		_name.text = "Empty"
		_desc.text = "You are carrying nothing."
		_use_button.disabled = true

func _on_select(index: int) -> void:
	if index < 0 or index >= _grouped.size():
		return
	var data: ItemData = _grouped[index]["data"]
	_name.text = data.display_name
	var category: String = GameTypes.category_name(data.category)
	_desc.text = "[%s]\n\n%s" % [category, data.description]
	_use_button.disabled = not data.consumable
	_use_button.text = "Use" if data.consumable else "—"

func _on_use() -> void:
	var index: int = _list.get_selected_items()[0] if not _list.get_selected_items().is_empty() else -1
	if index < 0 or index >= _grouped.size():
		return
	var data: ItemData = _grouped[index]["data"]
	if not data.consumable:
		return
	_apply_use(data)
	GameManager.inventory.remove_item(data.id, 1)
	if data.use_message != "":
		GameManager.notify(data.use_message)
	AudioManager.play_ui("confirm")
	_refresh()

func _apply_use(data: ItemData) -> void:
	var player: Node3D = GameManager.get_player()
	if player == null or not (player is Player):
		return
	var p: Player = player as Player
	match data.id:
		"flashlight_battery":
			p.add_battery(0.6)
		"medical_bandage":
			p.heal(40.0)

func _close() -> void:
	AudioManager.play_ui("back")
	GameManager.close_overlay()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("inventory") or event.is_action_pressed("pause"):
		_close()
		get_viewport().set_input_as_handled()
