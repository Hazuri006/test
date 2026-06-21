# Debug Guide — THE LAST WARD

All debug tooling is **disabled by default** and only active in **debug builds**
(running from the editor, or any non‑release export).

## Hotkeys

| Key | Function |
|---|---|
| **F3** | Toggle the **performance overlay** (FPS, frame/physics ms, draw calls, primitives, node/object counts, static memory, preset, level, monster AI state). |
| **F4** | Toggle **AI debug gizmos** on every monster (floating state + detection label, navigation path line, last‑known‑position line). |
| **F2** | Toggle the **debug console** (commands below). |

## Debug console (F2)

Type `help` for the list. Commands:

| Command | Effect |
|---|---|
| `give <item_id> [count]` | Add an item (see ids in `scripts/inventory/item_database.gd`). |
| `giveall` | Grant all keys, fuses, fuel, 3 seals, coil, flashlight, batteries. |
| `quest <quest_id> <step_id>` | Complete a quest step (ids in `scripts/quests/quest_database.gd`). |
| `flag <key> [0/1]` | Set a world flag (e.g. `flag power_on 1`). |
| `power` | Shortcut for `flag power_on 1` (also wakes the monster). |
| `lockdown` | Sets `lockdown_cleared` + `ritual_solved`. |
| `tp <level> [spawn]` | Teleport/load a level: `exterior`, `interior`, `basement`, `lower`, `lab`. |
| `ending <release\|reunion\|containment>` | Jump straight to an ending (also `a/b/c`). |
| `heal` / `hurt <n>` / `kill` | Adjust player health. |
| `battery` | Refill the flashlight. |
| `evidence <id\|all>` | Grant an evidence id, or all required evidence (enables Containment). |
| `reset` | Delete all save slots. |

### Recipes
- **Reach any level fast:** `power` → `lockdown` → `tp lower`.
- **Test Containment ending:** `evidence all` → `giveall` → `tp lab` → use the
  containment device (install coil, choose *Perform the containment*).
- **Test a chase:** `power` (wakes the monster) → walk into its vision cone, watch
  the F3 overlay's `Monster:` line escalate `PATROL → SUSPICIOUS → CHASE → ATTACK`.

## Headless / command‑line hooks

For automated QA without the editor (used by `TESTING_CHECKLIST.md`):

```
godot --headless --path . --test-newgame          # boot into the exterior
godot --headless --path . --test-flow             # auto-complete all quests + ending
godot --headless --path . --test-save             # save/load round-trip, prints result
godot --headless --path . "--test-level=<id>"      # build one level (sets gating flags)
```
These are handled in `scripts/main.gd → _maybe_run_test_hooks()`.

## Resetting saves

- Console: `reset`.
- Or delete the save folder: `user://saves/` (on Windows:
  `%APPDATA%\Godot\app_userdata\The Last Ward\saves\`). Settings live in
  `user://settings.cfg` next to it.

## Tuning the monster / difficulty

- `data/monster/hollow_attendant.tres` — speeds, vision, hearing, detection rates,
  attack values (hot‑editable in the editor inspector).
- `data/difficulty/*.tres` — aggression/detection/battery/damage multipliers,
  indicator + hint toggles, starting battery.

## Where AI state comes from
`scripts/AI/monster.gd` reports its state and detection to `GameManager`
(`report_monster_state` / `report_detection`), which the overlay and HUD read.
`get_debug_summary()` feeds the F3 line.
