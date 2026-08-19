extends Node
class_name PlayerStats

## Survie : oxygene, sante, faim, soif, froid.
## Les equipements portes modifient ces valeurs via `apply_modifiers`.

signal oxygen_changed(current: float, maximum: float)
signal health_changed(current: float, maximum: float)
signal food_changed(current: float, maximum: float)
signal water_changed(current: float, maximum: float)
signal died()
signal warning(text: String, severity: int)

const BASE_OXYGEN := 45.0
const MAX_HEALTH := 100.0

@export var food_decay: float = 0.30          # points par seconde
@export var water_decay: float = 0.42
@export var oxygen_refill_rate: float = 22.0

var oxygen_capacity: float = BASE_OXYGEN
var oxygen: float = BASE_OXYGEN
var health: float = MAX_HEALTH
var food: float = 100.0
var water: float = 100.0
var alive: bool = true

## Modificateurs cumules de l'equipement.
var swim_speed_bonus: float = 0.0
var damage_resist: float = 0.0
var cold_resist: float = 0.0
var depth_o2_penalty: float = 1.0             # 1 = penalite normale, 0 = annulee
var has_compass: bool = false

var _low_o2_warned := false
var _drown_timer := 0.0
var _warn_cooldown := 0.0

func apply_modifiers(mods: Dictionary) -> void:
	swim_speed_bonus = mods.get("swim_speed", 0.0)
	damage_resist = clampf(mods.get("damage_resist", 0.0), 0.0, 0.9)
	cold_resist = clampf(mods.get("cold_resist", 0.0), 0.0, 1.0)
	depth_o2_penalty = clampf(1.0 + mods.get("depth_o2_penalty", 0.0), 0.0, 1.0)
	has_compass = mods.has("compass")
	var new_cap: float = BASE_OXYGEN + mods.get("oxygen_capacity", 0.0)
	if not is_equal_approx(new_cap, oxygen_capacity):
		oxygen_capacity = new_cap
		oxygen = minf(oxygen, oxygen_capacity)
		oxygen_changed.emit(oxygen, oxygen_capacity)

## `submerged` : la tete est-elle sous l'eau. `depth` : metres sous la surface.
func tick(delta: float, submerged: bool, depth: float, sprinting: bool,
		in_shelter: bool) -> void:
	if not alive:
		return
	_warn_cooldown = maxf(_warn_cooldown - delta, 0.0)

	# ------------------------------------------------------------- oxygene ---
	if submerged and not in_shelter:
		var rate := 1.0
		if sprinting:
			rate *= 1.85
		# au-dela de 100 m la pression fait consommer plus vite
		rate *= 1.0 + clampf((depth - 100.0) / 300.0, 0.0, 1.2) * depth_o2_penalty
		oxygen -= rate * delta
		if oxygen <= 0.0:
			oxygen = 0.0
			_drown_timer += delta
			if _drown_timer >= 1.0:
				_drown_timer = 0.0
				damage(9.0, "noyade")
				_warn("Asphyxie !", GameState.Notice.DANGER, true)
		elif oxygen < oxygen_capacity * 0.25:
			if not _low_o2_warned:
				_low_o2_warned = true
				_warn("Oxygene faible", GameState.Notice.WARNING)
	else:
		var refill := oxygen_refill_rate * (2.0 if in_shelter else 1.0)
		if oxygen < oxygen_capacity:
			oxygen = minf(oxygen + refill * delta, oxygen_capacity)
		_drown_timer = 0.0
		if oxygen > oxygen_capacity * 0.5:
			_low_o2_warned = false
	oxygen_changed.emit(oxygen, oxygen_capacity)

	# ------------------------------------------------------- faim et soif ----
	var effort := 1.0 + (0.6 if sprinting else 0.0)
	food = maxf(food - food_decay * delta * effort * 0.1, 0.0)
	water = maxf(water - water_decay * delta * effort * 0.1, 0.0)
	food_changed.emit(food, 100.0)
	water_changed.emit(water, 100.0)

	if food <= 0.0:
		damage(1.4 * delta, "faim")
		_warn("Vous mourez de faim", GameState.Notice.DANGER)
	elif food < 20.0:
		_warn("Faim", GameState.Notice.WARNING)
	if water <= 0.0:
		damage(2.0 * delta, "soif")
		_warn("Deshydratation critique", GameState.Notice.DANGER)
	elif water < 20.0:
		_warn("Soif", GameState.Notice.WARNING)

	# ------------------------------------------------------------- froid -----
	if submerged and depth > 180.0:
		var cold := (depth - 180.0) / 220.0 * (1.0 - cold_resist)
		if cold > 0.0:
			damage(cold * delta * 1.6, "froid")
			_warn("Hypothermie", GameState.Notice.WARNING)

	# --------------------------------------------- regeneration lente --------
	if health < MAX_HEALTH and food > 45.0 and water > 45.0:
		health = minf(health + 0.55 * delta, MAX_HEALTH)
		health_changed.emit(health, MAX_HEALTH)

func damage(amount: float, _cause: String = "") -> void:
	if not alive:
		return
	health -= amount * (1.0 - damage_resist)
	health_changed.emit(health, MAX_HEALTH)
	if health <= 0.0:
		health = 0.0
		alive = false
		died.emit()

func heal(amount: float) -> void:
	health = clampf(health + amount, 0.0, MAX_HEALTH)
	health_changed.emit(health, MAX_HEALTH)

func eat(food_value: float, water_value: float, health_value: float) -> void:
	food = clampf(food + food_value, 0.0, 100.0)
	water = clampf(water + water_value, 0.0, 100.0)
	if health_value > 0.0:
		heal(health_value)
	food_changed.emit(food, 100.0)
	water_changed.emit(water, 100.0)

func reset() -> void:
	alive = true
	health = MAX_HEALTH
	oxygen = oxygen_capacity
	food = maxf(food, 55.0)
	water = maxf(water, 55.0)
	_drown_timer = 0.0
	_low_o2_warned = false
	health_changed.emit(health, MAX_HEALTH)
	oxygen_changed.emit(oxygen, oxygen_capacity)
	food_changed.emit(food, 100.0)
	water_changed.emit(water, 100.0)

func _warn(text: String, severity: int, force: bool = false) -> void:
	if _warn_cooldown > 0.0 and not force:
		return
	_warn_cooldown = 6.0
	warning.emit(text, severity)

func serialize() -> Dictionary:
	return {"oxygen": oxygen, "health": health, "food": food, "water": water}

func deserialize(d: Dictionary) -> void:
	oxygen = d.get("oxygen", oxygen)
	health = d.get("health", health)
	food = d.get("food", food)
	water = d.get("water", water)
	alive = health > 0.0
	if not alive:
		reset()
