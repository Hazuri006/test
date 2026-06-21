# Testing Checklist — THE LAST WARD

Legend: `[x]` verified (incl. automated headless checks) · `[~]` implemented, verify
in‑editor with visuals/input · `[ ]` to test on target hardware.

## Automated headless checks (run on Godot 4.6.3‑stable)

```
godot --headless --path . --import                 # 0 script/parse errors
godot --headless --path . --test-newgame           # boots into exterior, no errors
godot --headless --path . --test-flow              # all 5 quests complete + ending
godot --headless --path . --test-save              # save/load restores state
godot --headless --path . "--test-level=interior"  # each level builds + bakes nav
godot --headless --path . "--test-level=basement"
godot --headless --path . "--test-level=lower"
godot --headless --path . "--test-level=lab"
```
- [x] Project imports with **0** parse/compile errors.
- [x] Strict‑typing audit (untyped_declaration / inference_on_variant as errors): **0**.
- [x] All five levels instantiate and bake navigation with no script errors.
- [x] Full quest chain `q1 → q5` completes; ending resolves (verified: Containment).
- [x] Save → mutate → load restores inventory, quest steps, flags, evidence, level.
- [x] Runtime scan clean (only benign forced‑quit leak note from static caches).

## Project & boot
- [x] `project.godot` valid; main scene `res://scenes/Main.tscn` set.
- [x] 7 autoloads load (GameLog, Settings, Save, Audio, Quest, Event, Game).
- [x] Input Map actions present (move/sprint/crouch/interact/flashlight/inventory/
      journal/pause/primary/secondary/hold_breath/debug_overlay/debug_ai).
- [~] Boots to main menu with title, music drone, vignette.

## Player
- [~] WASD movement with acceleration/deceleration; gravity; slopes/ramps.
- [~] Mouse look captured; sensitivity + invert‑Y from settings.
- [~] Sprint drains stamina; exhaustion blocks sprint until recovered.
- [~] Crouch lowers capsule/eye; blocked from standing under low ceilings.
- [~] Head bob (toggleable), camera sway, breathing/heartbeat with fear.
- [~] Footsteps vary by surface; emit noise the monster hears.
- [~] Collision with world and props; cannot pass closed doors.

## Flashlight
- [~] **F** toggles (only after pickup); battery drains; flicker when low; dies at 0.
- [~] Battery item refills; smoothed hand‑lag; scripted flicker hook exists.

## Interaction
- [x] Reusable `Interactable` base; ray detects on Interactable layer.
- [~] Contextual prompts ("E — Open / Read / Take …", "Requires …", jammed text).
- [~] Doors open/close (swing + collision toggle) and emit door‑noise.
- [~] Locked doors require key/flag; jammed doors show blocked message.
- [~] Pickups add items, complete steps, persist as collected.
- [~] Documents/audio logs open readers; record evidence.
- [~] Lockers: enter/exit hiding; hold breath; monster can search.

## Inventory
- [x] Add/remove/stack/quest‑protect; grouped display; save round‑trip.
- [~] Inventory UI (Tab): select, description, **Use** for battery/medical.

## Quests
- [x] 5 main quests, ordered steps, dynamic objective, journal, auto‑chain.
- [x] Step completion idempotent; quest completes when required steps done.
- [~] HUD objective updates; journal (J) shows quests/evidence/recordings.

## Puzzles
- [~] Generator: install fuses+fuel, then start → power on (Puzzle 1).
- [~] Archive keypad `9861` from calendar clue → unlocks recorder (Puzzle 2).
- [~] CCTV terminal reveals cabinet code `0451`; monster may appear (Puzzle 3).
- [~] Ritual dials Eye/Spiral/Broken‑Circle order → opens lab (Puzzle 4).
- [x] No softlocks: progression gated by power/seals/lockdown/ritual flags.

## Monster AI
- [x] State machine (Dormant→Patrol→Investigate→Search→Suspicious→Stalk→Chase→
      Attack→Lost→Return→Scripted→Stunned).
- [~] Vision cone + line‑of‑sight (no seeing through walls/closed doors).
- [~] Hearing reacts to footsteps/sprint/doors; detection meter fills/decays.
- [~] Navigation via NavigationAgent3D; opens doors ahead; searches lockers.
- [~] Attack only within range + LOS; kills on connect; respawn at checkpoint.
- [~] Aggression scales in the lower ward; F4 debug gizmos (state/path/last‑known).

## Stealth & hiding
- [~] Crouch reduces noise; sprint increases it; surfaces change loudness.
- [~] Lockers hide the player; hold breath; heartbeat rises with proximity.
- [~] Detection indicator toggleable; hidden on Nightmare.

## Horror events
- [x] Event manager with cooldowns, one‑shot persistence, weighted ambient,
      tension escalation.
- [~] Light flicker/shutdown, whispers, static, pipe knocks, distant silhouette,
      power‑restored sequence, morgue encounter, backward announcement.

## Save / checkpoint
- [x] Multiple slots + autosave (slot 0); JSON with version + validation.
- [x] Saves position/level/quests/inventory/flags/world‑state/evidence/choices.
- [x] Refuses to save while dying/ending; corrupt/missing fields handled.
- [~] Checkpoints set before basement/lower/lab; death → retry from checkpoint.

## UI / menus
- [~] Main menu (New/Continue/Load/Settings/Credits/Quit‑confirm + difficulty).
- [~] Pause (Resume/Save/Load/Settings/Main Menu); Death; Ending screens.
- [~] Document reader, audio‑log player, keypad, camera feed, ending choice.
- [~] HUD: prompt, objective, banners, toasts, subtitles, bars, detection, vignette.
- [~] UI scales via anchors/containers at 1080p/1440p/2160p.

## Settings
- [x] Gameplay/Controls/Audio/Graphics tabs; persisted to `user://settings.cfg`.
- [~] Volume sliders affect buses; graphics preset + individual options apply live.
- [~] Key rebinding persists and re‑applies on launch.

## Audio
- [x] Buses: Master/Music/SFX/Ambience/Voice/UI + Reverb.
- [~] 3D positional one‑shots (pool); ambience/music; synthesised cues audible.

## Endings
- [x] Three endings reachable; choice + evidence determine result.
- [~] Containment gated behind all five evidence pieces; ending screen fades in.

## Performance (target: RTX 3050, medium ≈ 60 FPS)
- [ ] Verify 60 FPS at 1080p medium on target GPU.
- [~] F3 overlay shows FPS/frame time/draw calls/nodes/preset/monster state.
- [~] Distance fade on lights, occlusion culling on, modest light counts.
