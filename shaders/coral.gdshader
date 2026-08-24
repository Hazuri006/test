// =============================================================================
//  CORAIL — masse vivante bicolore
// =============================================================================
//  Un massif corallien n'est pas d'une seule couleur : c'est une base calcaire
//  colonisee par plaques. On melange donc deux teintes selon un bruit de
//  position monde, on creuse les pores avec un second bruit plus fin, et on
//  laisse la lumiere traverser la chair (BACKLIGHT) pour eviter l'aspect
//  "caillou peint". Les extremites peuvent s'allumer (polypes fluorescents).
// =============================================================================
shader_type spatial;
// Materiau OPAQUE : ne jamais ecrire ALPHA ici. Godot bascule tout shader
// qui affecte ALPHA dans la file transparente, ou il cesse d'ecrire la
// profondeur ; le post-traitement sous-marin le prend alors pour du vide a
// l'infini et le noie entierement dans le brouillard.
render_mode cull_back, depth_draw_opaque, diffuse_burley,
            specular_schlick_ggx;

uniform vec3 base_color : source_color = vec3(0.62, 0.30, 0.14);
uniform vec3 patch_color : source_color = vec3(0.10, 0.52, 0.45);
uniform vec3 tip_color : source_color = vec3(0.95, 0.62, 0.20);
uniform vec3 translucency : source_color = vec3(0.55, 0.24, 0.12);

uniform float patch_scale : hint_range(0.05, 4.0) = 0.85;
uniform float patch_amount : hint_range(0.0, 1.0) = 0.45;
uniform float pore_scale : hint_range(0.5, 20.0) = 6.0;
uniform float pore_depth : hint_range(0.0, 2.0) = 0.8;
uniform float tip_amount : hint_range(0.0, 1.0) = 0.0;
uniform float glow : hint_range(0.0, 6.0) = 0.0;
uniform vec3 glow_color : source_color = vec3(1.0, 0.55, 0.15);
uniform float roughness_amount : hint_range(0.0, 1.0) = 0.72;
uniform float highlight : hint_range(0.0, 1.0) = 0.0;
uniform float sway : hint_range(0.0, 1.0) = 0.0;

uniform sampler2D coral_noise : hint_default_white, repeat_enable,
	filter_linear_mipmap;

varying vec3 v_world;
varying vec3 v_object;

void vertex() {
	v_object = VERTEX;
	// Les especes molles ondulent doucement ; la phase depend de la position
	// de la colonie pour qu'aucune ne batte en meme temps que sa voisine.
	if (sway > 0.001) {
		vec3 base = MODEL_MATRIX[3].xyz;
		float h = clamp(VERTEX.y, 0.0, 4.0);
		float phase = base.x * 0.4 + base.z * 0.31;
		VERTEX.x += sin(TIME * 0.7 + phase) * 0.035 * h * sway;
		VERTEX.z += cos(TIME * 0.55 + phase * 1.3) * 0.03 * h * sway;
	}
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

// Projection triplanaire : indispensable sur des formes organiques, qui n'ont
// aucun depliage UV exploitable.
float tri_noise(vec3 p, float scale) {
	vec3 n = abs(normalize(v_object) + 0.0001);
	vec3 w = n / (n.x + n.y + n.z);
	return texture(coral_noise, p.zy * scale).r * w.x
		+ texture(coral_noise, p.xz * scale).r * w.y
		+ texture(coral_noise, p.xy * scale).r * w.z;
}

void fragment() {
	float patch = tri_noise(v_world, patch_scale * 0.35);
	float pore = tri_noise(v_world, pore_scale * 0.35);

	// plaques colonisees : seuil franc, bords irreguliers
	// Le bruit fractal se serre autour de 0,5 : sans etirer son contraste, le
	// seuil de colonisation ne se declenche presque jamais.
	patch = clamp((patch - 0.5) * 2.6 + 0.5, 0.0, 1.0);
	float colonised = smoothstep(0.42, 0.62, patch + pore * 0.15) * patch_amount;
	vec3 albedo = mix(base_color, patch_color, colonised);

	// les sommets s'eclaircissent (croissance recente, exposee a la lumiere)
	float up = clamp(normalize(v_object).y, 0.0, 1.0);
	albedo = mix(albedo, tip_color, pow(up, 2.5) * tip_amount);

	// pores : assombrissement dans les creux
	float cavity = 1.0 - pore * pore_depth * 0.45;
	albedo *= clamp(cavity, 0.35, 1.15);

	ALBEDO = albedo;
	ROUGHNESS = clamp(roughness_amount - colonised * 0.15 + pore * 0.12,
		0.15, 1.0);
	SPECULAR = 0.42;
	METALLIC = 0.0;
	AO = clamp(0.72 + pore * 0.35, 0.4, 1.0);
	AO_LIGHT_AFFECT = 0.6;
	// la chair du corail laisse passer la lumiere
	BACKLIGHT = translucency * (0.25 + colonised * 0.35);

	if (glow > 0.001) {
		float pulse = 0.7 + 0.3 * sin(TIME * 0.9 + v_world.x * 0.8 + v_world.z);
		float spots = smoothstep(0.62, 0.9, pore);
		EMISSION = glow_color * glow * spots * pulse;
	}
	if (highlight > 0.001) {
		float fres = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)),
			0.0, 1.0), 3.0);
		EMISSION += vec3(0.25, 0.9, 1.0) * fres * highlight * 2.5;
	}
}
