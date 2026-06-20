class_name UITheme
extends RefCounted
## Static UI helpers: a shared dark horror Theme plus factory functions for the
## controls every menu/HUD reuses. Keeps the code-built UI consistent and short.

const BG: Color = Color(0.03, 0.035, 0.04, 0.96)
const PANEL: Color = Color(0.07, 0.08, 0.09, 0.95)
const PANEL_BORDER: Color = Color(0.18, 0.20, 0.22, 1.0)
const TEXT: Color = Color(0.82, 0.83, 0.80)
const TEXT_DIM: Color = Color(0.55, 0.56, 0.54)
const ACCENT: Color = Color(0.74, 0.62, 0.36)        # sickly amber
const ACCENT_GREEN: Color = Color(0.45, 0.62, 0.45)
const DANGER: Color = Color(0.72, 0.22, 0.20)

static var _theme: Theme = null

static func get_theme() -> Theme:
	if _theme != null:
		return _theme
	var theme: Theme = Theme.new()
	theme.set_color("font_color", "Label", TEXT)
	theme.set_font_size("font_size", "Label", 18)

	var btn_normal: StyleBoxFlat = _box(Color(0.10, 0.11, 0.12, 0.95), PANEL_BORDER)
	var btn_hover: StyleBoxFlat = _box(Color(0.16, 0.15, 0.12, 0.98), ACCENT)
	var btn_pressed: StyleBoxFlat = _box(Color(0.20, 0.18, 0.12, 1.0), ACCENT)
	var btn_focus: StyleBoxFlat = _box(Color(0.14, 0.14, 0.13, 0.98), ACCENT)
	theme.set_stylebox("normal", "Button", btn_normal)
	theme.set_stylebox("hover", "Button", btn_hover)
	theme.set_stylebox("pressed", "Button", btn_pressed)
	theme.set_stylebox("focus", "Button", btn_focus)
	theme.set_stylebox("disabled", "Button", _box(Color(0.07, 0.07, 0.08, 0.8), PANEL_BORDER))
	theme.set_color("font_color", "Button", TEXT)
	theme.set_color("font_hover_color", "Button", ACCENT)
	theme.set_color("font_pressed_color", "Button", Color.WHITE)
	theme.set_color("font_disabled_color", "Button", TEXT_DIM)
	theme.set_font_size("font_size", "Button", 20)

	var panel_box: StyleBoxFlat = _box(PANEL, PANEL_BORDER)
	panel_box.set_content_margin_all(16.0)
	theme.set_stylebox("panel", "PanelContainer", panel_box)
	theme.set_stylebox("panel", "Panel", panel_box)
	_theme = theme
	return theme

static func _box(bg: Color, border: Color) -> StyleBoxFlat:
	var box: StyleBoxFlat = StyleBoxFlat.new()
	box.bg_color = bg
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(3)
	box.set_content_margin_all(10.0)
	return box

# --- Control factories -------------------------------------------------------

static func apply(control: Control) -> void:
	control.theme = get_theme()

static func full_rect(control: Control) -> void:
	control.set_anchors_preset(Control.PRESET_FULL_RECT)
	control.offset_left = 0
	control.offset_top = 0
	control.offset_right = 0
	control.offset_bottom = 0

static func dim_background(alpha: float = 0.85) -> ColorRect:
	var rect: ColorRect = ColorRect.new()
	rect.color = Color(BG.r, BG.g, BG.b, alpha)
	full_rect(rect)
	rect.mouse_filter = Control.MOUSE_FILTER_STOP
	return rect

static func title(text: String, size: int = 46) -> Label:
	var label: Label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", ACCENT)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return label

static func label(text: String, size: int = 18, color: Color = TEXT) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l

static func button(text: String, min_width: float = 280.0) -> Button:
	var b: Button = Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(min_width, 46)
	b.focus_mode = Control.FOCUS_ALL
	return b

static func panel() -> PanelContainer:
	var p: PanelContainer = PanelContainer.new()
	p.add_theme_stylebox_override("panel", _box(PANEL, PANEL_BORDER))
	return p

static func hsep(height: int = 8) -> Control:
	var c: Control = Control.new()
	c.custom_minimum_size = Vector2(0, height)
	return c

## A horizontal value bar (stamina, battery, detection). Returns the fill ColorRect
## so the owner can set its scale via set_bar(fill, value).
static func bar(width: float, height: float, fill_color: Color, bg_color: Color = Color(0.0, 0.0, 0.0, 0.6)) -> Control:
	var root: Control = Control.new()
	root.custom_minimum_size = Vector2(width, height)
	var bg: ColorRect = ColorRect.new()
	bg.color = bg_color
	full_rect(bg)
	root.add_child(bg)
	var fill: ColorRect = ColorRect.new()
	fill.color = fill_color
	fill.name = "Fill"
	fill.anchor_bottom = 1.0
	fill.anchor_right = 1.0
	root.add_child(fill)
	return root

static func set_bar(bar_root: Control, value: float) -> void:
	var fill: ColorRect = bar_root.get_node_or_null("Fill") as ColorRect
	if fill != null:
		fill.anchor_right = clampf(value, 0.0, 1.0)
		fill.offset_right = 0.0
