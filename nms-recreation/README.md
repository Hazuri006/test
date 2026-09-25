# No Man's Sky — hyper-real browser recreation

A single self-contained HTML file (`index.html`) that recreates the structure and systems of
No Man's Sky with a physically based, photoreal rendering style. The only dependency is
Three.js r170, loaded as an ES module through an import map from jsDelivr. Everything else
is generated in code:
- every mesh;
- every texture, drawn on canvas or in shaders;
- every sound, synthesised with Web Audio;
- all noise.

No model, image, HDRI, audio or font files are used.

## Running

Double-click `index.html`. It needs a desktop browser with WebGL2 and float render targets
(Chrome, Edge or Firefox), plus internet access the first time so Three.js can load from the CDN.

Hold **E** (or the mouse button) on the title screen, then choose **Play**, a mode, a seed
and a save slot. The mouse is captured when you click the game view. **ESC** always opens
the pause menu.

## Controls (defaults — rebindable under Controls)

| On foot | | In the starship | |
|---|---|---|---|
| W A S D | move / strafe | Mouse | pitch & yaw (mouse up = nose up) |
| Mouse | look (invert Y off) | W / S | throttle / brake |
| Shift | sprint | A / D | roll left / right |
| Space | jump, hold for jetpack | Shift | boost |
| C | crouch | Space or W (hold) | take off when landed; Space = pulse drive in space |
| LMB / RMB | multitool / aim | E | exit when landed; hold near the ground to land |
| Q | scanner pulse | G / V | switch weapon / cockpit ↔ chase view |
| E (hold) | interact | M | galaxy map (in space) |
| F / G / R | melee / grenade / reload | | |
| Tab / X / Z | inventory / quick menu / build | | |
| V / B / T / P | 3rd person / visor / torch / photo | | |
| H | summon exocraft | | |

## What is implemented

- **Lighting & shadows**
  - Physical units throughout: sun in lux from a blackbody star colour and angular size, and EV exposure from a luminance histogram.
  - 2–4 stabilised CSM cascades with PCSS: Vogel disk, blocker search and penumbra from the star's size.
  - Screen-space contact shadows.
  - Per-chunk horizon shadows for distant terrain.
  - Cloud shadows, analytic eclipses, and ring shadows.
  - Torch and landing-light spot shadows.
  - Local lights from a nearest-8 pool re-assigned every frame (true clustered culling is a `// STUB:`).
- **Global illumination & reflections**
  - Dynamic cube-map IBL: GGX prefiltered, with L2 spherical harmonics computed on the GPU.
  - Ground-bounce ambient.
  - GTAO applied only to indirect light, plus SSGI and SSR.
- **Atmosphere & volumetrics**
  - Hillaire-style atmosphere with transmittance and multi-scatter LUTs, per planet.
  - Froxel volumetric fog, lit by the sun and torch and shadowed by CSM and clouds.
  - Ray-marched Perlin-Worley clouds at low resolution with temporal accumulation.
- **Post-processing**
  - TAA, energy-conserving bloom, AgX tone mapping, star-only lens flare.
  - Depth of field, motion blur and FXAA.
  - Visor frost, heat, toxic, radiation and rain effects.
- **Worlds**
  - Deterministic spiral galaxy (tens of thousands of systems) with a 3D galaxy map and an animated hyperspace tunnel.
  - Cube-sphere quadtree planets with geomorphing and skirts, generated in Web Workers.
  - Voxel patches (surface nets) for caves and the terrain manipulator.
  - Nine planet types, and Gerstner water with caustics.
  - Instanced flora with impostors and wind.
  - Points of interest, weather storms and lightning.
- **Life**
  - Skinned procedural fauna with foot IK and shell-textured fur up close.
  - Herd, predator and prey AI with stuck recovery.
  - Sentinels with a five-level wanted system.
  - Three alien races with a word-learning language system.
- **Gameplay**
  - Survival: life support, hazard protection, shields, and a grave marker on death.
  - Multitool modes.
  - Inventories with drag and drop and 3D-rendered icons.
  - Refining and crafting (20+ products).
  - Base building: snapping holographic ghost, power, lights, deconstruction.
  - Five starship classes with a cockpit and holographic dashboard.
  - Seamless ground-to-space flight, pulse drive and space combat.
  - Asteroid mining, a walkable space station with trading, and a Roamer exocraft.
  - Discoveries with renaming and thumbnails.
  - Photo mode.
- **Frontend**
  - Cinematic title screen and hold-to-start.
  - Options with Low/Medium/High/Ultra presets and a toggle for every lighting feature.
  - Key rebinding, three save slots, and JSON export/import.
  - A lighting debug panel: cascades, AO, lighting only, albedo, normals, SSR, fog and clouds, plus a frame-time breakdown.

Unimplemented stretch goals are marked in the source with `// STUB:` comments:
- owned freighters and frigates;
- portals;
- black holes and the ending sequence;
- extra exocraft;
- settlements;
- riding companions.

## Source layout

The file is organised as commented modules, in this order:

1. Core: math, seeded RNG, settings, input.
2. Audio.
3. Renderer: G-buffer and the material patcher.
4. Lighting and shadows.
5. Atmosphere, clouds, fog and IBL.
6. Post-processing.
7. Universe and galaxy.
8. Terrain library and workers, then Planet.
9. Flora.
10. World.
11. Fauna.
12. Sentinels and points of interest.
13. Starship.
14. Space, station and exocraft.
15. Player.
16. Gameplay: items, multitool, discoveries.
17. Base building.
18. UI.
19. Game: state machine and fixed-timestep loop.
20. Boot.

`window.__nms` exposes the main modules for inspection from DevTools.
