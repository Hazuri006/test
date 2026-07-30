class_name CityLayout
extends RefCounted
## CityLayout -- the single description of Brick City's street grid.
##
## Everything that needs to know "where is a street", "which district is this",
## or "where can I spawn something" asks this class, so the generator, the
## minimap, the traffic system, the enemy spawner and the mission scripts can
## never disagree about the city's shape.
##
## Grid model (all metres):
##   pitch = BLOCK_SIZE + STREET_WIDTH
##   block (i, j) covers  x in [i*pitch, i*pitch + BLOCK_SIZE]
##   streets fill the gaps between blocks; intersections are the crossings.
## The whole grid is centred on the world origin via `origin_offset()`.

enum District { DOWNTOWN, COMMERCIAL, RESIDENTIAL, INDUSTRIAL, PARK, BOSS_ZONE, WATERFRONT }

const GRID: int = 8                  ## 8 x 8 city blocks
const BLOCK_SIZE: float = 62.0
const STREET_WIDTH: float = 17.0
const SIDEWALK_HEIGHT: float = 0.18
const WATER_LEVEL: float = -2.6

static func pitch() -> float:
	return BLOCK_SIZE + STREET_WIDTH

static func city_extent() -> float:
	return GRID * pitch()

static func origin_offset() -> float:
	return -city_extent() * 0.5

## World-space centre of block (i, j).
static func block_center(i: int, j: int) -> Vector3:
	var o := origin_offset()
	return Vector3(o + i * pitch() + BLOCK_SIZE * 0.5, 0.0, o + j * pitch() + BLOCK_SIZE * 0.5)

## World-space minimum corner of block (i, j).
static func block_min(i: int, j: int) -> Vector2:
	var o := origin_offset()
	return Vector2(o + i * pitch(), o + j * pitch())

## Centre of the intersection north-east of block (i, j); i,j in 0..GRID.
static func intersection_center(i: int, j: int) -> Vector3:
	var o := origin_offset()
	return Vector3(o + i * pitch() - STREET_WIDTH * 0.5,
			0.0, o + j * pitch() - STREET_WIDTH * 0.5)

## Nearest street centre-line position to `pos` -- used to drop vehicles,
## enemies and rescue targets onto walkable ground.
static func nearest_street_point(pos: Vector3) -> Vector3:
	var o := origin_offset()
	var p := pitch()
	var ix: float = roundf((pos.x - o) / p)
	var iz: float = roundf((pos.z - o) / p)
	var street_x: float = o + ix * p - STREET_WIDTH * 0.5
	var street_z: float = o + iz * p - STREET_WIDTH * 0.5
	# Snap to whichever axis is closer, keeping the other coordinate free so the
	# result stays on the road rather than always landing on a crossing.
	if absf(pos.x - street_x) < absf(pos.z - street_z):
		return Vector3(street_x, 0.0, clampf(pos.z, o, o + GRID * p))
	return Vector3(clampf(pos.x, o, o + GRID * p), 0.0, street_z)

## District of block (i, j). The layout is hand-tuned rather than random so the
## city reads like a designed place: towers in the middle, industry and the
## villain's factory at the north edge, park and waterfront to the south.
static func district_of(i: int, j: int) -> District:
	if i == GRID - 1 and j == GRID - 1:
		return District.BOSS_ZONE
	if i == 2 and j == 1:
		return District.PARK
	if i == 5 and j == 6:
		return District.PARK
	if j == 0:
		return District.WATERFRONT
	if i >= 3 and i <= 4 and j >= 3 and j <= 4:
		return District.DOWNTOWN
	if i >= 2 and i <= 5 and j >= 2 and j <= 5:
		return District.COMMERCIAL
	if j >= GRID - 2:
		return District.INDUSTRIAL
	return District.RESIDENTIAL

static func district_name(d: District) -> String:
	match d:
		District.DOWNTOWN: return "Centre-ville"
		District.COMMERCIAL: return "Quartier commercial"
		District.RESIDENTIAL: return "Quartier residentiel"
		District.INDUSTRIAL: return "Zone industrielle"
		District.PARK: return "Parc des Briques"
		District.BOSS_ZONE: return "Usine Mecanix"
		District.WATERFRONT: return "Front de mer"
	return "Brick City"

## Which district contains a world position (used by the HUD district readout).
static func district_at(pos: Vector3) -> District:
	var o := origin_offset()
	var p := pitch()
	var i := clampi(int(floorf((pos.x - o) / p)), 0, GRID - 1)
	var j := clampi(int(floorf((pos.z - o) / p)), 0, GRID - 1)
	return district_of(i, j)

## Height range for buildings of a district: [min, max] metres.
static func height_range(d: District) -> Vector2:
	match d:
		District.DOWNTOWN: return Vector2(95.0, 185.0)
		District.COMMERCIAL: return Vector2(38.0, 88.0)
		District.RESIDENTIAL: return Vector2(20.0, 46.0)
		District.INDUSTRIAL: return Vector2(11.0, 26.0)
		District.BOSS_ZONE: return Vector2(16.0, 34.0)
		District.WATERFRONT: return Vector2(14.0, 40.0)
		District.PARK: return Vector2(0.0, 0.0)
	return Vector2(20.0, 50.0)

## True when the block should be left mostly open (parks, plazas).
static func is_open_block(d: District) -> bool:
	return d == District.PARK

## A rooftop position on block (i, j) -- handy for mission markers.
static func block_rooftop_hint(i: int, j: int) -> Vector3:
	var c := block_center(i, j)
	c.y = height_range(district_of(i, j)).y * 0.55 + 6.0
	return c
