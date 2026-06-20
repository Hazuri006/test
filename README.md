# THE LAST WARD

A first‑person psychological survival‑horror prototype built in **Godot 4.6.x**.

Elias Morel, an investigative journalist, follows his missing sister's last
recording into the abandoned **Saint Veyra Hospital**. The entrance collapses
behind him. Somewhere below, Doctor Voss's experiments made something out of the
patients' fear — *The Hollow Attendant* — and it does not want the lower ward
opened. Restore the power, decode the archive, descend, and decide how it ends.

> This is a **playable prototype** with a complete vertical slice of every system
> in the design brief. The environment is built from **procedural fallback
> geometry** so the game runs with zero external art; see
> [Replacing fallback assets](#installing--replacing-fallback-assets) to drop in
> real models.

---

## Requirements

- **Godot 4.6.x stable** (developed and validated on **4.6.3‑stable**). Download from
  <https://godotengine.org/download> or the
  [godot-builds releases](https://github.com/godotengine/godot-builds/releases).
- No C#/.NET, no external plugins, no external assets required to run.
- Renderer: **Forward+**. Physics: **Jolt** (engine default in 4.6).

### Target hardware (medium preset → ~60 FPS)
Windows 10/11 · Ryzen 5 5500 · RTX 3050 8 GB · 16 GB RAM · 1920×1080.

---

## How to open the project

1. Launch Godot 4.6.x.
2. **Import** → select `project.godot` in this folder → **Import & Edit**.
3. Godot imports resources on first open (a few seconds).

## How to launch the game

- In the editor, press **F5** (Run Project). The main scene is
  `res://scenes/Main.tscn`, which boots straight to the main menu.
- **New Game** → choose a difficulty to begin.
- From a terminal (no editor):
  ```
  godot --path /path/to/project
  ```

### Headless QA flags (used by the automated checks)
```
godot --headless --path . --test-newgame        # boot straight into the exterior
godot --headless --path . --test-flow            # auto-complete every quest + ending
godot --headless --path . --test-save            # save/load round-trip check
godot --headless --path . "--test-level=lower"   # build a single level in isolation
```

---

## Controls

| Action | Key |
|---|---|
| Move | **W A S D** |
| Look | **Mouse** |
| Sprint | **Shift** (hold/toggle in settings) |
| Crouch | **Ctrl** or **C** (hold/toggle) |
| Interact / Use | **E** or **Left Mouse** |
| Cancel / exit inspection | **Right Mouse** |
| Flashlight | **F** |
| Inventory | **Tab** |
| Quest journal | **J** |
| Hold breath (while hiding) | **Space** |
| Pause | **Esc** |
| Performance overlay | **F3** |
| AI debug gizmos | **F4** |
| Debug console (debug builds) | **F2** |

The mouse is captured during play and released in menus and overlays.

---

## Story & progression (5 main quests, 3 endings)

1. **Enter the Hospital** — cross the forest, find the maintenance building, take the
   flashlight, reach reception.
2. **Restore Emergency Power** — find the electrical map, two fuses and fuel; repair
   the basement generator. *Power wakes the Attendant.*
3. **Find Lena's Records** — reach the archive (key), read the patient files, solve
   the calendar keypad (`9861`), play Lena's recording.
4. **Open the Lower Ward** — gather three access seals, use the CCTV terminal,
   override the security lockdown, search the morgue, survive the encounter, take the
   lift down.
5. **Stop the Experiment** — solve the ritual symbols, recover Lena's final
   recording, prime the containment device, and choose.

**Endings** (tracked by your choice and collected evidence):
- **A — Release** (destroy the machine)
- **B — Reunion** (activate the machine)
- **C — Containment** (only if you gathered all five key pieces of evidence)

---

## Project structure

```
res://
  project.godot          Forward+, Jolt, Input Map, autoloads, layers
  scenes/                Main + menus, UI, levels, player, enemies (thin wrappers)
  autoload/              GameLog, Settings, Save, Audio, Quest, Event, Game managers
  scripts/
    utilities/           GameTypes (enums/layers), MaterialLibrary, UITheme
    data/                Custom Resource types + content databases
    inventory/  quests/  interactions/  puzzles/  AI/  world/  player/  ui/
  data/                  Monster + difficulty .tres, override folders, README
  documentation/         Story timeline + architecture + export notes
```

Most `.tscn` files are intentionally thin wrappers whose script builds the node
tree in code — this keeps node references typed and avoids fragile scene paths.

### Systems implemented
Player controller · interaction component framework · inventory · quest manager ·
save/load (slots + autosave) · settings (gameplay/controls/audio/graphics +
key rebinding) · audio bus system with runtime‑synthesised sounds · horror event
manager · monster AI state machine (vision cone + LOS, hearing, navigation, attack,
locker search) · four puzzles · multiple endings · full menu/HUD suite · developer
overlay + console.

---

## Installing / replacing fallback assets

The game ships with **no external assets** and runs entirely on procedural geometry
and runtime‑synthesised audio. To add real art:

1. Read **`ASSET_DOWNLOAD_GUIDE.md`** for exact search terms, recommended **CC0**
   sources (Poly Haven, ambientCG, Freesound…) and where each file goes.
2. Place audio files at `res://assets/audio/<name>.ogg` (or `.wav`). The
   `AudioManager` automatically prefers a real file over the synthesised placeholder
   of the same name (e.g. `rain.ogg`, `heartbeat.ogg`, `whisper.ogg`).
3. Place models under `res://assets/...` and swap the relevant `WorldBuilder` /
   prop call for a `load("res://assets/.../model.glb").instantiate()`. The builders
   are isolated in `scripts/world/world_builder.gd`, so replacement is localised.
4. Record every external asset in **`ATTRIBUTION.md`** and **`ASSET_MANIFEST.json`**.

### Replacing fallback assets
Fallback geometry is created exclusively by `WorldBuilder` and the prop helpers.
Because levels call those helpers (rather than embedding meshes), you can redirect a
helper to instance a GLB once and every level benefits. Materials live in
`MaterialLibrary`; point a named material at a real PBR texture set to upgrade the
whole hospital at once.

---

## Exporting to Windows

See **`documentation/EXPORT_WINDOWS.md`** for the full walkthrough. In short:

1. Editor → **Editor → Manage Export Templates → Download and Install** (matching
   4.6.x).
2. **Project → Export → Add… → Windows Desktop**.
3. Set an output path (e.g. `build/TheLastWard.exe`), then **Export Project**.
4. Ship the `.exe` next to its generated `.pck`.

CLI alternative:
```
godot --headless --path . --export-release "Windows Desktop" build/TheLastWard.exe
```

---

## Known limitations

- Environments are **procedural blockouts**, not finished art — dense and atmospheric
  but geometric. This is by design (see the asset guide to upgrade).
- Audio is **procedurally synthesised** placeholder cues; there is no voice acting
  (audio logs play as timed transcripts/subtitles).
- The security‑camera puzzle uses stylised text feeds rather than live render
  targets, for performance and robustness.
- Lighting is real‑time (no baked lightmaps shipped) since the geometry is generated
  at runtime; baking is recommended once real static meshes replace the blockout.
- Navmesh is baked at level load; on a cold first frame the monster waits for the
  bake (sub‑second).

---

## Credits & licence

- Engine: **Godot 4.6.x** (MIT).
- All shipped geometry, materials and audio are **original procedural content**
  generated by this project — see `ATTRIBUTION.md`.

Built as a complete prototype per the design brief. See `TESTING_CHECKLIST.md` and
`DEBUG_GUIDE.md` for QA and debugging.
