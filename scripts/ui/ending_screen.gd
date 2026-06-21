extends Control
## Shows one of the three endings with a title and summary, then returns to menu.

const ENDINGS: Dictionary = {
	GameTypes.Ending.RELEASE: {
		"title": "ENDING A — RELEASE",
		"body": "You tear the containment coil from its cradle and drive it into the lattice. Light screams out of the machine — every stolen memory loosed at once, a hospital's worth of fear pouring back into empty heads that are no longer there to hold it.\n\nThe Hollow Attendant comes apart like wet paper. The walls of Saint Veyra come apart with it.\n\nYou run. Behind you the lower ward folds into the earth. You reach the treeline as the roof falls, and you do not look back, because you already know there is nothing of Lena left to see.\n\nYou survived. You are alone.",
	},
	GameTypes.Ending.REUNION: {
		"title": "ENDING B — REUNION",
		"body": "You throw the switch. The machine drinks the coil's charge and the lattice blazes, and for one impossible moment the Attendant's ruined face smooths into something you know — her eyes, her mouth shaping your name.\n\n'Eli.'\n\nThen the rest of it surfaces through her, all the borrowed terror, and the thing that was almost Lena opens arms far too long to be arms.\n\nYou wanted her back so badly you gave it a door. It steps through wearing your sister, and it is smiling, and it is so very glad to see you.",
	},
	GameTypes.Ending.CONTAINMENT: {
		"title": "ENDING C — CONTAINMENT",
		"body": "You read every page she left you. You know the order now: the eye, the spiral, the broken circle. Watched. Remembered. Undone.\n\nYou set the symbols and the lattice answers, folding inward, drawing the Attendant down into a silence that will not end. The maglocks seal. From the inside.\n\nThere is no version of this where the door opens again. Lena told you that. You stayed anyway.\n\nIn the dark of the sealed ward you sit with your back to the cold machine, and for the first time in three years you are not looking for her. You are with her. You are braver than she was.",
	},
}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	UITheme.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg: ColorRect = ColorRect.new()
	bg.color = Color(0.01, 0.012, 0.015, 1.0)
	UITheme.full_rect(bg)
	add_child(bg)

func show_ending(ending: int) -> void:
	var data: Dictionary = ENDINGS.get(ending, ENDINGS[GameTypes.Ending.RELEASE])
	_present(str(data["title"]), str(data["body"]))

## Presents an arbitrary ending (used by the Backrooms escape).
func show_custom(title_text: String, body_text: String) -> void:
	_present(title_text, body_text)

func _present(title_text: String, body_text: String) -> void:
	var margin: MarginContainer = MarginContainer.new()
	UITheme.full_rect(margin)
	margin.add_theme_constant_override("margin_left", 200)
	margin.add_theme_constant_override("margin_right", 200)
	margin.add_theme_constant_override("margin_top", 120)
	margin.add_theme_constant_override("margin_bottom", 80)
	add_child(margin)

	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 20)
	margin.add_child(vb)

	var title: Label = UITheme.title(title_text, 38)
	title.modulate.a = 0.0
	vb.add_child(title)

	var body: RichTextLabel = RichTextLabel.new()
	body.bbcode_enabled = false
	body.fit_content = true
	body.add_theme_color_override("default_color", UITheme.TEXT)
	body.add_theme_font_size_override("normal_font_size", 19)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.text = body_text
	body.modulate.a = 0.0
	vb.add_child(body)

	var cont: Button = UITheme.button("Continue", 260)
	cont.pressed.connect(func() -> void: GameManager.goto_main_menu())
	cont.modulate.a = 0.0
	vb.add_child(cont)

	AudioManager.stop_ambience()
	AudioManager.play_music("drone", -12.0)
	var tween: Tween = create_tween()
	tween.tween_property(title, "modulate:a", 1.0, 2.0)
	tween.tween_property(body, "modulate:a", 1.0, 2.5)
	tween.tween_property(cont, "modulate:a", 1.0, 1.5)
