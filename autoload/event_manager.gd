extends Node
## Reusable horror-event orchestrator (section 13). It decides WHEN events may fire
## (cooldowns, one-shot tracking, weighted ambient selection, tension escalation) and
## emits `horror_event`; dedicated listeners (levels, the effects layer) render the
## actual visuals. A few audio-only cues are played here directly so something always
## happens even before a level connects. Registered as the `EventManager` autoload.

signal horror_event(event_id: String, payload: Dictionary)

## Ambient events eligible for random selection, with relative weights.
const AMBIENT_WEIGHTS: Dictionary = {
	"light_flicker": 5.0,
	"distant_footsteps": 4.0,
	"whisper": 3.0,
	"object_fall": 3.0,
	"distant_silhouette": 2.0,
	"radio_static": 2.5,
	"shadow_move": 2.5,
	"pipe_knock": 4.0,
}

## Events that play an audio cue directly from here.
const AUDIO_CUES: Dictionary = {
	"whisper": "whisper",
	"radio_static": "static",
	"pipe_knock": "metal",
	"object_fall": "metal",
	"distant_footsteps": "step",
}

var ambient_enabled: bool = true
## 0..1 dread level; raises ambient frequency. Set by GameManager / Monster.
var tension: float = 0.0

var _cooldowns: Dictionary = {}          # event_id -> seconds remaining
var _once_fired: Dictionary = {}         # event_id -> true
var _ambient_timer: float = 18.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

func _ready() -> void:
	_rng.randomize()

func _process(delta: float) -> void:
	for key: Variant in _cooldowns.keys():
		_cooldowns[key] = maxf(0.0, float(_cooldowns[key]) - delta)
	if not ambient_enabled:
		return
	if GameManager.state != GameTypes.GameState.PLAYING:
		return
	_ambient_timer -= delta
	if _ambient_timer <= 0.0:
		request_ambient()
		# Higher tension -> shorter gaps between ambient scares.
		var base_gap: float = lerpf(34.0, 11.0, clampf(tension, 0.0, 1.0))
		_ambient_timer = base_gap + _rng.randf_range(-4.0, 4.0)

func reset() -> void:
	_cooldowns.clear()
	_once_fired.clear()
	tension = 0.0
	_ambient_timer = 18.0

## Returns true if an event is off cooldown and (when `once`) has not already fired.
func can_fire(event_id: String, once: bool = false) -> bool:
	if once and bool(_once_fired.get(event_id, false)):
		return false
	return float(_cooldowns.get(event_id, 0.0)) <= 0.0

## Fires an event if allowed. Sets its cooldown, marks one-shots, plays any audio
## cue and emits the signal. Returns whether it actually fired.
func trigger_event(event_id: String, payload: Dictionary = {}, cooldown: float = 8.0, once: bool = false) -> bool:
	if not can_fire(event_id, once):
		return false
	_cooldowns[event_id] = cooldown
	if once:
		_once_fired[event_id] = true
	if AUDIO_CUES.has(event_id):
		var pos: Variant = payload.get("position", null)
		if pos is Vector3:
			AudioManager.play_at(str(AUDIO_CUES[event_id]), pos as Vector3, -4.0)
		else:
			AudioManager.play_2d(str(AUDIO_CUES[event_id]), -8.0)
	GameLog.debug("Horror event: %s" % event_id)
	horror_event.emit(event_id, payload)
	return true

## Picks a weighted random ambient event (respecting per-event cooldowns).
func request_ambient(payload: Dictionary = {}) -> void:
	var candidates: Array[String] = []
	var weights: Array[float] = []
	for key: Variant in AMBIENT_WEIGHTS.keys():
		var id: String = str(key)
		if can_fire(id):
			candidates.append(id)
			weights.append(float(AMBIENT_WEIGHTS[key]))
	if candidates.is_empty():
		return
	var total: float = 0.0
	for w: float in weights:
		total += w
	var roll: float = _rng.randf() * total
	var chosen: String = candidates[0]
	for i: int in range(candidates.size()):
		roll -= weights[i]
		if roll <= 0.0:
			chosen = candidates[i]
			break
	trigger_event(chosen, payload, _rng.randf_range(14.0, 26.0), false)

func mark_fired(event_id: String) -> void:
	_once_fired[event_id] = true

func has_fired(event_id: String) -> bool:
	return bool(_once_fired.get(event_id, false))

# --- Serialisation -----------------------------------------------------------

func to_dict() -> Dictionary:
	return {"once_fired": _once_fired.duplicate()}

func from_dict(data: Dictionary) -> void:
	_once_fired.clear()
	var raw: Variant = data.get("once_fired", {})
	if raw is Dictionary:
		for k: Variant in (raw as Dictionary).keys():
			_once_fired[str(k)] = true
