# Stellar Frontier

A **No Man's Sky-inspired** procedural space-exploration game foundation for
**Unreal Engine 5** (C++). It implements the genuinely hard, code-heavy systems
of this genre so you can open the project, compile, and build a game on top —
rather than starting from an empty level.

> **This is an original project.** It is *inspired by* No Man's Sky's pillars
> (seamless planets, free-flight ships, exploration). It contains **no assets,
> code, branding, or content from No Man's Sky** — those are proprietary to
> Hello Games. Everything here is original.

---

## What's actually implemented (in C++)

| System | Status | Where |
| --- | --- | --- |
| **Procedural planets** — spherified-cube surface, layered 3D fractal noise (continents + ridged mountains + detail), flat oceans at sea level | ✅ Working code | `Source/StellarFrontier/Planets/` |
| **Continuous LOD** — per-face quad-tree that subdivides near the viewer and collapses at distance (orbit → ground on one actor) | ✅ Working code | `PlanetQuadTreeNode.*` |
| **Biomes** — elevation-banded colors written to vertex color for a triplanar material to read | ✅ Working code | `PlanetTypes.h`, `Planet::EvaluateColor` |
| **6-DOF flight model** — manual velocity/rotation integration, flight assist, boost, atmospheric drag, collision sweep | ✅ Working code | `Flight/Spaceship.*` |
| **Enhanced Input** — throttle / strafe / look / roll / boost / assist bindings | ✅ Working code (assign assets in-editor) | `Flight/Spaceship.cpp` |
| **Solar systems** — star + lighting, procedurally rolled planets on elliptical orbits | ✅ Working code | `Space/SolarSystem.*`, `OrbitComponent.*` |
| **Game mode** — spawns you in the ship | ✅ Working code | `Core/StellarFrontierGameMode.*` |

## What you do in the editor (can't be done as text/here)

These need the Unreal Editor and/or art assets — they're documented, not coded:

- **High-quality textures & materials** — build a triplanar planet material that
  blends rock/grass/sand/snow textures using the vertex colors and world normal.
  (Art assets come from you / Quixel Megascans / the Marketplace.)
- **The ship mesh** — assign a hull `StaticMesh` to `BP_Spaceship`.
- **Sky & atmosphere** — add `SkyAtmosphere`, `ExponentialHeightFog`,
  volumetric clouds, and a starfield skybox.
- **Maps** — create `L_SolarSystem`, drop in an `ASolarSystem`, set it as the
  default map.
- **Input assets** — create the Input Actions + Mapping Context and assign them.

See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for the exact click-by-click.

---

## Quick start

1. **Requirements:** Unreal Engine **5.7** + a C++ toolchain
   (Windows: Visual Studio 2022; macOS: Xcode; Linux: clang).
2. Clone this branch, then **right-click `StellarFrontier.uproject` →
   Generate project files** (or run from a terminal — see GETTING_STARTED).
3. Open `StellarFrontier.uproject`. When prompted to build the module, click
   **Yes**. (First build compiles all the C++ above.)
4. Follow [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) to create the map,
   input assets, and ship Blueprint, then press **Play**.

> ⚠️ The Unreal Engine itself is **not** included (it's 100+ GB and installed
> separately via the Epic Games Launcher). This repo is the *project*, not the engine.

---

## Repo layout

```
StellarFrontier.uproject      Project descriptor (UE 5.4, plugins)
Config/                       Engine/Game/Input .ini settings
Source/StellarFrontier/
  ├─ Core/                    Game mode
  ├─ Flight/                  Spaceship pawn + 6-DOF flight model
  ├─ Planets/                 Procedural planet, quad-tree LOD, noise, biomes
  └─ Space/                   Solar system + orbital mechanics
Content/                      (Art assets you create in-editor live here)
docs/                         Getting started · architecture · roadmap
PROMPT.md                     A reusable, improved version of the original brief
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for how the systems fit
together and **[docs/ROADMAP.md](docs/ROADMAP.md)** for what to build next
(async chunk generation, atmospheric scattering, save system, resources…).
