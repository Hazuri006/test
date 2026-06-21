extends Control
## Modal audio-log player. Plays a timed transcript (the prototype has no voiced
## audio) over a faint static loop, with a progress bar. Shown via
## GameManager.show_audio_log().

var _title: Label
var _speaker: Label
var _transcript: RichTextLabel
var _progress: Control
var _elapsed: float = 0.0
var _duration: float = 12.0
var _playing: bool = false
var _static_player: AudioStreamPlayer

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(UITheme.dim_background(0.9))

	var center: CenterContainer = CenterContainer.new()
	UITheme.full_rect(center)
	add_child(center)
	var panel: PanelContainer = UITheme.panel()
	panel.custom_minimum_size = Vector2(700, 420)
	center.add_child(panel)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	panel.add_child(vb)

	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	var rec: Label = UITheme.label("● REC", 16, UITheme.DANGER)
	head.add_child(rec)
	_title = UITheme.label("", 24, UITheme.ACCENT)
	head.add_child(_title)
	vb.add_child(head)
	_speaker = UITheme.label("", 15, UITheme.TEXT_DIM)
	vb.add_child(_speaker)
	vb.add_child(UITheme.hsep(6))

	_transcript = RichTextLabel.new()
	_transcript.bbcode_enabled = false
	_transcript.scroll_active = true
	_transcript.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_transcript.custom_minimum_size = Vector2(660, 250)
	_transcript.add_theme_color_override("default_color", UITheme.TEXT)
	_transcript.add_theme_font_size_override("normal_font_size", 18)
	vb.add_child(_transcript)

	_progress = UITheme.bar(660, 8, UITheme.ACCENT)
	vb.add_child(_progress)

	var close: Button = UITheme.button("Close  (E / Esc)", 200)
	close.pressed.connect(_close)
	vb.add_child(close)

	_static_player = AudioStreamPlayer.new()
	_static_player.bus = "Voice"
	_static_player.stream = AudioManager._resolve("static")
	_static_player.volume_db = -16.0
	add_child(_static_player)

func play_log(log_data: AudioLogData) -> void:
	_title.text = log_data.title
	_speaker.text = log_data.speaker
	_transcript.text = log_data.transcript
	_duration = maxf(log_data.duration, 2.0)
	_elapsed = 0.0
	_playing = true
	_static_player.play()
	if SettingsManager.subtitles_enabled():
		GameManager.show_subtitle(log_data.transcript, _duration)

func _process(delta: float) -> void:
	if not _playing:
		return
	_elapsed += delta
	UITheme.set_bar(_progress, clampf(_elapsed / _duration, 0.0, 1.0))
	if _elapsed >= _duration:
		_playing = false
		_static_player.stop()

func _close() -> void:
	_static_player.stop()
	AudioManager.play_ui("back")
	GameManager.close_overlay()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") or event.is_action_pressed("interact"):
		_close()
		get_viewport().set_input_as_handled()
