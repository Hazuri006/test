class_name LockedDoor
extends Door
## A door that requires a key item, a world flag, or is jammed from the far side.
## Once unlocked it behaves exactly like a normal Door.

@export var required_key_id: String = ""
## Optional flag that must be true to open (e.g. "security_lockdown_cleared").
@export var required_flag: String = ""
## If true the door can never be opened from this side (story barrier).
@export var jammed: bool = false
@export var jammed_message: String = "The door is blocked from the other side."

var _unlocked: bool = false

func _setup() -> void:
	super._setup()
	prompt_verb = "Unlock"

func can_interact(_player: Node) -> bool:
	if not enabled:
		return false
	if jammed:
		return false
	if _unlocked or _open:
		return true
	return _meets_requirements()

func _meets_requirements() -> bool:
	if required_key_id != "" and not GameManager.inventory.has_item(required_key_id):
		return false
	if required_flag != "" and not GameManager.get_flag_bool(required_flag):
		return false
	return true

func get_prompt() -> String:
	if jammed:
		return jammed_message
	if not _unlocked and not _open and not _meets_requirements():
		if required_key_id != "":
			var data: ItemData = ItemDatabase.get_item(required_key_id)
			var key_name: String = data.display_name if data != null else "a key"
			return "Requires %s" % key_name
		return "Locked"
	if not _unlocked and not _open:
		return "E — Unlock"
	return "E — %s" % get_verb()

func _on_interact(player: Node) -> void:
	if not _unlocked and not _open:
		_unlocked = true
		GameManager.notify("Unlocked.")
		AudioManager.play_at("metal", global_position, -4.0)
	super._on_interact(player)

func _on_interact_blocked(_player: Node) -> void:
	if jammed:
		GameManager.notify(jammed_message)
		AudioManager.play_at("deny", global_position, -6.0)
	else:
		GameManager.notify(get_prompt())
		AudioManager.play_at("deny", global_position, -6.0)

func _capture_state() -> Variant:
	return {"open": _open, "unlocked": _unlocked}

func _restore_state(data: Variant) -> void:
	if data is Dictionary:
		var d: Dictionary = data as Dictionary
		_unlocked = bool(d.get("unlocked", false))
		_apply_open_instant(bool(d.get("open", false)))
	elif data is bool:
		_apply_open_instant(data as bool)
