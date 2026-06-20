extends Node
## Central audio system. Creates the bus layout (Master/Music/SFX/Ambience/Voice/
## UI/Reverb), manages music + ambience crossfades, plays UI and positional one-shot
## sounds from a pool, and synthesises a small palette of placeholder sounds at
## runtime so the prototype is audible without any external audio files.
## Registered as the `AudioManager` autoload.

const MIX_RATE: int = 22050
const POOL_SIZE: int = 16

var _synth: Dictionary = {}                       # name -> AudioStreamWAV
var _music_player: AudioStreamPlayer
var _ambience_player: AudioStreamPlayer
var _ui_player: AudioStreamPlayer
var _pool: Array[AudioStreamPlayer3D] = []
var _pool_index: int = 0

func _ready() -> void:
	_build_buses()
	_synthesize_library()

	_music_player = AudioStreamPlayer.new()
	_music_player.bus = "Music"
	add_child(_music_player)

	_ambience_player = AudioStreamPlayer.new()
	_ambience_player.bus = "Ambience"
	add_child(_ambience_player)

	_ui_player = AudioStreamPlayer.new()
	_ui_player.bus = "UI"
	add_child(_ui_player)

	for i: int in range(POOL_SIZE):
		var p: AudioStreamPlayer3D = AudioStreamPlayer3D.new()
		p.bus = "SFX"
		p.max_distance = 35.0
		p.unit_size = 4.0
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		add_child(p)
		_pool.append(p)

	# Buses now exist, so push the saved volumes into them.
	SettingsManager.apply_audio()

# --- Bus setup ---------------------------------------------------------------

func _build_buses() -> void:
	_ensure_bus("Music")
	_ensure_bus("SFX")
	_ensure_bus("Ambience")
	_ensure_bus("Voice")
	_ensure_bus("UI")
	var reverb_index: int = _ensure_bus("Reverb")
	if AudioServer.get_bus_effect_count(reverb_index) == 0:
		var reverb: AudioEffectReverb = AudioEffectReverb.new()
		reverb.room_size = 0.85
		reverb.damping = 0.4
		reverb.wet = 0.35
		AudioServer.add_bus_effect(reverb_index, reverb)

func _ensure_bus(bus_name: String) -> int:
	var idx: int = AudioServer.get_bus_index(bus_name)
	if idx == -1:
		idx = AudioServer.bus_count
		AudioServer.add_bus(idx)
		AudioServer.set_bus_name(idx, bus_name)
		AudioServer.set_bus_send(idx, "Master")
	return idx

# --- Public playback API -----------------------------------------------------

## Plays a non-positional UI sound by synth name (e.g. "click", "confirm").
func play_ui(sound_name: String) -> void:
	var stream: AudioStream = _resolve(sound_name)
	if stream == null or _ui_player == null:
		return
	_ui_player.stream = stream
	_ui_player.play()

## Plays a 2D (non-positional) effect — heartbeat, stings, breathing.
func play_2d(sound_name: String, volume_db: float = 0.0) -> void:
	var stream: AudioStream = _resolve(sound_name)
	if stream == null:
		return
	var p: AudioStreamPlayer = AudioStreamPlayer.new()
	p.bus = "SFX"
	p.stream = stream
	p.volume_db = volume_db
	add_child(p)
	p.finished.connect(p.queue_free)
	p.play()

## Plays a positional one-shot at a world position using the round-robin pool.
func play_at(sound_name: String, global_pos: Vector3, volume_db: float = 0.0) -> void:
	var stream: AudioStream = _resolve(sound_name)
	if stream == null or _pool.is_empty():
		return
	var p: AudioStreamPlayer3D = _pool[_pool_index]
	_pool_index = (_pool_index + 1) % _pool.size()
	p.global_position = global_pos
	p.stream = stream
	p.volume_db = volume_db
	p.play()

## Starts a looping ambience track (synth name or stream). Safe to call repeatedly.
func play_ambience(sound_name: String, volume_db: float = -6.0) -> void:
	var stream: AudioStream = _resolve(sound_name)
	if stream == null or _ambience_player == null:
		return
	if _ambience_player.stream == stream and _ambience_player.playing:
		return
	_ambience_player.stream = stream
	_ambience_player.volume_db = volume_db
	_ambience_player.play()

func stop_ambience() -> void:
	if _ambience_player != null:
		_ambience_player.stop()

## Plays a looping music track.
func play_music(sound_name: String, volume_db: float = -8.0) -> void:
	var stream: AudioStream = _resolve(sound_name)
	if stream == null or _music_player == null:
		return
	if _music_player.stream == stream and _music_player.playing:
		return
	_music_player.stream = stream
	_music_player.volume_db = volume_db
	_music_player.play()

func stop_music() -> void:
	if _music_player != null:
		_music_player.stop()

## Resolves a sound name to a stream: prefers an external file under
## res://assets/audio/<name>.{ogg,wav}, otherwise the synthesised placeholder.
func _resolve(sound_name: String) -> AudioStream:
	for ext: String in ["ogg", "wav"]:
		var path: String = "res://assets/audio/%s.%s" % [sound_name, ext]
		if ResourceLoader.exists(path):
			var res: Resource = ResourceLoader.load(path)
			if res is AudioStream:
				return res as AudioStream
	if _synth.has(sound_name):
		return _synth[sound_name] as AudioStream
	return null

# --- Procedural sound synthesis ---------------------------------------------

func _synthesize_library() -> void:
	_synth["click"] = _make_wav(_tone(0.04, 1100.0, 0.5, 12.0), false)
	_synth["confirm"] = _make_wav(_sweep(0.12, 600.0, 1000.0, 8.0), false)
	_synth["back"] = _make_wav(_tone(0.07, 520.0, 0.45, 10.0), false)
	_synth["deny"] = _make_wav(_buzz(0.16, 150.0), false)
	_synth["pickup"] = _make_wav(_sweep(0.16, 480.0, 900.0, 6.0), false)
	_synth["page"] = _make_wav(_noise(0.10, 0.25, 18.0), false)
	_synth["heartbeat"] = _make_wav(_heartbeat(), false)
	_synth["static"] = _make_wav(_noise(0.8, 0.4, 0.3), true)
	_synth["drone"] = _make_wav(_drone(2.0), true)
	_synth["hum"] = _make_wav(_hum(1.0), true)
	_synth["thunder"] = _make_wav(_thunder(), false)
	_synth["step"] = _make_wav(_noise(0.08, 0.30, 22.0), false)
	_synth["door"] = _make_wav(_sweep(0.4, 220.0, 90.0, 4.0), false)
	_synth["metal"] = _make_wav(_buzz(0.2, 320.0), false)
	_synth["whisper"] = _make_wav(_noise(0.6, 0.2, 1.5), false)
	_synth["sting"] = _make_wav(_sweep(0.5, 180.0, 1200.0, 2.0), false)
	_synth["breath"] = _make_wav(_noise(0.5, 0.18, 1.0), false)

func _tone(duration: float, freq: float, amp: float, decay: float) -> PackedFloat32Array:
	var count: int = int(duration * MIX_RATE)
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(count)
	for i: int in range(count):
		var t: float = float(i) / float(MIX_RATE)
		out[i] = sin(TAU * freq * t) * amp * exp(-decay * t)
	return out

func _sweep(duration: float, f0: float, f1: float, decay: float) -> PackedFloat32Array:
	var count: int = int(duration * MIX_RATE)
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(count)
	for i: int in range(count):
		var t: float = float(i) / float(MIX_RATE)
		var frac: float = float(i) / float(maxi(count, 1))
		var freq: float = lerpf(f0, f1, frac)
		out[i] = sin(TAU * freq * t) * 0.5 * exp(-decay * t)
	return out

func _buzz(duration: float, freq: float) -> PackedFloat32Array:
	var count: int = int(duration * MIX_RATE)
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(count)
	for i: int in range(count):
		var t: float = float(i) / float(MIX_RATE)
		var square: float = 1.0 if sin(TAU * freq * t) >= 0.0 else -1.0
		out[i] = square * 0.4 * exp(-4.0 * t)
	return out

func _noise(duration: float, amp: float, decay: float) -> PackedFloat32Array:
	var count: int = int(duration * MIX_RATE)
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(count)
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	for i: int in range(count):
		var t: float = float(i) / float(MIX_RATE)
		out[i] = rng.randf_range(-1.0, 1.0) * amp * exp(-decay * t)
	return out

func _drone(duration: float) -> PackedFloat32Array:
	var count: int = int(duration * MIX_RATE)
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(count)
	for i: int in range(count):
		var t: float = float(i) / float(MIX_RATE)
		out[i] = (sin(TAU * 55.0 * t) * 0.25 + sin(TAU * 82.5 * t) * 0.12) * (0.8 + 0.2 * sin(TAU * 0.3 * t))
	return out

func _hum(duration: float) -> PackedFloat32Array:
	var count: int = int(duration * MIX_RATE)
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(count)
	for i: int in range(count):
		var t: float = float(i) / float(MIX_RATE)
		out[i] = sin(TAU * 120.0 * t) * 0.10 + sin(TAU * 60.0 * t) * 0.06
	return out

func _thunder() -> PackedFloat32Array:
	var count: int = int(1.4 * MIX_RATE)
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(count)
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	var prev: float = 0.0
	for i: int in range(count):
		var t: float = float(i) / float(MIX_RATE)
		var raw: float = rng.randf_range(-1.0, 1.0)
		prev = lerpf(prev, raw, 0.05)   # low-pass for a rumble
		var env: float = exp(-2.5 * t) * (1.0 - exp(-30.0 * t))
		out[i] = prev * env * 0.9
	return out

func _heartbeat() -> PackedFloat32Array:
	var count: int = int(0.7 * MIX_RATE)
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(count)
	for i: int in range(count):
		var t: float = float(i) / float(MIX_RATE)
		var thump1: float = sin(TAU * 50.0 * t) * exp(-22.0 * t)
		var t2: float = t - 0.18
		var thump2: float = 0.0
		if t2 > 0.0:
			thump2 = sin(TAU * 45.0 * t2) * exp(-22.0 * t2) * 0.7
		out[i] = (thump1 + thump2) * 0.8
	return out

func _make_wav(samples: PackedFloat32Array, loop: bool) -> AudioStreamWAV:
	var data: PackedByteArray = PackedByteArray()
	data.resize(samples.size() * 2)
	for i: int in range(samples.size()):
		var s: float = clampf(samples[i], -1.0, 1.0)
		data.encode_s16(i * 2, int(s * 32767.0))
	var wav: AudioStreamWAV = AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.stereo = false
	wav.mix_rate = MIX_RATE
	wav.data = data
	if loop:
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = samples.size()
	return wav
