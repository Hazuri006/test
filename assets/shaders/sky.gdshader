shader_type sky;
render_mode use_half_res_pass;

// =============================================================================
//  PROCEDURAL SKY -- blue sunny sky with drifting brick-white clouds.
//  Driven by DayNightCycle (scripts/systems/day_night_cycle.gd) which animates
//  `sun_dir`, `horizon_color`, `zenith_color` and `night_blend`.
// =============================================================================

uniform vec3 zenith_color : source_color = vec3(0.16, 0.40, 0.82);
uniform vec3 horizon_color : source_color = vec3(0.72, 0.85, 0.98);
uniform vec3 ground_color : source_color = vec3(0.24, 0.26, 0.30);
uniform vec3 sun_color : source_color = vec3(1.0, 0.94, 0.78);
uniform vec3 cloud_color : source_color = vec3(1.0, 1.0, 1.0);
uniform vec3 cloud_shadow : source_color = vec3(0.62, 0.68, 0.80);
uniform vec3 night_color : source_color = vec3(0.03, 0.04, 0.09);

uniform float sun_size : hint_range(0.0, 0.2) = 0.018;
uniform float sun_glow : hint_range(1.0, 400.0) = 90.0;
uniform float cloud_coverage : hint_range(0.0, 1.0) = 0.46;
uniform float cloud_scale = 2.2;
uniform float cloud_speed = 0.012;
uniform float night_blend : hint_range(0.0, 1.0) = 0.0;
uniform float star_amount : hint_range(0.0, 1.0) = 0.0;

float hash12(vec2 p) {
	p = fract(p * vec2(233.34, 851.73));
	p += dot(p, p + 23.45);
	return fract(p.x * p.y);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash12(i);
	float b = hash12(i + vec2(1.0, 0.0));
	float c = hash12(i + vec2(0.0, 1.0));
	float d = hash12(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float total = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 5; i++) {
		total += value_noise(p) * amp;
		p *= 2.03;
		amp *= 0.5;
	}
	return total;
}

void sky() {
	vec3 dir = normalize(EYEDIR);
	float up = clamp(dir.y, -1.0, 1.0);

	// --- base gradient ------------------------------------------------------
	vec3 sky_col = mix(horizon_color, zenith_color, pow(clamp(up, 0.0, 1.0), 0.55));
	sky_col = mix(sky_col, ground_color, smoothstep(0.0, -0.12, up));

	// --- sun ----------------------------------------------------------------
	vec3 sun_dir = normalize(LIGHT0_ENABLED ? -LIGHT0_DIRECTION : vec3(0.4, 0.7, 0.55));
	float sd = dot(dir, sun_dir);
	float disc = smoothstep(1.0 - sun_size, 1.0 - sun_size * 0.4, sd);
	float halo = pow(clamp(sd, 0.0, 1.0), sun_glow);
	sky_col += sun_color * (disc * 12.0 + halo * 0.9);
	// Warm scatter near the sun keeps the horizon from looking like flat paint.
	sky_col += sun_color * pow(clamp(sd, 0.0, 1.0), 4.0) * 0.12;

	// --- clouds (flat plane projection, only above the horizon) -------------
	if (up > 0.005) {
		vec2 plane = dir.xz / max(up, 0.02);
		vec2 uv = plane * cloud_scale + vec2(TIME * cloud_speed, TIME * cloud_speed * 0.6);
		float n = fbm(uv);
		float n2 = fbm(uv * 2.7 + 13.1);
		float mask = smoothstep(1.0 - cloud_coverage, 1.0 - cloud_coverage + 0.22, n);
		mask *= smoothstep(0.0, 0.35, up);                 // fade at the horizon
		mask *= 1.0 - smoothstep(9.0, 22.0, length(plane)); // fade very far out
		float shade = clamp(n2 * 1.15, 0.0, 1.0);
		vec3 cloud = mix(cloud_shadow, cloud_color, shade);
		cloud += sun_color * pow(clamp(sd, 0.0, 1.0), 8.0) * 0.5; // silver lining
		sky_col = mix(sky_col, cloud, mask * 0.92);
	}

	// --- night blend --------------------------------------------------------
	if (night_blend > 0.001) {
		vec3 night = night_color;
		if (star_amount > 0.001 && up > 0.0) {
			vec2 sc = dir.xz / max(up, 0.05) * 24.0;
			float star = step(0.9975, hash12(floor(sc)));
			night += vec3(star) * star_amount * (0.6 + 0.4 * sin(TIME * 3.0 + hash12(floor(sc)) * 30.0));
		}
		sky_col = mix(sky_col, night, night_blend);
	}

	COLOR = sky_col;
}
