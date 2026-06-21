// Full-screen post grade for the unsettling backrooms look.
// Applied via a ColorRect on a CanvasLayer that covers the viewport.
shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float aberration : hint_range(0.0, 4.0) = 1.2;
uniform float vignette_strength : hint_range(0.0, 1.0) = 0.5;
uniform float grain_amount : hint_range(0.0, 0.3) = 0.045;
uniform float saturation : hint_range(0.0, 2.0) = 0.9;
uniform vec3 tint = vec3(1.04, 1.0, 0.84);
uniform float fear : hint_range(0.0, 1.0) = 0.0; // pushed up by the game when the entity is near

float rand(vec2 co) {
	return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 center = uv - 0.5;
	float dist = length(center);

	// Chromatic aberration grows toward the edges and with fear.
	vec2 dir = center * dist * (aberration + fear * 3.0) * 0.012;
	vec3 col;
	col.r = texture(screen_tex, uv - dir).r;
	col.g = texture(screen_tex, uv).g;
	col.b = texture(screen_tex, uv + dir).b;

	// Saturation + sickly yellow grade.
	float l = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(vec3(l), col, saturation - fear * 0.25);
	col *= tint;

	// Vignette, tightening with fear.
	float vig = smoothstep(0.95, 0.25 - fear * 0.15, dist);
	col *= mix(1.0, vig, vignette_strength + fear * 0.3);

	// Animated film grain.
	float g = rand(uv * vec2(1280.0, 720.0) + fract(TIME) * 41.0) - 0.5;
	col += g * (grain_amount + fear * 0.05);

	// Faint scanline hum.
	col *= 1.0 - 0.03 * sin(uv.y * 900.0 + TIME * 2.0);

	COLOR = vec4(col, 1.0);
}
