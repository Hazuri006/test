shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// =============================================================================
//  BRICK SHADER -- the visual signature of the whole game.
//  Every wall, street, prop and character part uses this one shader, so the
//  world reads as a single moulded-plastic toy set.
//
//  Features
//   * Procedural studs on up-facing surfaces (no textures needed).
//   * Fake rounded bevel: edges of the unit cube get a soft rim highlight.
//   * Per-instance colour tint through INSTANCE_CUSTOM (MultiMesh friendly).
//   * Plastic specular response + optional emission for windows and signs.
//
//  IMPORTANT: meshes are expected to be UNIT cubes (BoxMesh size 1,1,1) scaled
//  through their transform. The shader reads the transform scale so studs and
//  bevels stay a constant physical size no matter how big the brick is.
// =============================================================================

uniform vec4 base_color : source_color = vec4(0.85, 0.16, 0.18, 1.0);
uniform float stud_density = 1.25;      // studs per world metre
uniform float stud_strength = 0.85;     // normal perturbation amount
uniform float stud_visible = 1.0;       // 0 = smooth (streets, glass)
uniform float roughness_value : hint_range(0.0, 1.0) = 0.28;
uniform float metallic_value : hint_range(0.0, 1.0) = 0.0;
uniform float bevel_width = 0.035;      // metres
uniform float bevel_lift = 0.22;        // how much brighter the bevel rim is
uniform float color_jitter : hint_range(0.0, 1.0) = 0.05;
uniform float emission_energy = 0.0;
uniform vec4 emission_tint : source_color = vec4(1.0);
uniform float rim_light = 0.15;

varying vec3 v_local;
varying vec3 v_scale;
varying vec3 v_normal_local;
varying vec4 v_custom;
varying vec3 v_origin;

void vertex() {
	v_local = VERTEX;
	v_normal_local = NORMAL;
	v_custom = INSTANCE_CUSTOM;
	v_scale = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
	v_origin = MODEL_MATRIX[3].xyz;
}

float hash13(vec3 p) {
	return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

void fragment() {
	// --- per-instance / per-brick colour ------------------------------------
	vec3 tint = mix(vec3(1.0), v_custom.rgb, step(0.001, v_custom.a));
	vec3 albedo = base_color.rgb * tint;

	// Subtle moulding variation so large flat walls never look flat.
	float jitter = (hash13(floor(v_origin * 4.0) + floor(v_local * v_scale)) - 0.5) * 2.0;
	albedo *= 1.0 + jitter * color_jitter;

	// World-relative position inside the brick (metres, origin at brick centre)
	vec3 wp = v_local * v_scale;

	// --- procedural studs on up-facing surfaces ----------------------------
	vec3 tangent_normal = vec3(0.0, 0.0, 1.0);
	float up_face = smoothstep(0.65, 0.9, v_normal_local.y) * stud_visible;
	if (up_face > 0.001) {
		vec2 cell = wp.xz * stud_density;
		vec2 g = fract(cell) - 0.5;
		float d = length(g);
		// Ring band = the sloped side wall of a stud -> that is where the
		// normal must bend to catch the light.
		float ring = smoothstep(0.34, 0.29, d) * smoothstep(0.20, 0.26, d);
		vec2 dir = g / max(d, 1e-4);
		tangent_normal = normalize(vec3(dir * ring * stud_strength * up_face, 1.0));
		// Tiny top-face brightening on the stud caps reads as moulded plastic.
		float cap = smoothstep(0.26, 0.21, d) * up_face;
		albedo *= 1.0 + cap * 0.06;
	}
	NORMAL_MAP = tangent_normal * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 1.0;

	// --- fake rounded bevel -------------------------------------------------
	// Distance (in metres) to the nearest edge of the cube face we are on.
	vec3 to_edge = (vec3(0.5) - abs(v_local)) * v_scale;
	vec3 mask = 1.0 - abs(v_normal_local);          // ignore the face's own axis
	float edge_d = 1000.0;
	edge_d = min(edge_d, mix(1000.0, to_edge.x, step(0.5, mask.x)));
	edge_d = min(edge_d, mix(1000.0, to_edge.y, step(0.5, mask.y)));
	edge_d = min(edge_d, mix(1000.0, to_edge.z, step(0.5, mask.z)));
	float bevel = 1.0 - smoothstep(0.0, max(bevel_width, 0.001), edge_d);
	albedo *= 1.0 + bevel * bevel_lift;

	ALBEDO = albedo;
	ROUGHNESS = clamp(roughness_value - bevel * 0.12, 0.03, 1.0);
	METALLIC = metallic_value;
	SPECULAR = 0.55;

	if (emission_energy > 0.001) {
		EMISSION = albedo * emission_tint.rgb * emission_energy;
	}

	// Cheap rim term: keeps silhouettes readable against the bright sky.
	float fres = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0), 3.0);
	EMISSION += albedo * fres * rim_light;
}
