// =============================================================================
//  HOLOGRAMME — projection du fabricateur
// =============================================================================
shader_type spatial;
render_mode blend_add, cull_disabled, unshaded, depth_draw_never;

uniform vec3 holo_color : source_color = vec3(0.35, 0.92, 1.0);
uniform float scan_speed : hint_range(0.0, 8.0) = 1.6;
uniform float scan_density : hint_range(1.0, 400.0) = 120.0;
uniform float flicker : hint_range(0.0, 1.0) = 0.15;
uniform float fresnel_power : hint_range(0.5, 8.0) = 2.2;
uniform float build_progress : hint_range(0.0, 1.0) = 1.0;
uniform float intensity : hint_range(0.0, 4.0) = 1.4;

varying vec3 v_local;

void vertex() {
	v_local = VERTEX;
	// leger tremblement du signal
	VERTEX += NORMAL * sin(TIME * 9.0 + VERTEX.y * 20.0) * 0.0015;
}

void fragment() {
	float fres = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0),
		fresnel_power);
	float scan = 0.5 + 0.5 * sin((v_local.y * scan_density) - TIME * scan_speed * 12.0);
	float band = smoothstep(0.35, 1.0, scan);
	float noise = fract(sin(dot(vec2(v_local.y, TIME), vec2(91.7, 47.3))) * 4375.85);
	float flick = 1.0 - flicker * noise;

	// balayage de construction : l'objet se materialise de bas en haut
	float reveal = step(v_local.y, mix(-1.0, 1.0, build_progress) );
	float edge = exp(-abs(v_local.y - mix(-1.0, 1.0, build_progress)) * 30.0);

	vec3 col = holo_color * (0.35 + band * 0.5 + fres * 1.2) * flick * intensity;
	col += holo_color * edge * 3.0;

	ALBEDO = vec3(0.0);
	EMISSION = col * max(reveal, edge);
	ALPHA = clamp((0.25 + band * 0.35 + fres * 0.8) * max(reveal, edge), 0.0, 1.0);
}
