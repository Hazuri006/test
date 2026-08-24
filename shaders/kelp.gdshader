// =============================================================================
//  ALGUES GEANTES — ondulation par le courant + translucidite
// =============================================================================
//  Les lames ondulent par une onde progressive dont la phase depend de la
//  position monde de la base : chaque plante bouge differemment, mais reste
//  ancree au sol (l'amplitude croit avec la hauteur le long de la tige).
// =============================================================================
shader_type spatial;
// Materiau OPAQUE : ne jamais ecrire ALPHA ici. Godot bascule tout shader
// qui affecte ALPHA dans la file transparente, ou il cesse d'ecrire la
// profondeur ; le post-traitement sous-marin le prend alors pour du vide a
// l'infini et le noie entierement dans le brouillard.
render_mode cull_disabled, depth_draw_opaque, diffuse_burley;

uniform vec3 blade_color : source_color = vec3(0.16, 0.31, 0.13);
uniform vec3 tip_color : source_color = vec3(0.45, 0.62, 0.22);
uniform vec3 translucency : source_color = vec3(0.35, 0.72, 0.28);
uniform float sway_amplitude : hint_range(0.0, 3.0) = 0.65;
uniform float sway_speed : hint_range(0.0, 4.0) = 0.7;
uniform vec2 current_direction = vec2(0.75, 0.35);
uniform float stiffness : hint_range(0.1, 4.0) = 1.4;
uniform float glow_amount : hint_range(0.0, 3.0) = 0.0;
uniform vec3 glow_color : source_color = vec3(0.2, 0.8, 0.7);
uniform sampler2D blade_noise : hint_default_white, repeat_enable;

varying float v_height;
varying vec3 v_world;

void vertex() {
	vec3 base = MODEL_MATRIX[3].xyz;
	// UV.y = 0 a la base, 1 a l'extremite
	float h = clamp(UV.y, 0.0, 1.0);
	float rigid = pow(h, stiffness);

	float phase = base.x * 0.35 + base.z * 0.27;
	float t = TIME * sway_speed;
	// onde principale + battement secondaire plus rapide et plus fin
	float wave = sin(t + phase + h * 2.1) + 0.45 * sin(t * 2.3 + phase * 1.7 + h * 4.2);
	vec2 dir = normalize(current_direction + vec2(0.0001));
	vec3 offset = vec3(dir.x, 0.0, dir.y) * wave * sway_amplitude * rigid;
	// leger flottement vertical : l'algue se detend et se retend
	offset.y += cos(t * 1.3 + phase) * 0.06 * rigid;

	VERTEX += (inverse(MODEL_MATRIX) * vec4(offset, 0.0)).xyz;
	v_height = h;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float vein = texture(blade_noise, vec2(UV.x * 3.0, v_height * 6.0)).r;
	vec3 col = mix(blade_color, tip_color, pow(v_height, 1.6));
	col *= 0.72 + vein * 0.5;
	// nervure centrale plus sombre
	col *= 1.0 - smoothstep(0.42, 0.5, abs(UV.x - 0.5)) * 0.25;

	ALBEDO = col;
	ROUGHNESS = 0.62;
	SPECULAR = 0.45;
	METALLIC = 0.0;
	// translucidite : la lame s'allume quand la lumiere passe au travers
	BACKLIGHT = translucency * (0.35 + v_height * 0.5);
	if (glow_amount > 0.001) {
		float pods = smoothstep(0.7, 0.95, vein);
		EMISSION = glow_color * pods * glow_amount
			* (0.6 + 0.4 * sin(TIME * 1.1 + v_world.x));
	}
}
