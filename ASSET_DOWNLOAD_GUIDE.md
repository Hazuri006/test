# Asset Download Guide

The prototype is **fully playable without any downloads** — it generates geometry,
materials and audio at runtime. This guide is for upgrading those fallbacks with
real **CC0‑first** assets. Nothing here is required to run the game.

> Rules: prefer **CC0**. Verify every licence. Do not use ripped/commercial‑game
> assets, copyrighted movie monsters, or anything without a clear licence. Record
> each asset in `ATTRIBUTION.md` and `ASSET_MANIFEST.json`.

## Where files go

```
res://assets/
  textures/      wall/floor/metal/tile PBR sets (albedo, normal, roughness, ao)
  environment/   forest, rocks, ground, hospital modular meshes (.glb/.gltf)
  props/         beds, wheelchairs, gurneys, cabinets, desks, lamps (.glb)
  monster/       humanoid model + animations (.glb)
  characters/    optional player hands (.glb)
  audio/         ambience and SFX (.ogg preferred, .wav ok)
  materials/     optional Godot .tres materials referencing the textures
```

## How the fallbacks auto‑upgrade

- **Audio** — `AudioManager._resolve(name)` checks `res://assets/audio/<name>.ogg`
  then `.wav` **before** falling back to the synthesised cue. So dropping in
  `rain.ogg`, `thunder.ogg`, `heartbeat.ogg`, `whisper.ogg`, `static.ogg`,
  `step.ogg`, `door.ogg`, `metal.ogg`, `hum.ogg`, `drone.ogg`, `breath.ogg`,
  `sting.ogg`, `click.ogg`, `confirm.ogg`, `back.ogg`, `deny.ogg`, `pickup.ogg`,
  `page.ogg` immediately replaces the matching placeholder — **no code change**.
- **Textures** — point a named material in `MaterialLibrary` at a texture set, e.g.
  set `albedo_texture`, `normal_texture`, `roughness` in `concrete_wall()`.
- **Models** — replace a `WorldBuilder` prop helper body (e.g. `hospital_bed`) with
  `load("res://assets/props/hospital_bed.glb").instantiate()`; every level updates.

## Recommended sources & search terms

### Textures — ambientCG (CC0) · <https://ambientcg.com>
Search: `Concrete Wall`, `Plaster Damaged`, `Tiles Hospital`, `Metal Rust`,
`Wood Old`, `Ground Wet`. Download the 2K PBR ZIP → `res://assets/textures/`.

### Environment / props — Poly Haven (CC0) · <https://polyhaven.com>
Models: `rock`, `tree`, `dead tree`, `barrel`, `pipe`. Textures: `forest floor`,
`mud`, `rock`. HDRIs optional (we use a dark interior; not required).

### Props / monster — Sketchfab (filter: Downloadable + CC0/CC‑BY)
Search: `hospital bed`, `wheelchair`, `morgue tray`, `medical cabinet`,
`mannequin`, `slender humanoid`. **Verify the licence on each model page.**
Prefer **glTF/GLB**; if only FBX is offered, import it in Godot (it converts on
import) or convert to GLB.

### Audio — Freesound (filter: CC0) · <https://freesound.org>
Search: `rain loop`, `thunder`, `wind howl`, `fluorescent buzz`, `pipe knock`,
`heartbeat`, `radio static`, `whisper`, `footstep concrete`, `metal impact`,
`breathing`. Export to OGG, name them as listed above, drop into
`res://assets/audio/`.

### Godot Asset Library
Inside the editor: **AssetLib** tab → search `horror`, `first person`, `hospital`.
Verify each add‑on's licence before use.

## If a download is unavailable
Do nothing — the game keeps running on the procedural fallbacks. Add assets
incrementally; each file you add upgrades exactly one fallback and is picked up on
the next launch (audio) or scene rebuild (geometry/materials).
