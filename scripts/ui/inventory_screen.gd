extends Control
class_name InventoryScreen

## Ecran d'inventaire : grille d'emplacements, details de l'objet survole,
## et actions contextuelles (equiper, consommer, jeter).

const COLUMNS := 6
const SLOT_SIZE := 78

var player: Player
var _grid: GridContainer
var _detail_name: Label
var _detail_desc: Label
var _detail_icon: IconPainter
var _actions: HBoxContainer
var _equipment_box: VBoxContainer
var _selected: int = -1

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	_build()

func bind_player(p: Player) -> void:
	player = p
	p.inventory.changed.connect(_refresh)
	p.inventory.equipment_changed.connect(_refresh)
	_refresh()

func _build() -> void:
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = UITheme.BG
	add_child(bg)

	var root := HBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 90
	root.offset_right = -90
	root.offset_top = 70
	root.offset_bottom = -70
	root.add_theme_constant_override("separation", 24)
	add_child(root)

	# --- colonne de gauche : la grille --------------------------------------
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 12)
	root.add_child(left)
	left.add_child(UITheme.label("INVENTAIRE", 22, UITheme.CYAN))

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", UITheme.panel())
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(panel)

	_grid = GridContainer.new()
	_grid.columns = COLUMNS
	_grid.add_theme_constant_override("h_separation", 8)
	_grid.add_theme_constant_override("v_separation", 8)
	panel.add_child(_grid)

	# --- colonne de droite : detail et equipement ---------------------------
	var right := VBoxContainer.new()
	right.custom_minimum_size = Vector2(360, 0)
	right.add_theme_constant_override("separation", 12)
	root.add_child(right)

	var detail_panel := PanelContainer.new()
	detail_panel.add_theme_stylebox_override("panel", UITheme.panel())
	right.add_child(detail_panel)
	var detail := VBoxContainer.new()
	detail.add_theme_constant_override("separation", 8)
	detail_panel.add_child(detail)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	detail.add_child(head)
	_detail_icon = IconPainter.new()
	_detail_icon.custom_minimum_size = Vector2(72, 72)
	head.add_child(_detail_icon)
	var head_text := VBoxContainer.new()
	head.add_child(head_text)
	_detail_name = UITheme.label("—", 19, UITheme.TEXT)
	head_text.add_child(_detail_name)
	_detail_desc = UITheme.label("Selectionnez un objet.", 13, UITheme.TEXT_DIM)
	_detail_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail_desc.custom_minimum_size = Vector2(240, 0)
	head_text.add_child(_detail_desc)

	_actions = HBoxContainer.new()
	_actions.add_theme_constant_override("separation", 8)
	detail.add_child(_actions)

	var eq_panel := PanelContainer.new()
	eq_panel.add_theme_stylebox_override("panel", UITheme.panel())
	eq_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(eq_panel)
	_equipment_box = VBoxContainer.new()
	_equipment_box.add_theme_constant_override("separation", 6)
	eq_panel.add_child(_equipment_box)

	right.add_child(UITheme.label(
		"Tab : fermer    Clic : selectionner    1-5 : outil actif",
		12, UITheme.TEXT_DIM))

func _refresh() -> void:
	if player == null or not is_inside_tree():
		return
	for child in _grid.get_children():
		child.queue_free()
	for i in player.inventory.slots.size():
		_grid.add_child(_make_slot(i))
	_refresh_detail()
	_refresh_equipment()

func _make_slot(index: int) -> Control:
	var slot: Dictionary = player.inventory.slots[index]
	var btn := Button.new()
	btn.custom_minimum_size = Vector2(SLOT_SIZE, SLOT_SIZE)
	btn.focus_mode = Control.FOCUS_NONE
	var selected := index == _selected
	btn.add_theme_stylebox_override("normal", UITheme.panel(
		Color(0.05, 0.1, 0.15, 0.9),
		UITheme.CYAN if selected else UITheme.CYAN_DIM, 2 if selected else 1))
	btn.add_theme_stylebox_override("hover",
		UITheme.panel(Color(0.09, 0.2, 0.28, 0.95), UITheme.CYAN))
	btn.add_theme_stylebox_override("pressed",
		UITheme.panel(Color(0.12, 0.28, 0.36, 1.0), UITheme.CYAN))
	btn.pressed.connect(func(): _select(index))

	if not slot.is_empty():
		var icon := IconPainter.new()
		icon.set_anchors_preset(Control.PRESET_FULL_RECT)
		icon.offset_left = 6
		icon.offset_top = 6
		icon.offset_right = -6
		icon.offset_bottom = -14
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon.set_item(slot["id"])
		btn.add_child(icon)
		if slot["amount"] > 1:
			var count := UITheme.label("x%d" % slot["amount"], 12, UITheme.TEXT)
			count.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
			count.offset_left = -30
			count.offset_top = -20
			count.mouse_filter = Control.MOUSE_FILTER_IGNORE
			btn.add_child(count)
	return btn

func _select(index: int) -> void:
	_selected = index
	SoundBank.play("ui_click", -18.0)
	_refresh()

func _refresh_detail() -> void:
	for child in _actions.get_children():
		child.queue_free()
	if _selected < 0 or _selected >= player.inventory.slots.size():
		return
	var slot: Dictionary = player.inventory.slots[_selected]
	if slot.is_empty():
		_detail_name.text = "—"
		_detail_desc.text = "Emplacement vide."
		_detail_icon.set_item(&"")
		return
	var id: StringName = slot["id"]
	var item: Resource = ItemDB.get_item(id)
	_detail_icon.set_item(id)
	_detail_name.text = item.name
	_detail_desc.text = item.description

	if item.equip_slot != &"":
		var b := UITheme.button("Equiper")
		b.pressed.connect(func():
			player.inventory.equip(id)
			SoundBank.play("ui_confirm", -12.0))
		_actions.add_child(b)
	if item.is_edible():
		var b2 := UITheme.button("Consommer")
		b2.pressed.connect(func():
			if player.inventory.remove(id, 1):
				player.stats.eat(item.food_value, item.water_value,
					item.health_value)
				SoundBank.play("ui_confirm", -12.0))
		_actions.add_child(b2)
	if item.health_value > 0.0 and not item.is_edible():
		var b3 := UITheme.button("Utiliser")
		b3.pressed.connect(func():
			if player.inventory.remove(id, 1):
				player.stats.heal(item.health_value)
				GameState.notify_success("Sante restauree")
				SoundBank.play("ui_confirm", -12.0))
		_actions.add_child(b3)
	var drop := UITheme.button("Jeter")
	drop.pressed.connect(func():
		player.inventory.remove(id, 1)
		SoundBank.play("ui_click", -14.0))
	_actions.add_child(drop)

func _refresh_equipment() -> void:
	for child in _equipment_box.get_children():
		child.queue_free()
	_equipment_box.add_child(UITheme.label("EQUIPEMENT", 17, UITheme.ORANGE))
	var slot_names := {
		&"head": "Tete", &"body": "Combinaison", &"feet": "Pieds",
		&"tank": "Bouteille", &"wrist": "Poignet"}
	for key in slot_names:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		row.add_child(UITheme.label("%s :" % slot_names[key], 14, UITheme.TEXT_DIM))
		if player.inventory.equipped.has(key):
			var id: StringName = player.inventory.equipped[key]
			row.add_child(UITheme.label(ItemDB.item_name(id), 14, UITheme.TEXT))
			var b := UITheme.button("Retirer", 12)
			b.pressed.connect(func(): player.inventory.unequip(key))
			row.add_child(b)
		else:
			row.add_child(UITheme.label("aucun", 14, Color(0.4, 0.5, 0.55)))
		_equipment_box.add_child(row)

	_equipment_box.add_child(UITheme.label("", 8))
	var stats_text := "Oxygene max : %d s\nVitesse de nage : +%d %%\nResistance : %d %%" % [
		roundi(player.stats.oxygen_capacity),
		roundi(player.stats.swim_speed_bonus * 100.0),
		roundi(player.stats.damage_resist * 100.0)]
	_equipment_box.add_child(UITheme.label(stats_text, 13, UITheme.TEXT_DIM))

func open() -> void:
	visible = true
	_refresh()

func close() -> void:
	visible = false
