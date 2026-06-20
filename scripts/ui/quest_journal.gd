extends Control
## Quest journal overlay: tabs for Quests, Evidence (documents) and Recordings
## (audio logs). Re-read documents / replay recordings from here.

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
	panel.custom_minimum_size = Vector2(840, 560)
	center.add_child(panel)
	var root: VBoxContainer = VBoxContainer.new()
	panel.add_child(root)
	root.add_child(UITheme.title("JOURNAL", 30))

	var tabs: TabContainer = TabContainer.new()
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(tabs)
	tabs.add_child(_build_quests_tab())
	tabs.add_child(_build_evidence_tab())
	tabs.add_child(_build_recordings_tab())

	var close: Button = UITheme.button("Close  (J / Esc)", 240)
	close.pressed.connect(_close)
	root.add_child(close)

func _scroll(tab_name: String) -> ScrollContainer:
	var s: ScrollContainer = ScrollContainer.new()
	s.name = tab_name
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	return s

func _build_quests_tab() -> ScrollContainer:
	var s: ScrollContainer = _scroll("Quests")
	var vb: VBoxContainer = VBoxContainer.new()
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vb.add_theme_constant_override("separation", 10)
	s.add_child(vb)
	var journal: Array[Dictionary] = QuestManager.get_journal()
	if journal.is_empty():
		vb.add_child(UITheme.label("No active quests.", 16, UITheme.TEXT_DIM))
	for quest: Dictionary in journal:
		var color: Color = UITheme.TEXT_DIM if bool(quest["complete"]) else UITheme.ACCENT
		var title_text: String = str(quest["title"])
		if bool(quest["complete"]):
			title_text += "  (complete)"
		elif bool(quest["active"]):
			title_text += "  ◂ active"
		vb.add_child(UITheme.label(title_text, 20, color))
		vb.add_child(UITheme.label(str(quest["summary"]), 15, UITheme.TEXT_DIM))
		for step: Dictionary in (quest["steps"] as Array):
			var done: bool = bool(step["complete"])
			var mark: String = "  ✓ " if done else "  •  "
			var step_color: Color = UITheme.TEXT_DIM if done else UITheme.TEXT
			vb.add_child(UITheme.label(mark + str(step["description"]), 16, step_color))
		vb.add_child(UITheme.hsep(8))
	return s

func _build_evidence_tab() -> ScrollContainer:
	var s: ScrollContainer = _scroll("Evidence")
	var vb: VBoxContainer = VBoxContainer.new()
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vb.add_theme_constant_override("separation", 6)
	s.add_child(vb)
	vb.add_child(UITheme.label("Containment requires all five key pieces of evidence.", 14, UITheme.TEXT_DIM))
	vb.add_child(UITheme.label("Collected: %d" % GameManager.collected_evidence.size(), 14, UITheme.ACCENT_GREEN))
	vb.add_child(UITheme.hsep(6))
	if GameManager.unlocked_documents.is_empty():
		vb.add_child(UITheme.label("No documents recovered.", 16, UITheme.TEXT_DIM))
	for doc_id: String in GameManager.unlocked_documents:
		var doc: DocumentData = DocumentDatabase.get_doc(doc_id)
		if doc == null:
			continue
		var b: Button = UITheme.button(doc.title, 360)
		b.pressed.connect(func() -> void: GameManager.show_document(doc_id))
		vb.add_child(b)
	return s

func _build_recordings_tab() -> ScrollContainer:
	var s: ScrollContainer = _scroll("Recordings")
	var vb: VBoxContainer = VBoxContainer.new()
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vb.add_theme_constant_override("separation", 6)
	s.add_child(vb)
	if GameManager.unlocked_audio_logs.is_empty():
		vb.add_child(UITheme.label("No recordings recovered.", 16, UITheme.TEXT_DIM))
	for log_id: String in GameManager.unlocked_audio_logs:
		var log_data: AudioLogData = AudioLogDatabase.get_log(log_id)
		if log_data == null:
			continue
		var b: Button = UITheme.button("%s — %s" % [log_data.title, log_data.speaker], 360)
		b.pressed.connect(func() -> void: GameManager.show_audio_log(log_id))
		vb.add_child(b)
	return s

func _close() -> void:
	AudioManager.play_ui("back")
	GameManager.close_overlay()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("journal") or event.is_action_pressed("pause"):
		_close()
		get_viewport().set_input_as_handled()
