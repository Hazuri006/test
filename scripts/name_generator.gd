class_name NameGenerator
extends RefCounted

## Génère des noms de planètes à partir de syllabes, de façon déterministe
## via le SeededRNG fourni (ex. « Vetrax Prime », « Oshara-7 », « Kelduni IV »).

const SYLLABLES: Array[String] = [
	"ve", "tra", "xor", "ka", "lu", "ni", "osh", "ara", "kel", "du",
	"ran", "zeph", "or", "ta", "mi", "sol", "qua", "bex", "ur", "phi",
	"no", "va", "ryn", "ith", "gor", "sha", "el", "dra", "yu", "men",
]

const ROMAN_NUMERALS: Array[String] = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]

const TITLES: Array[String] = ["Prime", "Majoris", "Minor", "Secundus", "Ultima"]


static func planet_name(rng: SeededRNG) -> String:
	var syllable_count := rng.randi_between(2, 3)
	var base := ""
	for _i in syllable_count:
		base += SYLLABLES[rng.randi_between(0, SYLLABLES.size() - 1)]
	base = base.capitalize()
	var roll := rng.randf_01()
	if roll < 0.3:
		return "%s %s" % [base, TITLES[rng.randi_between(0, TITLES.size() - 1)]]
	if roll < 0.55:
		return "%s %s" % [base, ROMAN_NUMERALS[rng.randi_between(0, ROMAN_NUMERALS.size() - 1)]]
	if roll < 0.7:
		return "%s-%d" % [base, rng.randi_between(2, 9)]
	return base
