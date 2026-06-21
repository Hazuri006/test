extends ColorRect
## Smoothly feeds the dread level into the full-screen post-process shader.

var current := 0.0

func _process(delta: float) -> void:
	current = lerp(current, Game.fear, clampf(delta * 3.0, 0.0, 1.0))
	if material is ShaderMaterial:
		(material as ShaderMaterial).set_shader_parameter("fear", current)
