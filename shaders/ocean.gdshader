// =============================================================================
//  OCEAN — surface d'eau physique
// =============================================================================
//  * Deplacement par sommes de vagues de Gerstner (houle de mer profonde,
//    la celerite c = sqrt(g/k) est celle de la vraie dispersion des vagues)
//  * Normales analytiques (derivees exactes de Gerstner) + 2 couches de
//    micro-relief anime pour les ridules
//  * Refraction ecran (SCREEN_TEXTURE) avec correction de contact
//  * Absorption de Beer-Lambert par canal -> vraie couleur d'eau par epaisseur
//  * Ecume de deferlement pilotee par le jacobien de la deformation
//  * Diffusion sous-surfacique sur la crete des vagues (dos de vague eclaire)
//  * Vue par en dessous : fenetre de Snell + reflexion totale interne
// =============================================================================
shader_type spatial;
render_mode blend_mix, depth_draw_always, cull_disabled, diffuse_burley,
            specular_schlick_ggx, world_vertex_coords;

// ---------------------------------------------------------------- etat de mer
uniform float sea_state : hint_range(0.0, 2.0) = 1.0;      // 0 = miroir, 2 = forte houle
uniform float wave_speed : hint_range(0.0, 3.0) = 1.0;
uniform float choppiness : hint_range(0.0, 1.5) = 0.85;
uniform float wind_angle : hint_range(-3.15, 3.15) = 0.6;
// Horloge des vagues pilotee par le script : garantit que la houle calculee
// sur le CPU (flottabilite, nage) est exactement celle affichee par le GPU.
uniform float wave_time = 0.0;

// ---------------------------------------------------------------- couleur eau
// Memes paliers que WaterPalette (scripts/world/water_palette.gd) : la
// surface, le brouillard et le post-traitement doivent donner exactement la
// meme teinte a une profondeur donnee, sinon l'eau change de couleur selon
// qu'on la regarde de dessus ou de dessous.
uniform vec3 tint_surface : source_color = vec3(0.085, 0.430, 0.410);
uniform vec3 tint_shallow : source_color = vec3(0.030, 0.250, 0.330);
uniform vec3 tint_mid : source_color = vec3(0.008, 0.090, 0.205);
uniform vec3 tint_deep : source_color = vec3(0.002, 0.028, 0.090);
// coefficients d'extinction (m^-1) par canal : le rouge meurt en ~4 m
uniform vec3 extinction = vec3(0.45, 0.11, 0.062);
uniform float scatter_strength : hint_range(0.0, 4.0) = 1.1;
uniform vec3 scatter_color : source_color = vec3(0.09, 0.42, 0.42);

// ---------------------------------------------------------------- micro-relief
uniform sampler2D detail_normal_a : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D detail_normal_b : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D foam_noise : hint_default_white, repeat_enable, filter_linear_mipmap;
uniform float detail_scale_a = 0.09;
uniform float detail_scale_b = 0.31;
uniform float detail_strength : hint_range(0.0, 2.0) = 0.38;

// ---------------------------------------------------------------- ecume
uniform vec3 foam_color : source_color = vec3(0.92, 0.96, 0.98);
uniform float foam_shore_depth : hint_range(0.05, 6.0) = 1.6;
// Seuil de deferlement, compare directement au repliement local de la surface.
// Le seuil est absolu : une mer calme ne moutonne pas, une mer forte se couvre
// de moutons, sans qu'il y ait le moindre reglage a changer entre les deux.
uniform float foam_crest_bias : hint_range(0.0, 1.0) = 0.30;
uniform float foam_crest_width : hint_range(0.01, 0.5) = 0.14;

// ---------------------------------------------------------------- refraction
uniform float refraction_strength : hint_range(0.0, 0.2) = 0.045;
uniform float roughness_base : hint_range(0.0, 0.5) = 0.035;

// ---------------------------------------------------------------- soleil / vue
uniform vec3 sun_direction = vec3(0.4, 0.75, 0.3);   // vers le soleil
uniform vec3 sun_color : source_color = vec3(1.0, 0.94, 0.82);
uniform float sun_energy = 1.0;
uniform float underwater_view = 0.0;                 // 1 quand la camera est immergee
// Diagnostic : peint la surface en aplat, pour verifier ou elle est
// reellement dessinee. Sans effet en jeu (reste a zero).
uniform float debug_flat = 0.0;
uniform vec3 underwater_fog_color : source_color = vec3(0.03, 0.15, 0.22);

uniform sampler2D screen_tex : hint_screen_texture, repeat_disable, filter_linear_mipmap;
uniform sampler2D depth_tex : hint_depth_texture, repeat_disable, filter_nearest;

varying vec3 v_world;
varying vec3 v_gerstner_normal;
varying float v_foam_fold;
varying float v_crest;

// -----------------------------------------------------------------------------
//  Banque de vagues : direction (angle relatif au vent), longueur d'onde,
//  cambrure relative. 6 trains croises -> houle non repetitive.
// -----------------------------------------------------------------------------
const int WAVE_COUNT = 6;
// x = angle relatif (rad), y = longueur d'onde (m), z = cambrure relative
const vec3 WAVES[6] = vec3[6](
	vec3( 0.00, 74.0, 0.075),
	vec3( 0.51, 41.0, 0.082),
	vec3(-0.68, 23.0, 0.090),
	vec3( 1.24, 12.5, 0.082),
	vec3(-1.51,  6.7, 0.070),
	vec3( 2.42,  3.3, 0.058)
);

const float GRAVITY = 9.81;

// Somme de Gerstner. Renvoie le deplacement ; ecrit tangente/binormale/repli.
vec3 gerstner(vec3 p, float t, out vec3 tangent, out vec3 binormal, out float fold,
              out float crest) {
	tangent = vec3(1.0, 0.0, 0.0);
	binormal = vec3(0.0, 0.0, 1.0);
	vec3 disp = vec3(0.0);
	fold = 0.0;
	crest = 0.0;

	float amp_scale = sea_state;
	for (int i = 0; i < WAVE_COUNT; i++) {
		vec3 w = WAVES[i];
		float ang = wind_angle + w.x;
		vec2 d = vec2(cos(ang), sin(ang));
		float wavelength = w.y;
		float k = 6.28318530718 / wavelength;
		float c = sqrt(GRAVITY / k);                       // dispersion eau profonde
		// cambrure : bornee pour ne jamais depasser le point de deferlement
		float steep = clamp(w.z * amp_scale * choppiness, 0.0, 0.92);
		float a = steep / k;
		float f = k * (dot(d, p.xz) - c * t * wave_speed);
		float sf = sin(f);
		float cf = cos(f);

		disp.x += d.x * a * cf;
		disp.z += d.y * a * cf;
		disp.y += a * sf;

		tangent += vec3(
			-d.x * d.x * steep * sf,
			 d.x * steep * cf,
			-d.x * d.y * steep * sf);
		binormal += vec3(
			-d.x * d.y * steep * sf,
			 d.y * steep * cf,
			-d.y * d.y * steep * sf);

		fold += steep * sf;
		crest += a * sf / max(amp_scale, 0.001);
	}
	return disp;
}

void vertex() {
	// world_vertex_coords : VERTEX est deja en espace monde
	vec3 p = VERTEX;

	// Attenuation du deplacement au loin : evite l'aliasing de specular
	float dist = length(p.xz - CAMERA_POSITION_WORLD.xz);
	float fade = 1.0 - smoothstep(500.0, 2600.0, dist);

	vec3 tangent, binormal;
	float fold, crest;
	vec3 disp = gerstner(p, wave_time, tangent, binormal, fold, crest);
	VERTEX = p + disp * fade;

	vec3 n = normalize(cross(binormal, tangent));
	v_gerstner_normal = normalize(mix(vec3(0.0, 1.0, 0.0), n, fade));
	NORMAL = v_gerstner_normal;
	TANGENT = normalize(tangent);
	BINORMAL = normalize(binormal);
	v_world = VERTEX;
	v_foam_fold = fold;
	v_crest = crest * fade;
}

// Reconstruit la profondeur lineaire (distance a la camera le long de -Z vue).
//
// Godot travaille en profondeur inversee : une valeur nulle signifie "aucune
// geometrie" — le ciel, ou du terrain pas encore charge. Reconstruire la
// profondeur telle quelle donne alors zero, donc une epaisseur d'eau nulle :
// le shader croit voir un bord de plage et couvre la mer d'ecume. On renvoie
// au contraire une distance tres grande, ce qui est le sens physique : sous ce
// pixel, il n'y a pas de fond.
float linear_depth(vec2 uv, mat4 inv_proj) {
	float d = texture(depth_tex, uv).r;
	if (d <= 0.000001) {
		return 10000.0;
	}
	vec3 ndc = vec3(uv * 2.0 - 1.0, d);
	vec4 view = inv_proj * vec4(ndc, 1.0);
	return -view.z / view.w;
}

// Couleur du milieu pour une colonne d'eau de `d` metres.
vec3 water_tint(float d) {
	d = max(d, 0.0);
	vec3 c = mix(tint_surface, tint_shallow, smoothstep(0.0, 13.0, d));
	c = mix(c, tint_mid, smoothstep(11.0, 40.0, d));
	c = mix(c, tint_deep, smoothstep(38.0, 95.0, d));
	return c;
}

vec3 sample_detail_normals(vec3 wpos, float t, float fade) {
	vec2 flow = vec2(cos(wind_angle), sin(wind_angle));
	vec2 uv_a = wpos.xz * detail_scale_a + flow * t * 0.035;
	vec2 uv_b = wpos.xz * detail_scale_b - flow.yx * t * 0.075;
	vec3 na = texture(detail_normal_a, uv_a).xyz * 2.0 - 1.0;
	vec3 nb = texture(detail_normal_b, uv_b).xyz * 2.0 - 1.0;
	// Melange "whiteout" : conserve mieux le detail que la moyenne. Le plancher
	// sur la composante Z empeche des normales quasi horizontales, qui
	// produiraient des eclats speculaires aberrants.
	vec3 n = normalize(vec3(na.xy + nb.xy, max(na.z * nb.z, 0.45)));
	n.xy *= detail_strength * fade;
	return normalize(n);
}

void fragment() {
	vec3 world_pos = v_world;
	vec3 view_dir = normalize(CAMERA_POSITION_WORLD - world_pos);
	float cam_dist = length(CAMERA_POSITION_WORLD - world_pos);
	float detail_fade = 1.0 - smoothstep(60.0, 420.0, cam_dist);

	// ---- normale finale (Gerstner + ridules), repliee si on est dessous ------
	vec3 base_n = normalize(v_gerstner_normal);
	vec3 det = sample_detail_normals(world_pos, wave_time, detail_fade);
	// repere tangent de la surface
	vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0) + vec3(0.001), base_n));
	vec3 B = normalize(cross(base_n, T));
	vec3 N = normalize(base_n + (T * det.x + B * det.y) * 0.6);
	if (!FRONT_FACING) {
		N = -N;
	}
	NORMAL = normalize((VIEW_MATRIX * vec4(N, 0.0)).xyz);

	// ---- geometrie de la colonne d'eau --------------------------------------
	// Profondeur de la surface, en espace vue. On la recalcule depuis la
	// position monde : le shader tourne en `world_vertex_coords`, donc VERTEX
	// n'est PAS en espace vue ici. La comparer telle quelle a la profondeur
	// lue dans le tampon revenait a soustraire deux grandeurs exprimees dans
	// des reperes differents — l'epaisseur d'eau devenait fonction de la
	// position dans le monde et non de la distance, et la mer prenait par
	// endroits la couleur du sable qu'elle recouvre.
	float surface_depth = -(VIEW_MATRIX * vec4(world_pos, 1.0)).z;
	float scene_depth = linear_depth(SCREEN_UV, INV_PROJECTION_MATRIX);
	float thickness = max(scene_depth - surface_depth, 0.0);

	// ---- refraction ---------------------------------------------------------
	vec2 refr_offset = N.xz * refraction_strength
		* clamp(thickness * 0.35, 0.0, 1.0)
		/ max(surface_depth * 0.06, 1.0);
	vec2 refr_uv = clamp(SCREEN_UV + refr_offset, vec2(0.001), vec2(0.999));
	// correction de contact : ne pas aspirer un objet situe DEVANT la surface
	float refr_depth = linear_depth(refr_uv, INV_PROJECTION_MATRIX);
	if (refr_depth < surface_depth) {
		refr_uv = SCREEN_UV;
		refr_depth = scene_depth;
	}
	float refr_thickness = max(refr_depth - surface_depth, 0.0);
	vec3 behind = texture(screen_tex, refr_uv).rgb;

	// ---- absorption (Beer-Lambert) : trajet aller-retour dans l'eau ---------
	vec3 transmit = exp(-extinction * refr_thickness * 1.35);
	vec3 tint = water_tint(refr_thickness);
	vec3 refracted = behind * transmit + tint * (1.0 - transmit);

	// ---- diffusion sous-surfacique --------------------------------------
	// Trois conditions doivent etre reunies pour qu'une vague s'allume :
	// se trouver sur une crete (peu d'eau a traverser), etre regardee a
	// contre-jour, et etre vue en rasant (long trajet dans la crete).
	float crest_mask = smoothstep(0.15, 0.95, v_crest);
	float back_light = pow(clamp(dot(view_dir, -normalize(sun_direction)) * 0.5 + 0.5,
		0.0, 1.0), 4.0);
	float grazing = pow(1.0 - clamp(dot(N, view_dir), 0.0, 1.0), 2.0);
	vec3 sss_col = scatter_color * sun_color * sun_energy
		* crest_mask * back_light * grazing * scatter_strength;

	// ---- ecume --------------------------------------------------------------
	float shore_foam = 1.0 - smoothstep(0.0, foam_shore_depth, refr_thickness);
	float crest_foam = smoothstep(foam_crest_bias,
		foam_crest_bias + foam_crest_width, v_foam_fold);
	vec2 fuv = world_pos.xz * 0.12 + vec2(wave_time * 0.02, wave_time * -0.014);
	float fn = texture(foam_noise, fuv).r * 0.6
		+ texture(foam_noise, fuv * 2.7 - wave_time * 0.03).r * 0.4;
	float foam = clamp(max(shore_foam * (0.55 + fn * 0.75),
		crest_foam * smoothstep(0.40, 0.92, fn)) * detail_fade
		+ shore_foam * 0.35, 0.0, 1.0);

	// ---- scintillement solaire (GGX manuel, en plus du specular moteur) -----
	vec3 L = normalize(sun_direction);
	vec3 H = normalize(L + view_dir);
	float ndh = max(dot(N, H), 0.0);
	float gloss = mix(2600.0, 160.0, clamp(sea_state * 0.5, 0.0, 1.0));
	float glint = pow(ndh, gloss) * clamp(dot(N, L), 0.0, 1.0);
	vec3 sun_glint = sun_color * sun_energy * glint * 2.6 * detail_fade;

	// Les deux faces de la surface s'ecrivent dans les memes sorties : GLSL
	// interdit un `return` anticipe dans le processeur de fragment.
	vec3 out_color;
	float out_rough;
	float out_alpha;
	float out_ao = 1.0;

	// =========================================================================
	//  VUE DEPUIS L'INTERIEUR DE L'EAU : fenetre de Snell
	// =========================================================================
	if (!FRONT_FACING) {
		// angle critique eau->air : asin(1/1.333) = 48.6 deg
		float cos_theta = clamp(dot(normalize(-view_dir), vec3(0.0, -1.0, 0.0)),
			-1.0, 1.0);
		float theta = acos(clamp(abs(cos_theta), 0.0, 1.0));
		float critical = 0.8481;                      // 48.6 deg en radians
		float window = 1.0 - smoothstep(critical - 0.16, critical + 0.05, theta);

		// dans la fenetre : le ciel compresse, avec aberration chromatique
		vec3 sky_seen = behind;
		vec2 ca = N.xz * 0.02;
		sky_seen.r = texture(screen_tex, clamp(refr_uv + ca, vec2(0.001), vec2(0.999))).r;
		sky_seen.b = texture(screen_tex, clamp(refr_uv - ca, vec2(0.001), vec2(0.999))).b;

		// hors fenetre : reflexion totale interne du volume d'eau
		vec3 tir = underwater_fog_color * (0.85 + 0.4 * pow(max(dot(N, L), 0.0), 2.0));

		vec3 col = mix(tir, sky_seen * 1.15, window);
		col += sun_color * sun_energy * pow(window, 3.0)
			* pow(max(dot(view_dir, L), 0.0), 24.0) * 1.4;   // tache solaire
		col += foam_color * foam * 0.35 * window;

		out_color = col;
		out_rough = 0.06;
		out_alpha = 1.0;
	} else {
		// =====================================================================
		//  VUE DEPUIS L'AIR
		// =====================================================================
		vec3 color = refracted + sss_col;
		color = mix(color, foam_color, foam);
		color += sun_glint * (1.0 - foam * 0.7);

		out_color = color;
		// La rugosite croit avec la distance pour absorber la variance des
		// normales sous-pixel. Sans cela, chaque pixel lointain couvre des
		// dizaines de facettes de vague et l'horizon se met a grouiller de
		// points blancs : c'est l'aliasing speculaire classique des oceans.
		float micro_variance = smoothstep(30.0, 700.0, cam_dist) * 0.28;
		out_rough = mix(roughness_base + sea_state * 0.02 + micro_variance,
			0.55, foam);
		out_alpha = mix(0.88, 1.0, clamp(refr_thickness * 0.6, 0.0, 1.0));
		// legere occlusion pour ancrer l'ecume
		out_ao = mix(1.0, 0.92, foam);
	}

	ALBEDO = vec3(0.0);
	EMISSION = mix(out_color, vec3(1.0, 0.0, 1.0), clamp(debug_flat, 0.0, 1.0));
	// F0 de l'eau = 0.02  ->  SPECULAR = sqrt(0.02 / 0.16)
	SPECULAR = 0.354;
	METALLIC = 0.0;
	ROUGHNESS = out_rough;
	ALPHA = out_alpha;
	AO = out_ao;
	AO_LIGHT_AFFECT = 0.6;
}
