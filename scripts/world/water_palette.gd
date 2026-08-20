extends RefCounted
class_name WaterPalette

## Couleur de l'eau en fonction de la profondeur — source unique de verite.
##
## Le shader d'ocean, le post-traitement sous-marin, le brouillard et la
## lumiere ambiante interrogent tous cette rampe. Sans cela, la teinte de
## l'eau differerait selon qu'on la regarde a travers la surface, a travers
## le brouillard ou dans le reflet, et l'illusion s'effondrerait.
##
## Les paliers reproduisent la descente reelle d'un lagon : turquoise tant que
## le fond clair renvoie encore du vert, bleu franc quand le vert a ete
## absorbe, puis bleu nuit et enfin noir.

const SURFACE := Color(0.20, 0.82, 0.76)     #   0 m — turquoise de lagon
const SHALLOW := Color(0.07, 0.55, 0.66)     #  13 m — cyan
const MID := Color(0.020, 0.235, 0.470)      #  40 m — bleu franc
const DEEP := Color(0.004, 0.070, 0.215)     #  95 m — bleu nuit
const ABYSS := Color(0.001, 0.014, 0.055)    # 230 m — noir bleute

## Couleur du milieu a `depth` metres sous la surface.
static func tint(depth: float) -> Color:
	var d: float = maxf(depth, 0.0)
	var c: Color = SURFACE.lerp(SHALLOW, smoothstep(0.0, 13.0, d))
	c = c.lerp(MID, smoothstep(11.0, 40.0, d))
	c = c.lerp(DEEP, smoothstep(38.0, 95.0, d))
	c = c.lerp(ABYSS, smoothstep(90.0, 230.0, d))
	return c

## Visibilite horizontale (metres) a cette profondeur : l'eau se charge en
## particules et s'assombrit a mesure qu'on descend.
static func visibility(depth: float) -> float:
	return lerpf(66.0, 26.0, clampf(depth / 160.0, 0.0, 1.0))

## Densite du brouillard exponentiel correspondante.
static func fog_density(depth: float) -> float:
	return lerpf(0.016, 0.070, clampf(depth / 140.0, 0.0, 1.0))
