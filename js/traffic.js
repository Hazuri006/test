'use strict';
/* ============================================================================
   traffic.js — the other ships.

   Some systems have traffic and some do not; the system seed decides.  Where
   there is any, it is local: haulers on approach to the active world, patrols
   holding an orbit, and the occasional courier crossing at speed.  That is
   deliberate.  A star system here is twenty million metres across, and a ship
   flying between two planets at a plausible cruise would take hours to arrive —
   you would never once see it move.  Traffic that lives around whatever world
   you are at is traffic you actually meet.

   Three procedural hulls, built at unit size and scaled per instance, drawn
   through the same instanced object shader as the debris belts and the
   wildlife.  Engine blocks are flagged emissive, so a ship too far away to
   resolve still reads as a moving light — which is what you see first.
   ============================================================================ */

const TRAFFIC = {
  max: 6,
  /* Spawn shell around the player, and the range past which a ship is gone. */
  spawnNear: 3500,
  spawnFar: 22000,
  despawn: 55000,
  /* Below this the hull is smaller than a pixel and only the running lights
     carry it, so hold it to a couple of pixels of apparent size. */
  minPixels: 2.4
};

const TRAFFIC_ROLES = ['hauler', 'courier', 'patrol'];

/* ---------------------------------------------------------------- hulls -- */
/* Built in unit space: roughly one unit from the centre to the nose, so the
   per-instance scale is the ship's half-length in metres. */
function buildHull(gl, variant, rng) {
  const B = new MeshBuilder();
  /* Painted metal, not plastic: near-neutral and on the dark side, so what the
     eye picks out at distance is the running lights rather than the hull. */
  const g = 0.30 + rng() * 0.20;
  const body = [g + 0.04 * rng(), g + 0.03 * rng(), g * 1.06 + 0.03 * rng()];
  const dark = [body[0] * 0.42, body[1] * 0.42, body[2] * 0.46];
  const glow = variant === 2
    ? [1.0, 0.42, 0.22]
    : (variant === 1 ? [0.35, 0.85, 1.0] : [0.55, 0.75, 1.0]);
  const lamp = [1.0, 0.35, 0.25];

  if (variant === 0) {
    /* Hauler: a spine with slung containers and a blunt bridge. */
    B.box(-0.16, -0.14, -0.95, 0.16, 0.16, 0.62, body, 0, 0, 0.55, true);
    B.box(-0.30, -0.05, -0.10, -0.16, 0.12, 0.55, dark, 0, 0);
    B.box(0.16, -0.05, -0.10, 0.30, 0.12, 0.55, dark, 0, 0);
    B.box(-0.13, 0.16, -0.55, 0.13, 0.30, -0.18, body, 0, 0);
    B.box(-0.09, 0.19, -0.58, 0.09, 0.27, -0.53, [0.5, 0.85, 1.0], 0, 1);
    for (const sx of [-1, 1]) {
      B.box(sx * 0.10 - 0.07, -0.10, 0.60, sx * 0.10 + 0.07, 0.04, 0.72, dark, 0, 0);
      B.box(sx * 0.10 - 0.05, -0.08, 0.70, sx * 0.10 + 0.05, 0.02, 0.76, glow, 0, 1);
    }
  } else if (variant === 1) {
    /* Courier: a narrow delta, everything swept back. */
    B.box(-0.11, -0.10, -1.00, 0.11, 0.11, 0.55, body, 0, 0, 0.25, true);
    B.box(-0.62, -0.03, 0.05, -0.11, 0.03, 0.45, body, 0, 0, 0.30, false);
    B.box(0.11, -0.03, 0.05, 0.62, 0.03, 0.45, body, 0, 0, 0.30, false);
    B.box(-0.07, 0.09, -0.50, 0.07, 0.20, -0.16, dark, 0, 0, 0.5, true);
    B.box(-0.05, 0.11, -0.46, 0.05, 0.17, -0.40, [0.55, 0.9, 1.0], 0, 1);
    B.box(-0.08, -0.07, 0.52, 0.08, 0.07, 0.64, dark, 0, 0);
    B.box(-0.06, -0.05, 0.62, 0.06, 0.05, 0.70, glow, 0, 1);
  } else {
    /* Patrol: short, angular, wings forward, two outboard engines. */
    B.box(-0.19, -0.13, -0.85, 0.19, 0.15, 0.55, body, 0, 0, 0.45, true);
    for (const sx of [-1, 1]) {
      B.box(sx * 0.19, -0.04, -0.30, sx * 0.58, 0.03, 0.30, body, 0, 0, 0.35, false);
      B.box(sx * 0.40, -0.09, 0.18, sx * 0.56, 0.07, 0.52, dark, 0, 0);
      B.box(sx * 0.42, -0.07, 0.48, sx * 0.54, 0.05, 0.58, glow, 0, 1);
      B.box(sx * 0.52, 0.03, -0.10, sx * 0.56, 0.20, 0.15, dark, 0, 0, 0.4, true);
    }
    B.box(-0.11, 0.15, -0.44, 0.11, 0.26, -0.05, dark, 0, 0, 0.6, true);
    B.box(-0.08, 0.18, -0.46, 0.08, 0.23, -0.40, [0.6, 0.9, 1.0], 0, 1);
    B.box(-0.03, 0.26, -0.20, 0.03, 0.29, -0.14, lamp, 0, 1);
  }
  return B.buildInstanced(gl, new Float32Array(0));
}

/* --------------------------------------------------------------------------
   The traffic itself.
   -------------------------------------------------------------------------- */
const Traffic = {
  hulls: null,
  ships: null,
  system: null,
  count: 0,

  build(gl, system) {
    this.dispose();
    this.system = system;
    const rng = makeRNG((system.seed ^ 0x51d0c7e3) >>> 0);
    /* Roughly a third of systems are empty, and the rest are quiet. */
    this.count = rng() < 0.32 ? 0 : 2 + ((rng() * (TRAFFIC.max - 1)) | 0);
    if (!this.count) return;

    this.hulls = [];
    for (let i = 0; i < 3; i++) {
      this.hulls.push({ mesh: buildHull(gl, i, rng), inst: new Float32Array(TRAFFIC.max * 11), n: 0 });
    }
    this.ships = [];
    this._rng = rng;
  },

  /* Spawned in a shell around the player, never around the planet's centre.  A
     star system is big enough that a ship placed "somewhere in orbit" is two
     hundred kilometres away and gone again before it has moved — traffic has to
     be seeded where you are if you are ever going to meet any. */
  spawn(game, rng) {
    const p = game.activePlanet;
    const pos = V3.new();
    const role = p
      ? TRAFFIC_ROLES[(rng() * TRAFFIC_ROLES.length) | 0]
      : 'courier';

    randomDir(_tDir, rng);
    V3.addScaled(pos, game.camPos, _tDir, TRAFFIC.spawnNear + rng() * TRAFFIC.spawnFar);
    if (p) {
      /* Never underground, and never inside the atmosphere it would have to
         re-enter to get out of. */
      V3.sub(_tFwd, pos, p.pos);
      const r = V3.len(_tFwd);
      const floor = p.atmoRadius * 1.02;
      if (r < floor) {
        V3.scale(_tFwd, _tFwd, floor / Math.max(r, 1));
        V3.add(pos, p.pos, _tFwd);
      }
    }

    const variant = (rng() * 3) | 0;
    const s = {
      pos, vel: V3.new(), rot: Q4.new(),
      variant,
      size: (variant === 0 ? 16 : variant === 1 ? 9 : 12) * (0.8 + rng() * 0.6),
      role,
      speed: 0,
      cruise: role === 'courier' ? 900 + rng() * 1400 : 180 + rng() * 320,
      target: V3.new(),
      timer: 0,
      tint: 0.75 + rng() * 0.5,
      hailed: false
    };
    this.retarget(s, game, rng);
    /* Point it where it is going, so it does not spend its first seconds
       swinging round in front of you. */
    V3.sub(_tFwd, s.target, s.pos);
    if (V3.lenSq(_tFwd) > 1e-6) {
      V3.normalize(_tFwd, _tFwd);
      orientTo(s.rot, _tFwd);
      V3.scale(s.vel, _tFwd, s.cruise * 0.6);
    }
    return s;
  },

  retarget(s, game, rng) {
    const p = game.activePlanet;
    s.timer = 14 + rng() * 26;
    if (p && s.role !== 'courier') {
      /* Shift a little way around the world and change altitude, rather than
         picking a point on the far side that takes twenty minutes to reach. */
      V3.sub(_tDir, s.pos, p.pos);
      const r = Math.max(V3.len(_tDir), 1);
      V3.scale(_tDir, _tDir, 1 / r);
      randomDir(_tSide, rng);
      V3.addScaled(_tDir, _tDir, _tSide, 0.10 + rng() * 0.26);
      V3.normalize(_tDir, _tDir);
      const lo = (p.atmoRadius * 1.03) / p.radius;
      const band = clamp(r / p.radius + (rng() - 0.5) * 0.55, lo, 3.4);
      V3.addScaled(s.target, p.pos, _tDir, p.radius * band);
    } else {
      /* Straight through, past whoever is watching. */
      randomDir(_tDir, rng);
      V3.addScaled(s.target, game.camPos, _tDir, 22000 + rng() * 26000);
    }
  },

  update(dt, game) {
    if (!this.ships) return;
    const rng = this._rng;

    for (let i = this.ships.length - 1; i >= 0; i--) {
      if (V3.dist(this.ships[i].pos, game.camPos) > TRAFFIC.despawn) this.ships.splice(i, 1);
    }
    if (this.ships.length < this.count) {
      const s = this.spawn(game, rng);
      if (s) this.ships.push(s);
    }

    for (const s of this.ships) {
      s.timer -= dt;
      V3.sub(_tFwd, s.target, s.pos);
      const d = V3.len(_tFwd);
      if (s.timer <= 0 || d < s.size * 12) this.retarget(s, game, rng);

      V3.sub(_tFwd, s.target, s.pos);
      if (V3.lenSq(_tFwd) < 1e-8) continue;
      V3.normalize(_tFwd, _tFwd);

      /* Turn the nose toward the target and let the velocity follow it, rather
         than steering the velocity directly — that is what makes a ship bank
         into a turn instead of sliding through it sideways. */
      orientTo(_tQ, _tFwd);
      Q4.slerp(s.rot, s.rot, _tQ, 1 - Math.exp(-dt * 0.7));
      quatFwd(_tNose, s.rot);

      /* Ease off as it arrives so it does not overshoot and turn round. */
      const want = s.cruise * saturate(V3.dist(s.target, s.pos) / (s.size * 40));
      s.speed = damp(s.speed, want, 0.6, dt);
      V3.scale(s.vel, _tNose, s.speed);
      V3.addScaled(s.pos, s.pos, s.vel, dt);

      /* One notification per ship, the first time it comes close. */
      const pd = V3.dist(s.pos, game.camPos);
      if (!s.hailed && pd < 3000 && game.mode === 'ship') {
        s.hailed = true;
        game.notify('SHIP DETECTED — ' + s.role.toUpperCase(), 'ok');
      } else if (s.hailed && pd > 9000) {
        s.hailed = false;
      }
    }
  },

  fillInstances(camPos) {
    if (!this.hulls) return;
    for (const h of this.hulls) h.n = 0;
    if (!this.ships) return;
    for (const s of this.ships) {
      const h = this.hulls[s.variant];
      if (h.n >= TRAFFIC.max) continue;
      const o = h.n * 11;
      h.inst[o] = s.pos[0] - camPos[0];
      h.inst[o + 1] = s.pos[1] - camPos[1];
      h.inst[o + 2] = s.pos[2] - camPos[2];
      h.inst[o + 3] = s.rot[0]; h.inst[o + 4] = s.rot[1];
      h.inst[o + 5] = s.rot[2]; h.inst[o + 6] = s.rot[3];
      h.inst[o + 7] = s.tint; h.inst[o + 8] = s.tint; h.inst[o + 9] = s.tint;
      h.inst[o + 10] = s.size;
      h.n++;
    }
  },

  dispose() {
    if (this.hulls) for (const h of this.hulls) h.mesh.dispose();
    this.hulls = null;
    this.ships = null;
    this.system = null;
    this.count = 0;
    this._rng = null;
  }
};

function randomDir(o, rng) {
  const z = rng() * 2 - 1, a = rng() * TAU, r = Math.sqrt(Math.max(0, 1 - z * z));
  V3.set(o, Math.cos(a) * r, Math.sin(a) * r, z);
  return o;
}

/* Nose along `fwd`, roughly level against the world up. */
function orientTo(q, fwd) {
  V3.set(_tUp, 0, 1, 0);
  if (Math.abs(V3.dot(_tUp, fwd)) > 0.98) V3.set(_tUp, 1, 0, 0);
  V3.normalize(_tRight, V3.cross(_tRight, fwd, _tUp));
  V3.normalize(_tUp2, V3.cross(_tUp2, _tRight, fwd));
  return Q4.fromBasis(q, _tRight, _tUp2, fwd);
}

const _tDir = V3.new(), _tSide = V3.new(), _tFwd = V3.new(), _tNose = V3.new();
const _tUp = V3.new(), _tUp2 = V3.new(), _tRight = V3.new();
const _tQ = Q4.new();
