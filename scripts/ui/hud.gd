extends Control
class_name HUD

## Affichage tete haute, dans l'esprit des combinaisons de plongee du jeu :
## jauge d'oxygene en arc, profondimetre, constantes vitales, boussole,
## nom du biome, invite d'interaction et journal d'alertes.
## Toutes les jauges sont dessinees a la main : aucune texture d'interface.

var player: Player

var _oxygen := 1.0
var _oxygen_seconds := 45.0
var _health := 1.0
var _food := 1.0
var _water := 1.0
var _depth := 0.0
var _heading := 0.0
var _prompt := ""
var _biome := ""
var _biome_alpha := 0.0
var _pulse := 0.0
var _low_oxygen := false

var _notice_box: VBoxContainer
var _quickbar: HBoxContainer
var _biome_label: Label
var _prompt_label: Label
var _heartbeat_timer := 0.0

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()
	GameState.notify.connect(_on_notify)
	GameState.biome_changed.connect(_on_biome_changed)

func bind_player(p: Player) -> void:
	player = p
	p.stats.oxygen_changed.connect(func(c, m):
		_oxygen = c / maxf(m, 0.001)
		_oxygen_seconds = c)
	p.stats.health_changed.connect(func(c, m): _health = c / maxf(m, 0.001))
	p.stats.food_changed.connect(func(c, m): _food = c / maxf(m, 0.001))
	p.stats.water_changed.connect(func(c, m): _water = c / maxf(m, 0.001))
	p.interact_target_changed.connect(func(_t, text): _prompt = text)
	p.inventory.equipment_changed.connect(_refresh_quickbar)
	_refresh_quickbar()

func _build() -> void:
	# --- invite d'interaction (sous le reticule) ----------------------------
	_prompt_label = UITheme.label("", 16, UITheme.TEXT)
	_prompt_label.set_anchors_preset(Control.PRESET_CENTER)
	_prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt_label.offset_top = 42
	_prompt_label.offset_left = -240
	_prompt_label.offset_right = 240
	_prompt_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_prompt_label)

	# --- nom du biome (en haut, apparait au changement) ---------------------
	_biome_label = UITheme.label("", 26, UITheme.CYAN)
	_biome_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_biome_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_biome_label.offset_top = 78
	_biome_label.offset_left = -360
	_biome_label.offset_right = 360
	_biome_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_biome_label)

	# --- journal d'alertes ---------------------------------------------------
	_notice_box = VBoxContainer.new()
	_notice_box.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_notice_box.offset_left = -430
	_notice_box.offset_right = -24
	_notice_box.offset_top = 120
	_notice_box.alignment = BoxContainer.ALIGNMENT_BEGIN
	_notice_box.add_theme_constant_override("separation", 5)
	_notice_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_notice_box)

	# --- barre d'outils ------------------------------------------------------
	_quickbar = HBoxContainer.new()
	_quickbar.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_quickbar.offset_left = -170
	_quickbar.offset_right = 170
	_quickbar.offset_top = -84
	_quickbar.offset_bottom = -22
	_quickbar.add_theme_constant_override("separation", 8)
	_quickbar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_quickbar)
	for i in 5:
		var slot := Panel.new()
		slot.custom_minimum_size = Vector2(56, 56)
		slot.add_theme_stylebox_override("panel", UITheme.panel())
		slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var icon := IconPainter.new()
		icon.name = "Icon"
		icon.set_anchors_preset(Control.PRESET_FULL_RECT)
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.add_child(icon)
		var num := UITheme.label(str(i + 1), 11, UITheme.TEXT_DIM)
		num.position = Vector2(4, 38)
		num.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.add_child(num)
		_quickbar.add_child(slot)

func _refresh_quickbar() -> void:
	if player == null:
		return
	for i in _quickbar.get_child_count():
		var slot := _quickbar.get_child(i) as Panel
		var id: StringName = player.inventory.quickbar[i]
		var icon := slot.get_node("Icon") as IconPainter
		icon.set_item(id)
		var active := i == player.inventory.active_slot
		slot.add_theme_stylebox_override("panel", UITheme.panel(
			UITheme.PANEL if not active else Color(0.08, 0.2, 0.28, 0.95),
			UITheme.CYAN_DIM if not active else UITheme.CYAN,
			1 if not active else 2))

func _process(delta: float) -> void:
	if player == null:
		return
	_depth = player.depth
	_heading = wrapf(-player.rotation.y, 0.0, TAU)
	_pulse = wrapf(_pulse + delta * 3.4, 0.0, TAU)

	_prompt_label.text = _prompt
	_prompt_label.modulate.a = lerpf(_prompt_label.modulate.a,
		1.0 if _prompt != "" else 0.0, 1.0 - exp(-delta * 12.0))

	_biome_alpha = maxf(_biome_alpha - delta * 0.28, 0.0)
	_biome_label.text = _biome
	_biome_label.modulate.a = clampf(_biome_alpha, 0.0, 1.0)

	# battement de coeur quand l'oxygene devient critique
	var critical := _oxygen < 0.22 and player.head_submerged
	if critical:
		_heartbeat_timer -= delta
		if _heartbeat_timer <= 0.0:
			_heartbeat_timer = lerpf(0.55, 1.0, _oxygen / 0.22)
			SoundBank.play("heartbeat", -14.0)
	_low_oxygen = critical
	queue_redraw()

func _on_notify(text: String, kind: int) -> void:
	var l := UITheme.label(text, 16, UITheme.severity_color(kind))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_notice_box.add_child(l)
	if kind == GameState.Notice.DANGER:
		SoundBank.play("alarm", -14.0)
	var tween := create_tween()
	tween.tween_property(l, "modulate:a", 1.0, 0.12).from(0.0)
	tween.tween_interval(3.4)
	tween.tween_property(l, "modulate:a", 0.0, 0.9)
	tween.tween_callback(l.queue_free)
	while _notice_box.get_child_count() > 7:
		var oldest := _notice_box.get_child(0)
		_notice_box.remove_child(oldest)
		oldest.queue_free()

func _on_biome_changed(biome: String) -> void:
	_biome = biome
	_biome_alpha = 3.2

# =============================================================================
#  Dessin
# =============================================================================
func _draw() -> void:
	var s := size
	_draw_crosshair(s)
	_draw_oxygen(s)
	_draw_vitals(s)
	_draw_depth(s)
	_draw_compass(s)

func _draw_crosshair(s: Vector2) -> void:
	var c := s * 0.5
	var col := UITheme.CYAN if _prompt == "" else UITheme.ORANGE
	draw_arc(c, 7.0, 0.0, TAU, 24, Color(col, 0.75), 1.4, true)
	draw_circle(c, 1.6, Color(col, 0.9))
	for i in 4:
		var a := TAU * float(i) / 4.0 + PI * 0.25
		var d := Vector2(cos(a), sin(a))
		draw_line(c + d * 11.0, c + d * 15.0, Color(col, 0.55), 1.2, true)

## Arc d'oxygene : identique a la jauge de la combinaison, il vire au rouge
## et pulse quand la reserve s'epuise.
func _draw_oxygen(s: Vector2) -> void:
	var c := Vector2(s.x * 0.5, s.y - 108.0)
	var radius := 86.0
	var start := PI * 0.78
	var sweep := PI * 1.44

	draw_arc(c, radius, start, start + sweep, 64, Color(0.15, 0.3, 0.38, 0.55),
		7.0, true)
	var col := UITheme.CYAN
	if _oxygen < 0.5:
		col = UITheme.CYAN.lerp(UITheme.ORANGE, 1.0 - _oxygen * 2.0)
	if _low_oxygen:
		col = UITheme.RED
		col.a = 0.6 + 0.4 * sin(_pulse * 2.2)
	draw_arc(c, radius, start, start + sweep * _oxygen, 64, col, 7.0, true)

	# graduations toutes les 15 s
	var total: float = maxf(_oxygen_seconds / maxf(_oxygen, 0.001), 1.0)
	var ticks := int(total / 15.0)
	for i in range(1, ticks + 1):
		var t := float(i) * 15.0 / total
		if t > 1.0:
			break
		var a := start + sweep * t
		var d := Vector2(cos(a), sin(a))
		draw_line(c + d * (radius - 11.0), c + d * (radius + 5.0),
			Color(0.6, 0.85, 1.0, 0.35), 1.2, true)

	var txt := "%d" % roundi(_oxygen_seconds)
	var font := ThemeDB.fallback_font
	var fs := 30
	var w := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string(font, c + Vector2(-w * 0.5, 4.0), txt,
		HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
	var unit := "O2"
	var uw := font.get_string_size(unit, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
	draw_string(font, c + Vector2(-uw * 0.5, 24.0), unit,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(UITheme.TEXT_DIM, 0.9))

func _draw_vitals(s: Vector2) -> void:
	var origin := Vector2(34.0, s.y - 116.0)
	var entries := [
		["SANTE", _health, UITheme.RED],
		["FAIM", _food, UITheme.ORANGE],
		["EAU", _water, UITheme.CYAN],
	]
	var font := ThemeDB.fallback_font
	for i in entries.size():
		var e: Array = entries[i]
		var y: float = origin.y + i * 26.0
		draw_string(font, Vector2(origin.x, y + 10.0), e[0],
			HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(UITheme.TEXT_DIM, 0.9))
		var bar := Rect2(origin.x + 62.0, y, 168.0, 11.0)
		draw_rect(bar, Color(0.08, 0.14, 0.18, 0.75), true)
		var fill := bar
		fill.size.x *= clampf(e[1], 0.0, 1.0)
		var col: Color = e[2]
		if e[1] < 0.25:
			col.a = 0.55 + 0.45 * sin(_pulse * 2.0)
		draw_rect(fill, col, true)
		draw_rect(bar, Color(col, 0.45), false, 1.0)

func _draw_depth(s: Vector2) -> void:
	var font := ThemeDB.fallback_font
	var origin := Vector2(34.0, s.y - 148.0)
	var txt := "%d m" % roundi(_depth)
	draw_string(font, origin, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 24,
		UITheme.CYAN if _depth < 180.0 else UITheme.ORANGE)
	draw_string(font, origin + Vector2(0, 16), "PROFONDEUR",
		HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(UITheme.TEXT_DIM, 0.85))

## Ruban de cap : les points cardinaux defilent avec la rotation de la tete.
func _draw_compass(s: Vector2) -> void:
	var width := 420.0
	var c := Vector2(s.x * 0.5, 42.0)
	var font := ThemeDB.fallback_font
	draw_line(c + Vector2(-width * 0.5, 12), c + Vector2(width * 0.5, 12),
		Color(UITheme.CYAN, 0.25), 1.0, true)
	var marks := {0.0: "N", 45.0: "NE", 90.0: "E", 135.0: "SE", 180.0: "S",
		225.0: "SO", 270.0: "O", 315.0: "NO"}
	var heading_deg := rad_to_deg(_heading)
	for angle in marks:
		var diff := wrapf(angle - heading_deg + 180.0, 0.0, 360.0) - 180.0
		if absf(diff) > 70.0:
			continue
		var x := c.x + diff / 70.0 * (width * 0.5)
		var fade: float = 1.0 - pow(absf(diff) / 70.0, 2.0)
		var label: String = marks[angle]
		var lw := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
		var is_cardinal := label.length() == 1
		draw_string(font, Vector2(x - lw * 0.5, c.y), label,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 15,
			Color(UITheme.TEXT if is_cardinal else UITheme.TEXT_DIM, fade))
		draw_line(Vector2(x, c.y + 4), Vector2(x, c.y + 12),
			Color(UITheme.CYAN, fade * 0.6), 1.2, true)
	draw_line(c + Vector2(0, 2), c + Vector2(0, 16), UITheme.ORANGE, 2.0, true)
	var hdg := "%03d" % roundi(rad_to_deg(_heading))
	var hw := font.get_string_size(hdg, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
	draw_string(font, c + Vector2(-hw * 0.5, 32.0), hdg,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(UITheme.TEXT_DIM, 0.9))
