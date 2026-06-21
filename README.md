# Backrooms Escape Together

A co-op third-person horror game built **from scratch in Godot 4.3**. You wake up in
the endless mono-yellow rooms with a buzzing fluorescent hum. Somewhere in the level a
hazmat-suited **entity** wanders the halls. Find the exit and get out — alone or with
friends — before it finds you.

---

## What's in the box

Three supplied GLB models drive the whole game:

| Model | File | Role | Animation |
|-------|------|------|-----------|
| **Captain Clark** | `assets/models/player.glb` | The playable survivor (third person) | Rigged Mixamo skeleton — see note below |
| **Hazmat Entity** | `assets/models/monster.glb` | The monster that hunts you | Ships with a real mocap loop (`mixamo.com`) |
| **Backrooms** | `assets/models/environment.glb` | The level — walls, ceilings, lamps, carpet, exit | Static |

### A note on the animations

The hazmat **entity** already contained a captured Mixamo locomotion clip, so it is
played directly (sped up while hunting, slowed while wandering).

The supplied **player** model was *rigged but shipped with zero animation clips*. So a
small build tool — [`tools/build_player_anim.py`](tools/build_player_anim.py) — authors a
full locomotion set (**Idle / Walk / Run / Jump / Fall**) directly onto Captain Clark's
Mixamo skeleton and injects them into `player.glb`. Because the project is built
head-less, every generated clip is **validated with forward kinematics** (feet stay below
the hips, the stride alternates, knees flex upward) before it is written — no clip ships
without passing those anatomical checks.

Regenerate the player clips at any time with:

```bash
python3 tools/build_player_anim.py <source_clark.glb> assets/models/player.glb
```

---

## Features

**Graphics (Forward+):**
- AgX tonemapping, SSAO, SSIL (screen-space GI), screen-space reflections and bloom.
- Volumetric fog + depth fog for the hazy, oppressive air.
- Lights are placed **automatically** on every ceiling-lamp mesh and given a buzzing,
  dying-fluorescent flicker; emissive lamp materials are boosted so they bloom.
- A full-screen post shader adds film grain, vignette, a sickly yellow grade and
  chromatic aberration that intensifies as the entity closes in.
- TAA + MSAA, soft shadows, auto-exposure and subtle far-DOF.

**Gameplay:**
- Smooth third-person controller: spring-arm boom camera, camera-relative movement,
  sprint with stamina, jump, and a toggleable flashlight.
- The model auto-scales to human height and turns to face its travel direction with
  blended Idle/Walk/Run/Jump/Fall animation.
- A navigation-driven **entity AI** (Patrol → Chase → Attack) that hears and sees you,
  hunts along a runtime-baked navmesh, and catches survivors.
- Objective: reach the glowing **exit**. Dread (audio + post FX) rises with proximity.

**Co-op ("Together"):**
- Host or join over LAN/IP from the main menu (Godot high-level multiplayer / ENet).
- Players are spawned and synchronised via `MultiplayerSpawner` + `MultiplayerSynchronizer`;
  the entity is server-authoritative. Or just hit **Play Solo**.

---

## Controls

| Action | Key |
|--------|-----|
| Move | `W` `A` `S` `D` |
| Look | Mouse |
| Sprint | `Shift` |
| Jump | `Space` |
| Flashlight | `F` |
| Pause | `Esc` |

---

## Running it

1. Install **Godot 4.3** (standard, not .NET) from <https://godotengine.org>.
2. Open the project: `Import` → select this folder's `project.godot`.
3. Press **F5** (or the Play button). The main menu loads first.
4. Choose **Play Solo**, **Host Co-op Game**, or **Join Game** (enter the host's IP).

The level builds itself at load time — collision, lighting, navigation and spawns are all
generated from the imported model, so there is nothing to bake by hand.

---

## Project layout

```
project.godot              Forward+ render + physics/navigation/input config
icon.svg
assets/models/             player.glb (animated), monster.glb, environment.glb (+ textures)
scenes/
  MainMenu.tscn            Host / Join / Solo
  World.tscn               WorldEnvironment, navigation, spawner, post-FX, HUD
  Player.tscn              CharacterBody3D + model + spring-arm camera + flashlight
  Monster.tscn             CharacterBody3D + model + NavigationAgent3D
  HUD.tscn                 objective, stamina, pause + end screens
scripts/
  boot.gd                  runtime input-map setup (autoload)
  network_manager.gd       host/join/peers (autoload "Net")
  game_manager.gd          run state, dread, win/lose (autoload "Game")
  world.gd                 builds collision/lights/navmesh, spawns players, escape logic
  player.gd                third-person controller + animation blending
  monster.gd               perception + navigation pursuit AI
  flicker_light.gd         buzzing fluorescent flicker
  post_fx.gd               feeds dread into the post shader
  ambient_audio.gd         procedural fluorescent hum (no audio asset needed)
  hud.gd / main_menu.gd
shaders/post_process.gdshader
tools/build_player_anim.py FK-validated animation baker for the player model
```

## Requirements

- Godot **4.3** (Forward+ / Vulkan).
- For regenerating player animations: Python 3 with `pygltflib` and `numpy`.
