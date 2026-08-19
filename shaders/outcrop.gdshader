// =============================================================================
//  GISEMENT DE MINERAI — roche avec veines de cristal luminescentes
// =============================================================================
shader_type spatial;
render_mode blend_mix, cull_back, depth_draw_opaque, specular_schlick_ggx;

uniform vec3 rock_color : source_color = vec3(0.30, 0.29, 0.27);
uniform vec3 vein_color : source_color = vec3(0.25, 0.85, 0.95);
uniform float vein_amount : hint_range(0.0, 1.0) = 0.35;
uniform float vein_sharpness : hint_range(1.0, 24.0) = 8.0;
uniform float emission_energy : hint_range(0.0, 8.0) = 2.2;
uniform float metallic_amount : hint_range(0.0, 1.0) = 0.0;
uniform float roughness_amount : hint_range(0.0, 1.0) = 0.75;
uniform float highlight : hint_range(0.0, 1.0) = 0.0;  // survol / scan
uniform sampler2D rock_noise : hint_default_white, repeat_enable,
	filter_linear_mipmap;

varying vec3 v_world;
varying vec3 v_normal;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 p = v_world * 1.6;
	float n1 = texture(rock_noise, p.xz * 0.5 + p.y * 0.13).r;
	float n2 = texture(rock_noise, p.xy * 1.7 - p.z * 0.21).r;
	float rough_mask = n1 * 0.6 + n2 * 0.4;

	// les veines suivent les lignes de crete du bruit
	float vein = pow(clamp(1.0 - abs(n1 - n2) * 3.2, 0.0, 1.0), vein_sharpness);
	vein *= step(0.0001, vein_amount);

	vec3 albedo = rock_color * (0.68 + rough_mask * 0.6);
	albedo = mix(albedo, vein_color * 0.6, vein * vein_amount);

	float fres = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)),
		0.0, 1.0), 3.0);

	ALBEDO = albedo;
	ROUGHNESS = mix(roughness_amount, 0.18, vein * vein_amount);
	METALLIC = mix(metallic_amount, 0.85, vein * vein_amount * 0.5);
	SPECULAR = 0.5;
	NORMAL_MAP_DEPTH = 1.0;

	float pulse = 0.7 + 0.3 * sin(TIME * 1.6 + v_world.x * 2.0 + v_world.z * 1.3);
	EMISSION = vein_color * vein * vein_amount * emission_energy * pulse;
	// liseré au survol : le contour du gisement s'allume
	EMISSION += vein_color * fres * highlight * 3.0;
	ALPHA = 1.0;
}
