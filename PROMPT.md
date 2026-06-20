# Improved Prompt

You asked me to "improve this prompt." Your original was:

> *"make a copy of No Man's Sky in 3D with planets and textures etc. in high
> quality and procedural planets in high quality and the ship etc. in high
> quality I want the flight system etc. to be well done, improve this prompt
> and also make the game in Unreal Engine and send me the project"*

The two big problems with it: (1) it asks to **copy** a specific commercial game
(its assets/brand are owned by Hello Games — not something to clone), and (2)
it's a single sentence standing in for what is, realistically, **years of studio
work**. A good prompt scopes the work, names a concrete target, and separates
"code I can generate" from "art/editor work that happens in Unreal."

Below is a reusable, scoped version. Use it whole, or pick the milestone you want.

---

## Reusable prompt (copy/paste)

> Build a **No Man's Sky-inspired** (not a copy) 3D space-exploration game in
> **Unreal Engine 5.4 (C++)**, called *Stellar Frontier*. Deliver it as an
> openable UE project I can compile, plus docs explaining what's code vs. what I
> set up in-editor. Use only original or properly-licensed assets.
>
> **Core systems (implement in C++):**
> 1. **Procedural planets:** fully spherical, seamless (spherified-cube + 3D
>    fractal noise), with continents, ridged mountains, fine detail, and oceans
>    at a configurable sea level. Per-planet seed for variety.
> 2. **Continuous LOD:** a per-face quad-tree so one planet actor scales from an
>    orbital sphere to walkable ground without seams or pop-in; near chunks get
>    collision.
> 3. **Biomes:** elevation/slope-banded surface coloring exposed to the material
>    (via vertex color) so a triplanar material can blend high-quality textures
>    with no UV seams.
> 4. **6-DOF flight model:** thrust/strafe/pitch/yaw/roll, boost, a toggleable
>    flight-assist (damped vs. true Newtonian inertia), atmospheric drag, and
>    collision. Tunable, with a chase camera. Use Enhanced Input.
> 5. **Solar systems:** a star with scene lighting and several planets on
>    elliptical orbits; procedurally generated from a system seed.
>
> **Editor/art tasks (document step-by-step, since they need the editor):**
> the triplanar planet material, ship hull mesh, sky/atmosphere/clouds/starfield,
> the level + default map, and the Enhanced Input assets.
>
> **Constraints:** keep gameplay code in clean, modular C++ classes; comment the
> non-obvious math; default planet scale to a comfortable ~6 km radius but keep
> the math double-precision (LWC) so it can scale up. Provide a README, an
> architecture doc, and a roadmap (async chunk generation, atmospheric
> scattering, on-foot mode, resources, save/load, galaxy map).
>
> **Definition of done for v0.1:** the project compiles; pressing Play drops me
> into a ship that can fly to a procedurally generated planet and land on
> tessellating terrain. Treat textures/atmosphere/on-foot as later milestones.

---

## Why this version is better
- **Names a target & scope** (*Stellar Frontier*, UE 5.4 C++, a concrete v0.1
  "definition of done") instead of an unbounded "copy."
- **Separates code from editor/art work**, so expectations are realistic and
  nothing silently gets dropped.
- **Lists the actual hard systems** (seamless planets, LOD, flight) as explicit
  deliverables rather than the vague "etc."
- **Respects IP** — inspired-by, original assets — which also makes it something
  you could legally ship.
- **Has a roadmap**, so "high quality everything" becomes a sequence of
  milestones instead of one impossible ask.

This repository is an implementation of the v0.1 above — see the
[README](README.md).
