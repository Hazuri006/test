class_name GameHUD
extends CanvasLayer

## Interface : réticule, télémétrie (vitesse, planète la plus proche),
## seed, compteur de découvertes, invite de scan, fiche de découverte et
## overlay de démarrage avec la liste des contrôles. Tout est construit en
## code, ancré au viewport, donc le redimensionnement est géré nativement.

signal new_system_requested

var _root: Control
var _seed_label: Label
var _discovery_label: Label
var _speed_label: Label
var _nearest_label: Label
var _prompt_label: Label
var _complete_label: Label
var _scan_panel: PanelContainer
var _scan_label: Label
var _overlay: Control
var _scan_timer: Timer


## Réticule central dessiné à la main (cercle + croix).
class ReticleControl:
	extends Control

	func _draw() -> void:
		var center := size * 0.5
		var color := Color(0.55, 0.85, 1.0, 0.85)
		draw_arc(center, 13.0, 0.0, TAU, 40, color, 1.5, true)
		draw_line(center + Vector2(-26.0, 0.0), center + Vector2(-9.0, 0.0), color, 1.5)
		draw_line(center + Vector2(9.0, 0.0), center + Vector2(26.0, 0.0), color, 1.5)
		draw_line(center + Vector2(0.0, -26.0), center + Vector2(0.0, -9.0), color, 1.5)
		draw_line(center + Vector2(0.0, 9.0), center + Vector2(0.0, 26.0), color, 1.5)

	func _notification(what: int) -> void:
		if what == NOTIFICATION_RESIZED:
			queue_redraw()


func _ready() -> void:
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)

	_build_reticle()
	_build_labels()
	_build_scan_panel()
	_build_overlay()

	_scan_timer = Timer.new()
	_scan_timer.one_shot = true
	_scan_timer.wait_time = 7.0
	add_child(_scan_timer)
	_scan_timer.timeout.connect(_on_scan_timer_timeout)


func _build_reticle() -> void:
	var reticle := ReticleControl.new()
	reticle.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	reticle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(reticle)


func _build_labels() -> void:
	_seed_label = _make_label(16, Color(0.75, 0.88, 1.0))
	_seed_label.position = Vector2(14.0, 12.0)
	_root.add_child(_seed_label)

	_discovery_label = _make_label(16, Color(0.75, 1.0, 0.85))
	_discovery_label.position = Vector2(14.0, 38.0)
	_root.add_child(_discovery_label)

	_nearest_label = _make_label(18, Color(0.9, 0.95, 1.0))
	_place_full_width(_nearest_label, 0.0, 10.0, 42.0)
	_root.add_child(_nearest_label)

	_complete_label = _make_label(26, Color(1.0, 0.85, 0.35))
	_complete_label.text = "Système entièrement cartographié !"
	_place_full_width(_complete_label, 0.0, 56.0, 96.0)
	_complete_label.visible = false
	_root.add_child(_complete_label)

	_prompt_label = _make_label(20, Color(0.6, 1.0, 0.7))
	_place_full_width(_prompt_label, 1.0, -110.0, -78.0)
	_prompt_label.visible = false
	_root.add_child(_prompt_label)

	_speed_label = _make_label(18, Color(0.9, 0.95, 1.0))
	_speed_label.anchor_left = 0.0
	_speed_label.anchor_right = 0.0
	_speed_label.anchor_top = 1.0
	_speed_label.anchor_bottom = 1.0
	_speed_label.offset_left = 14.0
	_speed_label.offset_right = 420.0
	_speed_label.offset_top = -44.0
	_speed_label.offset_bottom = -14.0
	_root.add_child(_speed_label)


func _build_scan_panel() -> void:
	_scan_panel = PanelContainer.new()
	_scan_panel.anchor_left = 0.5
	_scan_panel.anchor_right = 0.5
	_scan_panel.anchor_top = 1.0
	_scan_panel.anchor_bottom = 1.0
	_scan_panel.offset_left = -290.0
	_scan_panel.offset_right = 290.0
	_scan_panel.offset_top = -262.0
	_scan_panel.offset_bottom = -128.0
	_scan_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scan_panel.visible = false
	_root.add_child(_scan_panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scan_panel.add_child(margin)

	_scan_label = _make_label(16, Color(0.85, 0.95, 1.0))
	_scan_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_scan_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_scan_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	margin.add_child(_scan_label)


func _build_overlay() -> void:
	_overlay = Control.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_overlay)

	var dim_rect := ColorRect.new()
	dim_rect.color = Color(0.0, 0.0, 0.05, 0.62)
	dim_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(dim_rect)

	var center_container := CenterContainer.new()
	center_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(center_container)

	var menu_box := VBoxContainer.new()
	menu_box.add_theme_constant_override("separation", 12)
	menu_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center_container.add_child(menu_box)

	var title_label := _make_label(32, Color(0.8, 0.9, 1.0))
	title_label.text = "EXPLORATEUR STELLAIRE"
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	menu_box.add_child(title_label)

	var controls_label := _make_label(17, Color(0.85, 0.88, 0.95))
	controls_label.text = """Souris : orienter le vaisseau
ZQSD / WASD (touches physiques) : translation
Espace / Ctrl : monter / descendre
Maj (Shift) : boost
E : scanner la planète proche
N : nouveau système
Échap : libérer la souris"""
	controls_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	menu_box.add_child(controls_label)

	var new_system_button := Button.new()
	new_system_button.text = "Nouveau Système (N)"
	new_system_button.focus_mode = Control.FOCUS_NONE
	new_system_button.pressed.connect(_on_new_system_button_pressed)
	menu_box.add_child(new_system_button)

	var hint_label := _make_label(20, Color(1.0, 0.95, 0.7))
	hint_label.text = "Cliquez pour commencer"
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	menu_box.add_child(hint_label)


func _make_label(font_size: int, text_color: Color) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", text_color)
	label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.7))
	label.add_theme_constant_override("outline_size", 4)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


## Ancre un label sur toute la largeur, à hauteur fixe, texte centré.
func _place_full_width(
	label: Label, vertical_anchor: float, top_offset: float, bottom_offset: float
) -> void:
	label.anchor_left = 0.0
	label.anchor_right = 1.0
	label.anchor_top = vertical_anchor
	label.anchor_bottom = vertical_anchor
	label.offset_left = 0.0
	label.offset_right = 0.0
	label.offset_top = top_offset
	label.offset_bottom = bottom_offset
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _on_new_system_button_pressed() -> void:
	new_system_requested.emit()


func _on_scan_timer_timeout() -> void:
	_scan_panel.visible = false


## Réinitialise l'affichage pour un nouveau système.
func start_system(seed_value: int, total_planets: int) -> void:
	_seed_label.text = "Seed : %d" % seed_value
	set_discoveries(0, total_planets)
	_complete_label.visible = false
	_scan_panel.visible = false
	_prompt_label.visible = false
	_scan_timer.stop()


func set_discoveries(found: int, total: int) -> void:
	_discovery_label.text = "%d/%d planètes cartographiées" % [found, total]


## Mise à jour par frame : vitesse, planète la plus proche, invite de scan.
func update_telemetry(
	speed: float, nearest_name: String, nearest_distance: float, prompt: String
) -> void:
	_speed_label.text = "Vitesse : %.0f u/s" % speed
	if nearest_name.is_empty():
		_nearest_label.text = ""
	else:
		_nearest_label.text = "Planète la plus proche : %s — %.0f u" % [nearest_name, nearest_distance]
	_prompt_label.visible = not prompt.is_empty()
	if not prompt.is_empty():
		_prompt_label.text = prompt


func show_scan_result(result_text: String) -> void:
	_scan_label.text = result_text
	_scan_panel.visible = true
	_scan_timer.start()


func show_complete() -> void:
	_complete_label.visible = true


func show_overlay(overlay_visible: bool) -> void:
	_overlay.visible = overlay_visible
