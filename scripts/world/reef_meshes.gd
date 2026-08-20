extends RefCounted
class_name ReefMeshes

## Fabrique des formes du recif : massifs coralliens, dalles rocheuses,
## anemones, coraux tubulaires et grands coraux en eventail.
##
## Toutes les formes sortent de deux primitives seulement : une sphere
## deformee par du bruit, et un tube balaye le long d'une courbe. C'est
## suffisant pour couvrir tout ce qui pousse sur un recif, et cela evite
## d'avoir a stocker le moindre modele.
##
## Sens d'enroulement — Godot tient pour face AVANT celle dont la normale
## calculee a la main droite s'ECARTE de l'observateur. Les deux primitives
## n'ont donc pas le meme ordre de sommets : la sphere est parcourue du pole
## haut vers le bas, le tube de la base vers la pointe, et ces deux sens
## opposes s'annulent. Ne pas "harmoniser" les deux formules sans refaire
## le calcul : c'est exactement ce piege qui rend un maillage invisible.

# =============================================================================
#  Primitives
# =============================================================================

## Sphere de rayon 1 deformee par du bruit, puis eventuellement ecrasee et
## tronquee. `lobes` sculpte la silhouette d'ensemble, `knobs` la bosselure.
static func blob(seed_value: int, rings: int = 18, segments: int = 22,
		lobe_freq: float = 1.4, lobe_amp: float = 0.42,
		knob_freq: float = 5.0, knob_amp: float = 0.14,
		squash_y: float = 1.0, floor_y: float = -0.85,
		ceil_y: float = 2.0) -> ArrayMesh:
	var lobes := FastNoiseLite.new()
	lobes.seed = seed_value
	lobes.frequency = 1.0
	lobes.fractal_octaves = 3
	var knobs := FastNoiseLite.new()
	knobs.seed = seed_value * 7 + 13
	knobs.noise_type = FastNoiseLite.TYPE_SIMPLEX
	knobs.frequency = 1.0
	knobs.fractal_octaves = 2

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var pts: Array[Vector3] = []
	for r in rings + 1:
		var phi: float = PI * float(r) / float(rings)
		for s in segments + 1:
			var theta: float = TAU * float(s) / float(segments)
			var dir := Vector3(sin(phi) * cos(theta), cos(phi),
				sin(phi) * sin(theta))
			var q: Vector3 = dir * lobe_freq
			var radius: float = 1.0 + lobes.get_noise_3d(q.x, q.y, q.z) * lobe_amp
			var k: Vector3 = dir * knob_freq
			radius += absf(knobs.get_noise_3d(k.x, k.y, k.z)) * knob_amp
			var p := dir * radius
			p.y *= squash_y
			p.y = clampf(p.y, floor_y, ceil_y)
			pts.append(p)

	var stride := segments + 1
	for r in rings:
		for s in segments:
			var i0 := r * stride + s
			var i1 := i0 + 1
			var i2 := i0 + stride
			var i3 := i2 + 1
			# parcours du pole haut vers le bas : ordre "sphere"
			for idx in [i0, i2, i1, i1, i2, i3]:
				st.add_vertex(pts[idx])
	# Indexer d'abord fusionne les sommets coincidents ; les normales sont
	# alors moyennees entre faces voisines et la surface est lisse, au lieu
	# d'etre facettee. L'ordre inverse donnerait un rendu en polygones.
	st.index()
	st.generate_normals()
	return st.commit()

## Tube balaye le long d'une polyligne, avec un rayon par point.
## Le repere est transporte parallelement d'un point au suivant, ce qui evite
## la torsion parasite qu'on obtient en recalculant une base a chaque etape.
static func tube(path: PackedVector3Array, radii: PackedFloat32Array,
		segments: int = 8, st: SurfaceTool = null) -> ArrayMesh:
	var own := st == null
	if own:
		st = SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
	if path.size() < 2:
		if own:
			st.index()
			st.generate_normals()
			return st.commit()
		return null

	var up := Vector3(0.0, 0.0, 1.0)
	var first_dir: Vector3 = (path[1] - path[0]).normalized()
	if absf(first_dir.dot(up)) > 0.9:
		up = Vector3(1.0, 0.0, 0.0)
	var side: Vector3 = first_dir.cross(up).normalized()
	var fwd: Vector3 = side.cross(first_dir).normalized()

	var rings: Array[PackedVector3Array] = []
	for i in path.size():
		var dir: Vector3
		if i == 0:
			dir = (path[1] - path[0]).normalized()
		elif i == path.size() - 1:
			dir = (path[i] - path[i - 1]).normalized()
		else:
			dir = (path[i + 1] - path[i - 1]).normalized()
		# transport parallele : on redresse le repere sans le faire tourner
		side = (side - dir * side.dot(dir)).normalized()
		fwd = dir.cross(side).normalized()
		var ring := PackedVector3Array()
		var radius: float = radii[mini(i, radii.size() - 1)]
		for s in segments + 1:
			var a := TAU * float(s) / float(segments)
			ring.append(path[i] + (side * cos(a) + fwd * sin(a)) * radius)
		rings.append(ring)

	for i in rings.size() - 1:
		for s in segments:
			var a0: Vector3 = rings[i][s]
			var a1: Vector3 = rings[i][s + 1]
			var b0: Vector3 = rings[i + 1][s]
			var b1: Vector3 = rings[i + 1][s + 1]
			# parcours de la base vers la pointe : ordre "tube", inverse de
			# celui de la sphere
			for v in [a0, a1, b0, a1, b1, b0]:
				st.add_vertex(v)
	if not own:
		return null
	st.index()
	st.generate_normals()
	return st.commit()

# =============================================================================
#  Formes du recif
# =============================================================================

## Massif corallien : une masse bosselee, ecrasee et posee sur le fond.
static func coral_mound(seed_value: int) -> ArrayMesh:
	return blob(seed_value, 20, 24, 1.3, 0.46, 5.5, 0.20, 0.85, -0.55, 1.15)

## Dalle rocheuse a sommet plat, comme les plateformes de gres du recif.
## Le sommet est franchement tronque, les flancs restent irreguliers.
static func rock_slab(seed_value: int) -> ArrayMesh:
	return blob(seed_value, 16, 26, 0.9, 0.34, 3.2, 0.10, 0.34, -0.30, 0.30)

## Gros bloc erode, plus haut que large, qui sert de relief vertical.
static func boulder(seed_value: int) -> ArrayMesh:
	return blob(seed_value, 18, 22, 1.1, 0.38, 4.5, 0.16, 0.78, -0.60, 0.95)

## Corail tubulaire : quelques branches courbes partant d'un pied commun.
static func tube_coral(seed_value: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var branches := rng.randi_range(4, 7)
	for b in branches:
		var a := TAU * float(b) / float(branches) + rng.randf_range(-0.3, 0.3)
		var lean := rng.randf_range(0.25, 0.65)
		var height := rng.randf_range(0.7, 1.35)
		var path := PackedVector3Array()
		var radii := PackedFloat32Array()
		var steps := 7
		for i in steps + 1:
			var t := float(i) / float(steps)
			# la branche se redresse en montant : courbure en racine
			var spread: float = lean * pow(t, 1.5)
			path.append(Vector3(cos(a) * spread, t * height, sin(a) * spread))
			radii.append(lerpf(0.075, 0.022, pow(t, 0.7)))
		tube(path, radii, 7, st)

	st.index()
	st.generate_normals()
	return st.commit()

## Anemone : une couronne de doigts charnus evases autour d'un disque central.
static func anemone(seed_value: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var fingers := rng.randi_range(9, 14)
	for f in fingers:
		var a := TAU * float(f) / float(fingers) + rng.randf_range(-0.12, 0.12)
		var out_r := rng.randf_range(0.30, 0.52)
		var height := rng.randf_range(0.28, 0.46)
		var path := PackedVector3Array()
		var radii := PackedFloat32Array()
		var steps := 5
		for i in steps + 1:
			var t := float(i) / float(steps)
			# le doigt part vers le haut puis se couche vers l'exterieur
			var radial: float = out_r * sin(t * PI * 0.5)
			var y: float = height * sin(t * PI * 0.62)
			path.append(Vector3(cos(a) * radial, y, sin(a) * radial))
			radii.append(lerpf(0.055, 0.014, t))
		tube(path, radii, 6, st)

	# bulbe central : c'est lui qui porte la lueur
	var bulb := blob(seed_value + 91, 8, 10, 1.0, 0.12, 3.0, 0.05, 0.7, -0.5, 0.6)
	_append_mesh(st, bulb, 0.16, Vector3(0.0, 0.10, 0.0))

	st.index()
	st.generate_normals()
	return st.commit()

## Recopie un maillage dans un SurfaceTool, mis a l'echelle et decale.
static func _append_mesh(st: SurfaceTool, mesh: ArrayMesh, scale: float,
		offset: Vector3) -> void:
	if mesh == null or mesh.get_surface_count() == 0:
		return
	var arrays: Array = mesh.surface_get_arrays(0)
	var vs: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var raw: Variant = arrays[Mesh.ARRAY_INDEX]
	if raw is PackedInt32Array and (raw as PackedInt32Array).size() > 0:
		var ids: PackedInt32Array = raw
		for i in ids.size():
			st.add_vertex(vs[ids[i]] * scale + offset)
	else:
		for v in vs:
			st.add_vertex(v * scale + offset)

## Grand corail en eventail : pied strie qui s'ouvre en chapeau.
static func sea_flower(seed_value: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var flare := rng.randf_range(0.85, 1.25)
	var profile := PackedVector2Array([
		Vector2(0.05, 0.00), Vector2(0.13, 0.06), Vector2(0.10, 0.22),
		Vector2(0.085, 0.55), Vector2(0.095, 0.85), Vector2(0.16, 1.02),
		Vector2(0.55 * flare, 1.20), Vector2(0.78 * flare, 1.34),
		Vector2(0.80 * flare, 1.46), Vector2(0.60 * flare, 1.56),
		Vector2(0.26 * flare, 1.60), Vector2(0.04, 1.58),
	])
	return MeshBuilder.lathe(profile, 26, false, Vector2(3.0, 1.0))

## Petit corail en table : disque epais sur un pied court.
static func table_coral(seed_value: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var w := rng.randf_range(0.75, 1.15)
	var profile := PackedVector2Array([
		Vector2(0.06, 0.00), Vector2(0.11, 0.08), Vector2(0.09, 0.30),
		Vector2(0.14, 0.42), Vector2(0.55 * w, 0.50), Vector2(0.80 * w, 0.54),
		Vector2(0.82 * w, 0.62), Vector2(0.55 * w, 0.66), Vector2(0.12, 0.64),
		Vector2(0.0, 0.60),
	])
	return MeshBuilder.lathe(profile, 24, false, Vector2(3.0, 1.0))
