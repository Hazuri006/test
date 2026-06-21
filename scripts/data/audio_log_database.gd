class_name AudioLogDatabase
extends RefCounted
## All audio recordings in THE LAST WARD. The prototype ships without voiced audio,
## so each log "plays" as a timed transcript (subtitles) over a static cue.

static var _logs: Dictionary = {}
static var _initialised: bool = false

static func _ensure() -> void:
	if _initialised:
		return
	_initialised = true
	_build()
	_load_overrides()

static func _build() -> void:
	# --- Backrooms ---
	_add("log_br_intro", "Camcorder — Tape Start", "You", 14.0, "",
		"[REC] Okay. Okay, it's recording. I — I fell through the wall. The actual wall, I leaned on it and I fell THROUGH. [breath] If anyone finds this tape: it's all yellow. Rooms and rooms and rooms, lights buzzing, and the carpet's wet. I'm going to keep filming. I'm going to find a way out. [static]")

	_add("log_lena_intro", "Anonymous Recording", "Lena Morel", 14.0, "",
		"[static] Eli, it's me. I know how this sounds. I'm inside Saint Veyra and I can't— [crackle] —they're going to do it again, the final extraction. If anyone finds this: do not let them open the lower ward. Please. Do not let them open it. [static]")

	_add("log_voss_1", "Director's Dictation I", "Dr. Voss", 16.0, "",
		"Programme entry. The lattice hummed today without input. The duty nurse swears she saw a tall figure in attendant's whites at the end of B corridor, then nothing. I have reassured her it was a trick of the failing lights. [pause] I did not tell her the lattice was, at that moment, drawing power.")

	_add("log_voss_2", "Director's Dictation II", "Dr. Voss", 18.0, "experiment_log",
		"It is not a side effect. It is the result. Every fear I have lifted from those poor minds has gone somewhere, and the somewhere has a shape now, and the shape walks. [unsteady] It will not let me cut the power. The doors lock when I approach the breaker. I built a thing that does not wish to be unbuilt.")

	_add("log_security", "Last Patrol", "Night Guard", 13.0, "",
		"Three in the morning. Cameras keep showing the attendant on every floor at once. That's not possible, there's one feed per floor. [whisper] It's looking at the lens. On every floor it's looking right at me. I'm taking the seals and I'm going home. Whoever finds these — you'll need all three to get below.")

	_add("log_lena_1", "Lena's Log", "Lena Morel", 15.0, "",
		"Day four inside. Voss thinks I'm just a nosy journalist. I've found the procedure logs. They aren't curing anyone — they're harvesting. There's a woman here who doesn't remember her own children. [breath] I'm going to stop the final extraction even if I have to do it from the inside.")

	_add("log_lena_final", "Lena's Final Recording", "Lena Morel", 22.0, "lena_final",
		"Eli. By now you've seen what it is. It's made of everything they took, and the largest part of it is mine — I let them take it, it was the only way to get close to the lattice. [long pause] There's a containment coil in the lab. You can destroy the machine and let all of it loose, or switch it on and tell yourself you're saving me. Don't. The me you're looking for is already part of it. If you can be braver than I was: contain it. Seal the door. Even with you still inside. [static] I'm sorry I made you come all this way to lose me twice.")

static func _add(id: String, title: String, speaker: String, duration: float, evidence: String, transcript: String) -> void:
	var log_data: AudioLogData = AudioLogData.new()
	log_data.id = id
	log_data.title = title
	log_data.speaker = speaker
	log_data.duration = duration
	log_data.transcript = transcript
	log_data.evidence_id = evidence
	_logs[id] = log_data

static func _load_overrides() -> void:
	var dir: DirAccess = DirAccess.open("res://data/audio_logs")
	if dir == null:
		return
	dir.list_dir_begin()
	var f: String = dir.get_next()
	while f != "":
		if f.ends_with(".tres") or f.ends_with(".res"):
			var res: Resource = ResourceLoader.load("res://data/audio_logs/" + f)
			if res is AudioLogData and (res as AudioLogData).id != "":
				_logs[(res as AudioLogData).id] = res
		f = dir.get_next()
	dir.list_dir_end()

static func get_log(id: String) -> AudioLogData:
	_ensure()
	return _logs.get(id, null) as AudioLogData

static func has(id: String) -> bool:
	_ensure()
	return _logs.has(id)
