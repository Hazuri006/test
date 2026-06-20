extends Control
## In-game developer console (toggle with F2). Provides QA commands: give items,
## advance quests, teleport between levels, set flags, trigger endings, manage saves.
## Disabled by default and only built when running a debug build.

var _input_line: LineEdit
var _output: RichTextLabel

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	UITheme.apply(self)
	set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	visible = false
	var panel: PanelContainer = PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	panel.custom_minimum_size = Vector2(0, 220)
	panel.position = Vector2(0, -220)
	add_child(panel)
	var vb: VBoxContainer = VBoxContainer.new()
	panel.add_child(vb)
	_output = RichTextLabel.new()
	_output.bbcode_enabled = true
	_output.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_output.custom_minimum_size = Vector2(0, 170)
	_output.add_theme_font_size_override("normal_font_size", 14)
	_output.text = "[color=#c79b5a]THE LAST WARD console — type 'help'.[/color]"
	vb.add_child(_output)
	_input_line = LineEdit.new()
	_input_line.placeholder_text = "command…"
	_input_line.text_submitted.connect(_on_submit)
	vb.add_child(_input_line)

func toggle() -> void:
	visible = not visible
	if visible:
		GameManager.set_mouse_captured(false)
		_input_line.grab_focus()
	elif GameManager.state == GameTypes.GameState.PLAYING:
		GameManager.set_mouse_captured(true)

func _print(line: String) -> void:
	_output.text += "\n" + line

func _on_submit(text: String) -> void:
	_input_line.clear()
	if text.strip_edges() == "":
		return
	_print("[color=#888888]> %s[/color]" % text)
	var parts: PackedStringArray = text.strip_edges().split(" ", false)
	var cmd: String = parts[0].to_lower()
	var args: PackedStringArray = parts.slice(1)
	match cmd:
		"help":
			_print("give <id> [n] | giveall | quest <q> <step> | flag <k> [0/1] | power | lockdown")
			_print("tp <level> [spawn] | ending <release|reunion|containment> | heal | hurt <n> | kill | battery | evidence <id|all> | reset")
		"give":
			_cmd_give(args)
		"giveall":
			for id: String in ["maintenance_key", "basement_key", "archive_key", "morgue_key", "generator_fuse_a", "generator_fuse_b", "fuel_can", "security_access_seal", "containment_coil", "flashlight", "flashlight_battery"]:
				GameManager.inventory.add_item(id, 3 if id == "security_access_seal" else 1)
			_print("Gave all quest items.")
		"quest":
			if args.size() >= 2:
				QuestManager.complete_step(args[0], args[1])
				_print("Completed %s / %s" % [args[0], args[1]])
			else:
				_print("usage: quest <quest_id> <step_id>")
		"flag":
			if args.size() >= 1:
				var val: bool = args.size() < 2 or args[1] == "1" or args[1] == "true"
				GameManager.set_flag(args[0], val)
				_print("flag %s = %s" % [args[0], str(val)])
		"power":
			GameManager.set_flag("power_on", true)
			_print("power_on = true")
		"lockdown":
			GameManager.set_flag("lockdown_cleared", true)
			GameManager.set_flag("ritual_solved", true)
			_print("lockdown_cleared + ritual_solved = true")
		"tp":
			if args.size() >= 1:
				var spawn: String = args[1] if args.size() >= 2 else "start"
				GameManager.load_level(args[0], spawn)
				_print("Teleporting to %s/%s" % [args[0], spawn])
		"ending":
			if args.size() >= 1:
				_cmd_ending(args[0])
		"heal":
			_player_call("heal", 100.0)
			_print("Healed.")
		"hurt":
			var dmg: float = float(args[0]) if args.size() >= 1 else 25.0
			_player_call("apply_damage", dmg)
		"kill":
			_player_call("apply_damage", 9999.0)
		"battery":
			_player_call("add_battery", 1.0)
			_print("Battery refilled.")
		"evidence":
			if args.size() >= 1 and args[0] == "all":
				for e: String in GameManager.REQUIRED_EVIDENCE:
					GameManager.add_evidence(e)
				_print("All required evidence granted.")
			elif args.size() >= 1:
				GameManager.add_evidence(args[0])
		"reset":
			SaveManager.delete_all_saves()
			_print("All saves deleted.")
		_:
			_print("[color=#d05050]unknown command: %s[/color]" % cmd)

func _cmd_give(args: PackedStringArray) -> void:
	if args.is_empty():
		_print("usage: give <item_id> [count]")
		return
	var count: int = int(args[1]) if args.size() >= 2 else 1
	if ItemDatabase.has(args[0]):
		GameManager.inventory.add_item(args[0], count)
		_print("Gave %dx %s" % [count, args[0]])
	else:
		_print("[color=#d05050]no such item: %s[/color]" % args[0])

func _cmd_ending(which: String) -> void:
	match which.to_lower():
		"release", "a", "destroy":
			GameManager.resolve_ending("destroy")
		"reunion", "b", "activate":
			GameManager.resolve_ending("activate")
		"containment", "contain", "c":
			GameManager.resolve_ending("contain")
		_:
			_print("usage: ending <release|reunion|containment>")

func _player_call(method: String, arg: Variant) -> void:
	var player: Node3D = GameManager.get_player()
	if player != null and player.has_method(method):
		player.call(method, arg)
