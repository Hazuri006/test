extends RefCounted
class_name UITheme

## Palette et fabriques de composants : toute l'interface partage ces reglages
## pour garder l'aspect "console de combinaison" homogene.

const BG := Color(0.02, 0.05, 0.08, 0.88)
const BG_SOLID := Color(0.03, 0.07, 0.11, 0.97)
const PANEL := Color(0.05, 0.11, 0.16, 0.92)
const CYAN := Color(0.31, 0.85, 1.0)
const CYAN_DIM := Color(0.31, 0.85, 1.0, 0.35)
const ORANGE := Color(1.0, 0.62, 0.18)
const GREEN := Color(0.36, 0.95, 0.55)
const RED := Color(1.0, 0.32, 0.28)
const TEXT := Color(0.82, 0.94, 1.0)
const TEXT_DIM := Color(0.55, 0.7, 0.8)

static func panel(bg: Color = PANEL, border: Color = CYAN_DIM,
		border_width: int = 1, radius: int = 4) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(border_width)
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	return sb

static func label(text: String, size_px: int = 15,
		color: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size_px)
	l.add_theme_color_override("font_color", color)
	l.add_theme_constant_override("outline_size", 4)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	return l

static func button(text: String, size_px: int = 15) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", size_px)
	b.add_theme_color_override("font_color", TEXT)
	b.add_theme_color_override("font_hover_color", Color.WHITE)
	b.add_theme_stylebox_override("normal", panel(Color(0.06, 0.14, 0.2, 0.9)))
	b.add_theme_stylebox_override("hover", panel(Color(0.1, 0.25, 0.34, 0.95), CYAN))
	b.add_theme_stylebox_override("pressed", panel(Color(0.14, 0.35, 0.45, 1.0), CYAN))
	b.add_theme_stylebox_override("disabled",
		panel(Color(0.05, 0.08, 0.1, 0.7), Color(0.3, 0.35, 0.4, 0.3)))
	b.focus_mode = Control.FOCUS_NONE
	return b

static func severity_color(severity: int) -> Color:
	match severity:
		GameState.Notice.WARNING: return ORANGE
		GameState.Notice.DANGER: return RED
		GameState.Notice.SUCCESS: return GREEN
	return CYAN
