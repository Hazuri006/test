extends Node
## AudioManager (autoload)
##
## Every sound in this game is SYNTHESISED AT RUNTIME -- there is not a single
## imported audio file, so nothing here can infringe anyone's music or SFX.
## Short effects are built as AudioStreamWAV buffers on boot; the three music
## beds (explore / combat / boss) are generated lazily the first time they are
## needed and then looped.
##
## Buses created at runtime: Master -> Music, Master -> SFX.
##
## Scene requirements: none (autoload). Creates its own AudioStreamPlayers.

const SR := 22050            ## sample rate for SFX
const MUSIC_SR := 22050
const SFX_VOICES := 12       ## round-robin voices so sounds never cut each other

var _sfx: Dictionary = {}                 ## name -> AudioStreamWAV
var _voices: Array[AudioStreamPlayer] = []
var _voice_index: int = 0
var _music_player: AudioStreamPlayer
var _music_tracks: Dictionary = {}        ## name -> AudioStreamWAV
var _current_track: String = ""
var _music_bus: int = 0
var _sfx_bus: int = 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_buses()
	_build_sfx_library()
	for i in SFX_VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		p.process_mode = Node.PROCESS_MODE_ALWAYS
		add_child(p)
		_voices.append(p)
	_music_player = AudioStreamPlayer.new()
	_music_player.bus = "Music"
	_music_player.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(_music_player)
	apply_volumes(
		float(GameState.get_setting("master_volume")),
		float(GameState.get_setting("music_volume")),
		float(GameState.get_setting("sfx_volume")))

func _setup_buses() -> void:
	# Only add the buses if the project does not already define them.
	if AudioServer.get_bus_index("Music") == -1:
		AudioServer.add_bus()
		_music_bus = AudioServer.bus_count - 1
		AudioServer.set_bus_name(_music_bus, "Music")
		AudioServer.set_bus_send(_music_bus, "Master")
	else:
		_music_bus = AudioServer.get_bus_index("Music")
	if AudioServer.get_bus_index("SFX") == -1:
		AudioServer.add_bus()
		_sfx_bus = AudioServer.bus_count - 1
		AudioServer.set_bus_name(_sfx_bus, "SFX")
		AudioServer.set_bus_send(_sfx_bus, "Master")
	else:
		_sfx_bus = AudioServer.get_bus_index("SFX")

func apply_volumes(master: float, music: float, sfx: float) -> void:
	AudioServer.set_bus_volume_db(0, linear_to_db(clampf(master, 0.0001, 1.0)))
	AudioServer.set_bus_volume_db(_music_bus, linear_to_db(clampf(music, 0.0001, 1.0)))
	AudioServer.set_bus_volume_db(_sfx_bus, linear_to_db(clampf(sfx, 0.0001, 1.0)))


# =============================================================================
#  PUBLIC API
# =============================================================================

## Plays a one-shot effect by name. `pitch` lets callers add variation.
func play(sfx_name: String, pitch: float = 1.0, volume_db: float = 0.0) -> void:
	if not _sfx.has(sfx_name):
		return
	var voice := _voices[_voice_index]
	_voice_index = (_voice_index + 1) % _voices.size()
	voice.stream = _sfx[sfx_name]
	voice.pitch_scale = clampf(pitch, 0.2, 3.0)
	voice.volume_db = volume_db
	voice.play()

## Plays a 3D-positioned effect (used for distant gunfire, impacts, traffic).
func play_at(sfx_name: String, position: Vector3, pitch: float = 1.0, max_dist: float = 60.0) -> void:
	if not _sfx.has(sfx_name) or GameState.world == null:
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = _sfx[sfx_name]
	p.bus = "SFX"
	p.pitch_scale = clampf(pitch, 0.2, 3.0)
	p.max_distance = max_dist
	p.unit_size = 8.0
	GameState.world.add_child(p)
	p.global_position = position
	p.play()
	p.finished.connect(p.queue_free)

## Cross-fades to one of: "explore", "combat", "boss", "menu".
func play_music(track: String) -> void:
	if _current_track == track:
		return
	_current_track = track
	var stream := _get_music(track)
	if stream == null:
		return
	var tween := create_tween()
	if _music_player.playing:
		tween.tween_property(_music_player, "volume_db", -30.0, 0.6)
		tween.tween_callback(func() -> void:
			_music_player.stream = stream
			_music_player.play())
	else:
		_music_player.stream = stream
		_music_player.volume_db = -30.0
		_music_player.play()
	tween.tween_property(_music_player, "volume_db", -6.0, 1.2)

func stop_music() -> void:
	_current_track = ""
	_music_player.stop()


# =============================================================================
#  SFX SYNTHESIS
# =============================================================================

func _build_sfx_library() -> void:
	# UI
	_sfx["ui_click"] = _tone_blip(880.0, 0.06, 0.35, 1400.0)
	_sfx["ui_hover"] = _tone_blip(1320.0, 0.04, 0.16, 1600.0)
	_sfx["ui_back"] = _tone_blip(440.0, 0.09, 0.3, 300.0)
	# Movement
	_sfx["jump"] = _sweep(320.0, 720.0, 0.16, 0.35, 0.4)
	_sfx["double_jump"] = _sweep(520.0, 1080.0, 0.18, 0.35, 0.5)
	_sfx["land"] = _thud(0.22, 0.55)
	_sfx["land_hard"] = _thud(0.34, 0.9)
	_sfx["step"] = _noise_burst(0.05, 0.12, 2600.0)
	_sfx["dodge"] = _noise_sweep(0.18, 0.3, 900.0, 3200.0)
	_sfx["wall_run"] = _noise_burst(0.12, 0.16, 1800.0)
	# Web
	_sfx["web_shoot"] = _web_thwip()
	_sfx["web_attach"] = _tone_blip(1600.0, 0.07, 0.3, 2400.0)
	_sfx["web_release"] = _noise_burst(0.09, 0.2, 3000.0)
	_sfx["swing_wind"] = _noise_burst(0.45, 0.14, 700.0)
	_sfx["zip"] = _sweep(200.0, 1400.0, 0.28, 0.3, 0.6)
	# Combat
	_sfx["punch"] = _punch(0.14, 0.55, 220.0)
	_sfx["punch_heavy"] = _punch(0.24, 0.9, 130.0)
	_sfx["hit"] = _noise_burst(0.1, 0.45, 900.0)
	_sfx["enemy_down"] = _sweep(420.0, 110.0, 0.4, 0.4, 0.3)
	_sfx["enemy_alert"] = _tone_blip(660.0, 0.12, 0.3, 800.0)
	_sfx["shot"] = _laser()
	_sfx["explosion"] = _explosion()
	_sfx["metal_clang"] = _metal_hit()
	_sfx["shield_break"] = _noise_sweep(0.35, 0.5, 3000.0, 400.0)
	# Mission / UI stings
	_sfx["objective"] = _arp([784.0, 1046.0, 1318.0], 0.09, 0.3)
	_sfx["mission_start"] = _arp([392.0, 523.0, 659.0, 784.0], 0.11, 0.35)
	_sfx["mission_complete"] = _arp([523.0, 659.0, 784.0, 1046.0, 1318.0], 0.1, 0.4)
	_sfx["reward"] = _arp([1046.0, 1318.0, 1568.0], 0.08, 0.3)
	_sfx["alarm"] = _alarm()
	_sfx["boss_roar"] = _boss_roar()
	_sfx["ring_pass"] = _arp([880.0, 1174.0], 0.07, 0.3)

## Makes an AudioStreamWAV from a float buffer in [-1, 1].
func _wav(samples: PackedFloat32Array, sr: int = SR, loop: bool = false) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		var v := int(clampf(samples[i], -1.0, 1.0) * 32767.0)
		bytes.encode_s16(i * 2, v)
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = sr
	w.stereo = false
	w.data = bytes
	if loop:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = samples.size()
	return w

func _env(i: int, count: int, attack: float = 0.02, curve: float = 2.0) -> float:
	var t := float(i) / float(max(count - 1, 1))
	var atk := clampf(t / max(attack, 0.0001), 0.0, 1.0)
	return atk * pow(1.0 - t, curve)

func _tone_blip(freq: float, dur: float, amp: float, freq_end: float = -1.0) -> AudioStreamWAV:
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / float(n)
		var f: float = freq if freq_end < 0.0 else lerpf(freq, freq_end, t)
		phase += TAU * f / SR
		buf[i] = sin(phase) * _env(i, n, 0.01, 3.0) * amp
	return _wav(buf)

func _sweep(f0: float, f1: float, dur: float, amp: float, noise_mix: float) -> AudioStreamWAV:
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for i in n:
		var t := float(i) / float(n)
		var f := lerpf(f0, f1, t * t)
		phase += TAU * f / SR
		var v := sin(phase) * (1.0 - noise_mix) + rng.randf_range(-1.0, 1.0) * noise_mix
		buf[i] = v * _env(i, n, 0.02, 2.4) * amp
	return _wav(buf)

func _noise_burst(dur: float, amp: float, cutoff: float) -> AudioStreamWAV:
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	var lp := 0.0
	var k: float = clampf(cutoff / float(SR), 0.01, 0.9)
	for i in n:
		lp += (rng.randf_range(-1.0, 1.0) - lp) * k
		buf[i] = lp * _env(i, n, 0.03, 2.0) * amp
	return _wav(buf)

func _noise_sweep(dur: float, amp: float, c0: float, c1: float) -> AudioStreamWAV:
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 13
	var lp := 0.0
	for i in n:
		var t := float(i) / float(n)
		var k: float = clampf(lerpf(c0, c1, t) / float(SR), 0.01, 0.9)
		lp += (rng.randf_range(-1.0, 1.0) - lp) * k
		buf[i] = lp * _env(i, n, 0.05, 1.8) * amp
	return _wav(buf)

func _thud(dur: float, amp: float) -> AudioStreamWAV:
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = 17
	var lp := 0.0
	for i in n:
		var t := float(i) / float(n)
		var f := lerpf(160.0, 45.0, sqrt(t))
		phase += TAU * f / SR
		lp += (rng.randf_range(-1.0, 1.0) - lp) * 0.08
		buf[i] = (sin(phase) * 0.8 + lp * 0.5) * _env(i, n, 0.005, 3.0) * amp
	return _wav(buf)

func _punch(dur: float, amp: float, body_freq: float) -> AudioStreamWAV:
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = 19
	var lp := 0.0
	for i in n:
		var t := float(i) / float(n)
		phase += TAU * lerpf(body_freq * 2.0, body_freq * 0.5, t) / SR
		lp += (rng.randf_range(-1.0, 1.0) - lp) * 0.35
		var click := lp * pow(1.0 - t, 8.0)
		buf[i] = (sin(phase) * 0.55 + click * 0.9) * _env(i, n, 0.004, 2.6) * amp
	return _wav(buf)

func _web_thwip() -> AudioStreamWAV:
	var dur := 0.22
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 23
	var lp := 0.0
	var phase := 0.0
	for i in n:
		var t := float(i) / float(n)
		# bright noise sweep (the spray) + a rising whistle (the line flying out)
		var k: float = clampf(lerpf(5200.0, 1200.0, t) / float(SR), 0.02, 0.9)
		lp += (rng.randf_range(-1.0, 1.0) - lp) * k
		phase += TAU * lerpf(700.0, 2600.0, t) / SR
		buf[i] = (lp * 0.75 + sin(phase) * 0.25) * _env(i, n, 0.006, 2.2) * 0.45
	return _wav(buf)

func _laser() -> AudioStreamWAV:
	var dur := 0.18
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / float(n)
		phase += TAU * lerpf(1800.0, 260.0, pow(t, 0.6)) / SR
		var square: float = 1.0 if sin(phase) > 0.0 else -1.0
		buf[i] = lerpf(sin(phase), square, 0.35) * _env(i, n, 0.005, 2.2) * 0.32
	return _wav(buf)

func _explosion() -> AudioStreamWAV:
	var dur := 0.9
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 29
	var lp := 0.0
	var lp2 := 0.0
	var phase := 0.0
	for i in n:
		var t := float(i) / float(n)
		lp += (rng.randf_range(-1.0, 1.0) - lp) * 0.25
		lp2 += (lp - lp2) * 0.05
		phase += TAU * lerpf(70.0, 28.0, t) / SR
		buf[i] = (lp2 * 1.6 + lp * 0.35 + sin(phase) * 0.5) * pow(1.0 - t, 1.9) * 0.55
	return _wav(buf)

func _metal_hit() -> AudioStreamWAV:
	var dur := 0.5
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var partials := [1.0, 2.76, 5.4, 8.93]
	var phases := [0.0, 0.0, 0.0, 0.0]
	for i in n:
		var t := float(i) / float(n)
		var v := 0.0
		for pi in partials.size():
			phases[pi] += TAU * (520.0 * float(partials[pi])) / SR
			v += sin(phases[pi]) * pow(0.55, float(pi))
		buf[i] = v * 0.25 * _env(i, n, 0.002, 3.2) * (1.0 - t * 0.2)
	return _wav(buf)

func _alarm() -> AudioStreamWAV:
	var dur := 1.2
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / float(n)
		var f := 620.0 + 220.0 * sin(t * TAU * 3.0)
		phase += TAU * f / SR
		var amp: float = 0.30 * (0.6 + 0.4 * sin(t * TAU * 3.0))
		buf[i] = sin(phase) * amp * clampf(t * 12.0, 0.0, 1.0) * clampf((1.0 - t) * 8.0, 0.0, 1.0)
	return _wav(buf)

func _boss_roar() -> AudioStreamWAV:
	var dur := 1.6
	var n := int(SR * dur)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 31
	var p1 := 0.0
	var p2 := 0.0
	var lp := 0.0
	for i in n:
		var t := float(i) / float(n)
		var f := lerpf(90.0, 42.0, t) * (1.0 + 0.08 * sin(t * TAU * 7.0))
		p1 += TAU * f / SR
		p2 += TAU * f * 1.51 / SR
		lp += (rng.randf_range(-1.0, 1.0) - lp) * 0.06
		buf[i] = (sin(p1) * 0.6 + sin(p2) * 0.25 + lp * 0.4) * _env(i, n, 0.08, 1.2) * 0.6
	return _wav(buf)

func _arp(freqs: Array, note_dur: float, amp: float) -> AudioStreamWAV:
	var per := int(SR * note_dur)
	var n := per * freqs.size()
	var buf := PackedFloat32Array()
	buf.resize(n)
	for note in freqs.size():
		var phase := 0.0
		var f := float(freqs[note])
		for i in per:
			phase += TAU * f / SR
			var idx := note * per + i
			# triangle-ish tone: sweeter than a raw sine for stingers
			var tri := asin(sin(phase)) * (2.0 / PI)
			buf[idx] = tri * _env(i, per, 0.02, 2.6) * amp
	return _wav(buf)


# =============================================================================
#  MUSIC SYNTHESIS (generated once, then looped)
# =============================================================================

func _get_music(track: String) -> AudioStreamWAV:
	if _music_tracks.has(track):
		return _music_tracks[track]
	var stream: AudioStreamWAV
	match track:
		"combat":
			stream = _make_music(132.0, [0, 3, 5, 7], 0.55, true)
		"boss":
			stream = _make_music(148.0, [0, 1, 5, 6], 0.6, true)
		"menu":
			stream = _make_music(88.0, [0, 4, 7, 11], 0.35, false)
		_:
			stream = _make_music(104.0, [0, 4, 7, 9], 0.4, false)
	_music_tracks[track] = stream
	return stream

## Builds a short looping bed: bass line + arpeggio + soft kick.
## Deliberately simple and original -- four bars, seamless loop.
func _make_music(bpm: float, scale_steps: Array, energy: float, drums: bool) -> AudioStreamWAV:
	var beat := 60.0 / bpm
	var bars := 4
	var beats := bars * 4
	var total := int(MUSIC_SR * beat * beats)
	var buf := PackedFloat32Array()
	buf.resize(total)

	var root := 110.0                     # A2
	var rng := RandomNumberGenerator.new()
	rng.seed = int(bpm) * 17 + scale_steps.size()

	# --- bass: one note per beat, walking through the scale ------------------
	var bass_phase := 0.0
	var samples_per_beat := int(MUSIC_SR * beat)
	for b in beats:
		var step: int = int(scale_steps[b % scale_steps.size()])
		var f: float = root * pow(2.0, float(step) / 12.0) * (0.5 if (b % 8) >= 4 else 1.0)
		for i in samples_per_beat:
			var idx := b * samples_per_beat + i
			if idx >= total:
				break
			bass_phase += TAU * f / MUSIC_SR
			var saw := fmod(bass_phase / TAU, 1.0) * 2.0 - 1.0
			var env := clampf(float(i) / 400.0, 0.0, 1.0) * pow(1.0 - float(i) / float(samples_per_beat), 0.8)
			buf[idx] += saw * env * 0.22 * energy

	# --- arpeggio: eighth notes, an octave up, gentle triangle ---------------
	var arp_phase := 0.0
	var eighth := samples_per_beat / 2
	for e in beats * 2:
		var step: int = int(scale_steps[(e * 3) % scale_steps.size()])
		var octave: float = 4.0 if (e % 4) < 2 else 8.0
		var f: float = root * pow(2.0, float(step) / 12.0) * octave
		for i in eighth:
			var idx := e * eighth + i
			if idx >= total:
				break
			arp_phase += TAU * f / MUSIC_SR
			var tri := asin(sin(arp_phase)) * (2.0 / PI)
			var env := pow(1.0 - float(i) / float(eighth), 2.2)
			buf[idx] += tri * env * 0.10 * energy

	# --- pad: slow sine chord for glue ---------------------------------------
	var pad1 := 0.0
	var pad2 := 0.0
	for i in total:
		var t := float(i) / float(total)
		pad1 += TAU * (root * 2.0) / MUSIC_SR
		pad2 += TAU * (root * 2.0 * pow(2.0, 7.0 / 12.0)) / MUSIC_SR
		var swell := 0.5 + 0.5 * sin(t * TAU)
		buf[i] += (sin(pad1) + sin(pad2)) * 0.05 * swell * energy

	# --- drums ---------------------------------------------------------------
	if drums:
		var lp := 0.0
		for b in beats:
			# kick on every beat, snare-ish noise on the backbeat
			var base := b * samples_per_beat
			for i in mini(samples_per_beat, int(MUSIC_SR * 0.22)):
				var idx := base + i
				if idx >= total:
					break
				var t := float(i) / (MUSIC_SR * 0.22)
				var f := lerpf(150.0, 45.0, sqrt(t))
				buf[idx] += sin(TAU * f * float(i) / MUSIC_SR) * pow(1.0 - t, 2.5) * 0.35 * energy
			if b % 2 == 1:
				var soff := base + samples_per_beat / 2
				for i in int(MUSIC_SR * 0.12):
					var idx := soff + i
					if idx >= total:
						break
					lp += (rng.randf_range(-1.0, 1.0) - lp) * 0.5
					var t := float(i) / (MUSIC_SR * 0.12)
					buf[idx] += lp * pow(1.0 - t, 2.0) * 0.16 * energy

	# --- soft clip so the loop never distorts --------------------------------
	for i in total:
		buf[i] = tanh(buf[i] * 1.4) * 0.8

	return _wav(buf, MUSIC_SR, true)
