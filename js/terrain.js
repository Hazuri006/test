'use strict';
/* ============================================================================
   terrain.js — cube-sphere quadtree with streaming chunk generation.

   Design notes that matter for "flying down without a hitch":

   * A node is only replaced by its four children once ALL FOUR are built and
     uploaded.  You therefore never see a hole, and never see a partially
     refined patch.
   * Every chunk carries a downward skirt around its border.  Neighbouring
     chunks at different levels disagree about the surface by a fraction of a
     metre; the skirt hides that instead of leaving a crack of sky.
   * Generation runs on a time budget with a distance-sorted queue, so a fast
     descent degrades to "detail arrives a moment later" rather than a stall.
   ============================================================================ */

const CHUNK_SEG = 24;                 // quads per side
const CHUNK_VERTS = CHUNK_SEG + 1;
const GRID = CHUNK_SEG + 3;           // +1 ring on each side for normals

/* Cube faces: normal, u axis, v axis. */
const CUBE_FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }
];

/* Shared scratch — chunk building allocates nothing per chunk. */
const _gridPos = new Float64Array(GRID * GRID * 3);
const _gridAlt = new Float64Array(GRID * GRID);
const _vtx = new Float32Array((CHUNK_VERTS * CHUNK_VERTS + CHUNK_VERTS * 4 + 4) * 8);
const _idx = new Uint16Array(CHUNK_SEG * CHUNK_SEG * 6 + CHUNK_SEG * 4 * 6 + 64);

let CHUNK_ID = 0;

class Chunk {
  constructor(terrain, face, level, u0, v0, size, parent) {
    this.t = terrain;
    this.face = face;
    this.level = level;
    this.u0 = u0; this.v0 = v0; this.size = size;
    this.parent = parent || null;
    this.children = null;
    this.mesh = null;
    this.state = 0;                   // 0 queued, 1 built, 2 dead
    this.lastUsed = 0;
    this.id = CHUNK_ID++;

    const f = CUBE_FACES[face];
    const uc = u0 + size * 0.5, vc = v0 + size * 0.5;

    this.centerDir = V3.new(
      f.n[0] + f.u[0] * uc + f.v[0] * vc,
      f.n[1] + f.u[1] * uc + f.v[1] * vc,
      f.n[2] + f.u[2] * uc + f.v[2] * vc
    );
    V3.normalize(this.centerDir, this.centerDir);

    /* Corner directions give the true world size of the patch, which varies
       across a cube face — the corners of a face stretch. */
    const corner = (du, dv) => {
      const cu = u0 + size * du, cv = v0 + size * dv;
      const d = V3.new(
        f.n[0] + f.u[0] * cu + f.v[0] * cv,
        f.n[1] + f.u[1] * cu + f.v[1] * cv,
        f.n[2] + f.u[2] * cu + f.v[2] * cv
      );
      return V3.normalize(d, d);
    };
    const c00 = corner(0, 0), c11 = corner(1, 1), c10 = corner(1, 0), c01 = corner(0, 1);
    const R = terrain.planet.radius;
    this.worldSize = Math.max(
      V3.dist(c00, c11), V3.dist(c10, c01)
    ) * R * 0.72;
    this.angRadius = Math.acos(clamp(V3.dot(this.centerDir, c00), -1, 1));

    this.center = V3.new();            // planet-local centre of the patch
    this.boundRadius = this.worldSize * 0.9 + terrain.planet.maxElev;
    V3.scale(this.center, this.centerDir, R);

    this.centerF = new Float32Array(3);
  }

  /* Level-of-detail parameter fed to the noise so the octaves fade in with
     refinement instead of snapping on. */
  get lod() { return this.level + 2.2; }

  build() {
    const t = this.t, planet = t.planet;
    const f = CUBE_FACES[this.face];
    const R = planet.radius;
    const step = this.size / CHUNK_SEG;
    const lod = this.lod;

    // 1. sample the height field over a grid that overhangs by one ring
    let minA = 1e30, maxA = -1e30;
    for (let j = 0; j < GRID; j++) {
      const v = this.v0 + (j - 1) * step;
      for (let i = 0; i < GRID; i++) {
        const u = this.u0 + (i - 1) * step;
        let dx = f.n[0] + f.u[0] * u + f.v[0] * v;
        let dy = f.n[1] + f.u[1] * u + f.v[1] * v;
        let dz = f.n[2] + f.u[2] * u + f.v[2] * v;
        const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx *= il; dy *= il; dz *= il;
        const a = planet.heightAt(dx, dy, dz, lod);
        const r = R + a;
        const o = (j * GRID + i) * 3;
        _gridPos[o] = dx * r; _gridPos[o + 1] = dy * r; _gridPos[o + 2] = dz * r;
        _gridAlt[j * GRID + i] = a;
        if (a < minA) minA = a;
        if (a > maxA) maxA = a;
      }
    }

    // recentre the patch on its actual surface, not the ideal sphere
    const midR = R + (minA + maxA) * 0.5;
    V3.scale(this.center, this.centerDir, midR);
    this.centerF[0] = this.center[0]; this.centerF[1] = this.center[1]; this.centerF[2] = this.center[2];
    this.minAlt = minA; this.maxAlt = maxA;
    this.boundRadius = this.worldSize * 0.78 + (maxA - minA) * 0.5 + 2;

    const cx = this.center[0], cy = this.center[1], cz = this.center[2];

    // 2. interior vertices with normals from the overhanging grid
    let vp = 0;
    const at = (i, j) => (j * GRID + i) * 3;
    for (let j = 0; j <= CHUNK_SEG; j++) {
      const gj = j + 1;
      for (let i = 0; i <= CHUNK_SEG; i++) {
        const gi = i + 1;
        const o = at(gi, gj);
        const px = _gridPos[o], py = _gridPos[o + 1], pz = _gridPos[o + 2];

        const l = at(gi - 1, gj), r = at(gi + 1, gj);
        const d = at(gi, gj - 1), u = at(gi, gj + 1);
        const ax = _gridPos[r] - _gridPos[l], ay = _gridPos[r + 1] - _gridPos[l + 1], az = _gridPos[r + 2] - _gridPos[l + 2];
        const bx = _gridPos[u] - _gridPos[d], by = _gridPos[u + 1] - _gridPos[d + 1], bz = _gridPos[u + 2] - _gridPos[d + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        // keep normals pointing outward
        if (nx * px + ny * py + nz * pz < 0) { nx = -nx; ny = -ny; nz = -nz; }

        _vtx[vp++] = px - cx; _vtx[vp++] = py - cy; _vtx[vp++] = pz - cz;
        _vtx[vp++] = nx; _vtx[vp++] = ny; _vtx[vp++] = nz;
        _vtx[vp++] = _gridAlt[gj * GRID + gi];
        _vtx[vp++] = 0;
      }
    }

    // 3. indices
    let ip = 0;
    const W = CHUNK_VERTS;
    for (let j = 0; j < CHUNK_SEG; j++) {
      for (let i = 0; i < CHUNK_SEG; i++) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        _idx[ip++] = a; _idx[ip++] = c; _idx[ip++] = b;
        _idx[ip++] = b; _idx[ip++] = c; _idx[ip++] = d;
      }
    }

    // 4. skirt: duplicate the border ring pushed toward the planet centre
    const skirt = Math.max(this.worldSize * 0.045, 1.5);
    const border = [];
    for (let i = 0; i <= CHUNK_SEG; i++) border.push(i);                          // bottom row
    for (let j = 1; j <= CHUNK_SEG; j++) border.push(j * W + CHUNK_SEG);          // right col
    for (let i = CHUNK_SEG - 1; i >= 0; i--) border.push(CHUNK_SEG * W + i);      // top row
    for (let j = CHUNK_SEG - 1; j >= 1; j--) border.push(j * W);                  // left col

    const skirtBase = W * W;
    for (let k = 0; k < border.length; k++) {
      const src = border[k] * 8;
      const wx = _vtx[src] + cx, wy = _vtx[src + 1] + cy, wz = _vtx[src + 2] + cz;
      const il = 1 / Math.hypot(wx, wy, wz);
      _vtx[vp++] = _vtx[src] - wx * il * skirt;
      _vtx[vp++] = _vtx[src + 1] - wy * il * skirt;
      _vtx[vp++] = _vtx[src + 2] - wz * il * skirt;
      _vtx[vp++] = _vtx[src + 3]; _vtx[vp++] = _vtx[src + 4]; _vtx[vp++] = _vtx[src + 5];
      _vtx[vp++] = _vtx[src + 6] - skirt;
      _vtx[vp++] = 1;
    }
    for (let k = 0; k < border.length; k++) {
      const k2 = (k + 1) % border.length;
      const a = border[k], b = border[k2];
      const sa = skirtBase + k, sb = skirtBase + k2;
      _idx[ip++] = a; _idx[ip++] = sa; _idx[ip++] = b;
      _idx[ip++] = b; _idx[ip++] = sa; _idx[ip++] = sb;
    }

    this.vertexData = _vtx.slice(0, vp);
    this.indexData = _idx.slice(0, ip);
    this.state = 1;
  }

  upload(gl) {
    this.mesh = new Mesh(gl, [
      { name: 'aPos', size: 3 }, { name: 'aNormal', size: 3 }, { name: 'aInfo', size: 2 }
    ]);
    this.mesh.upload(this.vertexData, this.indexData);
    this.vertexData = null;
    this.indexData = null;
    this.t.liveChunks++;
    // Props are only worth scattering on the finest chunks.
    if (this.level >= this.t.maxLevel - 1) this.props = Props.scatter(this, gl);
  }

  get ready() { return this.mesh !== null; }

  dispose(gl) {
    if (this.mesh) { this.mesh.dispose(); this.mesh = null; this.t.liveChunks--; }
    if (this.props) { Props.dispose(this.props); this.props = null; }
    if (this.children) { for (const c of this.children) c.dispose(gl); this.children = null; }
    this.state = 2;
  }

  makeChildren() {
    const h = this.size * 0.5;
    this.children = [
      new Chunk(this.t, this.face, this.level + 1, this.u0, this.v0, h, this),
      new Chunk(this.t, this.face, this.level + 1, this.u0 + h, this.v0, h, this),
      new Chunk(this.t, this.face, this.level + 1, this.u0, this.v0 + h, h, this),
      new Chunk(this.t, this.face, this.level + 1, this.u0 + h, this.v0 + h, h, this)
    ];
  }
}

/* ============================================================================
   Terrain — one instance per active planet
   ============================================================================ */
class Terrain {
  constructor(gl, planet, quality) {
    this.gl = gl;
    this.planet = planet;
    this.setQuality(quality);
    this.roots = [];
    this.queue = [];
    this.visible = [];
    this.frame = 0;
    this.pendingChunks = 0;
    this.liveChunks = 0;

    for (let f = 0; f < 6; f++) {
      const c = new Chunk(this, f, 0, -1, -1, 2, null);
      c.build();
      c.upload(gl);
      this.roots.push(c);
    }
    /* Pre-build one level so the first frame after arrival already has shape. */
    for (const r of this.roots) {
      r.makeChildren();
      for (const c of r.children) { c.build(); c.upload(gl); }
      this.queue.length = 0;
    }
  }

  setQuality(q) {
    this.maxLevel = q.maxLevel;
    this.splitFactor = q.splitFactor;
    this.budgetMs = q.budgetMs;
  }

  enqueue(chunk) { this.queue.push(chunk); }

  /* Distance from the camera to the closest point of the patch. */
  nodeDistance(node, camLocal) {
    const d = V3.dist(camLocal, node.center) - node.boundRadius;
    return Math.max(d, 0);
  }

  shouldSplit(node, camLocal) {
    if (node.level >= this.maxLevel) return false;
    const d = V3.dist(camLocal, node.center);
    return d < node.worldSize * this.splitFactor;
  }

  /* Cull patches on the far side of the planet.  Without this we would draw
     (and keep refining) the whole globe. */
  horizonCull(node, camLocal, camLen, camDir) {
    const R = this.planet.radius - this.planet.maxElev;
    if (camLen <= R * 1.0005) return false;         // sitting on the surface
    const horizon = Math.acos(clamp(R / camLen, -1, 1));
    const ang = Math.acos(clamp(V3.dot(camDir, node.centerDir), -1, 1));
    const slack = node.angRadius + Math.asin(clamp(this.planet.maxElev / this.planet.radius, 0, 1)) + 0.02;
    return ang > horizon + slack;
  }

  update(camLocal, frustum, dt) {
    this.frame++;
    this.visible.length = 0;
    this.queue.length = 0;
    this._camLocal = camLocal;

    const camLen = V3.len(camLocal);
    const camDir = V3.normalize(_tcd, camLocal);

    for (const root of this.roots) this.traverse(root, camLocal, camLen, camDir, frustum);

    this.processQueue();
    this.collect();
  }

  traverse(node, camLocal, camLen, camDir, frustum) {
    if (this.horizonCull(node, camLocal, camLen, camDir)) {
      // still allow far-side chunks to be reclaimed
      if (node.children && node.level > 2) this.markUnused(node);
      return;
    }
    if (frustum && !frustum(node.center, node.boundRadius)) {
      if (node.children && node.level > 2) this.markUnused(node);
      return;
    }

    node.lastUsed = this.frame;

    if (this.shouldSplit(node, camLocal)) {
      if (!node.children) node.makeChildren();
      let allReady = true;
      for (const c of node.children) {
        c.lastUsed = this.frame;
        if (!c.ready) { allReady = false; this.enqueue(c); }
      }
      if (allReady) {
        for (const c of node.children) this.traverse(c, camLocal, camLen, camDir, frustum);
        return;
      }
      // children not ready yet — keep drawing the parent, no hole appears
      if (node.ready) this.visible.push(node);
      return;
    }

    if (node.ready) this.visible.push(node);
    if (node.children) this.markUnused(node);
  }

  markUnused(node) {
    // children keep their own lastUsed; the sweeper reclaims them later
  }

  processQueue() {
    this.pendingChunks = 0;
    if (!this.queue.length) return;
    const cam = this._camLocal;
    /* Coarse levels first (they unblock whole regions), then nearest first. */
    this.queue.sort((a, b) => (a.level - b.level) || (V3.distSq(a.center, cam) - V3.distSq(b.center, cam)));
    const t0 = performance.now();
    let n = 0;
    for (const c of this.queue) {
      if (c.ready || c.state === 2) continue;
      if (performance.now() - t0 > this.budgetMs) { this.pendingChunks++; continue; }
      c.build();
      c.upload(this.gl);
      n++;
    }
    this.built = n;
  }

  /* Reclaim chunks that have not been touched for a while.  Chunks are kept
     around deliberately — flying back over ground you just crossed should not
     re-generate it — but the cache has to have a ceiling, so the retention
     window tightens once there are a lot of them live. */
  collect() {
    if (this.frame % 40 !== 0) return;
    const cutoff = this.frame - (this.liveChunks > 850 ? 50 : 240);
    const sweep = (node) => {
      if (!node.children) return;
      let stale = true;
      for (const c of node.children) { sweep(c); if (c.lastUsed > cutoff) stale = false; }
      if (stale && node.level >= 1) {
        for (const c of node.children) c.dispose(this.gl);
        node.children = null;
      }
    };
    for (const r of this.roots) sweep(r);
  }

  setCamera(camLocal) { this._camLocal = camLocal; }

  stats() {
    let count = 0, tris = 0;
    for (const c of this.visible) { count++; tris += c.mesh.indexCount / 3; }
    return { chunks: count, tris };
  }

  dispose() {
    for (const r of this.roots) r.dispose(this.gl);
    this.roots.length = 0;
    this.visible.length = 0;
  }
}

const _tcd = V3.new();
