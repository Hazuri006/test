# NO MAN'S CLAUDE

A procedural space-exploration game in a single page of WebGL 2. Fly from orbit
down to the surface of generated worlds in one continuous motion, land, get out,
and walk around.

No engine, no libraries, no build step, no audio files. Everything except the
starship hull is generated at runtime from a seed.

**Open `index.html` in a browser. That's the whole install.**

---

## What's in it

- **Seamless orbit → surface descent.** One continuous flight from space to the
  ground with no loading screen, no cut, and no pop. A cube-sphere quadtree
  streams terrain as you fall toward it.
- **Six to seven worlds per system**, drawn from eight biome archetypes — lush,
  arid, frozen, volcanic, toxic, airless, exotic and oceanic — each with its own
  terrain character, palette, sky colour, gravity, weather and hazards.
- **Atmospheric scattering** (Rayleigh + Mie, ray-marched) so the sky is a
  consequence of the planet rather than a painted dome: coloured limb from
  orbit, correct colour at ground level, sunsets on the terminator.
- **Volumetric clouds** ray-marched through a shell, lit by a shadow march.
- **Analytic oceans** with waves, depth-graded colour, shoreline foam, sun glint
  and an underwater look if you go below.
- **Assisted landing and take-off** — see below.
- **On-foot exploration** with a jetpack, walking correctly around a sphere.
- **Four-stage drive**: cruise, boost, pulse drive, and an ultra drive at a
  hundred times the boost that crosses the system in seconds.
- **Debris belts** around roughly four worlds in five — a tilted, slowly turning
  band of rock above the atmosphere that you fly through on the way down. Two
  thirds are broad fields rather than tidy rings.
- **Forests on worlds that grow them**, instanced from three baked tree
  variants with a procedural wind sway.
- **Procedural everything except the hull and the trees**: the rocks and
  scrub, the star field and nebula, the engine exhaust, the engine hum, the
  wind, the ambient score.

## Controls

| | |
|---|---|
| Mouse | Steer (ship) / look (on foot) |
| `W` `S` | Throttle up / down |
| `A` `D` | Roll |
| `Shift` | Boost / sprint |
| `Space` | Pulse drive (in space) / jetpack (on foot) |
| `V` | **Ultra drive** — the boost, times a hundred |
| `Ctrl` | Brake |
| `F` | Land / take off |
| `E` | Disembark / board ship |
| `X` | Scanner pulse |
| `M` | System map (click a world to set a nav target) |
| `C` | Camera view |
| `H` | Hide interface |
| `F3` | Performance stats |
| `Esc` | Pause |

Enter a word in the **Seed** box on the title screen to get the same star system
every time; leave it blank for a random one.

## How the tricky parts work

**One depth buffer, 1 m to 400 km.** Every shader that writes depth uses
logarithmic depth (`log2(1 + w) * Fcoef`), and the post pass inverts it to
recover world-space distance. A conventional depth buffer cannot hold a landing
skid and a horizon at the same time.

**Nothing large is ever sent to the GPU.** The CPU keeps world positions in
`Float64Array`; the GPU only ever sees offsets from the camera, which stay
small. That is what keeps a ship from jittering when it is 8 million metres
from the origin.

**The orbit-to-ground hand-off is invisible because both halves agree.** From
far away a planet is one analytic sphere in the sky shader — no geometry at all.
Up close it is a streamed quadtree. Those two use *the same simplex noise
implementation*, ported line by line between `js/math.js` and `js/shaders.js`,
so they place continents in identical spots. The cross-fade between 6 and 4
planet radii is then just a fade between two pictures of the same world.

**You never see a hole in the ground.** A quadtree node is replaced by its four
children only once all four have been built and uploaded. If generation falls
behind — during a fast dive, say — the parent keeps drawing. Detail arrives a
moment late instead of the ground disappearing. Generation runs on a per-frame
time budget from a distance-sorted queue, so a stall degrades smoothly.

**Chunk seams are hidden with skirts.** Neighbouring chunks at different levels
disagree about the surface by a fraction of a metre, because octaves fade in
with refinement. Every chunk carries a downward skirt around its border that
covers the difference, so a seam is never a crack of sky.

**Landing is assisted on purpose.** Below 260 m the flight computer bleeds off
speed and caps the sink rate; `F` then flies a short scripted arc that sets the
ship down level with the local horizon and deploys the gear. Fighting a physics
sim for the last twenty metres is not the interesting part of arriving at a
planet — the approach is.

**Arriving at ten million metres a second.** `V` is the boost with a hundred
times the multiplier, and it engages wherever Shift would — thick air damps it,
nothing else gates it. At that speed a single frame covers hundreds of
kilometres, so integrating the position blindly would put the ship on the far
side of a planet before any proximity check could run. Each step is instead
clamped against every planet's approach sphere: point the nose at a world, hold
`V`, and you decelerate to a stop two and a half radii out rather than passing
through it.

**The exhaust is a beam, not a cone.** A cone is wrong for a plume twice over:
its silhouette is a hard polygon from every angle, and it collapses to a flat
disc exactly when you are behind the ship — which is where the chase camera
lives. The plume is built instead as a strip whose width the vertex shader
turns to face the viewer, cross-fading into a camera-facing disc as the view
lines up with the exhaust axis. Radial density, shock diamonds (which only
stand up in thin air, and only once the drive is working) and scrolling
turbulence are all evaluated per fragment.

**An engine trail has to survive a deferred sky.** The plume is additive and
writes no depth, which is right for a transparent thing — but the sky pass
rebuilds the world from the depth buffer, so "no depth here" means "this pixel
is sky", and the whole trail was being painted over with stars. The scene
buffer is cleared to black, so whatever sits in it at a depth-less pixel is
exactly the sum of the additive passes; the sky shader keeps that and adds it
back over the finished sky. A drive trail against a starfield survives, glows,
and feeds the bloom.

**A realistic debris belt is invisible.** Spaced the way real ones are, the
rocks sit kilometres apart and read as nothing at all. The belts here are
deliberately concentrated into a thinner, narrower band so they register both
as a ring from orbit and as debris around you when you are inside. Each rock
also has a floor on its apparent size, without which a belt dissolves into
sub-pixel aliasing at distance instead of reading as a band. One instanced
draw call per planet; the belt's rotation is a uniform, so it turns for free.

**Walking around a sphere.** The on-foot controller stores its heading as a
vector and re-projects it onto the local tangent plane every frame, so you can
walk a full circumference without the horizon rolling or the controls
gimbal-locking at the poles.

## Performance

Four quality presets (title screen and pause menu). They trade render scale,
maximum quadtree depth, terrain generation budget, and atmosphere/cloud march
step counts. **Medium** is the default and targets 60 fps on integrated
graphics; **Ultra** pushes terrain to roughly 1.5 m per vertex.

Requires WebGL 2. `EXT_color_buffer_float` is used for the HDR path when
available, and the renderer falls back to 8-bit colour when it is not.

## Layout

```
index.html          markup, interface styling, script tags
js/math.js          vectors, quaternions, matrices, PRNG, simplex noise
js/gl.js            WebGL2 helpers, meshes, procedural geometry builder
js/shaders.js       all GLSL: terrain, objects, ship, thrusters, sky, post
js/shipmodel.js     the starship, baked from glTF and embedded as base64
js/treemodel.js     the trees, baked the same way, three variants in one buffer
js/planets.js       biome archetypes, terrain functions, system generation
js/terrain.js       cube-sphere quadtree, chunk streaming
js/props.js         surface scatter — rocks, flora, crystals
js/debris.js        orbital debris belts
js/ship.js          hull + exhaust meshes, flight model, landing sequence
js/player.js        on-foot movement on a sphere
js/audio.js         runtime audio synthesis
js/hud.js           interface, world markers, system map
js/game.js          engine loop, renderer, camera, input, state machine
tools/check.js      static checks
```

## The starship model

The hull is a 137k-triangle gunship supplied as a `.glb`, with a running engine
animation and an emissive map for the engine cores.

**The animation was the interesting part.** The source rig drives a bone
hierarchy, but the meshes carry no joint weights — each of the 15 parts is
rigidly parented to a single bone. So rather than ship a skeleton and an
animation evaluator, the bake walks the hierarchy at 24 Hz and stores a plain
translation / rotation / scale per part per frame. The runtime interpolates
between two frames and issues one draw per part. Scales came out uniform, so a
`mat3` suffices and normals need no inverse-transpose.

The bake also rotates the model (its nose pointed along +X), recentres it,
scales it to 16 m, drops the tangents, the second UV set and the
metallic-roughness, occlusion and normal maps, and re-encodes the base-colour
and emissive atlases as JPEG. Vertex data is quantised — positions to int16
against each part's own bounding box, normals to int8, UVs to uint16 — which is
what keeps 133k vertices inside a few megabytes. 11.4 MB of glTF becomes a
3.7 MB JavaScript file.

It is embedded as base64 rather than fetched, because `fetch` is blocked under
`file://` and the game is meant to run by opening `index.html` directly. The
engine nozzle is found by taking the aft-most part whose centre sits near the
axis; the exhaust plume is anchored to it, and the emissive map's strength
tracks the drive state so the ship visibly spools up.

## The trees

The tree `.glb` turned out to hold **three** trees standing in a row, sharing
one bark mesh and one leaf/branch mesh. Baked whole, every instance was a
twenty-metre clump of three trunks pivoted in the gap between them. The bake
splits them apart on triangle centroids and keeps them as three variants of a
single vertex buffer — each pivoted at its own trunk with Y = 0 at the ground,
scaled by a common factor so they keep their relative sizes (8.8, 9.5 and 11 m).
Instancing picks a variant per tree, so a stand is not one silhouette repeated.

Bark tiles its UVs — they run from -3.5 to 12 — so it cannot share an atlas and
keeps its own repeating texture; leaf and branch both sit inside the unit square
and are packed into one alpha-masked atlas. Six index ranges over one buffer,
three variants times two materials, and one instanced draw per range per chunk.

Two things that are easy to get wrong here and produce a tree with no leaves at
all. The runtime uploads textures with `UNPACK_FLIP_Y_WEBGL`, so a tile pasted
at the top of the atlas image ends up at the *top* of the GL texture while glTF
counts `v` down from that same row — every UV needs `t = 1 - v`, or the foliage
samples empty atlas and vanishes under the alpha test. And the mip chain
averages more and more empty space into an alpha mask as it recedes, so a fixed
cutoff strips the canopy bare with distance; the shader estimates the mip level
from the UV derivatives and relaxes the test to match.

The source ships a morph-target wind animation. It is dropped: the vertex shader
sways the canopy instead, phased by instance position, which costs no extra
vertex data and means the forest does not lean in lockstep.

> Both models are third-party assets (their glTF metadata identifies them as
> Sketchfab exports). Check their licences before redistributing this repository
> publicly — everything else here is generated at runtime and carries no such
> constraint.

## Development notes

`node tools/check.js` parses every module, verifies that the GLSL template
literals in `shaders.js` are intact (a stray backtick in a shader comment
silently truncates the shader and produces a JavaScript error pointing nowhere
near the cause), and cross-references shader uniforms against the code that
sets them.
