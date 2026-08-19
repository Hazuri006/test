extends Node
## Banque sonore entierement generee par synthese : le projet ne depend
## d'aucun fichier audio externe. Tout est calcule au demarrage (~50 ms).
##
## Techniques utilisees :
##  * bruit blanc filtre en passe-bas a un pole -> bruit "brun" (ambiances)
##  * modulation d'amplitude lente -> ressac et respiration de l'ambiance
##  * sinus a frequence glissante + enveloppe exponentielle -> bulles, bips
##  * bruit filtre passe-bande -> souffle des mouvements de nage

const RATE := 22050

var streams: Dictionary = {}
var _pool: Array[AudioStreamPlayer] = []
var _rng := RandomNumberGenerator.new()

func _ready() -> void:
	_rng.seed = 20240617
	_build()
	for i in 12:
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		_pool.append(p)

# ------------------------------------------------------------------ synthese --
func _to_wav(samples: PackedFloat32Array, loop: bool, rate: int = RATE) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		var v: int = clampi(int(clampf(samples[i], -1.0, 1.0) * 32767.0), -32768, 32767)
		if v < 0:
			v += 65536
		bytes[i * 2] = v & 0xFF
		bytes[i * 2 + 1] = (v >> 8) & 0xFF
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	wav.stereo = false
	wav.data = bytes
	if loop:
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = samples.size()
	return wav

## Bruit filtre : cutoff en 0..1 (fraction de la frequence de Nyquist)
func _noise(count: int, cutoff: float, seed_value: int) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(count)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var y := 0.0
	for i in count:
		var x := rng.randf_range(-1.0, 1.0)
		y += cutoff * (x - y)          # passe-bas a un pole
		out[i] = y
	return out

func _normalize(s: PackedFloat32Array, peak: float = 0.9) -> PackedFloat32Array:
	var m := 0.0
	for v in s:
		m = maxf(m, absf(v))
	if m < 0.0001:
		return s
	var g := peak / m
	for i in s.size():
		s[i] *= g
	return s

func _build() -> void:
	streams["ambient_underwater"] = _to_wav(_ambient_underwater(), true)
	streams["ambient_surface"] = _to_wav(_ambient_surface(), true)
	streams["ambient_deep"] = _to_wav(_ambient_deep(), true)
	streams["bubble"] = _to_wav(_bubble(), false)
	streams["swim"] = _to_wav(_swim_stroke(), false)
	streams["pickup"] = _to_wav(_chime(880.0, 1320.0, 0.22), false)
	streams["ui_click"] = _to_wav(_chime(1500.0, 1500.0, 0.05), false)
	streams["ui_confirm"] = _to_wav(_chime(660.0, 1180.0, 0.16), false)
	streams["ui_deny"] = _to_wav(_chime(320.0, 190.0, 0.18), false)
	streams["craft_loop"] = _to_wav(_craft_loop(), true)
	streams["craft_done"] = _to_wav(_chime(520.0, 1560.0, 0.5), false)
	streams["alarm"] = _to_wav(_alarm(), false)
	streams["heartbeat"] = _to_wav(_heartbeat(), false)
	streams["break_rock"] = _to_wav(_break_rock(), false)

func _ambient_underwater() -> PackedFloat32Array:
	var n := RATE * 8
	var s := _noise(n, 0.045, 101)
	var rumble := _noise(n, 0.004, 202)
	for i in n:
		var t := float(i) / RATE
		# respiration lente du volume d'eau
		var env := 0.55 + 0.45 * sin(t * 0.42) * sin(t * 0.17 + 1.3)
		s[i] = s[i] * env * 0.55 + rumble[i] * 1.6
		# craquements lointains du recif
		s[i] += sin(t * TAU * 47.0 + sin(t * 1.1) * 3.0) * 0.012
	return _normalize(s, 0.55)

func _ambient_surface() -> PackedFloat32Array:
	var n := RATE * 8
	var s := _noise(n, 0.25, 303)
	for i in n:
		var t := float(i) / RATE
		# trains de vagues qui deferlent a des periodes non harmoniques
		var w := 0.5 + 0.5 * sin(t * 0.55)
		w *= 0.6 + 0.4 * sin(t * 0.31 + 2.1)
		s[i] *= pow(w, 2.2) * 0.9
	return _normalize(s, 0.5)

func _ambient_deep() -> PackedFloat32Array:
	var n := RATE * 8
	var s := _noise(n, 0.012, 404)
	for i in n:
		var t := float(i) / RATE
		# plaintes graves des grands fonds
		s[i] = s[i] * 1.4
		s[i] += sin(t * TAU * (38.0 + 6.0 * sin(t * 0.13))) * 0.09 \
			* (0.5 + 0.5 * sin(t * 0.21))
	return _normalize(s, 0.5)

func _bubble() -> PackedFloat32Array:
	var n := int(RATE * 0.35)
	var out := PackedFloat32Array()
	out.resize(n)
	var f0 := _rng.randf_range(420.0, 900.0)
	for i in n:
		var t := float(i) / RATE
		var env: float = exp(-t * 16.0)
		# la frequence d'une bulle monte quand elle se detache
		var f: float = f0 * (1.0 + 3.2 * t)
		out[i] = sin(t * TAU * f) * env * 0.5
	return out

func _swim_stroke() -> PackedFloat32Array:
	var n := int(RATE * 0.55)
	var s := _noise(n, 0.09, _rng.randi())
	for i in n:
		var t := float(i) / RATE
		var env: float = sin(clampf(t / 0.55, 0.0, 1.0) * PI)
		s[i] *= pow(env, 1.6) * 0.8
	return _normalize(s, 0.45)

func _chime(f_start: float, f_end: float, dur: float) -> PackedFloat32Array:
	var n := int(RATE * dur)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var t := float(i) / RATE
		var k := t / maxf(dur, 0.001)
		var f: float = lerpf(f_start, f_end, k * k)
		var env: float = exp(-t * (3.0 / maxf(dur, 0.05)))
		# fondamentale + quinte + harmonique douce -> timbre "interface"
		var v: float = sin(t * TAU * f) * 0.6
		v += sin(t * TAU * f * 1.5) * 0.25
		v += sin(t * TAU * f * 2.0) * 0.12
		out[i] = v * env * 0.7
	return out

func _craft_loop() -> PackedFloat32Array:
	var n := RATE * 2
	var out := PackedFloat32Array()
	out.resize(n)
	var noise := _noise(n, 0.3, 707)
	for i in n:
		var t := float(i) / RATE
		# bourdon du fabricateur : deux sinus battants + souffle
		var v := sin(t * TAU * 118.0) * 0.35 + sin(t * TAU * 124.0) * 0.3
		v += sin(t * TAU * 356.0) * 0.1 * (0.5 + 0.5 * sin(t * 9.0))
		v += noise[i] * 0.18
		out[i] = v * 0.5
	return _normalize(out, 0.5)

func _alarm() -> PackedFloat32Array:
	var n := int(RATE * 0.6)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var t := float(i) / RATE
		var gate := 1.0 if fmod(t, 0.2) < 0.11 else 0.0
		var env: float = exp(-fmod(t, 0.2) * 12.0) * gate
		out[i] = (sin(t * TAU * 1180.0) * 0.7 + sin(t * TAU * 1620.0) * 0.3) * env * 0.6
	return out

func _heartbeat() -> PackedFloat32Array:
	var n := int(RATE * 1.0)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var t := float(i) / RATE
		var v := 0.0
		for beat in [0.0, 0.26]:
			var dt: float = t - beat
			if dt >= 0.0:
				v += sin(dt * TAU * 52.0) * exp(-dt * 22.0) * (1.0 if beat == 0.0 else 0.7)
		out[i] = v * 0.85
	return out

func _break_rock() -> PackedFloat32Array:
	var n := int(RATE * 0.6)
	var s := _noise(n, 0.55, 909)
	var low := _noise(n, 0.03, 910)
	for i in n:
		var t := float(i) / RATE
		var env: float = exp(-t * 9.0)
		s[i] = (s[i] * 0.7 + low[i] * 2.2) * env
	return _normalize(s, 0.8)

# -------------------------------------------------------------- utilisation --
func play(name: String, volume_db: float = 0.0, pitch: float = 1.0) -> void:
	var stream: AudioStream = streams.get(name)
	if stream == null:
		return
	for p in _pool:
		if not p.playing:
			p.stream = stream
			p.volume_db = volume_db + linear_to_db(maxf(Settings.master_volume, 0.001))
			p.pitch_scale = pitch
			p.play()
			return

func play_at(name: String, node: Node3D, volume_db: float = 0.0,
		pitch: float = 1.0, max_distance: float = 40.0) -> void:
	var stream: AudioStream = streams.get(name)
	if stream == null or node == null or not node.is_inside_tree():
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = stream
	p.volume_db = volume_db + linear_to_db(maxf(Settings.master_volume, 0.001))
	p.pitch_scale = pitch
	p.max_distance = max_distance
	p.unit_size = 6.0
	p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_SQUARE_DISTANCE
	node.add_child(p)
	p.play()
	p.finished.connect(p.queue_free)

func make_looping_player(name: String, parent: Node, volume_db: float = -12.0
		) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = streams.get(name)
	p.volume_db = volume_db
	p.autoplay = false
	parent.add_child(p)
	return p
