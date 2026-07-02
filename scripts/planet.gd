class_name Planet
extends Node3D

## Planète procédurale : sphère dont les vertices sont déplacés par du bruit
## seedé multicouche, biome exprimé en couleurs de vertex (le canal alpha
## transporte la rugosité : océans brillants, terres mates), extras
## optionnels (anneaux, lunes, halo atmosphérique) et paramètres orbitaux.

const SURFACE_RINGS := 32
const SURFACE_SEGMENTS := 48
const MOON_RINGS := 14
const MOON_SEGMENTS := 20

const BIOMES: Array[Dictionary] = [
	{
		"name": "Luxuriant",
		"deep": Color(0.01, 0.08, 0.22),
		"shallow": Color(0.04, 0.32, 0.42),
		"low": Color(0.09, 0.36, 0.12),
		"high": Color(0.3, 0.42, 0.16),
		"peak": Color(0.62, 0.6, 0.55),
		"sea_min": -0.05, "sea_max": 0.1,
		"ocean_rough": 0.06, "land_rough": 0.85,
		"atmo": Color(0.35, 0.65, 0.9),
		"features": ["forêts bioluminescentes", "canopée continentale", "pluies chaudes perpétuelles"],
	},
	{
		"name": "Océan",
		"deep": Color(0.01, 0.06, 0.28),
		"shallow": Color(0.05, 0.35, 0.55),
		"low": Color(0.75, 0.7, 0.5),
		"high": Color(0.35, 0.5, 0.3),
		"peak": Color(0.6, 0.62, 0.58),
		"sea_min": 0.12, "sea_max": 0.3,
		"ocean_rough": 0.05, "land_rough": 0.8,
		"atmo": Color(0.4, 0.7, 1.0),
		"features": ["archipels dispersés", "méga-courants marins", "récifs abyssaux"],
	},
	{
		"name": "Désert",
		"deep": Color(0.3, 0.2, 0.1),
		"shallow": Color(0.5, 0.35, 0.15),
		"low": Color(0.78, 0.62, 0.35),
		"high": Color(0.65, 0.4, 0.2),
		"peak": Color(0.5, 0.28, 0.15),
		"sea_min": -1.9, "sea_max": -1.8,
		"ocean_rough": 0.6, "land_rough": 0.95,
		"atmo": Color(0.9, 0.7, 0.45),
		"features": ["canyons vitrifiés", "tempêtes de sable géantes", "mesas de cristal rouge"],
	},
	{
		"name": "Glacial",
		"deep": Color(0.1, 0.2, 0.35),
		"shallow": Color(0.35, 0.55, 0.7),
		"low": Color(0.75, 0.82, 0.9),
		"high": Color(0.88, 0.92, 0.97),
		"peak": Color(1.0, 1.0, 1.0),
		"sea_min": -0.05, "sea_max": 0.12,
		"ocean_rough": 0.05, "land_rough": 0.55,
		"atmo": Color(0.65, 0.8, 1.0),
		"features": ["banquises fracturées", "geysers de glace", "aurores permanentes"],
	},
	{
		"name": "Volcanique",
		"deep": Color(0.9, 0.25, 0.02),
		"shallow": Color(1.0, 0.55, 0.08),
		"low": Color(0.16, 0.12, 0.12),
		"high": Color(0.28, 0.2, 0.18),
		"peak": Color(0.45, 0.35, 0.3),
		"sea_min": -0.08, "sea_max": 0.08,
		"ocean_rough": 0.25, "land_rough": 0.9,
		"atmo": Color(0.9, 0.4, 0.2),
		"features": ["mers de lave actives", "cônes basaltiques", "pluies de cendres orbitales"],
	},
	{
		"name": "Toxique",
		"deep": Color(0.25, 0.4, 0.05),
		"shallow": Color(0.5, 0.65, 0.1),
		"low": Color(0.35, 0.28, 0.4),
		"high": Color(0.45, 0.35, 0.5),
		"peak": Color(0.6, 0.5, 0.65),
		"sea_min": 0.0, "sea_max": 0.15,
		"ocean_rough": 0.1, "land_rough": 0.8,
		"atmo": Color(0.6, 0.75, 0.2),
		"features": ["brumes acides", "lacs de solvant", "spores dérivantes"],
	},
]

const MOON_PALETTE := {
	"deep": Color(0.2, 0.2, 0.22),
	"shallow": Color(0.3, 0.3, 0.32),
	"low": Color(0.38, 0.37, 0.36),
	"high": Color(0.55, 0.54, 0.52),
	"peak": Color(0.7, 0.7, 0.68),
	"ocean_rough": 0.9, "land_rough": 0.95,
}

static var _surface_material: ShaderMaterial

var planet_name := ""
var biome_name := ""
var radius := 10.0
var discovered := false
var feature_text := ""

var orbit_radius := 0.0
var orbit_speed := 0.0
var orbit_angle := 0.0
var spin_speed := 0.0

var _moons: Array[Node3D] = []
var _moon_angles := PackedFloat32Array()
var _moon_distances := PackedFloat32Array()
var _moon_speeds := PackedFloat32Array()


## Construit toute la planète à partir d'une seed dédiée. À appeler avant
## d'ajouter le nœud à l'arbre de scène.
func setup(seed_value: int, orbit_radius_value: float) -> void:
	var rng := SeededRNG.new(seed_value)
	planet_name = NameGenerator.planet_name(rng)
	var biome: Dictionary = rng.pick(BIOMES)
	biome_name = String(biome["name"])
	var biome_features: Array = biome["features"]
	feature_text = String(biome_features[rng.randi_between(0, biome_features.size() - 1)])
	radius = rng.randf_between(8.0, 20.0)
	orbit_radius = orbit_radius_value
	orbit_angle = rng.randf_between(0.0, TAU)
	orbit_speed = rng.randf_between(4.5, 9.0) / orbit_radius
	if rng.chance(0.5):
		spin_speed = rng.randf_between(0.05, 0.3)
	else:
		spin_speed = -rng.randf_between(0.05, 0.3)

	var sea_level := rng.randf_between(float(biome["sea_min"]), float(biome["sea_max"]))
	var noise_frequency := rng.randf_between(1.6, 3.0)
	var relief := rng.randf_between(0.09, 0.17)

	var surface := MeshInstance3D.new()
	surface.mesh = build_body_mesh(
		SURFACE_RINGS, SURFACE_SEGMENTS, radius,
		rng.next_int(), noise_frequency, relief, sea_level, 4, biome
	)
	surface.material_override = get_surface_material()
	add_child(surface)

	if rng.chance(0.3):
		_add_rings(rng)
	if rng.chance(0.55):
		_add_atmosphere(biome["atmo"] as Color)
	var moon_roll := rng.randf_01()
	var moon_count := 0
	if moon_roll < 0.12:
		moon_count = 2
	elif moon_roll < 0.45:
		moon_count = 1
	for _i in moon_count:
		_add_moon(rng)

	position = Vector3(cos(orbit_angle) * orbit_radius, 0.0, sin(orbit_angle) * orbit_radius)


func _process(delta: float) -> void:
	orbit_angle += orbit_speed * delta
	position = Vector3(cos(orbit_angle) * orbit_radius, 0.0, sin(orbit_angle) * orbit_radius)
	rotate_y(spin_speed * delta)
	for i in _moons.size():
		_moon_angles[i] += _moon_speeds[i] * delta
		_moons[i].position = Vector3(
			cos(_moon_angles[i]) * _moon_distances[i],
			0.0,
			sin(_moon_angles[i]) * _moon_distances[i]
		)


## Description affichée lors du scan.
func describe() -> String:
	return "%s — Biome : %s • Classe : %s (rayon %d u) • Particularité : %s" % [
		planet_name, biome_name, size_class(), int(radius), feature_text,
	]


func size_class() -> String:
	if radius < 11.5:
		return "Naine"
	if radius < 16.0:
		return "Standard"
	return "Géante"


## Matériau partagé par toutes les surfaces planétaires : l'albédo vient de
## la couleur de vertex, la rugosité de son canal alpha (océans brillants).
static func get_surface_material() -> ShaderMaterial:
	if _surface_material == null:
		var shader := Shader.new()
		shader.code = """
shader_type spatial;
render_mode cull_disabled;

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = COLOR.a;
	METALLIC = 0.0;
	SPECULAR = 0.4;
}
"""
		_surface_material = ShaderMaterial.new()
		_surface_material.shader = shader
	return _surface_material


## Construit un ArrayMesh de sphère déformée par fBm, avec couleurs de vertex
## selon la palette du biome et normales calculées à la main.
static func build_body_mesh(
	ring_count: int, segment_count: int, body_radius: float, noise_seed: int,
	noise_frequency: float, relief_amp: float, sea_level: float,
	octave_count: int, palette: Dictionary
) -> ArrayMesh:
	var vertex_count := (ring_count - 1) * segment_count + 2

	# Directions unitaires de chaque vertex (pôles + anneaux de latitude).
	var directions := PackedVector3Array()
	directions.resize(vertex_count)
	directions[0] = Vector3.UP
	for r in range(1, ring_count):
		var theta := PI * float(r) / float(ring_count)
		var sin_theta := sin(theta)
		var cos_theta := cos(theta)
		for s in segment_count:
			var phi := TAU * float(s) / float(segment_count)
			directions[1 + (r - 1) * segment_count + s] = Vector3(
				sin_theta * cos(phi), cos_theta, sin_theta * sin(phi)
			)
	directions[vertex_count - 1] = Vector3.DOWN

	# Déplacement par bruit + couleur de biome.
	var vertices := PackedVector3Array()
	vertices.resize(vertex_count)
	var colors := PackedColorArray()
	colors.resize(vertex_count)
	for v in vertex_count:
		var direction := directions[v]
		var elevation := clampf(
			ProcNoise.fbm_3d(
				direction.x * noise_frequency,
				direction.y * noise_frequency,
				direction.z * noise_frequency,
				noise_seed, octave_count
			),
			-1.0, 1.0
		)
		# Sous le niveau de la mer, la surface est aplatie : océan lisse.
		var shaped := maxf(elevation, sea_level)
		vertices[v] = direction * (body_radius * (1.0 + shaped * relief_amp))
		colors[v] = _surface_color(elevation, sea_level, palette)

	# Indices : éventail nord, bandes de quads, éventail sud.
	var quad_rows := ring_count - 2
	var triangle_count := segment_count * 2 + quad_rows * segment_count * 2
	var indices := PackedInt32Array()
	indices.resize(triangle_count * 3)
	var w := 0
	for s in segment_count:
		indices[w] = 0
		indices[w + 1] = 1 + (s + 1) % segment_count
		indices[w + 2] = 1 + s
		w += 3
	for r in quad_rows:
		var row_a := 1 + r * segment_count
		var row_b := row_a + segment_count
		for s in segment_count:
			var a := row_a + s
			var b := row_a + (s + 1) % segment_count
			var c := row_b + (s + 1) % segment_count
			var d := row_b + s
			indices[w] = a
			indices[w + 1] = b
			indices[w + 2] = c
			w += 3
			indices[w] = a
			indices[w + 1] = c
			indices[w + 2] = d
			w += 3
	var south := vertex_count - 1
	var last_row := 1 + (ring_count - 2) * segment_count
	for s in segment_count:
		indices[w] = south
		indices[w + 1] = last_row + s
		indices[w + 2] = last_row + (s + 1) % segment_count
		w += 3

	# Normales lissées : somme des normales de face, orientées vers l'extérieur.
	var normals := PackedVector3Array()
	normals.resize(vertex_count)
	for t in range(0, indices.size(), 3):
		var i0 := indices[t]
		var i1 := indices[t + 1]
		var i2 := indices[t + 2]
		var v0 := vertices[i0]
		var v1 := vertices[i1]
		var v2 := vertices[i2]
		var face_normal := (v1 - v0).cross(v2 - v0)
		if face_normal.dot(v0 + v1 + v2) < 0.0:
			face_normal = -face_normal
		normals[i0] += face_normal
		normals[i1] += face_normal
		normals[i2] += face_normal
	for v in vertex_count:
		var accumulated := normals[v]
		if accumulated.length_squared() > 0.000001:
			normals[v] = accumulated.normalized()
		else:
			normals[v] = directions[v]

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


## Couleur (et rugosité dans l'alpha) d'un vertex selon son élévation.
static func _surface_color(elevation: float, sea_level: float, palette: Dictionary) -> Color:
	if elevation <= sea_level:
		var depth := clampf((sea_level - elevation) / 0.5, 0.0, 1.0)
		var water := (palette["shallow"] as Color).lerp(palette["deep"] as Color, depth)
		water.a = float(palette["ocean_rough"])
		return water
	var land_base := maxf(sea_level, -0.5)
	var t := clampf((elevation - land_base) / (0.55 - land_base), 0.0, 1.0)
	var ground: Color
	if t < 0.6:
		ground = (palette["low"] as Color).lerp(palette["high"] as Color, t / 0.6)
	else:
		ground = (palette["high"] as Color).lerp(palette["peak"] as Color, (t - 0.6) / 0.4)
	ground.a = float(palette["land_rough"])
	return ground


## Anneaux : tore aplati semi-transparent autour de l'équateur.
func _add_rings(rng: SeededRNG) -> void:
	var ring_node := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = radius * rng.randf_between(1.4, 1.7)
	torus.outer_radius = radius * rng.randf_between(2.1, 2.6)
	var ring_material := StandardMaterial3D.new()
	ring_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	ring_material.albedo_color = Color(
		rng.randf_between(0.5, 0.9),
		rng.randf_between(0.45, 0.75),
		rng.randf_between(0.35, 0.6),
		0.35
	)
	torus.material = ring_material
	ring_node.mesh = torus
	ring_node.scale = Vector3(1.0, 0.05, 1.0)
	add_child(ring_node)


## Halo atmosphérique : sphère un peu plus grande, transparente et teintée.
func _add_atmosphere(tint: Color) -> void:
	var atmosphere := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	var atmosphere_radius := radius * 1.18
	sphere.radius = atmosphere_radius
	sphere.height = atmosphere_radius * 2.0
	sphere.radial_segments = 32
	sphere.rings = 16
	var atmosphere_material := StandardMaterial3D.new()
	atmosphere_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	atmosphere_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	atmosphere_material.cull_mode = BaseMaterial3D.CULL_FRONT
	atmosphere_material.albedo_color = Color(tint.r, tint.g, tint.b, 0.18)
	sphere.material = atmosphere_material
	atmosphere.mesh = sphere
	add_child(atmosphere)


## Lune rocheuse en orbite locale autour de la planète.
func _add_moon(rng: SeededRNG) -> void:
	var moon := MeshInstance3D.new()
	var moon_radius := radius * rng.randf_between(0.15, 0.3)
	moon.mesh = build_body_mesh(
		MOON_RINGS, MOON_SEGMENTS, moon_radius,
		rng.next_int(), rng.randf_between(3.0, 5.0), 0.2, -2.0, 3, MOON_PALETTE
	)
	moon.material_override = get_surface_material()
	add_child(moon)
	_moons.append(moon)
	_moon_angles.append(rng.randf_between(0.0, TAU))
	_moon_distances.append(radius * rng.randf_between(2.2, 3.5) + moon_radius)
	if rng.chance(0.7):
		_moon_speeds.append(rng.randf_between(0.2, 0.6))
	else:
		_moon_speeds.append(-rng.randf_between(0.2, 0.6))
