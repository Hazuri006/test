# Architecture

How the systems fit together, and the reasoning behind the key decisions.

## Procedural planets

### Spherified cube, not a UV sphere
A planet's surface is built from the six faces of a cube, each point pushed out
to sphere radius using the **spherified-cube** mapping (`PointOnUnitSphere`).
Versus a latitude/longitude UV sphere this avoids polar pinching and gives a
near-uniform vertex distribution — essential for even terrain detail and clean
triplanar texturing.

### 3D noise for seamless terrain
Elevation is sampled in **3D on the unit sphere** (`FPlanetNoise::SampleElevation`),
never from a wrapped 2D heightmap. That means no seams and no distortion at the
poles. Terrain is layered fractal Brownian motion:

- **Continents** — low frequency, smooth, biased upward.
- **Mountains** — ridged noise, higher frequency, **masked by the continent
  layer** so peaks only rise on land.
- **Detail** — high frequency, low amplitude, also land-masked.

`GetSurfacePoint` floods anything below `SeaLevel` to a flat shell, producing
oceans; `EvaluateColor` bands the land into biomes and writes the tint to vertex
color.

### Continuous LOD via per-face quad-trees
Each face owns an `FPlanetQuadTreeNode`. Every tick a node compares the viewer's
distance to its chunk size:

```
splitWorldThreshold = chunkWorldSize * SplitFactor
if (depth < MaxDepth && distance < splitWorldThreshold) -> split into 4 children
else                                                     -> merge + show one chunk mesh
```

This is **chunked LOD**: a single `APlanet` actor scales from an orbital sphere
(one coarse chunk per face) down to dense, walkable ground under the player.
Leaf chunks at/below `CollisionDepth` get collision so you can land and not fall
through. Meshes are `UProceduralMeshComponent`s; normals/tangents are computed
by `UKismetProceduralMeshLibrary::CalculateTangentsForMesh`.

**Why non-UObject nodes?** Quad-tree nodes are plain C++ for cheap, frequent
alloc/free. The GPU meshes they create *are* UObjects, kept alive by the
`ManagedChunks` UPROPERTY array on the planet (`CreateChunkComponent` /
`ReleaseChunkComponent`).

> **Known limitation (by design, for a foundation):** chunk meshes are generated
> synchronously on the game thread, which can hitch when many split at once. The
> first roadmap item is moving generation to a worker thread / `Async` task pool.

## Flight

`ASpaceship` integrates motion **by hand** instead of using rigid-body physics,
trading physical realism for precise, tunable control (the arcade-sim approach):

- **Rotation:** input sets a target angular velocity (pitch/yaw/roll rates);
  the actual rate eases toward it (`RotationResponsiveness`) for inertia, then is
  applied as a local rotation.
- **Translation:** thrust accelerates along the ship's local axes; velocity is
  integrated into position with a **swept** move so it collides with terrain.
- **Flight assist / atmosphere:** exponential velocity damping. Assist makes the
  ship easy to fly; turning it off (Z) gives true Newtonian drift. `bInAtmosphere`
  adds drag for a heavier, plane-like feel near a planet.

Input uses **Enhanced Input**; bindings are null-safe so the game runs before
you've authored the IA/IMC assets.

## Space

- `UOrbitComponent` moves an actor along an inclined ellipse around a center and
  spins it on its axis — modular, drop it on anything.
- `ASolarSystem` places a star (directional "sun" light for even planet-scale
  lighting + a point light + visible mesh) and spawns planets, either from an
  authored `PlanetDescs` list or rolled procedurally from `SystemSeed` (outer
  planets orbit slower, a nod to Kepler).

## Data flow at a glance

```
ASolarSystem ──spawns──> APlanet (×N) ──owns──> 6 × FPlanetQuadTreeNode
      │                      │                          │ split/merge by viewer distance
      │                      │                          ▼
      │                      │                    UProceduralMeshComponent (chunk)
      │                      └── SampleElevation / EvaluateColor  (FPlanetNoise + Biomes)
      ▼
ASpaceship (viewer) ── GetViewerLocalPosition() drives every planet's LOD
```

## Scale & precision
Defaults use ~6 km planet radii (`Radius = 600000` uu) — large enough to feel
planetary, small enough to stay comfortable. UE5's **Large World Coordinates**
(double-precision `FVector`) lets you push to true planet scale; the math here is
already double-based.
