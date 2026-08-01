'use strict';
/* ============================================================================
   props.js — surface scatter (rocks, flora, crystals).

   Props are baked straight into a per-chunk mesh in chunk-local space rather
   than instanced.  A finest-level chunk is only ~25 m across, so one bake is
   cheap, it costs a single draw call, and it means props inherit the chunk's
   streaming lifetime for free — they appear and vanish exactly when their
   ground does.
   ============================================================================ */

const Props = {
  maxPerChunk: 44,

  /* Deterministic per-chunk seed: the same patch always grows the same trees. */
  seedFor(chunk) {
    const p = chunk.t.planet;
    let s = (p.seed ^ (chunk.face * 92821) ^ (chunk.level * 6151)) | 0;
    s = (s + Math.round((chunk.u0 + 1) * 1048576) * 40503) | 0;
    s = (s ^ Math.round((chunk.v0 + 1) * 1048576) * 12289) | 0;
    return s;
  },

  scatter(chunk, gl) {
    const terrain = chunk.t;
    const planet = terrain.planet;
    const cfg = planet.biome.props;
    if (!cfg) return null;

    const total = cfg.rock + cfg.tree + cfg.crystal;
    if (total <= 0.01) return null;

    /* Finest chunks get the full population, one level up gets a thinned one
       so the transition outward is gradual rather than a hard ring.  Biome
       weight drives density too: a lush world should read as vegetated, a
       barren one as scattered boulders. */
    const levelScale = chunk.level >= terrain.maxLevel ? 1.0 : 0.4;
    const count = Math.round(this.maxPerChunk * levelScale * clamp(total, 0.35, 1.5));
    if (count < 1) return null;

    const rng = makeRNG(this.seedFor(chunk));
    const f = CUBE_FACES[chunk.face];
    const B = new MeshBuilder();

    const dir = V3.new(), nrm = V3.new(), pos = V3.new();
    const cx = chunk.center[0], cy = chunk.center[1], cz = chunk.center[2];
    const tint = cfg.tint;

    let placed = 0;
    for (let k = 0; k < count; k++) {
      const u = chunk.u0 + rng() * chunk.size;
      const v = chunk.v0 + rng() * chunk.size;
      V3.set(dir,
        f.n[0] + f.u[0] * u + f.v[0] * v,
        f.n[1] + f.u[1] * u + f.v[1] * v,
        f.n[2] + f.u[2] * u + f.v[2] * v);
      V3.normalize(dir, dir);

      const alt = planet.heightAt(dir[0], dir[1], dir[2], chunk.lod);
      if (planet.hasWater && alt < planet.seaH + 1.5) continue;      // no props in the sea

      planet.normalAt(dir, nrm, Math.max(planet.radius * 4e-6, 0.6));
      const slope = 1 - V3.dot(nrm, dir);
      if (slope > 0.30) continue;                                     // too steep to root

      const r = planet.radius + alt;
      V3.scale(pos, dir, r);

      /* Local frame: +Y along the surface normal. */
      const upx = nrm[0], upy = nrm[1], upz = nrm[2];
      let ax = 0, ay = 0, az = 1;
      if (Math.abs(upz) > 0.9) { ax = 1; ay = 0; az = 0; }
      let tx = upy * az - upz * ay, ty = upz * ax - upx * az, tz = upx * ay - upy * ax;
      let tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let bx = upy * tz - upz * ty, by = upz * tx - upx * tz, bz = upx * ty - upy * tx;

      const spin = rng() * TAU;
      const cs = Math.cos(spin), sn = Math.sin(spin);
      const rx = tx * cs + bx * sn, ry = ty * cs + by * sn, rz = tz * cs + bz * sn;
      const fx = -tx * sn + bx * cs, fy = -ty * sn + by * cs, fz = -tz * sn + bz * cs;

      const ox = pos[0] - cx, oy = pos[1] - cy, oz = pos[2] - cz;

      // pick an archetype
      const roll = rng() * total;
      const local = new MeshBuilder();
      const shade = 0.72 + rng() * 0.5;
      const col = [tint[0] * shade, tint[1] * shade, tint[2] * shade];

      if (roll < cfg.rock) this.buildRock(local, rng, col);
      else if (roll < cfg.rock + cfg.tree) this.buildFlora(local, rng, col, planet.biome.id);
      else this.buildCrystal(local, rng, col, planet.biome.id);

      /* Bake the local mesh into the chunk mesh. */
      const base = B.vertCount;
      const lv = local.v;
      for (let i = 0; i < lv.length; i += 10) {
        const px = lv[i], py = lv[i + 1], pz = lv[i + 2];
        const nx = lv[i + 3], ny = lv[i + 4], nz = lv[i + 5];
        B.v.push(
          ox + rx * px + upx * py + fx * pz,
          oy + ry * px + upy * py + fy * pz,
          oz + rz * px + upz * py + fz * pz,
          rx * nx + upx * ny + fx * nz,
          ry * nx + upy * ny + fy * nz,
          rz * nx + upz * ny + fz * nz,
          lv[i + 6], lv[i + 7], lv[i + 8], lv[i + 9]
        );
      }
      for (let i = 0; i < local.i.length; i++) B.i.push(base + local.i[i]);
      placed++;
    }

    if (!placed) return null;
    return B.build(gl);
  },

  /* --------------------------------------------------------------- shapes -- */
  buildRock(B, rng, col) {
    const s = 0.7 + rng() * 2.6;
    const sx = 0.7 + rng() * 0.7, sy = 0.45 + rng() * 0.6, sz = 0.7 + rng() * 0.7;
    const ph = rng() * 10;
    B.sphere(0, s * sy * 0.55, 0, s, 1, col, 0, (x, y, z) => {
      const n = 0.78
        + 0.22 * Math.sin(x * 3.1 + ph) * Math.cos(z * 2.7 - ph)
        + 0.12 * Math.sin(y * 5.3 + ph * 2);
      return n * (1 + (x * x * (sx - 1) + y * y * (sy - 1) + z * z * (sz - 1)));
    });
  },

  buildFlora(B, rng, col, biomeId) {
    const h = 2.4 + rng() * 5.5;
    const trunk = [col[0] * 0.42 + 0.10, col[1] * 0.34 + 0.07, col[2] * 0.28 + 0.05];
    const leaf = [col[0], col[1], col[2]];

    if (biomeId === 'toxic' || biomeId === 'exotic') {
      // tall stalk with a bulbous, faintly glowing head
      B.cylinderY(0, 0, 0, h, 0.16, 0.09, 6, trunk, 0, 0, false, false);
      const bulb = [leaf[0] * 1.2, leaf[1] * 1.2, leaf[2] * 1.2];
      const from = B.vertCount;
      B.sphere(0, 0, 0, 0.85 + rng() * 0.5, 1, bulb, 8);
      for (let i = from * 10; i < B.v.length; i += 10) B.v[i + 1] += h;
    } else if (biomeId === 'frozen' || biomeId === 'desert') {
      // low, wind-scoured shrub
      const n = 3 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rng();
        const len = 0.9 + rng() * 1.5;
        const lean = 0.55 + rng() * 0.5;
        const from = B.vertCount;
        B.cylinderY(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0, len, 0.11, 0.03, 5, trunk, 0, 0, false, true);
        for (let vi = from * 10; vi < B.v.length; vi += 10) {
          const y = B.v[vi + 1];
          B.v[vi] += Math.cos(a) * y * lean;
          B.v[vi + 2] += Math.sin(a) * y * lean;
        }
      }
    } else {
      // trunk plus stacked canopy
      B.cylinderY(0, 0, 0, h * 0.62, 0.22, 0.14, 6, trunk, 0, 0, false, false);
      const layers = 2 + ((rng() * 2) | 0);
      for (let i = 0; i < layers; i++) {
        const t = i / layers;
        const y = h * (0.55 + t * 0.42);
        const r = (1.5 + rng() * 0.9) * (1 - t * 0.45);
        const shade = 1 - t * 0.18;
        const from = B.vertCount;
        B.sphere(0, 0, 0, r, 1, [leaf[0] * shade, leaf[1] * shade, leaf[2] * shade], 0,
          (x, y2, z) => 0.85 + 0.3 * Math.abs(Math.sin(x * 4 + z * 3)) - y2 * 0.12);
        for (let vi = from * 10; vi < B.v.length; vi += 10) {
          B.v[vi + 1] += y;
          B.v[vi] *= 1.15; B.v[vi + 2] *= 1.15;
        }
      }
    }
  },

  buildCrystal(B, rng, col, biomeId) {
    const n = 2 + ((rng() * 4) | 0);
    const glow = biomeId === 'exotic' || biomeId === 'volcanic' ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const h = 1.4 + rng() * 4.2;
      const w = 0.16 + rng() * 0.34;
      const a = rng() * TAU;
      const lean = rng() * 0.42;
      const c = [col[0] * (0.9 + rng() * 0.5), col[1] * (0.9 + rng() * 0.5), col[2] * (0.9 + rng() * 0.5)];
      const from = B.vertCount;
      B.cylinderY(0, 0, 0, h, w, 0.015, 5, c, 0, glow, true, true);
      for (let vi = from * 10; vi < B.v.length; vi += 10) {
        const y = B.v[vi + 1];
        B.v[vi] += Math.cos(a) * (0.35 + y * lean);
        B.v[vi + 2] += Math.sin(a) * (0.35 + y * lean);
      }
    }
  },

  dispose(mesh) { if (mesh) mesh.dispose(); }
};
