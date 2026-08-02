'use strict';
/* ============================================================================
   fauna.js — alien animals: procedural bodies, herd behaviour, and riding.

   Every creature on a world is generated from that world's seed, so the same
   planet always has the same wildlife.  Two species per world at most: enough
   that a valley is not one animal copy-pasted, few enough that they read as
   belonging somewhere.

   Rendering is two instanced draws per species — one for the body (torso, neck,
   head, tail and whatever horns the roll gave it, all baked into one mesh) and
   one for a single leg, instanced four or two times per animal.  A herd of
   twenty is therefore four draw calls, not eighty, and the instance buffers are
   rewritten each frame from the simulation.

   The body is rigid.  Everything that reads as "alive" at the distance you
   actually see these things — the legs swinging, the head dipping to graze, the
   whole animal leaning into a turn — comes from the per-instance transforms.

   Riding does not give the creature a second physics body.  Mounted, the walker
   in player.js is still the thing being simulated: it keeps terrain following,
   gravity and the jump, and the animal is drawn under the rider with the
   walker's speed limits raised to the creature's.  Trying to run a separate
   simulation for the mount and then keep the rider glued to it is how you get
   a player who clips through hills while their horse walks over them.
   ============================================================================ */

const FAUNA = {
  /* Creatures kept alive around the player.  They are cheap, but they are also
     only interesting within a few hundred metres. */
  herdMax: 18,
  spawnInner: 26,
  spawnOuter: 160,
  despawn: 300,
  mountRange: 12,
  /* How close you can get before a skittish animal bolts. */
  alertRange: 26,
  /* A calm animal stops and lets you walk up to it inside this. */
  settleRange: 16
};

/* --------------------------------------------------------------------------
   Species: the shape and temperament of one kind of animal.
   -------------------------------------------------------------------------- */
function makeSpecies(rng, planet, index, forceMount) {
  const big = rng();
  /* Every world gets one animal big enough to carry you.  Leaving it to the
     dice means worlds where the only two species are knee-high, or where the
     one you could ride bolts the moment you walk towards it — which is the
     same thing as having no mount at all. */
  const scale = forceMount ? 1.9 + big * 1.5 : 0.75 + big * big * 2.6;
  const biped = rng() < 0.28;
  const cfg = {
    id: index,
    biped,
    legs: biped ? 2 : 4,
    scale,
    bodyLen: (1.15 + rng() * 0.75) * scale,
    bodyR: (0.34 + rng() * 0.22) * scale,
    legLen: (0.55 + rng() * 0.75) * scale * (biped ? 1.35 : 1),
    legR: (0.10 + rng() * 0.065) * scale,
    neck: (0.25 + rng() * 0.95) * scale,
    headR: (0.19 + rng() * 0.13) * scale,
    tail: rng() < 0.7 ? (0.4 + rng() * 1.1) * scale : 0,
    horns: rng() < 0.45 ? (0.18 + rng() * 0.4) * scale : 0,
    fin: rng() < 0.3,
    /* Big animals are slower and calmer; small ones are quick and skittish. */
    walk: lerp(3.4, 1.9, saturate((scale - 0.75) / 2.5)) * (biped ? 1.25 : 1),
    run: lerp(13.0, 8.0, saturate((scale - 0.75) / 2.5)) * (biped ? 1.2 : 1),
    /* Only something you can actually sit on is worth mounting. */
    rideable: forceMount || scale > 1.5,
    skittish: rng() < 0.45,
    curious: false,
    stride: 0
  };
  /* A big grazer does not sprint away from you, and one that did could never
     be caught on foot anyway.  Only the small quick things bolt. */
  if (cfg.rideable) cfg.skittish = false;
  cfg.curious = !cfg.skittish && rng() < 0.5;
  cfg.stride = (cfg.legLen * 1.9 + cfg.bodyLen * 0.35);
  cfg.rideSpeed = cfg.run * 1.35;
  cfg.saddleH = cfg.legLen + cfg.bodyR * 0.9;

  /* Colour: the biome palette, pushed somewhere it would not go on its own so
     the animals stand out against the ground they are standing on. */
  const base = planet.biome.col.cliff;
  const shift = rng();
  cfg.col = [
    clamp(base[0] * (0.6 + shift * 0.9) + 0.10 * rng(), 0.04, 0.95),
    clamp(base[1] * (0.6 + (1 - shift) * 0.9) + 0.10 * rng(), 0.04, 0.95),
    clamp(base[2] * (0.7 + rng() * 0.8) + 0.10 * rng(), 0.04, 0.95)
  ];
  cfg.accent = [
    clamp(cfg.col[0] * 0.5 + 0.30 * rng(), 0.03, 1),
    clamp(cfg.col[1] * 0.5 + 0.30 * rng(), 0.03, 1),
    clamp(cfg.col[2] * 0.5 + 0.35 * rng(), 0.03, 1)
  ];
  cfg.name = faunaName(rng);
  return cfg;
}

const _FAUNA_SYL_A = ['ka', 'thu', 'vor', 'ny', 'sel', 'gra', 'oc', 'ish', 'ber', 'zan', 'mu', 'dre'];
const _FAUNA_SYL_B = ['loth', 'mir', 'dax', 'quen', 'ryx', 'vash', 'tor', 'phid', 'nal', 'grix'];
function faunaName(rng) {
  const a = _FAUNA_SYL_A[(rng() * _FAUNA_SYL_A.length) | 0];
  const b = _FAUNA_SYL_B[(rng() * _FAUNA_SYL_B.length) | 0];
  const s = a + b;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* Body, neck, head, tail and horns baked into one instanced mesh, with the
   origin at the hip height so the legs hang off y = 0. */
function buildBodyMesh(gl, s, rng) {
  const B = new MeshBuilder();
  const col = s.col, accent = s.accent;
  const lean = s.biped ? 0.55 : 0;                  // bipeds carry the torso up

  /* torso — a lumpy ellipsoid rather than a smooth one */
  const ph = rng() * 10;
  B.sphere(0, 0, 0, s.bodyR, 1, col, 0, (x, y, z) => {
    const stretch = 1 + (z * z) * (s.bodyLen / s.bodyR / 2 - 1);
    return (0.9 + 0.1 * Math.sin(x * 5 + ph) * Math.cos(y * 4 - ph)) * stretch;
  });

  /* Neck and head, reaching forward off the shoulders as much as up.  A neck
     that only goes up puts the head exactly where a rider sits. */
  const ny = s.neck * (0.42 + lean * 0.55);
  const nz = -(s.bodyLen * 0.50 + s.neck * (0.62 - lean * 0.35));
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const r0 = s.bodyR * lerp(0.55, 0.30, t0), r1 = s.bodyR * lerp(0.55, 0.30, t1);
    const from = B.vertCount;
    B.cylinderY(0, 0, 0, 1, r0, r1, 6, col, 0, 0, false, false);
    for (let v = from * 10; v < B.v.length; v += 10) {
      const u = B.v[v + 1];                          // 0..1 along the segment
      const t = lerp(t0, t1, u);
      B.v[v + 1] = ny * t;
      B.v[v + 2] += nz * t;
    }
  }
  const hFrom = B.vertCount;
  B.sphere(0, 0, 0, s.headR, 1, col, 0, (x, y, z) => 0.92 + 0.35 * Math.max(0, -z) - 0.1 * Math.abs(x));
  for (let v = hFrom * 10; v < B.v.length; v += 10) { B.v[v + 1] += ny; B.v[v + 2] += nz; }

  /* eyes: two small emissive beads, which is most of what makes a shape read
     as an animal rather than as a rock with legs */
  for (const sx of [-1, 1]) {
    const e = B.vertCount;
    B.sphere(0, 0, 0, s.headR * 0.24, 0, [1.0, 0.85, 0.4], 8);
    for (let v = e * 10; v < B.v.length; v += 10) {
      B.v[v] += sx * s.headR * 0.55;
      B.v[v + 1] += ny + s.headR * 0.25;
      B.v[v + 2] += nz - s.headR * 0.72;
    }
  }

  if (s.horns > 0) {
    for (const sx of [-1, 1]) {
      const h = B.vertCount;
      B.cylinderY(0, 0, 0, s.horns, s.headR * 0.22, 0.01, 5, accent, 0, 0, true, true);
      for (let v = h * 10; v < B.v.length; v += 10) {
        const y = B.v[v + 1];
        B.v[v] += sx * (s.headR * 0.5 + y * 0.55);
        B.v[v + 1] = ny + s.headR * 0.5 + y * 0.8;
        B.v[v + 2] += nz - y * 0.25;
      }
    }
  }

  if (s.fin) {
    /* a dorsal ridge of plates down the spine */
    const n = 4 + ((rng() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const h = s.bodyR * (0.5 + 0.7 * Math.sin(t * PI));
      const f = B.vertCount;
      B.cylinderY(0, 0, 0, h, s.bodyR * 0.20, 0.01, 4, accent, 0, 0, true, true);
      for (let v = f * 10; v < B.v.length; v += 10) {
        B.v[v + 1] += s.bodyR * 0.75;
        B.v[v + 2] += lerp(s.bodyLen * 0.45, -s.bodyLen * 0.35, t);
      }
    }
  }

  if (s.tail > 0) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const f = B.vertCount;
      B.cylinderY(0, 0, 0, 1, s.bodyR * lerp(0.42, 0.05, t0), s.bodyR * lerp(0.42, 0.05, t1), 5, accent, 0, 0, false, false);
      for (let v = f * 10; v < B.v.length; v += 10) {
        const u = B.v[v + 1];
        const t = lerp(t0, t1, u);
        B.v[v + 1] = s.bodyR * 0.35 - t * t * s.tail * 0.5;
        B.v[v + 2] += s.bodyLen * 0.48 + t * s.tail;
      }
    }
  }

  return B.buildInstanced(gl, new Float32Array(0));
}

/* One leg: a tapered two-segment limb whose origin is the hip and which hangs
   down -Y.  Instancing rotates it about the hip. */
function buildLegMesh(gl, s) {
  const B = new MeshBuilder();
  const upper = s.legLen * 0.52, lower = s.legLen * 0.48;
  /* A straight tube from hip to ground reads as a stilt.  The thigh angles
     back, the shin comes forward again, and the joint between them is the
     single thing that makes the animal look like it has knees. */
  const knee = s.legLen * 0.22;
  const f0 = B.vertCount;
  B.cylinderY(0, 0, 0, upper, s.legR, s.legR * 0.72, 5, s.col, 0, 0, true, false);
  for (let v = f0 * 10; v < B.v.length; v += 10) {
    const t = B.v[v + 1] / upper;
    B.v[v + 1] -= upper;
    B.v[v + 2] += knee * t;
  }
  const f1 = B.vertCount;
  B.cylinderY(0, 0, 0, lower, s.legR * 0.72, s.legR * 0.46, 5, s.col, 0, 0, false, false);
  for (let v = f1 * 10; v < B.v.length; v += 10) {
    const t = B.v[v + 1] / lower;
    B.v[v + 1] -= upper + lower;
    B.v[v + 2] += knee * (1 - t * 0.85);
  }
  /* foot */
  const f2 = B.vertCount;
  B.sphere(0, 0, 0, s.legR * 1.6, 1, s.accent, 0, (x, y, z) => 0.8 + 0.55 * Math.max(0, -z));
  for (let v = f2 * 10; v < B.v.length; v += 10) {
    B.v[v + 1] = B.v[v + 1] * 0.5 - s.legLen;
    B.v[v + 2] += knee * 0.15 - s.legR * 0.7;
  }
  return B.buildInstanced(gl, new Float32Array(0));
}

/* --------------------------------------------------------------------------
   The herd.
   -------------------------------------------------------------------------- */
const Fauna = {
  species: null,
  herd: null,
  planet: null,

  /* Not every world has life: airless rocks do not, and the biome's fauna
     weight decides the rest. */
  supports(planet) {
    return !!planet && planet.atmoAmount > 0.12 && planet.biome.id !== 'airless';
  },

  build(gl, planet) {
    this.dispose();
    this.planet = planet;
    if (!this.supports(planet)) return;

    const rng = makeRNG((planet.seed ^ 0x2f10b3a7) >>> 0);
    const count = rng() < 0.35 ? 1 : 2;
    this.species = [];
    for (let i = 0; i < count; i++) {
      const s = makeSpecies(rng, planet, i, i === 0);
      s.body = buildBodyMesh(gl, s, rng);
      s.leg = buildLegMesh(gl, s);
      s.bodyInst = new Float32Array(FAUNA.herdMax * 11);
      s.legInst = new Float32Array(FAUNA.herdMax * 4 * 11);
      s.bodyCount = 0;
      s.legCount = 0;
      this.species.push(s);
    }
    this.herd = [];
  },

  /* A creature lives on the sphere: a unit direction, a tangent heading, and a
     speed along it.  Altitude comes from the terrain every frame. */
  spawn(planet, aroundDir, rng) {
    const s = this.species[(rng() * this.species.length) | 0];
    const dir = V3.new();
    /* Pick a point on the tangent disc between the inner and outer radius. */
    const a = rng() * TAU;
    const d = lerp(FAUNA.spawnInner, FAUNA.spawnOuter, Math.sqrt(rng()));
    const t1 = V3.new(), t2 = V3.new();
    basisFor(aroundDir, t1, t2);
    V3.copy(dir, aroundDir);
    V3.addScaled(dir, dir, t1, Math.cos(a) * d / planet.radius);
    V3.addScaled(dir, dir, t2, Math.sin(a) * d / planet.radius);
    V3.normalize(dir, dir);

    const alt = planet.heightAt(dir[0], dir[1], dir[2], 1);
    if (planet.hasWater && alt < planet.seaH + 0.5) return null;

    const heading = V3.new();
    basisFor(dir, heading, t2);
    const spin = rng() * TAU;
    V3.set(heading,
      heading[0] * Math.cos(spin) + t2[0] * Math.sin(spin),
      heading[1] * Math.cos(spin) + t2[1] * Math.sin(spin),
      heading[2] * Math.cos(spin) + t2[2] * Math.sin(spin));
    V3.normalize(heading, heading);

    return {
      sp: s, dir, heading,
      pos: V3.new(), up: V3.new(),
      speed: 0, phase: rng() * TAU,
      state: 'graze', timer: 1 + rng() * 4,
      grazeT: rng(), bob: 0, lean: 0,
      size: 0.82 + rng() * 0.36,
      ridden: false
    };
  },

  update(dt, planet, game) {
    if (!this.species || planet !== this.planet) return;
    const focus = game.mode === 'foot' ? game.player.pos : game.ship.pos;
    V3.sub(_fRel, focus, planet.pos);
    const fr = V3.len(_fRel);
    if (fr <= 0) return;
    V3.scale(_fDir, _fRel, 1 / fr);
    /* Only run the herd when there is somebody on the ground to see it. */
    const alt = fr - planet.radius;
    if (alt > 600) { this.herd.length = 0; return; }

    const rng = this._rng || (this._rng = makeRNG((planet.seed ^ 0x77a1) >>> 0));

    // cull
    for (let i = this.herd.length - 1; i >= 0; i--) {
      const c = this.herd[i];
      if (c.ridden) continue;
      if (V3.dist(c.pos, focus) > FAUNA.despawn) this.herd.splice(i, 1);
    }
    // top up, a few per frame so a fresh landing does not stall
    let tries = 3;
    while (this.herd.length < FAUNA.herdMax && tries-- > 0) {
      const c = this.spawn(planet, _fDir, rng);
      if (c) this.herd.push(c);
    }

    for (const c of this.herd) this.step(c, dt, planet, game, focus, rng);
  },

  step(c, dt, planet, game, focus, rng) {
    const s = c.sp;

    /* ---- where am I ---- */
    const groundR = planet.surfaceRadius(c.dir[0], c.dir[1], c.dir[2]);
    V3.copy(c.up, c.dir);
    V3.scale(c.pos, c.dir, groundR + s.legLen * c.size);
    V3.add(c.pos, c.pos, planet.pos);

    if (c.ridden) {
      c.phase += (c.speed / Math.max(s.stride * c.size, 0.4)) * TAU * dt;
      c.bob = damp(c.bob, saturate(c.speed / s.rideSpeed), 6, dt);
      return;
    }

    /* ---- decide ---- */
    const toPlayer = _fTmp;
    V3.sub(toPlayer, focus, c.pos);
    const pd = V3.len(toPlayer);
    c.timer -= dt;

    if (s.skittish && pd < FAUNA.alertRange) {
      c.state = 'flee';
      c.timer = 2.5;
    } else if (!s.skittish && pd < FAUNA.settleRange) {
      /* Stand still and watch you.  Without this a calm animal keeps ambling
         off at exactly your walking speed and can never actually be reached. */
      c.state = 'settle';
      c.timer = 1.5;
    } else if (c.state === 'flee' && (pd > FAUNA.alertRange * 2.2 || c.timer <= 0)) {
      c.state = 'graze'; c.timer = 2 + rng() * 4;
    } else if (c.timer <= 0) {
      if (s.curious && pd < FAUNA.alertRange * 2 && pd > 7) {
        c.state = 'approach'; c.timer = 3 + rng() * 3;
      } else if (c.state === 'graze' && rng() < 0.45) {
        c.state = 'idle'; c.timer = 2 + rng() * 5;
      } else {
        c.state = 'graze'; c.timer = 3 + rng() * 6;
        /* pick a new direction to amble in */
        const turn = (rng() - 0.5) * 2.4;
        rotateAbout(c.heading, c.up, turn);
      }
    }

    /* ---- move ---- */
    let want = 0;
    if (c.state === 'flee') {
      V3.scale(_fWish, toPlayer, -1);
      V3.planeProject(_fWish, _fWish, c.up);
      if (V3.lenSq(_fWish) > 1e-8) { V3.normalize(_fWish, _fWish); steer(c, _fWish, dt, 3.2); }
      want = s.run;
    } else if (c.state === 'approach') {
      V3.copy(_fWish, toPlayer);
      V3.planeProject(_fWish, _fWish, c.up);
      if (V3.lenSq(_fWish) > 1e-8) { V3.normalize(_fWish, _fWish); steer(c, _fWish, dt, 1.4); }
      want = pd > 7 ? s.walk : 0;
    } else if (c.state === 'settle') {
      /* Turn to face whoever walked up. */
      V3.copy(_fWish, toPlayer);
      V3.planeProject(_fWish, _fWish, c.up);
      if (V3.lenSq(_fWish) > 1e-8) { V3.normalize(_fWish, _fWish); steer(c, _fWish, dt, 1.1); }
      want = 0;
    } else if (c.state === 'graze') {
      want = s.walk * 0.55;
    }

    /* Do not walk into the sea, and do not climb a cliff.  Sampling the terrain
       ahead means an fbm evaluation, so each animal only does it a few times a
       second — an animal that takes a quarter of a second to notice a lake is
       an animal, not a bug. */
    c.look = (c.look || 0) - dt;
    if (c.look <= 0) {
      c.look = 0.2 + rng() * 0.2;
      const ahead = _fAhead;
      V3.copy(ahead, c.dir);
      V3.addScaled(ahead, ahead, c.heading, (want * 0.9 + 3) / planet.radius);
      V3.normalize(ahead, ahead);
      const aheadH = planet.heightAt(ahead[0], ahead[1], ahead[2], 1);
      const here = groundR - planet.radius;
      c.blocked = (planet.hasWater && aheadH < planet.seaH + 0.4) ||
        (aheadH - here) > 2.2 + want * 0.5;
    }
    if (c.blocked) {
      rotateAbout(c.heading, c.up, (rng() < 0.5 ? -1 : 1) * 2.6 * dt);
      want *= 0.25;
    }

    c.speed = damp(c.speed, want, 2.4, dt);
    if (c.speed > 0.02) {
      const step = c.speed * dt / planet.radius;
      V3.addScaled(c.dir, c.dir, c.heading, step);
      V3.normalize(c.dir, c.dir);
      /* Carry the heading across the new up so it stays tangent. */
      V3.planeProject(c.heading, c.heading, c.dir);
      V3.normalize(c.heading, c.heading);
    }

    c.phase += (c.speed / Math.max(s.stride * c.size, 0.4)) * TAU * dt;
    c.bob = damp(c.bob, saturate(c.speed / Math.max(s.run, 1)), 5, dt);
    /* Head down when standing still and grazing, up when alarmed. */
    c.grazeT = damp(c.grazeT, c.state === 'graze' && c.speed < 0.6 ? 1 : 0, 2.2, dt);
  },

  /* The nearest animal you could get on: big enough to carry you, close enough
     to reach, and not currently bolting. */
  mountable(pos) {
    if (!this.herd) return null;
    let best = null, bd = FAUNA.mountRange;
    for (const c of this.herd) {
      if (!c.sp.rideable || c.ridden || c.state === 'flee') continue;
      const d = V3.dist(c.pos, pos);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  },

  /* --------------------------------------------------------------- draw -- */
  /* Rebuild both instance buffers for every species, then two draws each. */
  fillInstances(planet, camPos, time) {
    for (const s of this.species) { s.bodyCount = 0; s.legCount = 0; }
    if (!this.herd) return;

    for (const c of this.herd) {
      const s = c.sp;
      if (s.bodyCount >= FAUNA.herdMax) continue;

      /* Orientation: -Z along the heading, +Y along the local up, exactly the
         engine's convention, so the mesh needs no fix-up rotation. */
      V3.normalize(_fUp, V3.copy(_fUp, c.up));
      V3.copy(_fFwd, c.heading);
      V3.planeProject(_fFwd, _fFwd, _fUp);
      if (V3.lenSq(_fFwd) < 1e-9) V3.set(_fFwd, 0, 0, 1);
      V3.normalize(_fFwd, _fFwd);
      V3.normalize(_fRight, V3.cross(_fRight, _fFwd, _fUp));
      Q4.fromBasis(_fQ, _fRight, _fUp, _fFwd);

      const sc = c.size;
      const gallop = c.bob;
      /* Body bob and pitch: twice a stride vertically, and a nose-down lean
         into a run.  Grazing drops the whole front end instead. */
      const bobY = Math.sin(c.phase * 2) * s.bodyR * 0.10 * gallop;
      const pitch = -gallop * 0.16 + c.grazeT * 0.30;
      Q4.fromAxisAngle(_fQ2, _fRight, pitch);
      Q4.mul(_fQ3, _fQ2, _fQ);

      const bo = s.bodyCount * 11;
      const bx = c.pos[0] - camPos[0] + _fUp[0] * bobY;
      const by = c.pos[1] - camPos[1] + _fUp[1] * bobY;
      const bz = c.pos[2] - camPos[2] + _fUp[2] * bobY;
      s.bodyInst[bo] = bx; s.bodyInst[bo + 1] = by; s.bodyInst[bo + 2] = bz;
      s.bodyInst[bo + 3] = _fQ3[0]; s.bodyInst[bo + 4] = _fQ3[1];
      s.bodyInst[bo + 5] = _fQ3[2]; s.bodyInst[bo + 6] = _fQ3[3];
      s.bodyInst[bo + 7] = 1; s.bodyInst[bo + 8] = 1; s.bodyInst[bo + 9] = 1;
      s.bodyInst[bo + 10] = sc;
      s.bodyCount++;

      /* Legs.  Hips sit fore and aft on the body; each leg swings about its
         hip with a quarter-cycle offset so a quadruped moves diagonally. */
      const n = s.legs;
      for (let i = 0; i < n; i++) {
        const front = (i & 1) === 0;
        const left = i < 2 ? true : false;
        const side = (n === 2) ? (i === 0 ? 1 : -1) : (left ? 1 : -1);
        const alongZ = (n === 2) ? 0 : (front ? -s.bodyLen * 0.36 : s.bodyLen * 0.36);
        const offX = side * s.bodyR * 0.72;
        const offY = -s.bodyR * 0.25;

        /* Diagonal pairs move together: front-left with rear-right. */
        const ph = c.phase + ((n === 2) ? (i * PI) : ((front === left) ? 0 : PI));
        const swing = Math.sin(ph) * (0.35 + gallop * 0.55);

        V3.set(_fLeg, offX * sc, offY * sc, alongZ * sc);
        V3.rotQuat(_fLeg, _fLeg, _fQ3);
        Q4.fromAxisAngle(_fQ2, _fRight, swing);
        Q4.mul(_fQ4, _fQ2, _fQ3);

        const lo = s.legCount * 11;
        s.legInst[lo] = bx + _fLeg[0];
        s.legInst[lo + 1] = by + _fLeg[1];
        s.legInst[lo + 2] = bz + _fLeg[2];
        s.legInst[lo + 3] = _fQ4[0]; s.legInst[lo + 4] = _fQ4[1];
        s.legInst[lo + 5] = _fQ4[2]; s.legInst[lo + 6] = _fQ4[3];
        s.legInst[lo + 7] = 1; s.legInst[lo + 8] = 1; s.legInst[lo + 9] = 1;
        s.legInst[lo + 10] = sc;
        s.legCount++;
      }
    }
  },

  dispose() {
    if (this.species) {
      for (const s of this.species) { s.body.dispose(); s.leg.dispose(); }
    }
    this.species = null;
    this.herd = null;
    this.planet = null;
    this._rng = null;
  }
};

/* Any two unit vectors perpendicular to `n` and to each other. */
function basisFor(n, t1, t2) {
  V3.set(t1, 0, 1, 0);
  if (Math.abs(V3.dot(n, t1)) > 0.9) V3.set(t1, 1, 0, 0);
  V3.planeProject(t1, t1, n);
  V3.normalize(t1, t1);
  V3.normalize(t2, V3.cross(t2, n, t1));
}

function rotateAbout(v, axis, rad) {
  Q4.fromAxisAngle(_fQ, axis, rad);
  V3.rotQuat(v, v, _fQ);
  V3.planeProject(v, v, axis);
  V3.normalize(v, v);
}

/* Turn the heading toward `want` at a bounded rate. */
function steer(c, want, dt, rate) {
  V3.lerp(c.heading, c.heading, want, 1 - Math.exp(-rate * dt));
  V3.planeProject(c.heading, c.heading, c.up);
  if (V3.lenSq(c.heading) < 1e-8) V3.copy(c.heading, want);
  V3.normalize(c.heading, c.heading);
}

const _fRel = V3.new(), _fDir = V3.new(), _fTmp = V3.new(), _fWish = V3.new();
const _fAhead = V3.new(), _fUp = V3.new(), _fFwd = V3.new(), _fRight = V3.new();
const _fLeg = V3.new();
const _fQ = Q4.new(), _fQ2 = Q4.new(), _fQ3 = Q4.new(), _fQ4 = Q4.new();
