extends Node
class_name BodyAnimator

## Animation entierement procedurale du corps.
##
## Aucune animation n'est enregistree : chaque os recoit, a chaque image, une
## pose calculee par des oscillateurs dont la frequence et l'amplitude suivent
## la vitesse reelle du joueur. Consequences :
##  * les transitions sont continues (pas de fondu entre clips) ;
##  * la cadence de battement suit exactement la vitesse de nage ;
##  * il n'existe aucun glissement de pied ni aucune pose figee.
##
## Les poses sont melangees par poids d'etat puis lissees par un ressort
## critique, ce qui donne le rendu "lourd et fluide" d'un corps dans l'eau.

enum State { FLOAT, SWIM, WALK, TREAD }

var body: ProcBody
var skeleton: Skeleton3D

## Phases des cycles (radians)
var _kick_phase: float = 0.0
var _stroke_phase: float = 0.0
var _walk_phase: float = 0.0
var _breathe: float = 0.0

## Poids d'etat lisses
var w_float: float = 1.0
var w_swim: float = 0.0
var w_walk: float = 0.0
var w_tread: float = 0.0

var _poses: Dictionary = {}          # nom d'os -> Quaternion courant
var _hips_offset: Vector3 = Vector3.ZERO

func setup(p_body: ProcBody) -> void:
	body = p_body
	skeleton = p_body.skeleton
	for def in ProcBody.BONE_DEFS:
		_poses[def[0]] = Quaternion.IDENTITY

## `speed01` : vitesse horizontale normalisee (0..1)
## `vertical` : vitesse verticale en m/s
## `pitch`    : inclinaison du regard en radians
## `strafe`   : -1..1, sert a incliner le corps dans les virages
func update(delta: float, state: int, speed01: float, vertical: float,
		pitch: float, strafe: float, sprinting: bool, holding: bool) -> void:
	if skeleton == null:
		return

	# ------------------------------------------------------- horloges --------
	var kick_rate: float = lerpf(1.1, 3.4, clampf(speed01, 0.0, 1.0))
	if sprinting:
		kick_rate *= 1.35
	_kick_phase = wrapf(_kick_phase + delta * kick_rate * TAU, 0.0, TAU)
	_stroke_phase = wrapf(_stroke_phase + delta * kick_rate * 0.5 * TAU, 0.0, TAU)
	_walk_phase = wrapf(_walk_phase + delta * lerpf(1.4, 4.2, speed01) * TAU, 0.0, TAU)
	_breathe = wrapf(_breathe + delta * 0.55 * TAU, 0.0, TAU)

	# ------------------------------------------------------- poids d'etat ----
	var target := {
		State.FLOAT: 0.0, State.SWIM: 0.0, State.WALK: 0.0, State.TREAD: 0.0}
	target[state] = 1.0
	var k := 1.0 - exp(-delta * 7.0)
	w_float = lerpf(w_float, target[State.FLOAT], k)
	w_swim = lerpf(w_swim, target[State.SWIM], k)
	w_walk = lerpf(w_walk, target[State.WALK], k)
	w_tread = lerpf(w_tread, target[State.TREAD], k)

	# --------------------------------------------------------- accumulateur --
	var acc: Dictionary = {}
	for def in ProcBody.BONE_DEFS:
		acc[def[0]] = Vector3.ZERO

	if w_float > 0.001:
		_pose_float(acc, w_float)
	if w_swim > 0.001:
		_pose_swim(acc, w_swim, speed01, sprinting)
	if w_tread > 0.001:
		_pose_tread(acc, w_tread)
	if w_walk > 0.001:
		_pose_walk(acc, w_walk, speed01)

	# ------------------------- inclinaisons pilotees par le regard -----------
	# le buste accompagne le regard, mais moins que la tete (repartition
	# naturelle : 20 % colonne, 30 % torse, 50 % cou)
	acc["spine"] += Vector3(pitch * 0.18, 0.0, -strafe * 0.10)
	acc["chest"] += Vector3(pitch * 0.22, 0.0, -strafe * 0.14)
	acc["neck"] += Vector3(pitch * 0.25, 0.0, 0.0)
	acc["head"] += Vector3(pitch * 0.2, 0.0, -strafe * 0.06)
	acc["hips"] += Vector3(0.0, 0.0, -strafe * 0.12)

	# les bras se relevent quand un outil est en main
	if holding:
		var hold := 1.0
		acc["upperarm_r"] += Vector3(-0.55, -0.35, 0.9) * hold
		acc["forearm_r"] += Vector3(0.0, -0.9, 0.0) * hold
		acc["upperarm_l"] += Vector3(-0.2, 0.2, -0.35) * hold
		acc["forearm_l"] += Vector3(0.0, 0.5, 0.0) * hold

	# --------------------------------------------------- application ---------
	var smooth := 1.0 - exp(-delta * 14.0)
	for bone_name in acc.keys():
		var idx: int = body.bone_index.get(bone_name, -1)
		if idx < 0:
			continue
		var target_q := Quaternion.from_euler(acc[bone_name])
		_poses[bone_name] = _poses[bone_name].slerp(target_q, smooth)
		skeleton.set_bone_pose_rotation(idx, _poses[bone_name])

	# oscillation verticale du bassin
	var bob := 0.0
	bob += sin(_walk_phase * 2.0) * 0.035 * w_walk * speed01
	bob += sin(_breathe) * 0.012 * (w_float + w_tread)
	bob += sin(_kick_phase) * 0.018 * w_swim * speed01
	_hips_offset = _hips_offset.lerp(Vector3(0.0, bob, 0.0), smooth)
	var hips_idx: int = body.bone_index.get("hips", -1)
	if hips_idx >= 0:
		skeleton.set_bone_pose_position(hips_idx,
			skeleton.get_bone_rest(hips_idx).origin + _hips_offset)

# =============================================================================
#  Poses de base — angles en radians, dans le repere local de chaque os
# =============================================================================

## Flottaison : le corps derive, presque immobile, les membres suivent l'eau
## avec un leger retard (dephasage entre bras, avant-bras et main).
func _pose_float(acc: Dictionary, w: float) -> void:
	var p := _breathe
	acc["spine"] += Vector3(sin(p) * 0.05, 0.0, cos(p * 0.7) * 0.04) * w
	acc["chest"] += Vector3(sin(p + 0.4) * 0.05, cos(p * 0.5) * 0.05, 0.0) * w

	# bras ecartes, mains qui ondulent
	acc["upperarm_l"] += Vector3(0.15, 0.0, -0.75 + sin(p) * 0.12) * w
	acc["forearm_l"] += Vector3(0.0, 0.0, -0.45 + sin(p + 0.8) * 0.18) * w
	acc["hand_l"] += Vector3(0.0, 0.0, sin(p + 1.4) * 0.25) * w
	acc["upperarm_r"] += Vector3(0.15, 0.0, 0.75 - sin(p) * 0.12) * w
	acc["forearm_r"] += Vector3(0.0, 0.0, 0.45 - sin(p + 0.8) * 0.18) * w
	acc["hand_r"] += Vector3(0.0, 0.0, -sin(p + 1.4) * 0.25) * w

	# jambes qui ciseaillent tres lentement
	acc["thigh_l"] += Vector3(-0.12 + sin(p * 0.6) * 0.10, 0.0, 0.06) * w
	acc["thigh_r"] += Vector3(-0.12 - sin(p * 0.6) * 0.10, 0.0, -0.06) * w
	acc["shin_l"] += Vector3(0.25 + sin(p * 0.6 + 1.0) * 0.10, 0.0, 0.0) * w
	acc["shin_r"] += Vector3(0.25 - sin(p * 0.6 + 1.0) * 0.10, 0.0, 0.0) * w
	acc["foot_l"] += Vector3(0.35, 0.0, 0.0) * w
	acc["foot_r"] += Vector3(0.35, 0.0, 0.0) * w

## Nage : battement de palmes alterne (onde qui remonte de la hanche au pied)
## et bras plaques le long du corps ; le crawl n'apparait qu'en sprint.
func _pose_swim(acc: Dictionary, w: float, speed01: float, sprinting: bool) -> void:
	var amp: float = lerpf(0.22, 0.62, clampf(speed01, 0.0, 1.0))
	var k := _kick_phase
	# l'onde se propage : la cuisse mene, le tibia suit, le pied ferme
	acc["thigh_l"] += Vector3(sin(k) * amp, 0.0, 0.05) * w
	acc["thigh_r"] += Vector3(sin(k + PI) * amp, 0.0, -0.05) * w
	acc["shin_l"] += Vector3(0.18 + maxf(sin(k - 0.9), 0.0) * amp * 1.5, 0.0, 0.0) * w
	acc["shin_r"] += Vector3(0.18 + maxf(sin(k + PI - 0.9), 0.0) * amp * 1.5,
		0.0, 0.0) * w
	acc["foot_l"] += Vector3(0.42 + sin(k - 1.6) * amp * 0.5, 0.0, 0.0) * w
	acc["foot_r"] += Vector3(0.42 + sin(k + PI - 1.6) * amp * 0.5, 0.0, 0.0) * w

	acc["hips"] += Vector3(sin(k * 0.5) * 0.06 * amp, 0.0, 0.0) * w
	acc["spine"] += Vector3(sin(k * 0.5 + 0.6) * 0.05 * amp, 0.0, 0.0) * w

	if sprinting:
		# crawl : chaque bras decrit un cercle complet, en opposition de phase
		var s := _stroke_phase
		acc["upperarm_l"] += Vector3(-cos(s) * 1.5, 0.0, -1.15 + sin(s) * 0.55) * w
		acc["forearm_l"] += Vector3(0.0, 0.0, -0.5 - maxf(sin(s + 0.7), 0.0) * 0.8) * w
		acc["upperarm_r"] += Vector3(-cos(s + PI) * 1.5, 0.0,
			1.15 - sin(s + PI) * 0.55) * w
		acc["forearm_r"] += Vector3(0.0, 0.0,
			0.5 + maxf(sin(s + PI + 0.7), 0.0) * 0.8) * w
	else:
		# position profilee : bras le long du corps, mains vers l'arriere
		var d := sin(_breathe) * 0.06
		acc["upperarm_l"] += Vector3(0.1, 0.0, -1.35 + d) * w
		acc["forearm_l"] += Vector3(0.0, 0.0, -0.22 + d) * w
		acc["upperarm_r"] += Vector3(0.1, 0.0, 1.35 - d) * w
		acc["forearm_r"] += Vector3(0.0, 0.0, 0.22 - d) * w

## Sur place, tete hors de l'eau : petit ciseau des jambes et sculling des mains.
func _pose_tread(acc: Dictionary, w: float) -> void:
	var p := _kick_phase * 0.6
	acc["thigh_l"] += Vector3(-0.5 + sin(p) * 0.35, 0.0, 0.18) * w
	acc["thigh_r"] += Vector3(-0.5 + sin(p + PI) * 0.35, 0.0, -0.18) * w
	acc["shin_l"] += Vector3(0.9 - sin(p) * 0.3, 0.0, 0.0) * w
	acc["shin_r"] += Vector3(0.9 - sin(p + PI) * 0.3, 0.0, 0.0) * w
	acc["upperarm_l"] += Vector3(0.0, 0.0, -0.55) * w
	acc["upperarm_r"] += Vector3(0.0, 0.0, 0.55) * w
	acc["forearm_l"] += Vector3(0.0, sin(p * 2.0) * 0.5, -0.8) * w
	acc["forearm_r"] += Vector3(0.0, -sin(p * 2.0) * 0.5, 0.8) * w

## Marche / course a l'interieur de la capsule ou sur l'ilot.
func _pose_walk(acc: Dictionary, w: float, speed01: float) -> void:
	var p := _walk_phase
	var amp: float = lerpf(0.15, 0.62, clampf(speed01, 0.0, 1.0))
	acc["thigh_l"] += Vector3(sin(p) * amp, 0.0, 0.0) * w
	acc["thigh_r"] += Vector3(sin(p + PI) * amp, 0.0, 0.0) * w
	# le genou ne plie que pendant la phase de retour
	acc["shin_l"] += Vector3(maxf(-sin(p - 0.5), 0.0) * amp * 1.7, 0.0, 0.0) * w
	acc["shin_r"] += Vector3(maxf(-sin(p + PI - 0.5), 0.0) * amp * 1.7, 0.0, 0.0) * w
	acc["foot_l"] += Vector3(-sin(p - 1.2) * amp * 0.5, 0.0, 0.0) * w
	acc["foot_r"] += Vector3(-sin(p + PI - 1.2) * amp * 0.5, 0.0, 0.0) * w

	# les bras balancent en opposition aux jambes
	acc["upperarm_l"] += Vector3(sin(p + PI) * amp * 0.7, 0.0, -1.35) * w
	acc["upperarm_r"] += Vector3(sin(p) * amp * 0.7, 0.0, 1.35) * w
	acc["forearm_l"] += Vector3(0.0, 0.0, -0.35 - amp * 0.3) * w
	acc["forearm_r"] += Vector3(0.0, 0.0, 0.35 + amp * 0.3) * w
	acc["spine"] += Vector3(0.06, sin(p) * amp * 0.12, 0.0) * w
	acc["chest"] += Vector3(0.0, sin(p + PI) * amp * 0.16, 0.0) * w
