# Roadmap

Ordered roughly by impact-to-effort for turning this foundation into a game.

## Tier 1 — make the foundation production-grade
- [ ] **Async chunk generation.** Move noise sampling + mesh building off the
      game thread (`Async` / a task graph pool); double-buffer so a split swaps in
      a finished mesh instead of hitching. Add a per-frame generation budget.
- [ ] **Chunk skirts / edge stitching.** Hide LOD seams between chunks of
      different depth with vertical skirts or by matching edge resolution.
- [ ] **Triplanar planet material.** Megascans-based rock/grass/sand/snow blended
      by vertex color + slope + altitude; distance-based detail tiling.
- [ ] **Atmospheric scattering.** Per-planet `SkyAtmosphere` driven by planet
      params; smooth orbit↔surface transition; sunsets, horizon glow.

## Tier 2 — exploration loop
- [ ] **Walk-on-foot mode.** Swap ship ↔ character on landing; orient gravity to
      the planet's surface normal (custom movement or re-parented capsule).
- [ ] **Planet-relative gravity** for the ship near the surface.
- [ ] **Seamless space↔atmosphere** flight handoff (set `bInAtmosphere` from a
      planet proximity test; ease drag/handling).
- [ ] **Scanning & discovery.** Name planets/biomes, log discoveries.

## Tier 3 — content & systems
- [ ] **Procedural flora/fauna/rocks** scattered per biome (instanced meshes via
      a Hierarchical ISM, density driven by noise + slope).
- [ ] **Resource gathering & inventory.**
- [ ] **Save/Load** (planet seeds + player state; planets regenerate from seed).
- [ ] **Galaxy map & warp** between solar systems.
- [ ] **Cave systems** (3D noise density field → marching cubes / surface nets).

## Tier 4 — polish
- [ ] HUD (speed, throttle, altitude, target), cockpit view, audio, music.
- [ ] Ship variety, customization, damage.
- [ ] Performance pass: Nanite where applicable, GPU noise, streaming.

## Architectural notes for later
- For **true planet scale** (1000s of km), lean harder on LWC and consider a
  floating-origin / world-rebasing scheme to keep the player near (0,0,0).
- For very high detail, evaluate **GPU-side noise** (compute shader) feeding a
  `RealtimeMeshComponent` or Nanite-friendly meshes instead of
  `ProceduralMeshComponent`.
