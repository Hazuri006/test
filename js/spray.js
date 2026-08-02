'use strict';
/* ============================================================================
   spray.js — the water a ship throws up when it flies low over an ocean.

   The drive wash hits the surface, the surface goes up, and gravity brings it
   back.  That is the whole simulation: there is no fluid here, only a few
   hundred puffs launched from a ring under the ship and pulled down again.

   Two details do most of the work.  The first is that the puffs are launched
   from the *sea* surface rather than from the ship, so they read as water being
   lifted rather than as something the ship is emitting — the plume stays behind
   as you pass and settles, which is what tells you how fast you are going.  The
   second is that they carry a share of the ship's own velocity: a hover throws
   up a symmetric ring, and a run throws a wake.

   They are drawn through the same instanced object shader as the debris and the
   drones, opaque and sunlit, with a screen-space size floor so a droplet at two
   hundred metres is still a droplet and not a flickering half-pixel.
   ============================================================================ */

const SPRAY = {
  max: 340,
  trigger: 40,        // metres of clearance before the surface stops reacting
  life: 1.7,
  rate: 230,          // puffs a second at full effect
  rise: 10,           // how hard the wash lifts the water
  minPixels: 2.0
};

const Spray = {
  parts: null,
  mesh: null,
  inst: null,
  count: 0,
  acc: 0,
  intensity: 0,       // 0..1, what the audio and the HUD would read

  build(gl) {
    if (this.mesh) return;
    const B = new MeshBuilder();
    B.sphere(0, 0, 0, 1, 1, [0.88, 0.95, 1.0], 0);
    this.mesh = B.buildInstanced(gl, new Float32Array(0));
    this.inst = new Float32Array(SPRAY.max * 11);
    this.parts = [];
  },

  dispose() {
    if (this.mesh) this.mesh.dispose();
    this.mesh = null;
    this.parts = null;
    this.count = 0;
  },

  /* `src` is whatever is flying — the player's ship, and nothing else, because
     spray you cannot see from the cockpit is spray nobody asked for. */
  update(dt, planet, src, game) {
    if (!this.parts) return;
    this.intensity = 0;

    let over = false, clearance = 1e9;
    if (planet && planet.hasWater && src) {
      V3.sub(_spRel, src.pos, planet.pos);
      const r = V3.len(_spRel);
      V3.scale(_spUp, _spRel, 1 / r);
      const ground = planet.surfaceRadius(_spUp[0], _spUp[1], _spUp[2]);
      /* Over water means the sea is above the rock here, not merely that the
         world has an ocean somewhere. */
      over = ground < planet.seaRadius - 0.5;
      clearance = r - planet.seaRadius;
    }

    if (over && clearance > -6 && clearance < SPRAY.trigger) {
      /* Strongest just off the surface, gone by the trigger height, and gone
         again if the ship is sitting still with the drives idle. */
      const near = 1 - smoothstep(4, SPRAY.trigger, Math.max(clearance, 0));
      const speed = V3.len(src.vel);
      const push = saturate(0.35 + (src.thrustVis || 0) * 0.9 + speed / 90);
      this.intensity = near * push;
    }

    const wanted = this.intensity * SPRAY.rate;
    this.acc += wanted * dt;
    while (this.acc >= 1 && this.parts.length < SPRAY.max) {
      this.acc -= 1;
      this.spawn(planet, src);
    }
    if (this.acc > 4) this.acc = 4;

    const g = planet ? planet.gravity : 9.8;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      V3.addScaled(p.vel, p.vel, p.up, -g * dt);
      /* Air drag, which is what makes a droplet a mist: without it every puff
         follows the same parabola and the plume reads as a fountain. */
      V3.scale(p.vel, p.vel, Math.exp(-dt * p.drag));
      V3.addScaled(p.pos, p.pos, p.vel, dt);
      /* Anything that falls back through the surface is gone. */
      if (planet) {
        V3.sub(_spRel, p.pos, planet.pos);
        if (V3.len(_spRel) < planet.seaRadius - 0.4) { this.parts.splice(i, 1); }
      }
    }
  },

  spawn(planet, src) {
    V3.sub(_spRel, src.pos, planet.pos);
    const r = V3.len(_spRel);
    V3.scale(_spUp, _spRel, 1 / r);

    /* A ring on the water under the ship, biased forward so a fast pass throws
       its wake ahead of itself before the ship catches up with it. */
    V3.copy(_spF, src.vel);
    V3.addScaled(_spF, _spF, _spUp, -V3.dot(_spF, _spUp));
    const vh = V3.len(_spF);
    if (vh > 1e-3) V3.scale(_spF, _spF, 1 / vh); else V3.set(_spF, 1, 0, 0);
    V3.normalize(_spR, V3.cross(_spR, _spF, _spUp));

    const len = Math.max(10, Ships.length());
    const a = Math.random() * TAU;
    const rad = len * (0.15 + Math.random() * 0.62);
    const fwd = Math.cos(a) * rad + Math.min(vh, 120) * 0.05;
    const side = Math.sin(a) * rad;

    const p = {
      pos: V3.new(), vel: V3.new(), up: V3.new(),
      life: SPRAY.life * (0.55 + Math.random() * 0.75),
      /* Small.  The first cut used metre-and-a-half puffs on the theory that
         they had to be visible from the cockpit, and what came out was a
         trail of beach balls: at this scale the plume only reads as water if
         no single drop of it is big enough to look at. */
      size: 0.22 + Math.random() * 0.85,
      drag: 0.7 + Math.random() * 1.1,
      /* Foam is white, a lifted droplet is the colour of the sea it came from. */
      tint: 0.62 + Math.random() * 0.38
    };
    V3.copy(p.up, _spUp);
    V3.addScaled(p.pos, planet.pos, _spUp, planet.seaRadius + 0.4);
    V3.addScaled(p.pos, p.pos, _spF, fwd);
    V3.addScaled(p.pos, p.pos, _spR, side);

    /* Up hard, out from the centre of the wash, and carrying a share of the
       ship's own motion. */
    const lift = SPRAY.rise * (0.5 + Math.random()) * (0.4 + this.intensity);
    V3.scale(p.vel, _spUp, lift);
    V3.addScaled(p.vel, p.vel, _spF, Math.cos(a) * lift * 0.35 + vh * 0.10);
    V3.addScaled(p.vel, p.vel, _spR, Math.sin(a) * lift * 0.35);
    this.parts.push(p);
  },

  fillInstances(camPos) {
    this.count = 0;
    if (!this.parts) return;
    for (const p of this.parts) {
      if (this.count >= SPRAY.max) break;
      const o = this.count * 11;
      this.inst[o] = p.pos[0] - camPos[0];
      this.inst[o + 1] = p.pos[1] - camPos[1];
      this.inst[o + 2] = p.pos[2] - camPos[2];
      this.inst[o + 3] = 0; this.inst[o + 4] = 0; this.inst[o + 5] = 0; this.inst[o + 6] = 1;
      /* Thins out as it dies rather than fading: there is no alpha in this
         pass, and a droplet that shrinks reads as one that has evaporated. */
      const t = saturate(p.life / SPRAY.life);
      this.inst[o + 7] = p.tint * 0.92; this.inst[o + 8] = p.tint * 0.97; this.inst[o + 9] = p.tint;
      this.inst[o + 10] = p.size * (0.30 + 0.70 * t) * (1 + (1 - t) * 0.45);
      this.count++;
    }
  }
};

const _spRel = V3.new(), _spUp = V3.new(), _spF = V3.new(), _spR = V3.new();
