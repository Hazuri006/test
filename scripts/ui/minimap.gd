extends Control
## Minimap -- north-up city map, drawn entirely with _draw().
##
## No render target, no second camera, no textures: it reads CityLayout directly
## and paints the block grid, the streets, the water, the hero, the objective and
## nearby enemies. That makes it essentially free, and it can never desync from
## the real city because it is generated from the same data.
##
## Scene requirements: a Control node (created by hud.gd).
##
## Inspector parameters: view_radius, block_colors, show_enemies.

@export var view_radius: float = 260.0     ## metres shown from edge to edge
@export var show_enemies: bool = true
@export var enemy_range: float = 120.0

const BG_COLOR := Color(0.06, 0.08, 0.13, 0.82)
const STREET_COLOR := Color(0.20, 0.22, 0.28, 0.9)
const BORDER_COLOR := Color(0.85, 0.88, 0.95, 0.5)
const PLAYER_COLOR := Color(0.95, 0.25, 0.25)
const MARKER_COLOR := Color(1.0, 0.82, 0.25)
const ENEMY_COLOR := Color(1.0, 0.35, 0.3)
const WATER_COLOR := Color(0.10, 0.28, 0.46, 0.9)

var marker_position: Vector3 = Vector3.ZERO
var marker_visible: bool = false

func _ready() -> void:
	custom_minimum_size = Vector2(190, 190)
	Events.mission_marker_changed.connect(_on_marker)
	set_process(true)

func _process(_delta: float) -> void:
	queue_redraw()

func _on_marker(world_position: Vector3, is_visible: bool) -> void:
	marker_position = world_position
	marker_visible = is_visible

func _draw() -> void:
	var rect_size: Vector2 = size
	var centre: Vector2 = rect_size * 0.5
	var radius: float = minf(rect_size.x, rect_size.y) * 0.5
	var scale_factor: float = radius / view_radius

	# --- frame --------------------------------------------------------------
	draw_circle(centre, radius, BG_COLOR)

	var player_pos := GameState.player_position()
	var to_map := func(world: Vector3) -> Vector2:
		return centre + Vector2(world.x - player_pos.x, world.z - player_pos.z) * scale_factor

	# --- water --------------------------------------------------------------
	var o := CityLayout.origin_offset()
	var sw := CityLayout.STREET_WIDTH
	var water_top: float = o - sw
	var water_rect := Rect2(to_map.call(Vector3(o - 200.0, 0, water_top - 260.0)),
			Vector2((CityLayout.city_extent() + 400.0) * scale_factor, 260.0 * scale_factor))
	draw_rect(water_rect, WATER_COLOR)

	# --- blocks -------------------------------------------------------------
	for i in CityLayout.GRID:
		for j in CityLayout.GRID:
			var block_centre := CityLayout.block_center(i, j)
			# Cheap cull: skip blocks well outside the view.
			if absf(block_centre.x - player_pos.x) > view_radius + 60.0:
				continue
			if absf(block_centre.z - player_pos.z) > view_radius + 60.0:
				continue
			var district := CityLayout.district_of(i, j)
			var top_left: Vector2 = to_map.call(block_centre - Vector3(CityLayout.BLOCK_SIZE * 0.5, 0,
					CityLayout.BLOCK_SIZE * 0.5))
			draw_rect(Rect2(top_left, Vector2(CityLayout.BLOCK_SIZE, CityLayout.BLOCK_SIZE)
					* scale_factor), _district_color(district))

	# --- objective ----------------------------------------------------------
	if marker_visible:
		var marker_point: Vector2 = to_map.call(marker_position)
		var offset: Vector2 = marker_point - centre
		if offset.length() > radius - 8.0:
			marker_point = centre + offset.normalized() * (radius - 8.0)
		_draw_diamond(marker_point, 6.0, MARKER_COLOR)

	# --- enemies ------------------------------------------------------------
	if show_enemies:
		for node in get_tree().get_nodes_in_group("enemies"):
			var enemy := node as Node3D
			if enemy == null or not is_instance_valid(enemy):
				continue
			var distance: float = enemy.global_position.distance_to(player_pos)
			if distance > enemy_range:
				continue
			var point: Vector2 = to_map.call(enemy.global_position)
			if point.distance_to(centre) > radius - 4.0:
				continue
			draw_circle(point, 2.6, ENEMY_COLOR)

	# --- hero ---------------------------------------------------------------
	var player := GameState.get_player()
	var yaw: float = player.rotation.y if player != null else 0.0
	_draw_arrow(centre, 8.0, -yaw, PLAYER_COLOR)

	# --- ring + north -------------------------------------------------------
	draw_arc(centre, radius - 1.0, 0.0, TAU, 48, BORDER_COLOR, 2.0, true)
	var north := centre + Vector2(0, -radius + 10.0)
	draw_string(ThemeDB.fallback_font, north + Vector2(-4, 4), "N",
			HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.9, 0.92, 1.0, 0.8))

func _district_color(district: CityLayout.District) -> Color:
	match district:
		CityLayout.District.DOWNTOWN: return Color(0.55, 0.58, 0.68, 0.95)
		CityLayout.District.COMMERCIAL: return Color(0.62, 0.48, 0.30, 0.95)
		CityLayout.District.RESIDENTIAL: return Color(0.40, 0.46, 0.42, 0.95)
		CityLayout.District.INDUSTRIAL: return Color(0.38, 0.36, 0.34, 0.95)
		CityLayout.District.PARK: return Color(0.22, 0.48, 0.24, 0.95)
		CityLayout.District.BOSS_ZONE: return Color(0.52, 0.24, 0.24, 0.95)
		CityLayout.District.WATERFRONT: return Color(0.34, 0.42, 0.52, 0.95)
	return Color(0.4, 0.4, 0.45, 0.95)

func _draw_diamond(at: Vector2, radius: float, color: Color) -> void:
	var points := PackedVector2Array([
		at + Vector2(0, -radius), at + Vector2(radius, 0),
		at + Vector2(0, radius), at + Vector2(-radius, 0)])
	draw_colored_polygon(points, color)

func _draw_arrow(at: Vector2, radius: float, angle: float, color: Color) -> void:
	var points := PackedVector2Array()
	for offset in [Vector2(0, -radius), Vector2(radius * 0.7, radius * 0.8),
			Vector2(0, radius * 0.35), Vector2(-radius * 0.7, radius * 0.8)]:
		points.append(at + offset.rotated(angle))
	draw_colored_polygon(points, color)
	draw_polyline(points + PackedVector2Array([points[0]]), Color(1, 1, 1, 0.8), 1.5)
