extends Node
## Reliable JSON save/load with multiple slots, an autosave/checkpoint slot, and
## defensive validation of every loaded field. Registered as the `SaveManager`
## autoload. Slot 0 is reserved for autosaves/checkpoints; slots 1..MAX are manual.

signal save_completed(slot: int)
signal load_completed(slot: int)

const SAVE_DIR: String = "user://saves"
const SAVE_VERSION: int = 1
const MAX_SLOTS: int = 5          # slots 1..5 are manual
const AUTOSAVE_SLOT: int = 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SAVE_DIR))
	if not DirAccess.dir_exists_absolute(SAVE_DIR):
		DirAccess.make_dir_recursive_absolute(SAVE_DIR)

func _slot_path(slot: int) -> String:
	return "%s/slot_%d.json" % [SAVE_DIR, slot]

## Writes the current game state to a slot. Refuses while dying/ending.
func save_game(slot: int) -> bool:
	if GameManager.state == GameTypes.GameState.DEAD or GameManager.state == GameTypes.GameState.ENDING:
		GameLog.warn("Save refused: cannot save while dying or in an ending.")
		return false
	var payload: Dictionary = {
		"version": SAVE_VERSION,
		"timestamp": Time.get_unix_time_from_system(),
		"datetime": Time.get_datetime_string_from_system(false, true),
		"meta": _build_meta(),
		"game": GameManager.collect_save_data(),
		"quests": QuestManager.to_dict(),
		"events": EventManager.to_dict(),
	}
	var file: FileAccess = FileAccess.open(_slot_path(slot), FileAccess.WRITE)
	if file == null:
		GameLog.error("save_game: could not open slot %d for writing (%d)." % [slot, FileAccess.get_open_error()])
		return false
	file.store_string(JSON.stringify(payload, "\t"))
	file.close()
	GameLog.info("Saved to slot %d." % slot)
	save_completed.emit(slot)
	return true

func autosave() -> void:
	save_game(AUTOSAVE_SLOT)

## Reads a slot, validates it and resumes the game there. Returns false on failure.
func load_game(slot: int) -> bool:
	var data: Dictionary = _read_slot(slot)
	if data.is_empty():
		return false
	var game_raw: Variant = data.get("game", {})
	if not (game_raw is Dictionary):
		GameLog.error("load_game: slot %d missing game block." % slot)
		return false
	var quests_raw: Variant = data.get("quests", {})
	if quests_raw is Dictionary:
		QuestManager.from_dict(quests_raw as Dictionary)
	else:
		QuestManager.reset()
	var events_raw: Variant = data.get("events", {})
	EventManager.reset()
	if events_raw is Dictionary:
		EventManager.from_dict(events_raw as Dictionary)
	load_completed.emit(slot)
	await GameManager.load_and_resume(game_raw as Dictionary)
	return true

func has_save(slot: int) -> bool:
	return FileAccess.file_exists(_slot_path(slot))

func delete_save(slot: int) -> void:
	if has_save(slot):
		DirAccess.remove_absolute(_slot_path(slot))

func delete_all_saves() -> void:
	for slot: int in range(0, MAX_SLOTS + 1):
		delete_save(slot)

## Returns lightweight metadata for the load/continue menus (no full state).
func get_metadata(slot: int) -> Dictionary:
	var data: Dictionary = _read_slot(slot)
	if data.is_empty():
		return {}
	var meta_raw: Variant = data.get("meta", {})
	var meta: Dictionary = (meta_raw as Dictionary) if meta_raw is Dictionary else {}
	meta["slot"] = slot
	meta["datetime"] = str(data.get("datetime", ""))
	meta["timestamp"] = float(data.get("timestamp", 0.0))
	return meta

## Returns the most recently written slot, or -1 if no saves exist.
func latest_slot() -> int:
	var best: int = -1
	var best_time: float = -1.0
	for slot: int in range(0, MAX_SLOTS + 1):
		if not has_save(slot):
			continue
		var meta: Dictionary = get_metadata(slot)
		var t: float = float(meta.get("timestamp", 0.0))
		if t > best_time:
			best_time = t
			best = slot
	return best

func has_any_save() -> bool:
	return latest_slot() >= 0

func _read_slot(slot: int) -> Dictionary:
	if not has_save(slot):
		return {}
	var file: FileAccess = FileAccess.open(_slot_path(slot), FileAccess.READ)
	if file == null:
		GameLog.error("_read_slot: could not open slot %d." % slot)
		return {}
	var text: String = file.get_as_text()
	file.close()
	var parsed: Variant = JSON.parse_string(text)
	if not (parsed is Dictionary):
		GameLog.error("_read_slot: slot %d is corrupt (not a JSON object)." % slot)
		return {}
	var dict: Dictionary = parsed as Dictionary
	if int(dict.get("version", 0)) != SAVE_VERSION:
		GameLog.warn("Slot %d uses save version %s (current %d); attempting to load anyway." % [slot, str(dict.get("version", 0)), SAVE_VERSION])
	return dict

func _build_meta() -> Dictionary:
	var quest: QuestData = QuestManager.get_active_quest()
	return {
		"level": GameManager.current_level_id,
		"quest_title": quest.title if quest != null else "—",
		"objective": QuestManager.get_current_objective_text(),
		"difficulty": GameTypes.difficulty_name(SettingsManager.difficulty()),
		"evidence_count": GameManager.collected_evidence.size(),
	}
