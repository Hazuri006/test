'use strict';
/* ============================================================================
   spray.js — the water a ship throws up when it flies low over an ocean.

   The drive wash hits the surface, the surface goes up, and gravity brings it
   back.  That is the whole simulation: there is no fluid here, only a few
   hundred parcels launched from a ring under the ship and pulled down again.

   Three details do most of the work.

   The parcels are launched from the *sea* surface rather than from the ship, so
   they read as water being lifted rather than as something the ship is
   emitting — the plume stays behind as you pass and settles, which is what
   tells you how fast you are going.

   There are two populations, not one.  Droplets are small, fast, short-lived
   and nearly opaque; mist is large, slow, translucent and drifts.  A single
   population cannot be both, and water that is only one of them looks like
   neither — one gives you a fountain, the other a fog bank.

   And they are drawn as camera-facing discs through their own shader rather
   than as little spheres through the object shader, because at this size the
   thing that says "water" is the soft edge and the light coming through it,
   and a sphere mesh has neither.  The first version used lit spheres and what
   came out was a trail of beach balls.
   ============================================================================ */

const SPRAY = {
  max: 560,
  trigger: 42,        // metres of clearance before the surface stops reacting
  rate: 620,          // parcels a second at full effect
  rise: 11,           // how hard the wash lifts the water
  minPixels: 1.8
};

const Spray = {
  parts: null,
  mesh: null,
  inst: null,
  count: 0,
  acc: 0,
  _ord: [],
  _d: null,
  intensity: 0,       // 0..1, what the audio and the HUD would read

  build(gl) {
    if (this.mesh) return;
    /* One quad, instanced.  The instance stream is (x, y, z, radius) and
       (opacity, seed, foam, spare). */
    this.mesh = new Mesh(gl, [{ name: 'aCorner', size: 2 }]);
    this.mesh.upload(
      new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      new Uint16Array([0, 1, 2, 0, 2, 3]),
      [{ name: 'iPos', size: 4 }, { name: 'iParam', size: 4 }],
      new Float32Array(0));
    this.inst = new Float32Array(SPRAY.max * 8);
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

    if (over && clearance > -8 && clearance < SPRAY.trigger) {
      /* Strongest just off the surface, gone by the trigger height, and gone
         again if the ship is sitting still with the drives idle. */
      const near = 1 - smoothstep(3, SPRAY.trigger, Math.max(clearance, 0));
      const speed = V3.len(src.vel);
      const push = saturate(0.30 + (src.thrustVis || 0) * 0.9 + speed / 85);
      this.intensity = near * push;
    }

    this.acc += this.intensity * SPRAY.rate * dt;
    while (this.acc >= 1 && this.parts.length < SPRAY.max) {
      this.acc -= 1;
      this.spawn(planet, src);
    }
    if (this.acc > 6) this.acc = 6;

    const g = planet ? planet.gravity : 9.8;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt / p.life;
      if (p.t >= 1) { this.parts.splice(i, 1); continue; }
      V3.addScaled(p.vel, p.vel, p.up, -g * p.weight * dt);
      /* Air drag, which is what separates the two populations: a droplet keeps
         its parabola, a mist parcel loses its velocity in a third of a second
         and then just hangs and spreads. */
      V3.scale(p.vel, p.vel, Math.exp(-dt * p.drag));
      V3.addScaled(p.pos, p.pos, p.vel, dt);
      if (planet) {
        V3.sub(_spRel, p.pos, planet.pos);
        if (V3.len(_spRel) < planet.seaRadius - 0.5) this.parts.splice(i, 1);
      }
    }
  },

  spawn(planet, src) {
    V3.sub(_spRel, src.pos, planet.pos);
    const r = V3.len(_spRel);
    V3.scale(_spUp, _spRel, 1 / r);

    /* The wash ring on the water under the ship, with the ship's own heading
       for a frame: a hover throws a symmetric ring, a run throws a wake. */
    V3.copy(_spF, src.vel);
    V3.addScaled(_spF, _spF, _spUp, -V3.dot(_spF, _spUp));
    const vh = V3.len(_spF);
    if (vh > 1e-3) V3.scale(_spF, _spF, 1 / vh); else V3.set(_spF, 1, 0, 0);
    V3.normalize(_spR, V3.cross(_spR, _spF, _spUp));

    /* Two thirds droplets, one third mist. */
    const misty = Math.random() < 0.45;
    const len = Math.max(9, Ships.length());
    const a = Math.random() * TAU;
    /* Centre-weighted, not uniform over the disc: the wash is a column, so
       most of the water comes up directly under the hull and only the tail of
       the distribution reaches the edge.  Spread it evenly and the plume
       reads as a thin ring rather than a burst. */
    const rad = len * 0.75 * Math.random() * Math.random();
    const fwd = Math.cos(a) * rad;
    const side = Math.sin(a) * rad;

    const p = {
      pos: V3.new(), vel: V3.new(), up: V3.new(),
      t: 0,
      /* Small.  At this scale water only reads as water if no single parcel of
         it is big enough to look at on its own. */
      size: misty ? 0.45 + Math.random() * 0.95 : 0.10 + Math.random() * Math.random() * 0.45,
      life: misty ? 0.9 + Math.random() * 1.0 : 0.5 + Math.random() * 0.8,
      drag: misty ? 2.6 + Math.random() * 1.6 : 0.25 + Math.random() * 0.5,
      weight: misty ? 0.20 : 1.0,
      grow: misty ? 1.2 : 0.25,
      peak: misty ? 0.45 : 0.85,
      foam: misty ? 0.15 : 0.60 + Math.random() * 0.4,
      seed: Math.random()
    };
    V3.copy(p.up, _spUp);
    V3.addScaled(p.pos, planet.pos, _spUp, planet.seaRadius + 0.3);
    V3.addScaled(p.pos, p.pos, _spF, fwd);
    V3.addScaled(p.pos, p.pos, _spR, side);

    /* Up hard, out from the centre of the wash, and carrying a share of the
       ship's own motion.  Droplets get most of the lift; mist barely any, so
       it stays as a sheet at the surface. */
    const lift = SPRAY.rise * (misty ? 0.25 + Math.random() * 0.35 : 0.55 + Math.random() * 1.1) *
      (0.45 + this.intensity);
    V3.scale(p.vel, _spUp, lift);
    V3.addScaled(p.vel, p.vel, _spF, Math.cos(a) * lift * 0.55 + vh * (misty ? 0.05 : 0.13));
    V3.addScaled(p.vel, p.vel, _spR, Math.sin(a) * lift * 0.55);
    this.parts.push(p);
  },

  fillInstances(camPos) {
    this.count = 0;
    if (!this.parts) return;
    const parts = this.parts, n = parts.length;
    if (!this._d || this._d.length < n) this._d = new Float64Array(n + 128);
    const d = this._d, ord = this._ord;
    ord.length = n;
    for (let i = 0; i < n; i++) {
      const q = parts[i].pos;
      const dx = q[0] - camPos[0], dy = q[1] - camPos[1], dz = q[2] - camPos[2];
      d[i] = dx * dx + dy * dy + dz * dz;
      ord[i] = i;
    }
    /* Back to front, because these parcels are composited and write no depth
       of their own: alpha over alpha is only correct in that order. */
    ord.sort((a, b) => d[b] - d[a]);

    for (let k = 0; k < n; k++) {
      const p = parts[ord[k]];
      if (this.count >= SPRAY.max) break;
      const o = this.count * 8;
      this.inst[o] = p.pos[0] - camPos[0];
      this.inst[o + 1] = p.pos[1] - camPos[1];
      this.inst[o + 2] = p.pos[2] - camPos[2];
      /* Droplets hold their size; mist expands as it thins, which is what an
         expanding cloud of anything does and what sells it as vapour. */
      this.inst[o + 3] = p.size * (1 + p.t * p.grow);
      /* Fade in fast, out slowly.  The fade-in matters: without it every
         parcel appears at full strength on the water and the plume looks like
         it is being switched on rather than thrown up. */
      const rise = saturate(p.t / 0.12);
      const fall = 1 - smoothstep(p.peak * 0.55, 1.0, p.t);
      this.inst[o + 4] = rise * fall * (p.weight > 0.5 ? 0.95 : 0.72);
      this.inst[o + 5] = p.seed;
      this.inst[o + 6] = p.foam;
      this.inst[o + 7] = 0;
      this.count++;
    }
  }
};

const _spRel = V3.new(), _spUp = V3.new(), _spF = V3.new(), _spR = V3.new();
