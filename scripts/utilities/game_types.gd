class_name GameTypes
extends RefCounted
## Central definitions for enums, physics layers and shared constants used across
## THE LAST WARD. Kept as a RefCounted with only static members so it never needs
## to be instanced; reference values as GameTypes.SomeEnum.VALUE.

## High level game flow states tracked by GameManager.
enum GameState {
	BOOT,
	MAIN_MENU,
	LOADING,
	PLAYING,
	PAUSED,
	CUTSCENE,
	DEAD,
	ENDING,
}

## The Hollow Attendant AI states (section 10 of the design brief).
enum MonsterState {
	DORMANT,
	PATROL,
	INVESTIGATE,
	SEARCH,
	SUSPICIOUS,
	STALK,
	CHASE,
	ATTACK,
	LOST_TARGET,
	RETURN_TO_PATROL,
	SCRIPTED_EVENT,
	STUNNED,
}

## Surface materials drive footstep audio and noise emission.
enum SurfaceType {
	CONCRETE,
	TILE,
	METAL,
	WOOD,
	WATER,
	GRASS,
	DIRT,
	CARPET,
}

## Item categories for the inventory.
enum ItemCategory {
	KEY,
	BATTERY,
	MEDICAL,
	QUEST,
	DOCUMENT,
	TOOL,
	FUSE,
	AUDIO_LOG,
}

## Difficulty presets. Story is the most forgiving, Nightmare the harshest.
enum Difficulty {
	STORY,
	NORMAL,
	HARD,
	NIGHTMARE,
}

## The three reachable endings plus a NONE sentinel.
enum Ending {
	NONE,
	RELEASE,
	REUNION,
	CONTAINMENT,
}

## Physics layer bit values. Layer index N corresponds to bit (1 << (N - 1)).
## Mirrors the [layer_names] block in project.godot.
const LAYER_WORLD: int = 1 << 0
const LAYER_PLAYER: int = 1 << 1
const LAYER_MONSTER: int = 1 << 2
const LAYER_INTERACTABLE: int = 1 << 3
const LAYER_HIDEABLE: int = 1 << 4
const LAYER_SOUND_AREA: int = 1 << 5
const LAYER_DYNAMIC_PROP: int = 1 << 6
const LAYER_VISION_BLOCKER: int = 1 << 7

## Convenience: everything the interaction ray and vision checks treat as solid.
const MASK_SOLID_WORLD: int = LAYER_WORLD | LAYER_DYNAMIC_PROP
const MASK_VISION_OBSTRUCTION: int = LAYER_WORLD | LAYER_VISION_BLOCKER | LAYER_DYNAMIC_PROP

## Returns a human readable name for a monster state (used by the debug overlay).
static func monster_state_name(state: int) -> String:
	match state:
		MonsterState.DORMANT: return "DORMANT"
		MonsterState.PATROL: return "PATROL"
		MonsterState.INVESTIGATE: return "INVESTIGATE"
		MonsterState.SEARCH: return "SEARCH"
		MonsterState.SUSPICIOUS: return "SUSPICIOUS"
		MonsterState.STALK: return "STALK"
		MonsterState.CHASE: return "CHASE"
		MonsterState.ATTACK: return "ATTACK"
		MonsterState.LOST_TARGET: return "LOST_TARGET"
		MonsterState.RETURN_TO_PATROL: return "RETURN_TO_PATROL"
		MonsterState.SCRIPTED_EVENT: return "SCRIPTED_EVENT"
		MonsterState.STUNNED: return "STUNNED"
		_: return "UNKNOWN"

## Returns a display label for a difficulty value.
static func difficulty_name(value: int) -> String:
	match value:
		Difficulty.STORY: return "Story"
		Difficulty.NORMAL: return "Normal"
		Difficulty.HARD: return "Hard"
		Difficulty.NIGHTMARE: return "Nightmare"
		_: return "Normal"

## Returns a display label for an ending value.
static func ending_name(value: int) -> String:
	match value:
		Ending.RELEASE: return "Release"
		Ending.REUNION: return "Reunion"
		Ending.CONTAINMENT: return "Containment"
		_: return "Undetermined"

## Returns a label for an item category, used by the inventory UI tabs.
static func category_name(value: int) -> String:
	match value:
		ItemCategory.KEY: return "Keys"
		ItemCategory.BATTERY: return "Batteries"
		ItemCategory.MEDICAL: return "Medical"
		ItemCategory.QUEST: return "Quest"
		ItemCategory.DOCUMENT: return "Documents"
		ItemCategory.TOOL: return "Tools"
		ItemCategory.FUSE: return "Components"
		ItemCategory.AUDIO_LOG: return "Recordings"
		_: return "Misc"
