# Getting Started

This walks you from a fresh clone to flying a ship around procedural planets.

## 0. Prerequisites

- **Unreal Engine 5.7** installed via the Epic Games Launcher.
- A C++ toolchain:
  - **Windows:** Visual Studio 2022 with "Game development with C++".
  - **macOS:** Xcode + command line tools.
  - **Linux:** the cross-compile/clang toolchain UE expects.

## 1. Generate project files & compile

Right-click `StellarFrontier.uproject` → **Generate Visual Studio project files**.
Then either open the generated solution and Build, or just double-click the
`.uproject` and click **Yes** when it offers to rebuild `StellarFrontier`.

From a terminal you can instead run (adjust the engine path):

```bash
# Windows (Developer Command Prompt)
"C:\Program Files\Epic Games\UE_5.7\Engine\Build\BatchFiles\Build.bat" ^
  StellarFrontierEditor Win64 Development -project="%CD%\StellarFrontier.uproject" -waitmutex
```

## 2. Create the Input assets (Enhanced Input)

In the Content Browser, make a folder `Content/Input/` and create:

- **Input Actions** (right-click → Input → Input Action):
  - `IA_Throttle`  → Value Type **Axis1D (float)**
  - `IA_Strafe`    → Value Type **Axis2D (Vector2D)**
  - `IA_Look`      → Value Type **Axis2D (Vector2D)**
  - `IA_Roll`      → Value Type **Axis1D (float)**
  - `IA_Boost`     → Value Type **Digital (bool)**
  - `IA_FlightAssist` → Value Type **Digital (bool)**
- **Input Mapping Context** `IMC_Flight` and add mappings, e.g.:
  - `IA_Throttle`: **W** (scale +1), **S** (scale −1)
  - `IA_Strafe`: **D**/**A** (X ±1), **Space**/**LeftCtrl** (Y ±1, use a *Swizzle Input Axis Values* + scalar modifier)
  - `IA_Look`: **Mouse XY** (add *Negate* on Y if it feels inverted)
  - `IA_Roll`: **E** (+1), **Q** (−1)
  - `IA_Boost`: **Left Shift**
  - `IA_FlightAssist`: **Z**

> Tip: for keyboard axes, add the **Scalar** and **Swizzle Input Axis Values**
> modifiers so single keys map cleanly onto Axis1D/Axis2D actions.

## 3. Make the ship Blueprint

Create `BP_Spaceship` (parent class **Spaceship**). Then:

- Assign a **hull static mesh** to the `Hull` component (any spaceship mesh;
  a placeholder cube works to start).
- In **Class Defaults → Input**, assign `IMC_Flight` and the six Input Actions.
- Tune **Flight** values (thrust, rates, damping) to taste.

## 4. Build the planet material (high-quality surface)

Create `M_PlanetSurface`:

- Use **world-space triplanar** sampling (UE has a `WorldAlignedTexture` node)
  to project rock/grass/sand/snow textures with no UV seams.
- Read **Vertex Color** and use it to blend between those texture sets — the C++
  writes biome tint into vertex color (beach→grass→forest→rock→snow + ocean).
- Drive roughness/normal per layer. Add Megascans surfaces for "high quality".

Assign `M_PlanetSurface` to the planet's **Surface Material** (on the planet
class defaults or per-instance).

## 5. Set up the level

Create `Content/Maps/L_SolarSystem`:

1. Drop in an **ASolarSystem** actor. Set its **Planet Class** to your planet
   (or leave default `APlanet`). Leave **Planet Descs** empty to roll a random
   system from **System Seed**, or fill it in for an authored system.
2. Add a **SkyAtmosphere**, **ExponentialHeightFog**, optional **Volumetric
   Clouds**, and a **SkyLight** (set to Movable/real-time capture).
3. Add a star skybox or a large emissive sphere for the sun (assign to the solar
   system's `StarMesh`).
4. **Project Settings → Maps & Modes:** set Editor Startup Map and Game Default
   Map to `L_SolarSystem`, and confirm Default GameMode is
   `StellarFrontierGameMode` (already set in `Config/DefaultEngine.ini`).
5. Set the game mode's **Default Pawn** to `BP_Spaceship`.

## 6. Play

Press **Play**. You spawn in the ship. Throttle forward toward a planet — watch
the quad-tree tessellate the surface as you approach, fly down to the ground,
and toggle flight assist (Z) to feel the difference between damped and true
Newtonian inertia.

## Tuning cheat-sheet

| Want… | Change |
| --- | --- |
| More ground detail | ↑ `MaxDepth`, ↑ `ChunkResolution` (watch perf) |
| Subdivide sooner | ↑ `SplitFactor` |
| Taller mountains | ↑ `HeightScale`, or layer `Amplitude` |
| Bigger oceans | ↑ `SeaLevel` |
| Snappier ship | ↑ rates + `RotationResponsiveness` |
| Floatier ship | ↓ `FlightAssistDamping` (or toggle assist off) |
