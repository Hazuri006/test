extends Control
## Gameplay HUD. Shows the interaction prompt, live objective, transient banners /
## toasts / subtitles, health / stamina / battery bars, a detection indicator and a
## fear vignette. Connects to the player (on spawn) and the manager singletons.
## Also routes Tab / J to open the inventory and journal overlays.

var _prompt: Label
var _objective_title: Label
var _objective_text: Label
var _banner: Label
var _toast: Label
var _subtitle: Label
var _health_bar: Control
var _stamina_bar: Control
var _battery_bar: Control
var _battery_label: Label
var _detection_root: Control
var _detection_bar: Control
var _vignette: ColorRect
var _hidden_label: Label
var _player: Player

func _ready() -> void:
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()
	_ignore_mouse(self)
	_connect_managers()
	if GameManager.get_player() != null:
		_bind_player(GameManager.get_player())
	_refresh_objective()

func _build() -> void:
	# Fear vignette (full screen, behind text).
	_vignette = ColorRect.new()
	UITheme.full_rect(_vignette)
	_vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_vignette.material = _make_vignette()
	add_child(_vignette)

	# Crosshair dot.
	var dot: Panel = Panel.new()
	dot.custom_minimum_size = Vector2(4, 4)
	dot.set_anchors_preset(Control.PRESET_CENTER)
	dot.position = Vector2(-2, -2)
	dot.modulate = Color(1, 1, 1, 0.5)
	add_child(dot)

	# Interaction prompt (just under centre).
	_prompt = UITheme.label("", 20, UITheme.ACCENT)
	_prompt.set_anchors_preset(Control.PRESET_CENTER)
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.position = Vector2(-150, 24)
	_prompt.custom_minimum_size = Vector2(300, 0)
	add_child(_prompt)

	# Objective tracker (top-left).
	var obj_panel: PanelContainer = UITheme.panel()
	obj_panel.position = Vector2(28, 28)
	obj_panel.custom_minimum_size = Vector2(360, 0)
	var obj_vb: VBoxContainer = VBoxContainer.new()
	obj_panel.add_child(obj_vb)
	_objective_title = UITheme.label("", 16, UITheme.ACCENT)
	_objective_text = UITheme.label("", 18, UITheme.TEXT)
	obj_vb.add_child(_objective_title)
	obj_vb.add_child(_objective_text)
	add_child(obj_panel)

	# Objective banner (upper-centre, transient).
	_banner = UITheme.label("", 26, UITheme.ACCENT)
	_banner.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.position = Vector2(-300, 110)
	_banner.custom_minimum_size = Vector2(600, 0)
	_banner.modulate.a = 0.0
	add_child(_banner)

	# Subtitle + toast (bottom-centre).
	_subtitle = UITheme.label("", 20, UITheme.TEXT)
	_subtitle.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle.position = Vector2(-450, -150)
	_subtitle.custom_minimum_size = Vector2(900, 0)
	_subtitle.modulate.a = 0.0
	add_child(_subtitle)

	_toast = UITheme.label("", 18, UITheme.ACCENT_GREEN)
	_toast.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.position = Vector2(-300, -100)
	_toast.custom_minimum_size = Vector2(600, 0)
	_toast.modulate.a = 0.0
	add_child(_toast)

	# Status bars (bottom-left).
	var status: VBoxContainer = VBoxContainer.new()
	status.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	status.position = Vector2(28, -120)
	status.add_theme_constant_override("separation", 6)
	add_child(status)
	_health_bar = _labeled_bar(status, "HEALTH", UITheme.DANGER)
	_stamina_bar = _labeled_bar(status, "STAMINA", UITheme.ACCENT)
	var battery_row: HBoxContainer = HBoxContainer.new()
	battery_row.add_theme_constant_override("separation", 8)
	status.add_child(battery_row)
	var blabel: Label = UITheme.label("LIGHT", 13, UITheme.TEXT_DIM)
	blabel.custom_minimum_size = Vector2(70, 0)
	battery_row.add_child(blabel)
	_battery_bar = UITheme.bar(180, 12, Color(0.85, 0.78, 0.3))
	battery_row.add_child(_battery_bar)
	_battery_label = UITheme.label("100%", 13, UITheme.TEXT_DIM)
	battery_row.add_child(_battery_label)

	# Detection indicator (top-centre).
	_detection_root = VBoxContainer.new()
	_detection_root.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_detection_root.position = Vector2(-90, 22)
	_detection_root.visible = false
	add_child(_detection_root)
	var eye: Label = UITheme.label("◢ AWARENESS ◣", 14, UITheme.DANGER)
	eye.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_detection_root.add_child(eye)
	_detection_bar = UITheme.bar(180, 8, UITheme.DANGER)
	_detection_root.add_child(_detection_bar)

	# Hidden indicator.
	_hidden_label = UITheme.label("Hidden — hold Space to steady your breath", 16, UITheme.TEXT_DIM)
	_hidden_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_hidden_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hidden_label.position = Vector2(-300, -200)
	_hidden_label.custom_minimum_size = Vector2(600, 0)
	_hidden_label.visible = false
	add_child(_hidden_label)

## The HUD never needs the cursor, so make every element transparent to it; this
## guarantees captured-mouse motion always reaches the player's look handler.
func _ignore_mouse(node: Node) -> void:
	for child: Node in node.get_children():
		if child is Control:
			(child as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ignore_mouse(child)

func _labeled_bar(parent: VBoxContainer, name_text: String, color: Color) -> Control:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	parent.add_child(row)
	var l: Label = UITheme.label(name_text, 13, UITheme.TEXT_DIM)
	l.custom_minimum_size = Vector2(70, 0)
	row.add_child(l)
	var b: Control = UITheme.bar(180, 12, color)
	row.add_child(b)
	return b

func _connect_managers() -> void:
	GameManager.player_spawned.connect(_bind_player)
	GameManager.toast_requested.connect(_show_toast)
	GameManager.subtitle_requested.connect(_show_subtitle)
	GameManager.objective_banner_requested.connect(_show_banner)
	GameManager.detection_changed.connect(_on_detection)
	QuestManager.objective_changed.connect(func(_q: String, _s: String, _t: String) -> void: _refresh_objective())
	QuestManager.step_completed.connect(_on_step_completed)
	QuestManager.quest_started.connect(_on_quest_started)

func _bind_player(player: Node) -> void:
	if not (player is Player):
		return
	_player = player as Player
	_player.interaction_prompt_changed.connect(func(t: String) -> void: _prompt.text = t)
	_player.health_changed.connect(func(v: float, m: float) -> void: UITheme.set_bar(_health_bar, v / m))
	_player.stamina_changed.connect(func(v: float, m: float) -> void: UITheme.set_bar(_stamina_bar, v / m))
	_player.battery_changed.connect(_on_battery)
	_player.fear_changed.connect(_on_fear)
	_player.hidden_changed.connect(func(h: bool) -> void: _hidden_label.visible = h)

# --- Updates -----------------------------------------------------------------

func _on_battery(value: float) -> void:
	UITheme.set_bar(_battery_bar, value)
	_battery_label.text = "%d%%" % int(round(value * 100.0))

func _on_fear(value: float) -> void:
	if _vignette.material is ShaderMaterial:
		(_vignette.material as ShaderMaterial).set_shader_parameter("intensity", value)

func _on_detection(value: float) -> void:
	var show: bool = SettingsManager.detection_indicator_enabled() and GameManager.difficulty_config.show_detection_indicator
	_detection_root.visible = show and value > 0.02
	if _detection_root.visible:
		UITheme.set_bar(_detection_bar, value)

func _refresh_objective() -> void:
	var quest: QuestData = QuestManager.get_active_quest()
	if quest == null:
		_objective_title.text = ""
		_objective_text.text = ""
		return
	_objective_title.text = quest.title.to_upper()
	_objective_text.text = "• " + QuestManager.get_current_objective_text()

func _on_step_completed(_quest_id: String, _step_id: String) -> void:
	_show_toast("Objective updated")
	_refresh_objective()

func _on_quest_started(quest_id: String) -> void:
	var quest: QuestData = QuestDatabase.get_quest(quest_id)
	if quest != null:
		_show_banner(quest.title)
	_refresh_objective()

# --- Transient text ----------------------------------------------------------

func _show_toast(text: String) -> void:
	_toast.text = text
	_fade_inout(_toast, 2.6)

func _show_banner(text: String) -> void:
	_banner.text = text
	_fade_inout(_banner, 3.2)

func _show_subtitle(text: String, duration: float) -> void:
	if not SettingsManager.subtitles_enabled():
		return
	_subtitle.add_theme_font_size_override("font_size", _subtitle_size())
	_subtitle.text = text
	_fade_inout(_subtitle, duration)

func _subtitle_size() -> int:
	match SettingsManager.get_int("gameplay", "subtitle_size"):
		0: return 16
		2: return 26
		_: return 20

func _fade_inout(node: Control, hold: float) -> void:
	node.modulate.a = 0.0
	var tween: Tween = create_tween()
	tween.tween_property(node, "modulate:a", 1.0, 0.25)
	tween.tween_interval(hold)
	tween.tween_property(node, "modulate:a", 0.0, 0.6)

func _unhandled_input(event: InputEvent) -> void:
	if GameManager.state != GameTypes.GameState.PLAYING:
		return
	if event.is_action_pressed("inventory"):
		GameManager.open_inventory()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("journal"):
		GameManager.open_journal()
		get_viewport().set_input_as_handled()

func _make_vignette() -> ShaderMaterial:
	var shader: Shader = Shader.new()
	shader.code = """
shader_type canvas_item;
uniform float intensity : hint_range(0.0, 1.0) = 0.0;
void fragment() {
	float d = distance(UV, vec2(0.5));
	float base = smoothstep(0.45, 0.95, d) * 0.35;
	float fear = smoothstep(0.15, 0.9, d) * intensity * 0.85;
	float r = fear * 0.25;
	COLOR = vec4(r, 0.0, 0.0, base + fear);
}
"""
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("intensity", 0.0)
	return mat
