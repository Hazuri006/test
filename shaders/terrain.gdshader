// =============================================================================
//  FOND MARIN — melange triplanaire sable / roche / sediment
// =============================================================================
//  La couleur de sommet transporte les donnees de biome :
//    R = rugosite rocheuse   G = identifiant de biome   B = bioluminescence
//    A = occlusion ambiante pre-calculee (creux et crevasses)
// =============================================================================
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley,
            specular_schlick_ggx;

uniform sampler2D sand_albedo : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D sand_normal : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D rock_albedo : source_color, repeat_enable, filter_linear_mipmap;
uniform sampler2D rock_normal : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D detail_noise : hint_default_white, repeat_enable,
	filter_linear_mipmap;

uniform vec3 sand_tint : source_color = vec3(0.86, 0.82, 0.68);
uniform vec3 rock_tint : source_color = vec3(0.36, 0.38, 0.40);
uniform vec3 kelp_floor_tint : source_color = vec3(0.32, 0.40, 0.28);
uniform vec3 deep_tint : source_color = vec3(0.20, 0.24, 0.30);

uniform float sand_scale = 0.55;
uniform float rock_scale = 0.28;
uniform float macro_scale = 0.012;
uniform float normal_strength : hint_range(0.0, 3.0) = 1.25;
uniform float slope_start : hint_range(0.0, 1.0) = 0.55;
uniform float slope_end : hint_range(0.0, 1.0) = 0.86;
uniform float wetness : hint_range(0.0, 1.0) = 0.85;
uniform float bio_glow : hint_range(0.0, 4.0) = 1.0;
uniform vec3 bio_color : source_color = vec3(0.16, 0.72, 0.95);

varying vec3 v_world;
varying vec3 v_world_normal;
varying vec4 v_data;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	v_data = COLOR;
}

// Projection triplanaire : evite tout etirement sur les falaises
vec3 triplanar(sampler2D tex, vec3 p, vec3 n, float scale) {
	vec3 w = pow(abs(n), vec3(4.0));
	w /= max(w.x + w.y + w.z, 0.0001);
	vec3 x = texture(tex, p.zy * scale).rgb;
	vec3 y = texture(tex, p.xz * scale).rgb;
	vec3 z = texture(tex, p.xy * scale).rgb;
	return x * w.x + y * w.y + z * w.z;
}

void fragment() {
	vec3 n = normalize(v_world_normal);
	float slope = 1.0 - clamp(n.y, 0.0, 1.0);
	float rockiness = clamp(
		smoothstep(slope_start, slope_end, slope * 1.4) + v_data.r * 0.8,
		0.0, 1.0);

	// --- deux echelles melangees : casse la repetition du carrelage ---------
	vec3 sand_c = triplanar(sand_albedo, v_world, n, sand_scale) * 0.65
		+ triplanar(sand_albedo, v_world, n, sand_scale * 0.21) * 0.35;
	vec3 rock_c = triplanar(rock_albedo, v_world, n, rock_scale) * 0.6
		+ triplanar(rock_albedo, v_world, n, rock_scale * 0.17) * 0.4;

	// variation macro : plaques claires et sombres a l'echelle du paysage
	float macro = texture(detail_noise, v_world.xz * macro_scale).r;
	float macro2 = texture(detail_noise, v_world.xz * macro_scale * 3.7 + 11.0).r;

	vec3 sand_col = sand_c * sand_tint * (0.78 + macro * 0.44);
	vec3 rock_col = rock_c * rock_tint * (0.75 + macro2 * 0.5);

	// --- teinte de biome ----------------------------------------------------
	float biome = v_data.g;
	vec3 biome_tint = mix(vec3(1.0), kelp_floor_tint,
		smoothstep(0.25, 0.55, biome));
	biome_tint = mix(biome_tint, deep_tint, smoothstep(0.6, 1.0, biome));

	vec3 albedo = mix(sand_col, rock_col, rockiness) * biome_tint;

	// petits galets / debris coquilliers
	float grit = texture(detail_noise, v_world.xz * 2.6).r;
	albedo *= 0.9 + grit * 0.2;

	// --- normales -----------------------------------------------------------
	vec3 nrm_s = triplanar(sand_normal, v_world, n, sand_scale) * 2.0 - 1.0;
	vec3 nrm_r = triplanar(rock_normal, v_world, n, rock_scale) * 2.0 - 1.0;
	vec3 nrm = normalize(mix(nrm_s, nrm_r, rockiness));
	NORMAL_MAP = nrm * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = normal_strength;

	ALBEDO = albedo;
	ROUGHNESS = mix(mix(0.92, 0.62, rockiness), 0.34, wetness * 0.55)
		- macro * 0.06;
	SPECULAR = mix(0.35, 0.5, wetness);
	METALLIC = 0.0;
	AO = clamp(v_data.a, 0.25, 1.0) * (0.82 + grit * 0.18);
	AO_LIGHT_AFFECT = 0.8;

	// --- bioluminescence (coraux et lichens des profondeurs) ----------------
	float bio = v_data.b;
	if (bio > 0.001) {
		float patch = smoothstep(0.62, 0.95,
			texture(detail_noise, v_world.xz * 1.4 + vec2(TIME * 0.008)).r);
		float pulse = 0.65 + 0.35 * sin(TIME * 1.3 + v_world.x * 0.5 + v_world.z * 0.4);
		EMISSION = bio_color * bio * patch * pulse * bio_glow;
	}
}
