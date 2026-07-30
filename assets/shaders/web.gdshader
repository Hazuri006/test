shader_type spatial;
render_mode blend_mix, unshaded, cull_disabled, depth_draw_opaque;

// =============================================================================
//  WEB STRAND -- drawn on the cylinder mesh that links the hero's hand to the
//  anchor point. `progress` animates the shot travelling out, `tension` makes
//  the strand glow and thin out when the rope is pulling hard.
// =============================================================================

uniform vec4 strand_color : source_color = vec4(0.95, 0.97, 1.0, 1.0);
uniform float progress : hint_range(0.0, 1.0) = 1.0;
uniform float tension : hint_range(0.0, 1.0) = 0.0;
uniform float thread_count = 7.0;
uniform float fade_tip : hint_range(0.0, 1.0) = 0.12;

void fragment() {
	// UV.y runs 0 (hand) -> 1 (anchor) along the generated cylinder.
	float along = UV.y;
	if (along > progress) {
		discard;
	}

	// Braided threads: a few bright strands twisting around the tube.
	float braid = abs(sin(UV.x * 3.14159 * thread_count + along * 26.0));
	float body = mix(0.55, 1.0, pow(braid, 2.0));

	// Soften both ends so the strand melts into hand and wall.
	float ends = smoothstep(0.0, fade_tip, along) * smoothstep(1.0, 1.0 - fade_tip * 0.5, along);

	vec3 col = strand_color.rgb * body;
	col += vec3(0.5, 0.7, 1.0) * tension * 0.6;

	ALBEDO = col;
	ALPHA = strand_color.a * (0.65 + 0.35 * body) * max(ends, 0.35);
	EMISSION = col * (0.35 + tension * 0.8);
}
