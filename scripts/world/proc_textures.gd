extends RefCounted
class_name ProcTextures

## Fabrique de textures procedurales. Le projet ne contient aucun fichier
## image : tout le relief de surface (sable, roche, ecume, ridules) est
## synthetise au demarrage avec FastNoiseLite.

static func _noise(freq: float, octaves: int, seed_value: int,
		type: int = FastNoiseLite.TYPE_SIMPLEX_SMOOTH,
		fractal: int = FastNoiseLite.FRACTAL_FBM) -> FastNoiseLite:
	var n := FastNoiseLite.new()
	n.noise_type = type
	n.seed = seed_value
	n.frequency = freq
	n.fractal_type = fractal
	n.fractal_octaves = octaves
	n.fractal_lacunarity = 2.02
	n.fractal_gain = 0.5
	return n

static func gray(size: int, freq: float, octaves: int, seed_value: int,
		seamless: bool = true) -> NoiseTexture2D:
	var tex := NoiseTexture2D.new()
	tex.width = size
	tex.height = size
	tex.seamless = seamless
	tex.generate_mipmaps = true
	tex.noise = _noise(freq, octaves, seed_value)
	return tex

static func cellular(size: int, freq: float, seed_value: int,
		seamless: bool = true) -> NoiseTexture2D:
	var tex := NoiseTexture2D.new()
	tex.width = size
	tex.height = size
	tex.seamless = seamless
	tex.generate_mipmaps = true
	var n := _noise(freq, 3, seed_value, FastNoiseLite.TYPE_CELLULAR,
		FastNoiseLite.FRACTAL_NONE)
	n.cellular_return_type = FastNoiseLite.RETURN_DISTANCE2_SUB
	n.cellular_jitter = 1.0
	tex.noise = n
	return tex

static func normal_map(size: int, freq: float, octaves: int, seed_value: int,
		depth: float = 1.0, seamless: bool = true) -> NoiseTexture2D:
	var tex := NoiseTexture2D.new()
	tex.width = size
	tex.height = size
	tex.seamless = seamless
	tex.generate_mipmaps = true
	tex.as_normal_map = true
	tex.bump_strength = depth * 8.0
	tex.noise = _noise(freq, octaves, seed_value)
	return tex

static func ramped(size: int, freq: float, octaves: int, seed_value: int,
		colors: Array, seamless: bool = true) -> NoiseTexture2D:
	var tex := NoiseTexture2D.new()
	tex.width = size
	tex.height = size
	tex.seamless = seamless
	tex.generate_mipmaps = true
	tex.noise = _noise(freq, octaves, seed_value)
	var grad := Gradient.new()
	var offsets := PackedFloat32Array()
	var cols := PackedColorArray()
	for i in colors.size():
		offsets.append(float(i) / maxf(colors.size() - 1.0, 1.0))
		cols.append(colors[i])
	grad.offsets = offsets
	grad.colors = cols
	var gt := GradientTexture1D.new()
	gt.gradient = grad
	gt.width = 256
	tex.color_ramp = grad
	return tex

## Petite texture de gradient radial : utilisee pour les particules
## (bulles, neige marine) sans aucun fichier image.
static func radial_dot(size: int = 64, softness: float = 2.0,
		tint: Color = Color(1, 1, 1)) -> ImageTexture:
	var img := Image.create(size, size, true, Image.FORMAT_RGBA8)
	var c := (size - 1) * 0.5
	for y in size:
		for x in size:
			var d := Vector2(x - c, y - c).length() / c
			var a: float = pow(clampf(1.0 - d, 0.0, 1.0), softness)
			img.set_pixel(x, y, Color(tint.r, tint.g, tint.b, a))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)

## Anneau lumineux (halo de bulle) : plus credible qu'un simple disque.
static func bubble_sprite(size: int = 64) -> ImageTexture:
	var img := Image.create(size, size, true, Image.FORMAT_RGBA8)
	var c := (size - 1) * 0.5
	for y in size:
		for x in size:
			var d := Vector2(x - c, y - c).length() / c
			if d > 1.0:
				img.set_pixel(x, y, Color(0, 0, 0, 0))
				continue
			# Fresnel : une bulle est surtout visible sur son contour
			var rim: float = pow(clampf(d, 0.0, 1.0), 3.5)
			var edge: float = smoothstep(1.0, 0.9, d)
			var a: float = clampf(rim * 0.95 + 0.06, 0.0, 1.0) * edge
			# reflet speculaire en haut a gauche
			var spec := 0.0
			var sd := Vector2(x - c * 0.62, y - c * 0.6).length() / c
			spec = pow(clampf(1.0 - sd * 3.4, 0.0, 1.0), 2.0) * 0.9
			img.set_pixel(x, y, Color(0.75 + spec, 0.9 + spec, 1.0,
				clampf(a + spec * edge, 0.0, 1.0)))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)
