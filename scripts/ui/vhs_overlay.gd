extends Control
## Old-camcorder / VHS post-process for the player's view. A full-screen ColorRect
## samples the rendered frame and applies chromatic aberration, scanlines, grain,
## a rolling tracking wobble and a vignette; an overlay adds a blinking REC dot,
## a running timecode and "PLAY ►". Toggle via the gameplay/vhs setting (default on).

var _rect: ColorRect
var _rec_dot: Label
var _timecode: Label
var _elapsed: float = 0.0
var _blink: float = 0.0

func _ready() -> void:
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)

	_rect = ColorRect.new()
	UITheme.full_rect(_rect)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rect.material = _make_material()
	add_child(_rect)

	# REC indicator (top-left).
	_rec_dot = Label.new()
	_rec_dot.text = "● REC"
	_rec_dot.add_theme_font_size_override("font_size", 22)
	_rec_dot.add_theme_color_override("font_color", Color(0.9, 0.1, 0.1))
	_rec_dot.position = Vector2(40, 30)
	add_child(_rec_dot)

	# "PLAY ►" + timecode (bottom).
	var play: Label = Label.new()
	play.text = "▶  PLAY"
	play.add_theme_font_size_override("font_size", 20)
	play.add_theme_color_override("font_color", Color(0.95, 0.95, 0.95))
	play.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	play.position = Vector2(40, -54)
	add_child(play)

	_timecode = Label.new()
	_timecode.add_theme_font_size_override("font_size", 20)
	_timecode.add_theme_color_override("font_color", Color(0.95, 0.95, 0.95))
	_timecode.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_timecode.position = Vector2(-220, -54)
	add_child(_timecode)

	_apply_setting()
	if SettingsManager.settings_changed.is_connected(_on_setting):
		return
	SettingsManager.settings_changed.connect(_on_setting)

func _on_setting(section: String, key: String, _v: Variant) -> void:
	if section == "gameplay" and key == "vhs":
		_apply_setting()

func _apply_setting() -> void:
	visible = SettingsManager.get_value("gameplay", "vhs", true)

func _process(delta: float) -> void:
	_elapsed += delta
	_blink += delta
	if _blink >= 0.6:
		_blink = 0.0
		_rec_dot.visible = not _rec_dot.visible
	var h: int = int(_elapsed) / 3600
	var m: int = (int(_elapsed) / 60) % 60
	var s: int = int(_elapsed) % 60
	_timecode.text = "%02d:%02d:%02d" % [h, m, s]

func _make_material() -> ShaderMaterial:
	var shader: Shader = Shader.new()
	shader.code = """
shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float aberration : hint_range(0.0, 4.0) = 1.6;
uniform float grain : hint_range(0.0, 0.5) = 0.09;
uniform float scanlines : hint_range(0.0, 0.6) = 0.14;
uniform float vignette : hint_range(0.0, 1.5) = 0.55;

float rand(vec2 co) {
	return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	// Rolling tracking wobble + slight horizontal jitter.
	float roll = sin((uv.y + TIME * 0.25) * 90.0) * 0.0009;
	float jitter = (rand(vec2(TIME * 12.0, floor(uv.y * 80.0))) - 0.5) * 0.0012;
	uv.x += roll + jitter;

	// Chromatic aberration (stronger toward the edges).
	vec2 dir = uv - vec2(0.5);
	float amt = aberration * SCREEN_PIXEL_SIZE.x;
	float r = texture(screen_tex, uv + dir * amt * 2.0).r;
	float g = texture(screen_tex, uv).g;
	float b = texture(screen_tex, uv - dir * amt * 2.0).b;
	vec3 col = vec3(r, g, b);

	// Film grain.
	float n = rand(uv * vec2(1024.0, 768.0) + fract(TIME) * 91.0);
	col += (n - 0.5) * grain;

	// Scanlines.
	float sl = sin(uv.y * 1400.0) * 0.5 + 0.5;
	col *= 1.0 - scanlines * sl;

	// Occasional bright tracking line.
	float band = step(0.995, rand(vec2(floor(TIME * 8.0), floor(uv.y * 30.0))));
	col += band * 0.15;

	// Vignette.
	float d = distance(uv, vec2(0.5));
	col *= mix(1.0, smoothstep(0.95, 0.35, d), vignette);

	// Desaturate slightly + warm old-tape tint.
	float gray = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(col, vec3(gray), 0.12);
	col *= vec3(1.04, 1.0, 0.92);

	COLOR = vec4(col, 1.0);
}
"""
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = shader
	return mat
