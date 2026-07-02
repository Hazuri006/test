class_name ProcNoise
extends RefCounted

## Bruit de valeur 3D écrit à la main (aucun addon, aucune classe de bruit
## de Godot). Déterministe à partir d'une seed entière : les mêmes
## coordonnées et la même seed donnent toujours le même résultat.


## Hash entier 3D -> flottant dans [0, 1], stable pour une seed donnée.
static func _hash01(ix: int, iy: int, iz: int, seed_value: int) -> float:
	var h: int = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed_value * 144665) & 0xFFFFFFFF
	h = (h ^ (h >> 13)) & 0xFFFFFFFF
	h = (h * 1597334677) & 0xFFFFFFFF
	h = (h ^ (h >> 16)) & 0xFFFFFFFF
	return float(h) / 4294967295.0


## Bruit de valeur 3D lissé (interpolation trilinéaire + fondu cubique).
## Renvoie une valeur dans [-1, 1].
static func value_noise_3d(x: float, y: float, z: float, seed_value: int) -> float:
	var fx := floorf(x)
	var fy := floorf(y)
	var fz := floorf(z)
	var ix := int(fx)
	var iy := int(fy)
	var iz := int(fz)
	var tx := x - fx
	var ty := y - fy
	var tz := z - fz
	var ux := tx * tx * (3.0 - 2.0 * tx)
	var uy := ty * ty * (3.0 - 2.0 * ty)
	var uz := tz * tz * (3.0 - 2.0 * tz)
	var c000 := _hash01(ix, iy, iz, seed_value)
	var c100 := _hash01(ix + 1, iy, iz, seed_value)
	var c010 := _hash01(ix, iy + 1, iz, seed_value)
	var c110 := _hash01(ix + 1, iy + 1, iz, seed_value)
	var c001 := _hash01(ix, iy, iz + 1, seed_value)
	var c101 := _hash01(ix + 1, iy, iz + 1, seed_value)
	var c011 := _hash01(ix, iy + 1, iz + 1, seed_value)
	var c111 := _hash01(ix + 1, iy + 1, iz + 1, seed_value)
	var x00 := lerpf(c000, c100, ux)
	var x10 := lerpf(c010, c110, ux)
	var x01 := lerpf(c001, c101, ux)
	var x11 := lerpf(c011, c111, ux)
	var y0 := lerpf(x00, x10, uy)
	var y1 := lerpf(x01, x11, uy)
	return lerpf(y0, y1, uz) * 2.0 - 1.0


## Bruit fractal multicouche (fBm) : plusieurs octaves de bruit de valeur.
## Renvoie une valeur normalisée dans [-1, 1].
static func fbm_3d(x: float, y: float, z: float, seed_value: int, octave_count: int) -> float:
	var total := 0.0
	var amplitude := 1.0
	var frequency := 1.0
	var max_total := 0.0
	for i in octave_count:
		var octave_seed := seed_value + i * 1013
		total += value_noise_3d(x * frequency, y * frequency, z * frequency, octave_seed) * amplitude
		max_total += amplitude
		amplitude *= 0.5
		frequency *= 2.0
	return total / max_total
