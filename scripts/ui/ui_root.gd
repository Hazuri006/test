extends CanvasLayer
class_name UIRoot

## Chef d'orchestre de l'interface : une seule fenetre modale a la fois,
## capture de la souris coherente, et ecran de mort.

var hud: HUD
var inventory_screen: InventoryScreen
var fabricator_screen: FabricatorScreen
var pause_menu: PauseMenu
var death_screen: Control

var player: Player
var _open_screen: Control = null

func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build()
	GameState.request_fabricator.connect(_on_request_fabricator)
	GameState.request_storage.connect(_on_request_storage)
	GameState.player_died.connect(_on_player_died)
	GameState.player_respawned.connect(_on_player_respawned)

func _build() -> void:
	hud = HUD.new()
	hud.name = "HUD"
	add_child(hud)

	inventory_screen = InventoryScreen.new()
	inventory_screen.name = "InventoryScreen"
	add_child(inventory_screen)

	fabricator_screen = FabricatorScreen.new()
	fabricator_screen.name = "FabricatorScreen"
	add_child(fabricator_screen)

	pause_menu = PauseMenu.new()
	pause_menu.name = "PauseMenu"
	pause_menu.resume_requested.connect(_close_all)
	add_child(pause_menu)

	death_screen = _build_death_screen()
	add_child(death_screen)

func _build_death_screen() -> Control:
	var root := Control.new()
	root.name = "DeathScreen"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.12, 0.0, 0.0, 0.62)
	root.add_child(bg)
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.offset_left = -260
	box.offset_right = 260
	box.offset_top = -60
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	root.add_child(box)
	var title := UITheme.label("SIGNES VITAUX PERDUS", 38, UITheme.RED)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var sub := UITheme.label("Reanimation d'urgence en cours...", 16, UITheme.TEXT_DIM)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(sub)
	return root

func bind_player(p: Player) -> void:
	player = p
	hud.bind_player(p)
	inventory_screen.bind_player(p)
	fabricator_screen.bind_player(p)

# =============================================================================
#  Entrees
# =============================================================================
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if _open_screen != null:
			_close_all()
		else:
			_open(pause_menu, true)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("inventory"):
		if _open_screen == inventory_screen:
			_close_all()
		elif _open_screen == null:
			_open(inventory_screen, false)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("toggle_quality"):
		Settings.cycle_quality()
		GameState.notify_info("Qualite : %s" % Settings.quality_name())

func _on_request_fabricator(fab: Node) -> void:
	fabricator_screen.open(fab)
	_open(fabricator_screen, false)

func _on_request_storage(_container: Node) -> void:
	GameState.notify_info("Casier : deposez vos objets depuis l'inventaire")
	_open(inventory_screen, false)

func _open(screen: Control, pause: bool) -> void:
	if _open_screen != null and _open_screen != screen:
		_hide_screen(_open_screen)
	_open_screen = screen
	if screen.has_method("open"):
		screen.call("open")
	else:
		screen.visible = true
	hud.visible = false
	GameState.release_mouse()
	if pause:
		GameState.set_paused(true)

func _hide_screen(screen: Control) -> void:
	if screen.has_method("close"):
		screen.call("close")
	else:
		screen.visible = false

func _close_all() -> void:
	if _open_screen != null:
		_hide_screen(_open_screen)
		_open_screen = null
	hud.visible = true
	GameState.set_paused(false)
	GameState.capture_mouse()

func _on_player_died() -> void:
	death_screen.visible = true
	_close_all()
	hud.visible = false

func _on_player_respawned() -> void:
	death_screen.visible = false
	hud.visible = true
