class_name AudioLogData
extends Resource
## A playable audio recording with an on-screen transcript / subtitles.

@export var id: String = ""
@export var title: String = "Recording"
@export var speaker: String = ""
@export_multiline var transcript: String = ""
## Playback length in seconds; used to drive the transcript timer when no stream
## is supplied (the prototype ships without voiced audio by default).
@export var duration: float = 12.0
## Optional path to an AudioStream; the log still "plays" (timed transcript) if empty.
@export var stream_path: String = ""
## Optional evidence id recorded when this log is first played (for endings).
@export var evidence_id: String = ""
