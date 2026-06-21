# Attribution

## Summary

**THE LAST WARD ships with no third‑party assets.** Every mesh, material and sound
in the prototype is generated at runtime by the project's own code:

- **Geometry** — built procedurally by `scripts/world/world_builder.gd` and the
  monster/interactable scripts from Godot primitive meshes (`BoxMesh`,
  `CylinderMesh`, `SphereMesh`).
- **Materials** — `StandardMaterial3D` instances created by
  `scripts/utilities/material_library.gd`, with a procedural detail normal map from
  `FastNoiseLite` / `NoiseTexture2D`.
- **Audio** — synthesised as 16‑bit PCM `AudioStreamWAV` at runtime by
  `autoload/audio_manager.gd` (`_synthesize_library()`).
- **Icon** — `icon.svg`, an original vector drawing in this repository.

Because there are no external assets, **no third‑party attribution is required** to
ship this prototype.

## Engine

| Component | Author | Licence | Source |
|---|---|---|---|
| Godot Engine 4.6.x | Godot contributors | MIT | <https://godotengine.org> |

## Bundled external assets (user‑supplied)

These GLB assets were provided by the project owner and added to the build. They are
used in‑game (the zombie as the monster, the pack as set dressing). **Confirm and
fill in the author/source/licence below** — both appear to be Sketchfab models, so
verify each model's page and licence before distributing.

### Zombie (HazMat) — the Hollow Attendant
- File:        `res://assets/monster/zombie_hazmat.glb`
- Used as:     player‑facing monster model + animations (Idle / Walk / EnemySpotted / Skill)
- Author:      _TODO — fill from the Sketchfab model page_
- Source:      _TODO — Sketchfab URL_
- Licence:     _TODO — verify (CC‑BY / CC0 / …); add attribution to Credits if CC‑BY_

### Hospital asset pack
- File:        `res://assets/environment/hospital_pack.glb`
- Used as:     modular décor (couch, chairs, lockers, pipes, drip stands, trays, shelves)
- Author:      _TODO — fill from the Sketchfab model page_
- Source:      _TODO — Sketchfab URL_
- Licence:     _TODO — verify; add attribution to Credits if CC‑BY_

### Backrooms maze
- File:        `res://assets/environment/backrooms.glb`
- Used as:     the entire Backrooms level environment (with generated collision)
- Author:      _TODO — fill from the Sketchfab model page_
- Source:      _TODO — Sketchfab URL_
- Licence:     _TODO — verify; add attribution to Credits if CC‑BY_

## If you add external assets

When you replace the procedural fallbacks with downloaded assets (see
`ASSET_DOWNLOAD_GUIDE.md`), **record each one here and in `ASSET_MANIFEST.json`**
using the template below, and verify the licence permits your use and redistribution.

```
### <Asset name>
- Author:        <name>
- Source:        <url to the asset page>
- Licence:       <CC0 / CC-BY 4.0 / ...>
- Attribution:   <required? text to display>
- Local path:    res://assets/<category>/<file>
```

> Do **not** add ripped game assets, copyrighted movie monsters, or anything without
> a clear licence. Prefer **CC0**. Keep attribution text visible in the in‑game
> Credits screen (`scripts/ui/main_menu.gd → _show_credits`) for CC‑BY assets.
