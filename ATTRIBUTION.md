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
