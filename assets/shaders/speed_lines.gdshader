shader_type canvas_item;
render_mode blend_add;

// =============================================================================
//  SPEED LINES -- full-screen overlay used by the camera when the hero is going
//  fast (swinging, diving, wall-running). `intensity` is animated from
//  scripts/player/speed_fx.gd. Purely additive so it never darkens the image.
// =============================================================================

uniform float intensity : hint_range(0.0, 1.0) = 0.0;
uniform float line_count = 120.0;
uniform float inner_radius : hint_range(0.0, 1.0) = 0.22;
uniform vec4 tint : source_color = vec4(0.75, 0.88, 1.0, 1.0);
uniform float scroll_speed = 5.0;

float hash11(float x) {
	return fract(sin(x * 91.3458) * 47453.5453);
}

void fragment() {
	if (intensity <= 0.001) {
		COLOR = vec4(0.0);
	} else {
		vec2 uv = SCREEN_UV - vec2(0.5);
		uv.x *= 1.777; // keep streaks radial on wide screens
		float r = length(uv);
		float a = atan(uv.y, uv.x);

		float id = floor((a / 6.28318 + 0.5) * line_count);
		float seed = hash11(id);
		float speed = 0.6 + seed * 1.4;
		float streak = fract(r * (2.0 + seed * 3.0) - TIME * scroll_speed * speed);
		streak = pow(streak, 6.0);

		float radial = smoothstep(inner_radius, 0.85, r);
		float amount = streak * radial * intensity;

		COLOR = vec4(tint.rgb, 1.0) * amount * 0.85;
	}
}
