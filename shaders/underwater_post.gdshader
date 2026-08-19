// =============================================================================
//  POST-TRAITEMENT SOUS-MARIN
// =============================================================================
//  Quad plein ecran place devant la camera. Reconstruit la position monde a
//  partir du tampon de profondeur, puis applique :
//   * l'absorption de Beer-Lambert le long du segment reellement immerge
//     (intersection analytique du rayon avec le demi-espace sous la surface)
//   * la diffusion (in-scattering) qui bleuit et voile la distance
//   * un flou croissant avec la distance (turbidite)
//   * des caustiques projetees en espace monde, avec dispersion chromatique
//   * des rayons crepusculaires (god rays) en flou radial vers le soleil
//   * la ligne de flottaison ondulante quand la tete traverse la surface
//   * ondulation de l'image, aberration chromatique et vignettage
// =============================================================================
shader_type spatial;
render_mode unshaded, depth_test_disabled, depth_draw_never, fog_disabled;

uniform sampler2D screen_tex : hint_screen_texture, repeat_disable,
	filter_linear_mipmap;
uniform sampler2D depth_tex : hint_depth_texture, repeat_disable, filter_nearest;

uniform float water_level = 0.0;
uniform float submersion : hint_range(0.0, 1.0) = 0.0;   // 0 = a l'air libre
uniform float depth_below : hint_range(0.0, 2000.0) = 0.0;

// Extinction (m^-1) : le rouge disparait vers 5 m, le vert vers 25 m,
// le bleu porte au-dela de 60 m. Valeurs proches d'une eau cotiere claire.
uniform vec3 extinction = vec3(0.36, 0.075, 0.042);
uniform vec3 water_color : source_color = vec3(0.045, 0.28, 0.36);
uniform vec3 deep_water_color : source_color = vec3(0.004, 0.03, 0.075);
uniform float turbidity : hint_range(0.0, 3.0) = 1.0;
uniform float visibility : hint_range(5.0, 200.0) = 45.0;

group_uniforms Caustics;
uniform float caustics_strength : hint_range(0.0, 4.0) = 1.4;
uniform float caustics_scale = 0.55;
uniform float caustics_speed = 0.42;
uniform float caustics_depth_fade = 45.0;
uniform float caustics_dispersion : hint_range(0.0, 0.1) = 0.022;

group_uniforms GodRays;
uniform float godray_strength : hint_range(0.0, 3.0) = 0.85;
uniform vec2 sun_screen_pos = vec2(0.5, -0.4);
uniform float sun_visible : hint_range(0.0, 1.0) = 1.0;
uniform vec3 sun_tint : source_color = vec3(0.68, 0.92, 1.0);

group_uniforms Lens;
uniform float wobble_strength : hint_range(0.0, 0.02) = 0.0035;
uniform float chromatic : hint_range(0.0, 0.02) = 0.0025;
uniform float vignette : hint_range(0.0, 2.0) = 0.75;
uniform float waterline_thickness : hint_range(0.0, 0.2) = 0.028;
uniform float damage_flash : hint_range(0.0, 1.0) = 0.0;

void vertex() {
	// quad en coordonnees de clip : couvre exactement le viewport, toujours
	// devant la camera quelle que soit son orientation
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

// ----------------------------------------------------------------- bruit -----
float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
	           mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Cellules de Worley animees : reseau de caustiques tres proche du reel.
float worley_caustic(vec2 p, float t) {
	vec2 n = floor(p);
	vec2 f = fract(p);
	float d = 1.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 o = vec2(hash12(n + g), hash12(n + g + 41.7));
			// chaque cellule derive sur une petite orbite -> ondulation continue
			o = 0.5 + 0.42 * sin(t + 6.2831 * o);
			d = min(d, length(g + o - f));
		}
	}
	// les lignes brillantes sont les aretes du diagramme de Voronoi
	return pow(1.0 - clamp(d, 0.0, 1.0), 5.0);
}

float caustics(vec3 wpos, float t, float scale) {
	vec2 p = wpos.xz * scale;
	float c = worley_caustic(p, t * caustics_speed);
	c += 0.55 * worley_caustic(p * 2.13 + 17.0, t * caustics_speed * 1.4);
	c += 0.28 * worley_caustic(p * 4.31 - 9.0, t * caustics_speed * 0.7);
	return c * 0.55;
}

void fragment() {
	vec2 uv = SCREEN_UV;
	float t = TIME;

	// ------------------------------------------------ reconstruction geometrie
	// Godot utilise un tampon de profondeur inverse : 0 = infini (ciel).
	float raw_depth = texture(depth_tex, uv).r;
	bool is_sky = raw_depth <= 0.000001;
	vec3 cam_pos = CAMERA_POSITION_WORLD;

	// direction du rayon, independante de la profondeur (jamais de NaN)
	vec4 dir_view = INV_PROJECTION_MATRIX * vec4(uv * 2.0 - 1.0, 0.5, 1.0);
	vec3 rd = normalize((INV_VIEW_MATRIX
		* vec4(normalize(dir_view.xyz / dir_view.w), 0.0)).xyz);

	float scene_dist = 8000.0;
	if (!is_sky) {
		vec4 view_p = INV_PROJECTION_MATRIX * vec4(uv * 2.0 - 1.0, raw_depth, 1.0);
		scene_dist = length(view_p.xyz / view_p.w);
	}
	vec3 world_pos = cam_pos + rd * scene_dist;

	// ------------------------------------------------ masque de ligne d'eau ---
	// La frontiere ecran est l'horizon du plan d'eau, gondolee par une houle :
	// tete a moitie sortie, on voit le bourrelet du menisque onduler.
	float wobble_line = (vnoise(vec2(uv.x * 9.0, t * 0.9)) - 0.5) * 0.09
		+ (vnoise(vec2(uv.x * 26.0 + 5.0, t * 1.7)) - 0.5) * 0.035;
	float cam_rel = cam_pos.y - water_level;
	float line = rd.y * 0.30 + cam_rel * 2.2 + wobble_line;
	float under = 1.0 - smoothstep(-waterline_thickness, waterline_thickness, line);
	// quand on est franchement immerge, tout l'ecran l'est
	under = max(under, clamp(-cam_rel * 3.0, 0.0, 1.0));
	under *= step(0.001, submersion + max(-cam_rel, 0.0));

	vec3 result = texture(screen_tex, uv).rgb;
	float edge = length(uv - 0.5) * 2.0;

	// Le test est coherent sur tout l'ecran : le GPU saute reellement le bloc
	// quand la camera est a l'air libre.
	if (under >= 0.002) {
		// ---------------------------- longueur du trajet reellement dans l'eau
		float t_enter = 0.0;
		float t_exit = scene_dist;
		if (abs(rd.y) > 0.0001) {
			float t_cross = (water_level - cam_pos.y) / rd.y;
			if (cam_rel < 0.0) {
				// on part de l'eau : on en sort si le rayon monte
				if (rd.y > 0.0) {
					t_exit = min(t_exit, max(t_cross, 0.0));
				}
			} else {
				// on part de l'air : on entre dans l'eau si le rayon descend
				t_enter = (rd.y < 0.0) ? clamp(t_cross, 0.0, scene_dist) : scene_dist;
			}
		} else if (cam_rel >= 0.0) {
			t_enter = scene_dist;
		}
		float water_dist = max(t_exit - t_enter, 0.0);

		// ------------------------------------------- distorsion de l'image ---
		vec2 warp = vec2(
			sin(uv.y * 22.0 + t * 1.6) + 0.5 * sin(uv.y * 51.0 - t * 2.3),
			cos(uv.x * 19.0 - t * 1.3) + 0.5 * cos(uv.x * 44.0 + t * 2.9)
		) * wobble_strength * under;
		vec2 suv = clamp(uv + warp, vec2(0.0), vec2(1.0));

		// flou de turbidite : au loin, la diffusion multiple brouille l'image
		float blur_lod = clamp(water_dist / max(visibility, 1.0), 0.0, 1.0)
			* 3.2 * turbidity;
		vec3 col = textureLod(screen_tex, suv, blur_lod).rgb;

		// aberration chromatique croissante vers les bords
		vec2 ca = normalize(uv - 0.5 + 0.0001) * chromatic * edge * under;
		col.r = textureLod(screen_tex, clamp(suv + ca, vec2(0.0), vec2(1.0)), blur_lod).r;
		col.b = textureLod(screen_tex, clamp(suv - ca, vec2(0.0), vec2(1.0)), blur_lod).b;

		// ------------------------------------------------------ caustiques ---
		if (!is_sky && caustics_strength > 0.001) {
			float surface_depth = max(water_level - world_pos.y, 0.0);
			float fade = exp(-surface_depth / max(caustics_depth_fade, 0.1));
			fade *= 1.0 - smoothstep(visibility * 0.6, visibility * 1.6, water_dist);
			if (fade > 0.003) {
				// dispersion : chaque longueur d'onde se refracte differemment
				float cr = caustics(world_pos, t,
					caustics_scale * (1.0 - caustics_dispersion));
				float cg = caustics(world_pos, t, caustics_scale);
				float cb = caustics(world_pos, t,
					caustics_scale * (1.0 + caustics_dispersion));
				vec3 caus = vec3(cr, cg, cb) * fade * caustics_strength * sun_visible;
				// elles n'apparaissent que sur les surfaces tournees vers le haut
				vec3 dx = dFdx(world_pos);
				vec3 dy = dFdy(world_pos);
				vec3 nrm = normalize(cross(dy, dx));
				float up = clamp(abs(nrm.y), 0.0, 1.0);
				col += caus * (0.25 + 0.75 * up) * sun_tint;
			}
		}

		// --------------------------------------- absorption + diffusion -------
		vec3 transmit = exp(-extinction * water_dist * turbidity);
		float depth_mix = clamp(depth_below / 90.0, 0.0, 1.0);
		vec3 medium = mix(water_color, deep_water_color, depth_mix);
		// la lumiere ambiante decroit avec la profondeur du fragment lui-meme
		float ambient_depth = clamp(
			(water_level - min(world_pos.y, water_level)) / 140.0, 0.0, 1.0);
		medium *= mix(1.0, 0.12, ambient_depth);
		vec3 fogged = col * transmit + medium * (1.0 - transmit);

		// -------------------------------------------------------- god rays ---
		if (godray_strength > 0.001 && sun_visible > 0.001) {
			vec2 delta = (sun_screen_pos - uv) / 26.0;
			vec2 p = uv;
			float decay = 1.0;
			float acc = 0.0;
			for (int i = 0; i < 26; i++) {
				p += delta;
				vec2 cp = clamp(p, vec2(0.0), vec2(1.0));
				float d = texture(depth_tex, cp).r;
				// seuls les pixels "vides" (eau lointaine) laissent passer
				float mask = step(d, 0.00002);
				acc += mask * decay;
				decay *= 0.955;
			}
			acc /= 26.0;
			float aim = 1.0 - clamp(length(uv - sun_screen_pos) * 0.75, 0.0, 1.0);
			float dust = 0.75 + 0.25 * vnoise(uv * 8.0 + vec2(t * 0.15, -t * 0.11));
			fogged += sun_tint * acc * aim * dust * godray_strength * sun_visible
				* (1.0 - depth_mix * 0.85);
		}

		// ---------------------------------------------------- neige marine ----
		float snow = vnoise(uv * vec2(180.0, 120.0) + vec2(t * 0.05, t * 0.22));
		snow = smoothstep(0.965, 1.0, snow) * 0.16 * (1.0 - depth_mix * 0.4);
		fogged += vec3(snow);

		// --------------------------------------------------- voile et bords ---
		float vig = 1.0 - vignette * pow(edge * 0.62, 2.6);
		fogged *= clamp(vig, 0.15, 1.0);
		// legere teinte a la peripherie : la vitre du masque
		fogged = mix(fogged, fogged * vec3(0.72, 0.9, 1.0),
			clamp(edge - 0.6, 0.0, 1.0));

		result = mix(result, fogged, under);

		// menisque : bourrelet lumineux le long de la ligne de flottaison
		float rim = exp(-pow(line / max(waterline_thickness * 1.6, 0.001), 2.0));
		result += vec3(0.55, 0.85, 0.95) * rim * 0.22;
	}

	// flash de degat
	result = mix(result, vec3(0.55, 0.02, 0.03), damage_flash * (0.35 + edge * 0.5));

	ALBEDO = result;
	ALPHA = 1.0;
}
