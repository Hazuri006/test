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
  hundred times pulse speed that crosses the system in seconds.
- **Procedural everything except the hull**: the rocks and flora, the star
  field and nebula, the engine exhaust, the engine hum, the wind, the ambient
  score.

## Controls

| | |
|---|---|
| Mouse | Steer (ship) / look (on foot) |
| `W` `S` | Throttle up / down |
| `A` `D` | Roll |
| `Shift` | Boost / sprint |
| `Space` | Pulse drive (in space) / jetpack (on foot) |
| `V` | **Ultra drive** — 100x the pulse drive |
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

**Arriving at ten million metres a second.** At ultra speed a single frame
covers 800 km, so integrating the position blindly would put the ship on the
far side of a planet before any proximity check could run. Each step is
instead clamped against every planet's approach sphere: point the nose at a
world, hold `V`, and you decelerate to a stop two and a half radii out rather
than passing through it.

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
js/planets.js       biome archetypes, terrain functions, system generation
js/terrain.js       cube-sphere quadtree, chunk streaming
js/props.js         surface scatter — rocks, flora, crystals
js/ship.js          hull + exhaust meshes, flight model, landing sequence
js/player.js        on-foot movement on a sphere
js/audio.js         runtime audio synthesis
js/hud.js           interface, world markers, system map
js/game.js          engine loop, renderer, camera, input, state machine
tools/check.js      static checks
```

## The starship model

The hull is an X-wing supplied as a `.glb`. The bake in `js/shipmodel.js`
applies the glTF node transform (Z-up to Y-up), recentres the model on its
bounding box, scales it to 11 m, drops the tangents and the metallic-roughness
and normal maps, and downsamples the base-colour atlas from 2048 to 1024 JPEG
— 7.7 MB of glTF becomes a 780 KB JavaScript file.

It is embedded as base64 rather than fetched, because `fetch` is blocked under
`file://` and the game is meant to run by opening `index.html` directly. The
four engine nozzles were located by clustering the rearmost vertices into
quadrants, and the exhaust plumes are anchored to those positions.

> The model is a third-party asset (its glTF metadata identifies it as a
> Sketchfab export). Check its licence before redistributing this repository
> publicly — everything else here is generated at runtime and carries no such
> constraint.

## Development notes

`node tools/check.js` parses every module, verifies that the GLSL template
literals in `shaders.js` are intact (a stray backtick in a shader comment
silently truncates the shader and produces a JavaScript error pointing nowhere
near the cause), and cross-references shader uniforms against the code that
sets them.
