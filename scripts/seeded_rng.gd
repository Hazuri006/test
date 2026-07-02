class_name SeededRNG
extends RefCounted

## Générateur pseudo-aléatoire déterministe maison (mulberry32 adapté en
## GDScript, arithmétique forcée sur 32 bits). Toute la génération
## procédurale du jeu passe par cette classe : aucune dépendance externe.

var _state: int


func _init(seed_value: int) -> void:
	_state = seed_value & 0xFFFFFFFF
	if _state == 0:
		_state = 0x9E3779B9


## Entier pseudo-aléatoire dans [0, 2^32 - 1].
func next_int() -> int:
	_state = (_state + 0x6D2B79F5) & 0xFFFFFFFF
	var t: int = _state
	t = ((t ^ (t >> 15)) * ((t | 1) & 0xFFFFFFFF)) & 0xFFFFFFFF
	t = (t ^ (t + (((t ^ (t >> 7)) * ((t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF))) & 0xFFFFFFFF
	return (t ^ (t >> 14)) & 0xFFFFFFFF


## Flottant pseudo-aléatoire dans [0, 1).
func randf_01() -> float:
	return float(next_int()) / 4294967296.0


## Flottant pseudo-aléatoire dans [from, to).
func randf_between(from: float, to: float) -> float:
	return from + (to - from) * randf_01()


## Entier pseudo-aléatoire dans [from, to] (bornes incluses).
func randi_between(from: int, to: int) -> int:
	return from + next_int() % (to - from + 1)


## Vrai avec la probabilité donnée (0.0 à 1.0).
func chance(probability: float) -> bool:
	return randf_01() < probability


## Élément pseudo-aléatoire du tableau donné.
func pick(values: Array) -> Variant:
	return values[randi_between(0, values.size() - 1)]
