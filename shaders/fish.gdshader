// =============================================================================
//  POISSON — ondulation du corps + reflets iridescents
// =============================================================================
//  Concu pour un MultiMesh : INSTANCE_CUSTOM.x porte la phase de nage,
//  .y la vitesse, .z la taille relative, .w la teinte.
// =============================================================================
shader_type spatial;
render_mode blend_mix, cull_disabled, depth_draw_opaque, diffuse_burley;

uniform vec3 body_color : source_color = vec3(0.22, 0.42, 0.55);
uniform vec3 belly_color : source_color = vec3(0.86, 0.88, 0.84);
uniform vec3 iridescence : source_color = vec3(0.35, 0.85, 0.75);
uniform float undulation : hint_range(0.0, 1.0) = 0.22;
uniform float undulation_speed : hint_range(0.0, 20.0) = 7.0;
uniform float body_length = 1.0;
uniform float emission_energy : hint_range(0.0, 4.0) = 0.25;

varying float v_along;
varying vec3 v_normal_w;
varying vec4 v_custom;

void vertex() {
	float phase = INSTANCE_CUSTOM.x * 6.2831;
	float speed = mix(0.6, 1.6, INSTANCE_CUSTOM.y);
	// le corps est aligne sur -Z ; l'amplitude croit vers la queue
	float along = clamp((-VERTEX.z / max(body_length, 0.001)) * 0.5 + 0.5, 0.0, 1.0);
	float tail = pow(along, 2.0);
	float wave = sin(TIME * undulation_speed * speed + phase - along * 4.2);
	VERTEX.x += wave * tail * undulation * body_length;
	// leger roulis sur la nageoire caudale
	VERTEX.y += wave * tail * undulation * 0.12 * body_length;
	v_along = along;
	v_custom = INSTANCE_CUSTOM;
	v_normal_w = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	float belly = smoothstep(0.15, -0.35, NORMAL.y);
	vec3 tint = mix(body_color, body_color.bgr, v_custom.w);
	vec3 col = mix(tint, belly_color, belly);
	// bandes verticales
	float stripes = 0.5 + 0.5 * sin(v_along * 34.0);
	col *= 0.88 + stripes * 0.18;

	float fres = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0), 2.5);
	col += iridescence * fres * 0.35;

	ALBEDO = col;
	ROUGHNESS = 0.28;
	SPECULAR = 0.6;
	METALLIC = 0.15;
	EMISSION = iridescence * fres * emission_energy;
	ALPHA = 1.0;
}
