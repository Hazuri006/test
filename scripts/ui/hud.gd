extends CanvasLayer
## HUD -- scenes/ui/hud.tscn, instanced by the world scene.
##
## Everything the player reads while playing, built in code so there is a single
## place to restyle it:
##   * hero plate: health bar + emblem + score
##   * objective panel: mission title, current objective, live distance
##   * enemy counter
##   * combo counter with a drain bar
##   * web reticle that reacts when a valid anchor is in range
##   * minimap (see minimap.gd)
##   * boss health bar with phase pips
##   * dialogue box and toast messages
##
## Every element is driven by EventBus signals -- the HUD never polls gameplay
## objects, except for the objective distance which has to update every frame.
##
## Scene requirements: CanvasLayer with this script (children created here).
##
## Inspector parameters: accent_color, danger_color, panel_color, corner_margin.

@export var accent_color: Color = Color(1.0, 0.82, 0.25)
@export var danger_color: Color = Color(0.92, 0.22, 0.22)
@export var panel_color: Color = Color(0.06, 0.08, 0.14, 0.78)
@export var corner_margin: float = 26.0

var health_bar: ProgressBar
var health_label: Label
var score_label: Label
var district_label: Label
var objective_title: Label
var objective_text: Label
var objective_distance: Label
var objective_panel: PanelContainer
var enemy_label: Label
var combo_label: Label
var combo_bar: ProgressBar
var reticle: Control
var minimap: Control
var boss_panel: PanelContainer
var boss_bar: ProgressBar
var boss_name: Label
var boss_phase: Label
var dialogue_panel: PanelContainer
var dialogue_speaker: Label
var dialogue_text: Label
var toast_label: Label

var _marker_position: Vector3 = Vector3.ZERO
var _marker_visible: bool = false
var _combo: int = 0
var _combo_time: float = 0.0
var _dialogue_time: float = 0.0
var _toast_time: float = 0.0
var _web_ready: bool = false
var _reticle_scale: float = 1.0

func _ready() -> void:
	layer = 10
	_build_ui()
	_connect_events()
	# Fill in anything that happened before the HUD existed.
	var player := GameState.get_player()
	if player != null and player.has_method("get_health"):
		_on_health(player.call("get_health"), 100.0)
	MissionManager.refresh_hud()
	_on_score(GameState.score)

# =============================================================================
#  BUILD
# =============================================================================

func _build_ui() -> void:
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_build_hero_plate(root)
	_build_objective_panel(root)
	_build_combo(root)
	_build_reticle(root)
	_build_minimap(root)
	_build_boss_bar(root)
	_build_dialogue(root)
	_build_toast(root)

func _panel(bg: Color = Color.TRANSPARENT) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = bg if bg != Color.TRANSPARENT else panel_color
	style.corner_radius_top_left = 10
	style.corner_radius_top_right = 10
	style.corner_radius_bottom_left = 10
	style.corner_radius_bottom_right = 10
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	style.border_color = Color(1, 1, 1, 0.12)
	style.set_border_width_all(1)
	panel.add_theme_stylebox_override("panel", style)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return panel

func _label(text: String, font_size: int, color: Color = Color.WHITE) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 2)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func _bar(width: float, height: float, fill: Color) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(width, height)
	bar.show_percentage = false
	bar.max_value = 100.0
	bar.value = 100.0
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.04, 0.05, 0.09, 0.85)
	bg.set_corner_radius_all(int(height * 0.5))
	bg.border_color = Color(1, 1, 1, 0.18)
	bg.set_border_width_all(1)
	var fg := StyleBoxFlat.new()
	fg.bg_color = fill
	fg.set_corner_radius_all(int(height * 0.5))
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", fg)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return bar

## Bottom-left: emblem, health, score.
func _build_hero_plate(root: Control) -> void:
	var panel := _panel()
	panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	panel.position = Vector2(corner_margin, -corner_margin - 96.0)
	panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	root.add_child(panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	panel.add_child(row)

	# Hero emblem: the same diamond spark as the suit, drawn with a polygon.
	var emblem := Control.new()
	emblem.custom_minimum_size = Vector2(52, 52)
	emblem.draw.connect(func() -> void:
		var c := Vector2(26, 26)
		emblem.draw_circle(c, 24, Color(0.10, 0.24, 0.68))
		emblem.draw_colored_polygon(PackedVector2Array([
			c + Vector2(0, -17), c + Vector2(15, 0), c + Vector2(0, 17), c + Vector2(-15, 0)]),
			Color(0.86, 0.12, 0.16))
		emblem.draw_colored_polygon(PackedVector2Array([
			c + Vector2(0, -8), c + Vector2(7, 0), c + Vector2(0, 8), c + Vector2(-7, 0)]),
			Color(0.95, 0.97, 1.0)))
	row.add_child(emblem)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	row.add_child(column)

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 10)
	column.add_child(name_row)
	name_row.add_child(_label("WEB HERO", 15, accent_color))
	score_label = _label("0 pts", 13, Color(0.8, 0.85, 0.95))
	name_row.add_child(score_label)

	health_bar = _bar(240, 16, Color(0.90, 0.20, 0.24))
	column.add_child(health_bar)

	var info_row := HBoxContainer.new()
	info_row.add_theme_constant_override("separation", 12)
	column.add_child(info_row)
	health_label = _label("100 / 100", 12, Color(0.85, 0.88, 0.95))
	info_row.add_child(health_label)
	district_label = _label("Brick City", 12, Color(0.6, 0.75, 0.95))
	info_row.add_child(district_label)

## Top-left: mission title, objective, distance, enemy count.
func _build_objective_panel(root: Control) -> void:
	objective_panel = _panel()
	objective_panel.set_anchors_preset(Control.PRESET_TOP_LEFT)
	objective_panel.position = Vector2(corner_margin, corner_margin)
	objective_panel.visible = false
	root.add_child(objective_panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 3)
	objective_panel.add_child(column)

	objective_title = _label("", 15, accent_color)
	column.add_child(objective_title)
	objective_text = _label("", 14, Color(0.94, 0.96, 1.0))
	column.add_child(objective_text)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	column.add_child(row)
	objective_distance = _label("", 13, Color(0.62, 0.82, 1.0))
	row.add_child(objective_distance)
	enemy_label = _label("", 13, danger_color)
	row.add_child(enemy_label)

## Right side: combo counter.
func _build_combo(root: Control) -> void:
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	box.position = Vector2(-190.0, -30.0)
	box.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(box)

	combo_label = _label("", 34, accent_color)
	combo_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(combo_label)
	combo_bar = _bar(150, 8, accent_color)
	combo_bar.visible = false
	box.add_child(combo_bar)

## Centre: web reticle.
func _build_reticle(root: Control) -> void:
	reticle = Control.new()
	reticle.set_anchors_preset(Control.PRESET_CENTER)
	reticle.custom_minimum_size = Vector2(48, 48)
	reticle.pivot_offset = Vector2(24, 24)
	reticle.position = Vector2(-24, -24)
	reticle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	reticle.draw.connect(_draw_reticle)
	root.add_child(reticle)

## Top-right: minimap.
func _build_minimap(root: Control) -> void:
	minimap = Control.new()
	minimap.set_script(load("res://scripts/ui/minimap.gd"))
	minimap.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	minimap.custom_minimum_size = Vector2(190, 190)
	minimap.size = Vector2(190, 190)
	minimap.position = Vector2(-190.0 - corner_margin, corner_margin)
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(minimap)

## Top-centre: boss bar.
func _build_boss_bar(root: Control) -> void:
	boss_panel = _panel(Color(0.10, 0.03, 0.05, 0.82))
	boss_panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	boss_panel.position = Vector2(-260.0, corner_margin)
	boss_panel.custom_minimum_size = Vector2(520, 0)
	boss_panel.visible = false
	root.add_child(boss_panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	boss_panel.add_child(column)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	column.add_child(row)
	boss_name = _label("DOCTEUR MECANIX", 17, Color(1.0, 0.5, 0.35))
	row.add_child(boss_name)
	boss_phase = _label("PHASE 1", 14, accent_color)
	row.add_child(boss_phase)

	boss_bar = _bar(492, 18, Color(0.95, 0.35, 0.18))
	column.add_child(boss_bar)

## Bottom-centre: dialogue.
func _build_dialogue(root: Control) -> void:
	dialogue_panel = _panel()
	dialogue_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	dialogue_panel.position = Vector2(-330.0, -corner_margin - 120.0)
	dialogue_panel.custom_minimum_size = Vector2(660, 0)
	dialogue_panel.visible = false
	root.add_child(dialogue_panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	dialogue_panel.add_child(column)
	dialogue_speaker = _label("", 14, accent_color)
	column.add_child(dialogue_speaker)
	dialogue_text = _label("", 16, Color(0.96, 0.97, 1.0))
	dialogue_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dialogue_text.custom_minimum_size = Vector2(630, 0)
	column.add_child(dialogue_text)

## Upper-centre: transient toasts.
func _build_toast(root: Control) -> void:
	toast_label = _label("", 22, accent_color)
	toast_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	toast_label.position = Vector2(-300.0, 150.0)
	toast_label.custom_minimum_size = Vector2(600, 0)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.modulate.a = 0.0
	root.add_child(toast_label)

# =============================================================================
#  EVENTS
# =============================================================================

func _connect_events() -> void:
	Events.player_health_changed.connect(_on_health)
	Events.score_changed.connect(_on_score)
	Events.mission_started.connect(_on_mission_started)
	Events.mission_objective_changed.connect(_on_objective)
	Events.mission_completed.connect(_on_mission_completed)
	Events.mission_failed.connect(_on_mission_failed)
	Events.mission_marker_changed.connect(_on_marker)
	Events.enemy_counter_changed.connect(_on_enemy_count)
	Events.combo_changed.connect(_on_combo)
	Events.web_target_available.connect(_on_web_target)
	Events.boss_health_changed.connect(_on_boss_health)
	Events.boss_intro_started.connect(_on_boss_intro)
	Events.boss_defeated.connect(_on_boss_defeated)
	Events.dialogue_requested.connect(_on_dialogue)
	Events.toast_requested.connect(_on_toast)

func _on_health(current: float, maximum: float) -> void:
	health_bar.max_value = maximum
	var tween := create_tween()
	tween.tween_property(health_bar, "value", current, 0.25)
	health_label.text = "%d / %d" % [roundi(current), roundi(maximum)]
	var ratio: float = current / maxf(maximum, 1.0)
	var fill := health_bar.get_theme_stylebox("fill") as StyleBoxFlat
	if fill != null:
		fill.bg_color = danger_color.lerp(Color(1.0, 0.65, 0.15), 1.0 - ratio)

func _on_score(score: int) -> void:
	score_label.text = "%d pts" % score

func _on_mission_started(_id: String, title: String) -> void:
	objective_panel.visible = true
	objective_title.text = title.to_upper()
	objective_panel.modulate.a = 0.0
	create_tween().tween_property(objective_panel, "modulate:a", 1.0, 0.4)

func _on_objective(text: String, index: int, total: int) -> void:
	if text == "":
		objective_panel.visible = false
		return
	objective_panel.visible = true
	objective_text.text = "%d/%d  %s" % [index, total, text] if total > 0 else text

func _on_mission_completed(_id: String, reward: int) -> void:
	_on_toast("MISSION ACCOMPLIE  +%d" % reward)
	objective_panel.visible = false
	enemy_label.text = ""

func _on_mission_failed(_id: String) -> void:
	_on_toast("MISSION ECHOUEE")
	objective_panel.visible = false

func _on_marker(world_position: Vector3, is_visible: bool) -> void:
	_marker_position = world_position
	_marker_visible = is_visible
	if not is_visible:
		objective_distance.text = ""

func _on_enemy_count(remaining: int) -> void:
	enemy_label.text = "Ennemis : %d" % remaining if remaining > 0 else ""

func _on_combo(count: int, _ratio: float) -> void:
	_combo = count
	if count <= 1:
		combo_label.text = ""
		combo_bar.visible = false
		return
	combo_label.text = "x%d" % count
	combo_bar.visible = true
	_combo_time = 1.5
	_reticle_scale = 1.0
	# Punchy pop on every added hit.
	combo_label.scale = Vector2(1.5, 1.5)
	combo_label.pivot_offset = combo_label.size * 0.5
	create_tween().tween_property(combo_label, "scale", Vector2.ONE, 0.22) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

func _on_web_target(available: bool) -> void:
	_web_ready = available
	reticle.queue_redraw()

func _on_boss_intro(boss_title: String) -> void:
	boss_panel.visible = true
	boss_name.text = boss_title
	boss_panel.modulate.a = 0.0
	create_tween().tween_property(boss_panel, "modulate:a", 1.0, 0.8)

func _on_boss_health(current: float, maximum: float, phase: int) -> void:
	boss_panel.visible = true
	boss_bar.max_value = maximum
	create_tween().tween_property(boss_bar, "value", current, 0.2)
	boss_phase.text = "PHASE %d" % phase

func _on_boss_defeated() -> void:
	create_tween().tween_property(boss_panel, "modulate:a", 0.0, 1.2)
	await get_tree().create_timer(1.4).timeout
	boss_panel.visible = false

func _on_dialogue(speaker: String, line: String, duration: float) -> void:
	dialogue_panel.visible = true
	dialogue_speaker.text = speaker.to_upper()
	dialogue_text.text = line
	dialogue_panel.modulate.a = 1.0
	_dialogue_time = duration

func _on_toast(text: String) -> void:
	toast_label.text = text
	toast_label.modulate.a = 1.0
	toast_label.scale = Vector2(1.1, 1.1)
	toast_label.pivot_offset = toast_label.size * 0.5
	create_tween().tween_property(toast_label, "scale", Vector2.ONE, 0.25) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_toast_time = 2.6

# =============================================================================
#  FRAME UPDATES
# =============================================================================

func _process(delta: float) -> void:
	# Objective distance in metres -- the one thing worth polling.
	if _marker_visible:
		var distance: float = GameState.player_position().distance_to(_marker_position)
		objective_distance.text = "%d m" % roundi(distance)

	var player := GameState.get_player()
	if player != null:
		district_label.text = CityLayout.district_name(
				CityLayout.district_at(player.global_position))

	if _combo_time > 0.0:
		_combo_time -= delta
		combo_bar.value = clampf(_combo_time / 1.5, 0.0, 1.0) * 100.0
		if _combo_time <= 0.0:
			combo_label.text = ""
			combo_bar.visible = false

	if _dialogue_time > 0.0:
		_dialogue_time -= delta
		if _dialogue_time <= 0.0:
			create_tween().tween_property(dialogue_panel, "modulate:a", 0.0, 0.4)

	if _toast_time > 0.0:
		_toast_time -= delta
		if _toast_time <= 0.0:
			create_tween().tween_property(toast_label, "modulate:a", 0.0, 0.5)

	# Reticle breathes when a web anchor is available.
	var target_scale: float = 1.25 if _web_ready else 1.0
	_reticle_scale = lerpf(_reticle_scale, target_scale, 1.0 - exp(-10.0 * delta))
	reticle.scale = Vector2.ONE * _reticle_scale
	reticle.queue_redraw()

func _draw_reticle() -> void:
	var centre := Vector2(24, 24)
	var color: Color = accent_color if _web_ready else Color(0.85, 0.9, 1.0, 0.55)
	var gap: float = 6.0 if _web_ready else 4.0
	var length: float = 9.0
	for angle_index in 4:
		var direction := Vector2.RIGHT.rotated(TAU * float(angle_index) / 4.0 + PI * 0.25)
		reticle.draw_line(centre + direction * gap, centre + direction * (gap + length), color, 2.0)
	reticle.draw_circle(centre, 2.0, color)
	if _web_ready:
		reticle.draw_arc(centre, 15.0, 0.0, TAU, 24, color, 1.5, true)
