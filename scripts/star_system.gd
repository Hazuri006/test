class_name StarSystem
extends Node3D

## Génère et possède tout le contenu du système stellaire : soleil, champ
## d'étoiles et planètes. Régénérable à volonté à partir d'une seed.

const STAR_COUNT := 1200
const STARFIELD_RADIUS := 3900.0

var planets: Array[Planet] = []
var sun_radius := 34.0
var current_seed := 0


## Détruit le système courant et en génère un nouveau, déterministe pour la
## seed donnée.
func generate(seed_value: int) -> void:
	current_seed = seed_value
	for child in get_children():
		remove_child(child)
		child.queue_free()
	planets.clear()

	var rng := SeededRNG.new(seed_value)
	_create_sun(rng)
	_create_starfield(rng)

	var planet_count := rng.randi_between(6, 8)
	var orbit := 150.0
	for _i in planet_count:
		orbit += rng.randf_between(90.0, 150.0)
		var planet := Planet.new()
		planet.setup(rng.next_int(), orbit)
		add_child(planet)
		planets.append(planet)


func _create_sun(rng: SeededRNG) -> void:
	var sun_colors: Array[Color] = [
		Color(1.0, 0.85, 0.55),
		Color(1.0, 0.7, 0.4),
		Color(0.75, 0.82, 1.0),
		Color(1.0, 0.95, 0.75),
	]
	var sun_color := sun_colors[rng.randi_between(0, sun_colors.size() - 1)]
	sun_radius = rng.randf_between(28.0, 40.0)

	var sun := MeshInstance3D.new()
	var sun_mesh := SphereMesh.new()
	sun_mesh.radius = sun_radius
	sun_mesh.height = sun_radius * 2.0
	sun_mesh.radial_segments = 48
	sun_mesh.rings = 24
	var sun_material := StandardMaterial3D.new()
	sun_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sun_material.albedo_color = sun_color
	sun_material.emission_enabled = true
	sun_material.emission = sun_color
	sun_material.emission_energy_multiplier = 3.5
	sun_mesh.material = sun_material
	sun.mesh = sun_mesh
	add_child(sun)

	var light := OmniLight3D.new()
	light.light_color = sun_color.lerp(Color.WHITE, 0.4)
	light.light_energy = 2.5
	light.omni_range = 4500.0
	light.omni_attenuation = 0.5
	light.shadow_enabled = false
	add_child(light)


func _create_starfield(rng: SeededRNG) -> void:
	var star_mesh := SphereMesh.new()
	star_mesh.radius = 4.0
	star_mesh.height = 8.0
	star_mesh.radial_segments = 4
	star_mesh.rings = 2
	var star_material := StandardMaterial3D.new()
	star_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	star_material.vertex_color_use_as_albedo = true
	star_mesh.material = star_material

	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = star_mesh
	multimesh.instance_count = STAR_COUNT
	for i in STAR_COUNT:
		# Direction uniforme sur la sphère céleste.
		var z := rng.randf_between(-1.0, 1.0)
		var phi := rng.randf_between(0.0, TAU)
		var planar := sqrt(maxf(0.0, 1.0 - z * z))
		var direction := Vector3(planar * cos(phi), z, planar * sin(phi))
		var star_scale := rng.randf_between(0.5, 1.8)
		var star_basis := Basis.IDENTITY.scaled(Vector3.ONE * star_scale)
		multimesh.set_instance_transform(i, Transform3D(star_basis, direction * STARFIELD_RADIUS))
		var brightness := rng.randf_between(0.45, 1.0)
		var warmth := rng.randf_between(0.8, 1.0)
		var coolness := rng.randf_between(0.8, 1.0)
		var star_color := Color(brightness * warmth, brightness * 0.92, brightness * coolness)
		multimesh.set_instance_color(i, star_color)

	var stars := MultiMeshInstance3D.new()
	stars.multimesh = multimesh
	add_child(stars)
