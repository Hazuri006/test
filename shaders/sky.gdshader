// =============================================================================
//  CIEL PHYSIQUE — diffusion de Rayleigh/Mie + nuages volumetriques
// =============================================================================
//  * Integration numerique de la diffusion atmospherique (modele de Nishita) :
//    couleur du ciel, du soleil et de l'horizon entierement physiques, donc
//    corrects du lever au coucher sans triche.
//  * Couche de nuages cumulus ray-marchee (bruit de valeur 3D fbm) avec
//    diffusion Henyey-Greenstein et attenuation vers le soleil.
//  * Voile de cirrus, etoiles et lune la nuit.
// =============================================================================
shader_type sky;

group_uniforms Atmosphere;
uniform float rayleigh_strength : hint_range(0.0, 4.0) = 1.0;
uniform vec3 rayleigh_beta = vec3(5.802e-6, 13.558e-6, 33.1e-6); // m^-1, air sec
uniform float mie_strength : hint_range(0.0, 5.0) = 1.0;
uniform float mie_beta = 21e-6;
uniform float mie_g : hint_range(-0.99, 0.99) = 0.76;
// Reglage fin de la luminance du ciel. L'echelle physique est deja portee par
// `sun_intensity` : cette valeur doit rester proche de 1.
uniform float exposure : hint_range(0.05, 4.0) = 1.0;
uniform float sun_intensity : hint_range(0.0, 40.0) = 22.0;
uniform float ozone_strength : hint_range(0.0, 4.0) = 1.0;

group_uniforms Clouds;
uniform bool clouds_enabled = true;
uniform float cloud_coverage : hint_range(0.0, 1.0) = 0.46;
uniform float cloud_density : hint_range(0.0, 4.0) = 1.15;
uniform float cloud_bottom = 1400.0;
uniform float cloud_top = 4200.0;
uniform float cloud_speed : hint_range(0.0, 40.0) = 5.0;
uniform int cloud_steps : hint_range(8, 96) = 28;
uniform int cloud_light_steps : hint_range(1, 12) = 5;
uniform vec3 cloud_albedo : source_color = vec3(1.0, 0.99, 0.97);
// Les fonctions de phase sont normalisees a 1 sur la sphere, leurs valeurs
// tournent donc autour de 0,05. Sans ce gain, la luminance des nuages reste
// dix fois inferieure a celle du ciel et ils paraissent gris et eteints,
// alors qu'un cumulus eclaire est bien plus lumineux que le ciel derriere lui.
uniform float cloud_light_gain : hint_range(1.0, 80.0) = 24.0;
uniform float cirrus_amount : hint_range(0.0, 1.0) = 0.35;

group_uniforms Night;
uniform float star_amount : hint_range(0.0, 1.0) = 0.7;
uniform vec3 night_sky_color : source_color = vec3(0.008, 0.014, 0.032);
uniform vec3 moon_direction = vec3(-0.4, 0.6, -0.5);
uniform float moon_size : hint_range(0.0, 0.05) = 0.017;

// ------------------------------------------------------- constantes planete --
const float R_PLANET = 6371000.0;
const float R_ATMOS  = 6471000.0;
const float H_RAYLEIGH = 8000.0;
const float H_MIE = 1200.0;
// L'integrale de diffusion converge tres vite : au-dela d'une douzaine de pas
// la difference n'est plus perceptible, alors que le cout, lui, est lineaire.
const int PRIMARY_STEPS = 12;
const int LIGHT_STEPS = 4;

// --------------------------------------------------------------- bruit 3D ----
float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float value_noise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
		mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float fbm(vec3 p, int octaves) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < octaves; i++) {
		v += a * value_noise(p);
		p *= 2.02;
		a *= 0.5;
	}
	return v;
}

// ------------------------------------------------------ intersection sphere --
// renvoie (t_entree, t_sortie), x > y si pas d'intersection
vec2 ray_sphere(vec3 ro, vec3 rd, float radius) {
	float b = dot(ro, rd);
	float c = dot(ro, ro) - radius * radius;
	float d = b * b - c;
	if (d < 0.0) {
		return vec2(1.0, -1.0);
	}
	d = sqrt(d);
	return vec2(-b - d, -b + d);
}

float rayleigh_phase(float mu) {
	return 3.0 / (16.0 * PI) * (1.0 + mu * mu);
}

float hg_phase(float mu, float g) {
	float gg = g * g;
	return (1.0 - gg) / (4.0 * PI * pow(1.0 + gg - 2.0 * g * mu, 1.5));
}

// Profil d'ozone approxime : gaussienne centree a 25 km
float ozone_density(float h) {
	float x = (h - 25000.0) / 15000.0;
	return exp(-x * x);
}

// ---------------------------------------------------------- ciel physique ----
vec3 atmosphere(vec3 ro, vec3 rd, vec3 sun_dir) {
	vec2 atmos_hit = ray_sphere(ro, rd, R_ATMOS);
	if (atmos_hit.x > atmos_hit.y) {
		return vec3(0.0);
	}
	vec2 planet_hit = ray_sphere(ro, rd, R_PLANET);
	float t_max = atmos_hit.y;
	if (planet_hit.x <= planet_hit.y && planet_hit.x > 0.0) {
		t_max = min(t_max, planet_hit.x);
	}
	float t_min = max(atmos_hit.x, 0.0);

	float mu = dot(rd, sun_dir);
	float phase_r = rayleigh_phase(mu);
	float phase_m = hg_phase(mu, mie_g);

	// Coefficient d'absorption de l'ozone (bande de Chappuis, pique dans le vert)
	vec3 ozone_beta = vec3(0.650e-6, 1.881e-6, 0.085e-6) * ozone_strength;

	float step_size = (t_max - t_min) / float(PRIMARY_STEPS);
	float t = t_min + step_size * 0.5;

	vec3 total_r = vec3(0.0);
	vec3 total_m = vec3(0.0);
	float od_r = 0.0;
	float od_m = 0.0;
	vec3 od_o = vec3(0.0);

	for (int i = 0; i < PRIMARY_STEPS; i++) {
		vec3 p = ro + rd * t;
		float h = length(p) - R_PLANET;
		float dr = exp(-h / H_RAYLEIGH) * step_size;
		float dm = exp(-h / H_MIE) * step_size;
		od_r += dr;
		od_m += dm;
		od_o += ozone_beta * ozone_density(h) * step_size * 1e-1;

		// transmittance vers le soleil
		vec2 light_hit = ray_sphere(p, sun_dir, R_ATMOS);
		float l_step = light_hit.y / float(LIGHT_STEPS);
		float lt = l_step * 0.5;
		float lod_r = 0.0;
		float lod_m = 0.0;
		vec3 lod_o = vec3(0.0);
		bool shadowed = false;
		for (int j = 0; j < LIGHT_STEPS; j++) {
			vec3 lp = p + sun_dir * lt;
			float lh = length(lp) - R_PLANET;
			if (lh < 0.0) {
				shadowed = true;
				break;
			}
			lod_r += exp(-lh / H_RAYLEIGH) * l_step;
			lod_m += exp(-lh / H_MIE) * l_step;
			lod_o += ozone_beta * ozone_density(lh) * l_step * 1e-1;
			lt += l_step;
		}
		if (shadowed) {
			t += step_size;
			continue;
		}
		vec3 tau = rayleigh_beta * rayleigh_strength * (od_r + lod_r)
			+ vec3(mie_beta * mie_strength) * 1.1 * (od_m + lod_m)
			+ (od_o + lod_o);
		vec3 attn = exp(-tau);
		total_r += attn * dr;
		total_m += attn * dm;
		t += step_size;
	}

	return sun_intensity * (
		total_r * rayleigh_beta * rayleigh_strength * phase_r
		+ total_m * mie_beta * mie_strength * phase_m);
}

// ------------------------------------------------------------- nuages --------
// Densite du cumulus a la position monde p
float cloud_density_at(vec3 p, float t, int octaves) {
	float h = clamp((p.y - cloud_bottom) / max(cloud_top - cloud_bottom, 1.0),
		0.0, 1.0);
	// profil vertical : base plate, sommet bombé (aspect cumulus)
	float profile = smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.42, 1.0, h));

	vec3 wind = vec3(t * cloud_speed, 0.0, t * cloud_speed * 0.35);
	vec3 q = (p + wind) * 0.00022;
	float base = fbm(q, octaves);
	// erosion par un bruit plus fin -> bords floconneux
	float erosion = fbm((p + wind * 2.0) * 0.0016, 3);

	float d = base * profile;
	d = smoothstep(1.0 - cloud_coverage, 1.0 - cloud_coverage + 0.40, d);
	d -= erosion * 0.22 * (1.0 - h);
	return clamp(d, 0.0, 1.0) * cloud_density;
}

vec4 march_clouds(vec3 ro, vec3 rd, vec3 sun_dir, vec3 sun_col, float t,
                  int steps, int light_steps) {
	if (rd.y <= 0.005) {
		return vec4(0.0);
	}
	float t_bottom = (cloud_bottom - ro.y) / rd.y;
	float t_top = (cloud_top - ro.y) / rd.y;
	float t0 = max(min(t_bottom, t_top), 0.0);
	float t1 = max(t_bottom, t_top);
	// horizon : on borne la distance pour eviter des pas gigantesques
	t1 = min(t1, 42000.0);
	if (t1 <= t0) {
		return vec4(0.0);
	}

	float dt = (t1 - t0) / float(steps);
	// Decalage partiel du premier pas : casse les bandes sans introduire
	// autant de bruit qu'un decalage sur un pas entier.
	float march_t = t0 + dt * (0.3 + 0.4 * hash13(vec3(rd * 811.0)));

	float transmittance = 1.0;
	vec3 scattered = vec3(0.0);
	float mu = dot(rd, sun_dir);
	// double lobe : avant (halo solaire) + arriere (bord argente)
	float phase = mix(hg_phase(mu, 0.78), hg_phase(mu, -0.32), 0.35);

	for (int i = 0; i < steps; i++) {
		if (transmittance < 0.01) {
			break;
		}
		vec3 p = ro + rd * march_t;
		float d = cloud_density_at(p, t, 4);
		if (d > 0.001) {
			// transmittance vers le soleil
			float light_t = 0.0;
			float ld = 0.0;
			float l_step = 220.0;
			for (int j = 0; j < light_steps; j++) {
				light_t += l_step;
				ld += cloud_density_at(p + sun_dir * light_t, t, 2) * l_step;
				l_step *= 1.55;
			}
			float sun_transmit = exp(-ld * 0.0026);
			// approximation multi-diffusion : 3 octaves d'energie
			float ms = sun_transmit
				+ 0.42 * exp(-ld * 0.0009)
				+ 0.16 * exp(-ld * 0.00035);
			float sigma = d * 0.055;
			float step_transmit = exp(-sigma * dt);
			vec3 lum = cloud_albedo * sun_col * ms * phase * cloud_light_gain;
			// integration analytique sur le pas (scattering integral)
			scattered += transmittance * (lum - lum * step_transmit);
			transmittance *= step_transmit;
		}
		march_t += dt;
	}
	return vec4(scattered, 1.0 - transmittance);
}

// ------------------------------------------------------------- etoiles -------
// `t` est passe en argument : dans Godot, TIME n'existe que dans la fonction
// d'entree du shader, pas dans les fonctions auxiliaires.
vec3 stars(vec3 dir, float t) {
	vec3 d = dir * 220.0;
	vec3 id = floor(d);
	float h = hash13(id);
	if (h < 0.9955) {
		return vec3(0.0);
	}
	vec3 f = fract(d) - 0.5;
	float dist = length(f);
	float b = smoothstep(0.36, 0.0, dist) * (0.4 + hash13(id + 3.7) * 0.6);
	// scintillement
	b *= 0.75 + 0.25 * sin(t * (2.0 + hash13(id + 9.1) * 6.0) + h * 40.0);
	vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.65), hash13(id + 1.3));
	return tint * b * star_amount;
}

void sky() {
	vec3 dir = EYEDIR;
	// Convention Godot : LIGHT0_DIRECTION pointe du fragment VERS le soleil.
	vec3 sun_dir = normalize(LIGHT0_ENABLED ? LIGHT0_DIRECTION : vec3(0.0, 1.0, 0.0));
	vec3 sun_col = LIGHT0_ENABLED ? LIGHT0_COLOR : vec3(1.0);

	// observateur a 100 m au-dessus du niveau de la mer
	vec3 ro = vec3(0.0, R_PLANET + 100.0, 0.0);

	vec3 sky_col = atmosphere(ro, dir, sun_dir);

	// --- soleil : disque avec assombrissement centre-bord -------------------
	float sun_cos = dot(dir, sun_dir);
	float sun_ang = 0.0046;                      // ~0.53 deg de diametre
	float disc = smoothstep(cos(sun_ang * 2.6), cos(sun_ang * 1.6), sun_cos);
	float r = clamp(acos(clamp(sun_cos, -1.0, 1.0)) / (sun_ang * 1.8), 0.0, 1.0);
	float limb = sqrt(max(1.0 - r * r, 0.0));
	float limb_darkening = 0.4 + 0.6 * pow(limb, 0.45);
	vec3 sun_disc = sun_col * disc * limb_darkening * sun_intensity * 6.0;
	// halo
	sun_disc += sun_col * pow(max(sun_cos, 0.0), 900.0) * 4.0;

	float day = clamp(sun_dir.y * 6.0 + 0.25, 0.0, 1.0);

	// --- nuit ---------------------------------------------------------------
	vec3 night = night_sky_color * (0.55 + 0.45 * pow(clamp(dir.y, 0.0, 1.0), 0.6));
	night += stars(dir, TIME);
	vec3 mdir = normalize(moon_direction);
	float moon_cos = dot(dir, mdir);
	float moon_disc = smoothstep(cos(moon_size * 1.15), cos(moon_size), moon_cos);
	// relief lunaire simple
	float moon_tex = 0.75 + 0.25 * fbm(dir * 90.0, 3);
	night += vec3(0.92, 0.93, 0.88) * moon_disc * moon_tex * 2.6;
	night += vec3(0.35, 0.42, 0.6) * pow(max(moon_cos, 0.0), 260.0) * 0.5;

	vec3 col = mix(night, sky_col * exposure, day);
	col += sun_disc * day;

	// --- nuages -------------------------------------------------------------
	if (clouds_enabled) {
		int steps = cloud_steps;
		int lsteps = cloud_light_steps;
		if (AT_CUBEMAP_PASS) {
			steps = max(steps / 4, 8);
			lsteps = max(lsteps / 2, 2);
		} else if (AT_HALF_RES_PASS) {
			steps = max(steps / 2, 10);
		}
		// cirrus : nappe fine et rapide, tres bon marche
		if (dir.y > 0.01) {
			float ct = (7000.0 - 0.0) / max(dir.y, 0.02);
			vec3 cp = dir * ct + vec3(TIME * 14.0, 0.0, TIME * 4.0);
			float cirrus = fbm(cp * 0.00012, 4);
			cirrus = smoothstep(0.52, 0.86, cirrus) * cirrus_amount
				* smoothstep(0.02, 0.25, dir.y);
			vec3 cirrus_col = sun_col * (0.6 + 0.7 * pow(max(sun_cos, 0.0), 8.0));
			col = mix(col, mix(col, cirrus_col * exposure * 0.4, 0.75), cirrus);
		}

		vec4 cl = march_clouds(vec3(0.0, 0.0, 0.0), dir, sun_dir,
			sun_col * (0.15 + day), TIME, steps, lsteps);
		// les nuages recoivent aussi la lumiere ambiante du ciel
		vec3 ambient = mix(night_sky_color * 4.0, sky_col * exposure * 0.42, day);
		vec3 cloud_col = cl.rgb + ambient * cl.a * 0.5;
		// perspective aerienne sur les nuages lointains
		float horizon_fade = smoothstep(0.0, 0.14, dir.y);
		col = mix(col, cloud_col, clamp(cl.a * horizon_fade, 0.0, 1.0));
	}

	COLOR = max(col, vec3(0.0));
}
