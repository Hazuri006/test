'use strict';
/* ============================================================================
   debris.js — orbital debris belts.

   Roughly four worlds in five carry a belt: a torus of rock and wreckage
   sitting above the atmosphere, tilted off the equator and slowly precessing.
   Two thirds of them are broad fields rather than tidy rings.  You fly through
   it on the way down.

   One instanced draw call per planet.  The belt's rotation is a uniform rather
   than baked into the instance buffer, so it turns for free, and each rock's
   apparent size has a floor so a belt still reads as a band from orbit instead
   of dissolving into sub-pixel noise.
   ============================================================================ */

/* A physically-spaced belt is almost entirely empty — kilometres between
   rocks — which reads as nothing at all.  These are deliberately concentrated
   into a thinner, narrower band so it registers both as a ring from orbit and
   as debris you are flying through when you are inside it. */
const DEBRIS_QUALITY = { low: 2200, medium: 4500, high: 7500, ultra: 12000 };

const Debris = {
  /* Deterministic from the planet seed — the same world always has the same
     belt, and 'some planets' stays stable across sessions. */
  configFor(planet) {
    const rng = makeRNG((planet.seed ^ 0x5eb17e21) >>> 0);
    /* Most worlds carry something; a quarter are clean. */
    if (rng() > 0.78) return null;

    const R = planet.radius;
    const inner = Math.max(planet.atmoRadius * 1.06, R * (1.24 + rng() * 0.30));
    const width = R * (0.30 + rng() * 0.75);
    /* Two thirds are broad fields wrapping the planet rather than tidy rings —
       that is what a debris field actually looks like from inside it. */
    const field = rng() < 0.66;
    const tiltA = (rng() - 0.5) * 0.9;
    const tiltB = (rng() - 0.5) * 0.9;

    const axis = V3.normalize(V3.new(), V3.new(Math.sin(tiltA), Math.cos(tiltA) * Math.cos(tiltB), Math.sin(tiltB)));
    return {
      inner, outer: inner + width,
      field,
      /* A field is nearly as thick as it is wide; a ring stays a band. */
      thickness: field ? (width * (0.35 + rng() * 0.35)) : R * (0.008 + rng() * 0.022),
      axis,
      /* A few minutes per revolution: perceptible while you sit in it, never
         distracting. */
      spin: (rng() < 0.5 ? -1 : 1) * (TAU / (180 + rng() * 320)),
      density: 0.55 + rng() * 0.9,
      rockScale: R * (0.00016 + rng() * 0.00030),
      bigChance: 0.04 + rng() * 0.06,
      tint: rng()
    };
  },

  /* One lumpy rock; per-instance rotation, scale and tint do the rest. */
  buildRockMesh(gl, planet, cfg) {
    const B = new MeshBuilder();
    const base = planet.biome.col.cliff;
    const warm = cfg.tint;
    const col = [
      base[0] * (0.75 + warm * 0.5) + 0.06,
      base[1] * (0.75 + warm * 0.4) + 0.055,
      base[2] * (0.72 + warm * 0.3) + 0.05
    ];
    B.sphere(0, 0, 0, 1, 1, col, 0, (x, y, z) =>
      0.70
      + 0.20 * Math.sin(x * 3.7 + y * 2.1)
      + 0.14 * Math.cos(z * 4.3 - x * 1.9)
      + 0.10 * Math.sin(y * 6.1 + z * 3.3));
    return B;
  },

  build(gl, planet, qualityName) {
    const cfg = this.configFor(planet);
    if (!cfg) return null;

    const count = Math.round((DEBRIS_QUALITY[qualityName] || 1500) * cfg.density);
    const rng = makeRNG((planet.seed ^ 0x13579bdf) >>> 0);

    /* iOffset(3) iRot(4) iTint(4) — tint.a carries the scale. */
    const inst = new Float32Array(count * 11);
    const axis = cfg.axis;
    const t1 = V3.new(), t2 = V3.new(), tmp = V3.new(0, 1, 0);
    if (Math.abs(V3.dot(axis, tmp)) > 0.9) V3.set(tmp, 1, 0, 0);
    V3.normalize(t1, V3.cross(t1, tmp, axis));
    V3.normalize(t2, V3.cross(t2, axis, t1));

    const q = Q4.new(), ax = V3.new();
    for (let i = 0; i < count; i++) {
      const a = rng() * TAU;
      /* sqrt keeps the belt evenly dense rather than crowding the inner edge */
      const r = Math.sqrt(lerp(cfg.inner * cfg.inner, cfg.outer * cfg.outer, rng()));
      const h = (rng() + rng() - 1) * cfg.thickness;
      const ca = Math.cos(a), sa = Math.sin(a);
      const o = i * 11;
      inst[o] = t1[0] * ca * r + t2[0] * sa * r + axis[0] * h;
      inst[o + 1] = t1[1] * ca * r + t2[1] * sa * r + axis[1] * h;
      inst[o + 2] = t1[2] * ca * r + t2[2] * sa * r + axis[2] * h;

      V3.set(ax, rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
      V3.normalize(ax, ax);
      Q4.fromAxisAngle(q, ax, rng() * TAU);
      inst[o + 3] = q[0]; inst[o + 4] = q[1]; inst[o + 5] = q[2]; inst[o + 6] = q[3];

      const shade = 0.62 + rng() * 0.62;
      inst[o + 7] = shade; inst[o + 8] = shade; inst[o + 9] = shade;
      /* Mostly gravel, occasionally something the size of a building. */
      const big = rng() < cfg.bigChance;
      const size = big ? 4.5 + rng() * 9 : 0.35 + rng() * rng() * 2.6;
      inst[o + 10] = cfg.rockScale * size;
    }

    const B = this.buildRockMesh(gl, planet, cfg);
    const mesh = B.buildInstanced(gl, inst);
    return { mesh, cfg, count, angle: 0 };
  },

  update(belt, dt) {
    if (!belt) return;
    belt.angle = (belt.angle + belt.cfg.spin * dt) % TAU;
  },

  dispose(belt) { if (belt && belt.mesh) belt.mesh.dispose(); }
};
