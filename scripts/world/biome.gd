extends RefCounted
class_name Biome

## Definition du monde : relief du fond, biomes et couleurs.
## Tout est deterministe et sans etat : le terrain, le placement des gisements,
## des algues et des bancs de poissons interrogent les memes fonctions, donc
## tout reste coherent sans avoir a stocker quoi que ce soit.

enum Kind { SHALLOWS, KELP, PLATEAU, REEF, DEEP, BEACH }

const NAMES := {
	Kind.SHALLOWS: "Bas-fonds abrites",
	Kind.KELP: "Foret d'algues geantes",
	Kind.PLATEAU: "Plateau herbeux",
	Kind.REEF: "Grand recif",
	Kind.DEEP: "Fosse abyssale",
	Kind.BEACH: "Ilot rocheux",
}

## Profil radial du cratere : (rayon, profondeur)
const PROFILE: Array[Vector2] = [
	Vector2(0.0, -13.0),
	Vector2(58.0, -16.5),
	Vector2(125.0, -29.0),
	Vector2(215.0, -47.0),
	Vector2(335.0, -96.0),
	Vector2(490.0, -168.0),
	Vector2(720.0, -320.0),
	Vector2(1200.0, -470.0),
]

const ISLAND_CENTER := Vector2(565.0, -305.0)
const ISLAND_RADIUS := 168.0

static var _dunes: FastNoiseLite = null
static var _ridge: FastNoiseLite = null
static var _warp: FastNoiseLite = null
static var _detail: FastNoiseLite = null
static var _patch: FastNoiseLite = null

static func _ensure() -> void:
	if _dunes != null:
		return
	_dunes = FastNoiseLite.new()
	_dunes.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_dunes.seed = 1337
	_dunes.frequency = 0.0042
	_dunes.fractal_octaves = 4

	_ridge = FastNoiseLite.new()
	_ridge.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_ridge.seed = 909
	_ridge.frequency = 0.011
	_ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	_ridge.fractal_octaves = 5
	_ridge.fractal_gain = 0.45

	_warp = FastNoiseLite.new()
	_warp.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_warp.seed = 77
	_warp.frequency = 0.0035
	_warp.fractal_octaves = 2

	_detail = FastNoiseLite.new()
	_detail.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_detail.seed = 4242
	_detail.frequency = 0.075
	_detail.fractal_octaves = 3

	_patch = FastNoiseLite.new()
	_patch.noise_type = FastNoiseLite.TYPE_CELLULAR
	_patch.seed = 5150
	_patch.frequency = 0.004
	_patch.cellular_return_type = FastNoiseLite.RETURN_CELL_VALUE

## Profondeur de reference a la distance `r` du centre du cratere.
static func crater_depth(r: float) -> float:
	if r <= PROFILE[0].x:
		return PROFILE[0].y
	for i in range(PROFILE.size() - 1):
		var a := PROFILE[i]
		var b := PROFILE[i + 1]
		if r <= b.x:
			var t: float = (r - a.x) / maxf(b.x - a.x, 0.001)
			return lerpf(a.y, b.y, smoothstep(0.0, 1.0, t))
	return PROFILE[PROFILE.size() - 1].y - (r - PROFILE[PROFILE.size() - 1].x) * 0.12

## Altitude du fond (negative sous le niveau de la mer).
static func height(x: float, z: float) -> float:
	_ensure()
	# deformation du domaine : evite l'aspect "bruit pose sur un cone"
	var wx: float = x + _warp.get_noise_2d(x, z) * 45.0
	var wz: float = z + _warp.get_noise_2d(x + 500.0, z - 500.0) * 45.0
	var r := sqrt(wx * wx + wz * wz)

	var h := crater_depth(r)
	var kind := _kind_from_radius(r)

	# dunes larges : partout, mais tres douces dans les bas-fonds
	var dune_amp: float = lerpf(1.6, 9.0, clampf(r / 600.0, 0.0, 1.0))
	h += _dunes.get_noise_2d(wx, wz) * dune_amp

	# aretes rocheuses : absentes du sable, marquees sur le recif
	var ridge_amp := 0.0
	match kind:
		Kind.SHALLOWS: ridge_amp = 2.4
		Kind.KELP: ridge_amp = 4.5
		Kind.PLATEAU: ridge_amp = 6.0
		Kind.REEF: ridge_amp = 16.0
		Kind.DEEP: ridge_amp = 26.0
		_: ridge_amp = 8.0
	var ridged: float = absf(_ridge.get_noise_2d(wx, wz))
	h += pow(ridged, 1.5) * ridge_amp

	# micro-relief : rides de sable et cailloux
	h += _detail.get_noise_2d(x * 2.0, z * 2.0) * 0.35

	# ilot emerge : sert de repere visuel a l'horizon
	var island := _island_height(x, z)
	if island > h:
		h = lerpf(h, island, smoothstep(0.0, 1.0, (island - h) / 12.0))

	return h

static func _island_height(x: float, z: float) -> float:
	var d := Vector2(x, z).distance_to(ISLAND_CENTER)
	if d > ISLAND_RADIUS * 1.35:
		return -9999.0
	var t: float = clampf(1.0 - d / ISLAND_RADIUS, 0.0, 1.0)
	var h: float = pow(t, 1.7) * 62.0 - 14.0
	# falaises et eboulis
	h += absf(_ridge.get_noise_2d(x * 1.6, z * 1.6)) * 9.0 * t
	return h

static func _kind_from_radius(r: float) -> int:
	if r < 78.0:
		return Kind.SHALLOWS
	elif r < 190.0:
		return Kind.KELP
	elif r < 300.0:
		return Kind.PLATEAU
	elif r < 520.0:
		return Kind.REEF
	return Kind.DEEP

## Biome au point donne (tient compte de l'ilot).
static func kind_at(x: float, z: float, h: float = INF) -> int:
	_ensure()
	if is_inf(h):
		h = height(x, z)
	if h > -2.5 and Vector2(x, z).distance_to(ISLAND_CENTER) < ISLAND_RADIUS * 1.2:
		return Kind.BEACH
	var r := sqrt(x * x + z * z)
	var kind := _kind_from_radius(r)
	# les plaques d'algues debordent un peu de leur anneau
	_ensure()
	var patch := _patch.get_noise_2d(x, z)
	if kind == Kind.SHALLOWS and patch > 0.55 and r > 55.0:
		return Kind.KELP
	if kind == Kind.PLATEAU and patch < -0.55:
		return Kind.KELP
	return kind

static func biome_name(kind: int) -> String:
	return NAMES.get(kind, "Inconnu")

## Valeur 0..1 injectee dans la couleur de sommet pour teinter le sol.
static func biome_gradient(kind: int) -> float:
	match kind:
		Kind.BEACH: return 0.0
		Kind.SHALLOWS: return 0.08
		Kind.KELP: return 0.42
		Kind.PLATEAU: return 0.5
		Kind.REEF: return 0.72
		Kind.DEEP: return 1.0
	return 0.5

## Quantite de bioluminescence du sol (0..1).
static func bio_amount(kind: int, h: float) -> float:
	match kind:
		Kind.REEF: return clampf((-h - 70.0) / 120.0, 0.0, 0.6)
		Kind.DEEP: return clampf((-h - 120.0) / 160.0, 0.15, 1.0)
		Kind.KELP: return 0.12
	return 0.0

## Densite d'algues geantes 0..1.
static func kelp_density(x: float, z: float) -> float:
	_ensure()
	var kind := kind_at(x, z)
	if kind != Kind.KELP:
		return 0.0
	var h := height(x, z)
	if h > -14.0 or h < -70.0:
		return 0.0
	var d: float = clampf(_patch.get_noise_2d(x * 1.7, z * 1.7) * 0.5 + 0.65, 0.0, 1.0)
	return d

## Normale approchee du fond, par differences finies.
static func normal(x: float, z: float, eps: float = 0.75) -> Vector3:
	var h := height(x, z)
	return Vector3(h - height(x + eps, z), eps, h - height(x, z + eps)).normalized()
