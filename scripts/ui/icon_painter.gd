extends Control
class_name IconPainter

## Dessine l'icone d'un objet a la volee, d'apres sa couleur et sa forme.
## Aucune image n'est chargee : chaque icone est un dessin vectoriel.

var item_id: StringName = &"" : set = set_item

var _color := Color(0.7, 0.7, 0.7)
var _accent := Color.WHITE
var _shape: int = 0

func set_item(id: StringName) -> void:
	item_id = id
	var item: Resource = ItemDB.get_item(id)
	if item != null:
		_color = item.color
		_accent = item.accent
		_shape = item.shape
	queue_redraw()

func _draw() -> void:
	if item_id == &"":
		return
	var r := size
	var c := r * 0.5
	var s: float = minf(r.x, r.y)

	match _shape:
		0:   # CHUNK — eclat de minerai
			var pts := PackedVector2Array()
			var rng := RandomNumberGenerator.new()
			rng.seed = hash(item_id)
			for i in 7:
				var a := TAU * float(i) / 7.0
				var rad: float = s * rng.randf_range(0.24, 0.36)
				pts.append(c + Vector2(cos(a), sin(a)) * rad)
			draw_colored_polygon(pts, _color)
			draw_polyline(pts + PackedVector2Array([pts[0]]), _accent, 1.5, true)
		1:   # CRYSTAL — prisme allonge
			var h := s * 0.36
			var w := s * 0.17
			var pts2 := PackedVector2Array([
				c + Vector2(0, -h), c + Vector2(w, -h * 0.25),
				c + Vector2(w * 0.7, h), c + Vector2(-w * 0.7, h),
				c + Vector2(-w, -h * 0.25)])
			draw_colored_polygon(pts2, _color)
			draw_line(c + Vector2(0, -h), c + Vector2(0, h), _accent, 1.2, true)
			draw_polyline(pts2 + PackedVector2Array([pts2[0]]), _accent, 1.4, true)
		2:   # INGOT — lingot en perspective
			var w2 := s * 0.34
			var h2 := s * 0.16
			var pts3 := PackedVector2Array([
				c + Vector2(-w2 * 0.7, -h2), c + Vector2(w2 * 0.7, -h2),
				c + Vector2(w2, h2), c + Vector2(-w2, h2)])
			draw_colored_polygon(pts3, _color)
			draw_line(c + Vector2(-w2 * 0.7, -h2), c + Vector2(w2 * 0.7, -h2),
				_accent, 1.6, true)
		3:   # PLANT — trois feuilles
			for i in 3:
				var a2: float = -PI * 0.5 + (i - 1) * 0.55
				var tip := c + Vector2(cos(a2), sin(a2)) * s * 0.36
				var side := Vector2(-sin(a2), cos(a2)) * s * 0.09
				draw_colored_polygon(PackedVector2Array([
					c + Vector2(0, s * 0.3), tip - side, tip, tip + side]),
					_color.lerp(_accent, float(i) * 0.25))
			draw_line(c + Vector2(0, s * 0.34), c + Vector2(0, s * 0.05),
				_accent.darkened(0.4), 2.0, true)
		4:   # CANISTER — bouteille sous pression
			var rect := Rect2(c - Vector2(s * 0.14, s * 0.3),
				Vector2(s * 0.28, s * 0.56))
			draw_rect(rect, _color, true)
			draw_rect(rect, _accent, false, 1.4)
			draw_rect(Rect2(c - Vector2(s * 0.06, s * 0.38),
				Vector2(s * 0.12, s * 0.1)), _accent, true)
		5:   # DEVICE — boitier avec voyant
			var rect2 := Rect2(c - Vector2(s * 0.28, s * 0.2),
				Vector2(s * 0.56, s * 0.4))
			draw_rect(rect2, _color, true)
			draw_rect(rect2, _accent, false, 1.4)
			draw_circle(c + Vector2(s * 0.16, -s * 0.1), s * 0.05, _accent)
		6:   # FISH — corps fusele + caudale
			draw_circle(c, s * 0.2, _color)
			draw_colored_polygon(PackedVector2Array([
				c + Vector2(s * 0.16, 0), c + Vector2(s * 0.36, -s * 0.16),
				c + Vector2(s * 0.36, s * 0.16)]), _color.darkened(0.15))
			draw_circle(c - Vector2(s * 0.1, s * 0.05), s * 0.035, _accent)
		7:   # BOTTLE — flacon
			draw_rect(Rect2(c - Vector2(s * 0.05, s * 0.34),
				Vector2(s * 0.1, s * 0.16)), _color.darkened(0.2), true)
			var body := Rect2(c - Vector2(s * 0.16, s * 0.2),
				Vector2(s * 0.32, s * 0.5))
			draw_rect(body, _color, true)
			draw_rect(body, _accent, false, 1.4)
		_:   # SEED — grappe
			for i in 5:
				var a3 := TAU * float(i) / 5.0
				draw_circle(c + Vector2(cos(a3), sin(a3)) * s * 0.14, s * 0.09,
					_color.lerp(_accent, 0.3))
			draw_circle(c, s * 0.1, _accent)
