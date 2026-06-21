extends OmniLight3D
## Buzzing fluorescent: a constant subtle hum with occasional dying-tube flicker bursts.

var base := 1.0
var hum_phase := 0.0
var mode_timer := 0.0
var flickering := false

func _ready() -> void:
	base = light_energy
	hum_phase = randf() * TAU
	mode_timer = randf_range(3.0, 10.0)
	set_process(true)

func _process(delta: float) -> void:
	hum_phase += delta * TAU * 8.0
	mode_timer -= delta
	var hum := 1.0 + sin(hum_phase) * 0.04
	if flickering:
		light_energy = base * hum * randf_range(0.05, 0.9)
		if mode_timer <= 0.0:
			flickering = false
			mode_timer = randf_range(4.0, 13.0)
	else:
		light_energy = base * hum
		if mode_timer <= 0.0:
			flickering = true
			mode_timer = randf_range(0.08, 0.5)
