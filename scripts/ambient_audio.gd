extends AudioStreamPlayer
## Procedural fluorescent hum so the level is never silent — no audio asset needed.
## The buzz swells with the global dread level.

const SR := 22050.0
var playback: AudioStreamGeneratorPlayback
var phase := 0.0
var noise_lp := 0.0

func _ready() -> void:
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = SR
	gen.buffer_length = 0.2
	stream = gen
	playing = true
	var pb := get_stream_playback()
	if pb is AudioStreamGeneratorPlayback:
		playback = pb

func _process(_delta: float) -> void:
	if playback == null:
		return
	var frames := playback.get_frames_available()
	var dread := Game.fear
	for i in frames:
		phase += 60.0 / SR
		if phase > 1.0:
			phase -= 1.0
		var hum := sin(phase * TAU) * 0.05
		var buzz := sin(phase * TAU * 2.017) * 0.02
		var n := (randf() * 2.0 - 1.0)
		noise_lp = lerp(noise_lp, n, 0.05)
		var s := (hum + buzz + noise_lp * 0.03 * (0.4 + dread)) * (0.35 + dread * 0.65)
		playback.push_frame(Vector2(s, s))
