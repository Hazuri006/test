# Architecture

## Philosophy
- **Autoload singletons** own global state and orchestration.
- **Custom `Resource` types** define data; **code databases** are the runtime source
  of truth (with `.tres` override support) so a missing data file can never break the
  build.
- **Thin `.tscn` wrappers + code‑built node trees.** Most scenes are a root node with
  a script that constructs children in `_ready()`. This keeps every node reference
  statically typed and eliminates fragile node‑path strings and missing‑resource
  errors — the key to a project that imports and runs cleanly.
- **Strict static typing** everywhere; Variant values from dictionaries are cast
  explicitly (audited with `untyped_declaration`/`inference_on_variant` as errors → 0).
- **Signals + components**, no circular `extends`.

## Autoloads (load order matters)
1. `GameLog` — logging (named to avoid Godot 4.6's native `Logger` class).
2. `SettingsManager` — `ConfigFile` persistence; applies audio/window/graphics/keybinds.
3. `SaveManager` — JSON slots + autosave; validates every field.
4. `AudioManager` — bus layout, pooled 3D one‑shots, runtime sound synthesis.
5. `QuestManager` — quest state, dynamic objectives, journal, auto‑chaining.
6. `EventManager` — horror‑event timing (cooldowns, one‑shots, weighted ambient,
   tension).
7. `GameManager` — the spine: game state, inventory, world flags/state, evidence,
   choices, scene/level transitions, pause/death/endings, overlays.

## Scene flow
`Main.tscn` (bootstrap) builds the layer structure (WorldHost, HUD/Menu/Debug/
Transition `CanvasLayer`s, fade) and calls `GameManager.bind_main(...)`. GameManager
then drives: **MainMenu → (new/continue) → load_level → Player spawn + HUD → pause /
overlays / death / ending**. Levels are instanced into WorldHost; the Player is
instanced per level and its state (health/stamina/battery) persists across
transitions via `get_state()/set_state()`.

## Persistence model
- **Global, easily‑saved state** lives on `GameManager`: `inventory`, `world_flags`,
  `world_state` (per‑object, keyed by `persistent_id`), `collected_evidence`,
  `player_choices`, unlocked documents/logs.
- Interactables with a `persistent_id` push/pull their own small state to
  `GameManager.world_state`, so picked‑up items / opened doors / solved puzzles
  survive save→reload and level revisits without serialising the scene tree.
- `SaveManager` snapshots `GameManager` + `QuestManager` + `EventManager` into JSON.

## Interaction framework
`Interactable` (StaticBody3D on the Interactable physics layer) is the base for
`Door`, `LockedDoor`, `PickupItem`, `DocumentPickup`, `AudioLogPickup`,
`HidingLocker`, `LevelDoor`, `Lever`, `InspectClue`, and the puzzle interactables.
The player's `RayCast3D` masks only the Interactable layer; whatever it hits is the
interactable. Doors also occupy the World layer (collision toggled when open).

## Monster
`Monster` (CharacterBody3D + NavigationAgent3D) runs a 12‑state machine driven by a
detection meter fed by a **vision cone + line‑of‑sight raycast** and a **hearing**
API (`hear_noise`) that the player and doors call. It reports state/detection to
`GameManager` for the HUD and overlay, opens doors in its path, searches lockers,
and is tuned by `MonsterConfig` × `DifficultyConfig`.

## World construction
`WorldBuilder` (static) creates all geometry/props from primitives with
`MaterialLibrary` PBR materials; `LevelBase` provides the `WorldEnvironment`
(fog/exposure/SSAO/SSR from settings), bakes a `NavigationMesh` from the static
geometry, manages spawns, ambience, the monster spawn helper, and horror‑event light
handling. The five levels subclass `LevelBase` and implement `_build_level()`.

## Directory map
```
autoload/     game_log, settings_manager, save_manager, audio_manager,
              quest_manager, event_manager, game_manager
scripts/
  utilities/  game_types, material_library, ui_theme, main (bootstrap)
  data/       item/quest/quest_step/document/audio_log/monster/difficulty Resources
              + document_database, audio_log_database
  inventory/  inventory, item_database
  quests/     quest_database
  interactions/ interactable + subclasses
  puzzles/    generator, keypad_door, ritual_dial/puzzle, camera_terminal, ending_console
  AI/         monster
  world/      world_builder, level_base, trigger_volume, the 5 levels
  player/     player, flashlight
  ui/         menus, hud, overlays, debug overlay/console
```
