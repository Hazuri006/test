extends Control
class_name FabricatorScreen

## Arborescence du fabricateur : categories a gauche, recettes au centre,
## detail et bouton de fabrication a droite. Les ingredients manquants sont
## affiches en rouge, la recette reste visible mais non fabricable.

var player: Player
var fabricator: Fabricator

var _group_box: VBoxContainer
var _recipe_box: VBoxContainer
var _detail_box: VBoxContainer
var _progress: ProgressBar
var _current_group: StringName = &"basic"
var _current_recipe: Resource = null

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	_build()

func bind_player(p: Player) -> void:
	player = p
	p.inventory.changed.connect(func():
		if visible:
			_refresh_recipes()
			_refresh_detail())

func _build() -> void:
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = UITheme.BG
	add_child(bg)

	var frame := VBoxContainer.new()
	frame.set_anchors_preset(Control.PRESET_FULL_RECT)
	frame.offset_left = 120
	frame.offset_right = -120
	frame.offset_top = 70
	frame.offset_bottom = -70
	frame.add_theme_constant_override("separation", 14)
	add_child(frame)

	var title := HBoxContainer.new()
	title.add_theme_constant_override("separation", 14)
	frame.add_child(title)
	title.add_child(UITheme.label("FABRICATEUR", 24, UITheme.CYAN))
	title.add_child(UITheme.label("Assemblage moleculaire", 14, UITheme.TEXT_DIM))

	_progress = ProgressBar.new()
	_progress.custom_minimum_size = Vector2(0, 6)
	_progress.show_percentage = false
	_progress.visible = false
	frame.add_child(_progress)

	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 16)
	frame.add_child(body)

	var groups_panel := PanelContainer.new()
	groups_panel.custom_minimum_size = Vector2(220, 0)
	groups_panel.add_theme_stylebox_override("panel", UITheme.panel())
	body.add_child(groups_panel)
	_group_box = VBoxContainer.new()
	_group_box.add_theme_constant_override("separation", 6)
	groups_panel.add_child(_group_box)

	var recipes_panel := PanelContainer.new()
	recipes_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	recipes_panel.add_theme_stylebox_override("panel", UITheme.panel())
	body.add_child(recipes_panel)
	var scroll := ScrollContainer.new()
	recipes_panel.add_child(scroll)
	_recipe_box = VBoxContainer.new()
	_recipe_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_recipe_box.add_theme_constant_override("separation", 5)
	scroll.add_child(_recipe_box)

	var detail_panel := PanelContainer.new()
	detail_panel.custom_minimum_size = Vector2(330, 0)
	detail_panel.add_theme_stylebox_override("panel", UITheme.panel())
	body.add_child(detail_panel)
	_detail_box = VBoxContainer.new()
	_detail_box.add_theme_constant_override("separation", 8)
	detail_panel.add_child(_detail_box)

	frame.add_child(UITheme.label("Echap : fermer", 12, UITheme.TEXT_DIM))

func open(fab: Fabricator) -> void:
	fabricator = fab
	visible = true
	_refresh_groups()
	_refresh_recipes()
	_refresh_detail()

func close() -> void:
	visible = false
	fabricator = null

func _refresh_groups() -> void:
	for c in _group_box.get_children():
		c.queue_free()
	_group_box.add_child(UITheme.label("CATEGORIES", 15, UITheme.ORANGE))
	for key in ItemDB.groups:
		var info: Dictionary = ItemDB.groups[key]
		var b := UITheme.button(info["name"], 15)
		if key == _current_group:
			b.add_theme_stylebox_override("normal",
				UITheme.panel(Color(0.1, 0.26, 0.34, 0.95), UITheme.CYAN, 2))
		b.pressed.connect(func():
			_current_group = key
			SoundBank.play("ui_click", -18.0)
			_refresh_groups()
			_refresh_recipes())
		_group_box.add_child(b)

func _refresh_recipes() -> void:
	for c in _recipe_box.get_children():
		c.queue_free()
	if player == null:
		return
	for recipe in ItemDB.recipes_in_group(_current_group):
		var can := player.inventory.has_all(recipe.ingredients)
		var row := Button.new()
		row.focus_mode = Control.FOCUS_NONE
		row.custom_minimum_size = Vector2(0, 56)
		row.add_theme_stylebox_override("normal",
			UITheme.panel(Color(0.05, 0.11, 0.16, 0.85),
				UITheme.CYAN_DIM if can else Color(0.4, 0.25, 0.25, 0.4)))
		row.add_theme_stylebox_override("hover",
			UITheme.panel(Color(0.09, 0.2, 0.28, 0.95), UITheme.CYAN))
		row.pressed.connect(func():
			_current_recipe = recipe
			SoundBank.play("ui_click", -18.0)
			_refresh_detail())
		_recipe_box.add_child(row)

		var hb := HBoxContainer.new()
		hb.set_anchors_preset(Control.PRESET_FULL_RECT)
		hb.offset_left = 8
		hb.offset_right = -8
		hb.add_theme_constant_override("separation", 10)
		hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(hb)

		var icon := IconPainter.new()
		icon.custom_minimum_size = Vector2(44, 44)
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon.set_item(recipe.output)
		hb.add_child(icon)

		var text := VBoxContainer.new()
		text.mouse_filter = Control.MOUSE_FILTER_IGNORE
		hb.add_child(text)
		var name_label := UITheme.label(ItemDB.item_name(recipe.output), 16,
			UITheme.TEXT if can else Color(0.65, 0.5, 0.5))
		text.add_child(name_label)
		text.add_child(UITheme.label(_ingredients_line(recipe), 12,
			UITheme.TEXT_DIM))

func _ingredients_line(recipe: Resource) -> String:
	var parts: Array[String] = []
	for id in recipe.ingredients:
		var need: int = recipe.ingredients[id]
		var have: int = player.inventory.count(id) if player != null else 0
		parts.append("%s %d/%d" % [ItemDB.item_name(id), have, need])
	return " · ".join(parts)

func _refresh_detail() -> void:
	for c in _detail_box.get_children():
		c.queue_free()
	if _current_recipe == null:
		_detail_box.add_child(UITheme.label("Selectionnez une recette", 14,
			UITheme.TEXT_DIM))
		return
	var out_id: StringName = _current_recipe.output
	var item: Resource = ItemDB.get_item(out_id)

	var icon := IconPainter.new()
	icon.custom_minimum_size = Vector2(96, 96)
	icon.set_item(out_id)
	_detail_box.add_child(icon)
	_detail_box.add_child(UITheme.label(item.name, 20, UITheme.TEXT))
	var desc := UITheme.label(item.description, 13, UITheme.TEXT_DIM)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.custom_minimum_size = Vector2(290, 0)
	_detail_box.add_child(desc)
	_detail_box.add_child(UITheme.label("INGREDIENTS", 14, UITheme.ORANGE))

	var can := true
	for id in _current_recipe.ingredients:
		var need: int = _current_recipe.ingredients[id]
		var have: int = player.inventory.count(id)
		if have < need:
			can = false
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var ic := IconPainter.new()
		ic.custom_minimum_size = Vector2(26, 26)
		ic.set_item(id)
		row.add_child(ic)
		row.add_child(UITheme.label("%s  %d / %d" % [ItemDB.item_name(id), have, need],
			14, UITheme.TEXT if have >= need else UITheme.RED))
		_detail_box.add_child(row)

	var craft := UITheme.button("FABRIQUER", 17)
	craft.disabled = not can or (fabricator != null and fabricator.busy)
	craft.pressed.connect(_on_craft_pressed)
	_detail_box.add_child(craft)
	if not can:
		_detail_box.add_child(UITheme.label("Materiaux insuffisants", 12,
			UITheme.RED))

func _on_craft_pressed() -> void:
	if fabricator == null or _current_recipe == null or player == null:
		return
	if fabricator.start_craft(_current_recipe, player):
		SoundBank.play("ui_confirm", -8.0)
		_progress.visible = true
		_progress.max_value = _current_recipe.craft_time
		_progress.value = 0.0
		_refresh_recipes()
		_refresh_detail()

func _process(delta: float) -> void:
	if not visible or fabricator == null:
		return
	if fabricator.busy:
		_progress.visible = true
		_progress.value = minf(_progress.value + delta, _progress.max_value)
	elif _progress.visible and _progress.value >= _progress.max_value:
		_progress.visible = false
		_refresh_detail()
