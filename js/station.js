'use strict';
/* ============================================================================
   station.js — the orbital station.

   One per system, hanging above a world: a sphere three kilometres across with
   a rectangular docking port cut into one face, a hangar bay behind it, and a
   combat arena further in.  You fly at the port, the station takes the ship off
   you and flies it in, and you can get out and walk around.

   Three things about the construction are worth knowing.

   The hull has an actual hole in it.  The shell is a lat/long sphere whose
   quads are skipped where the door window falls, and the ragged edge that
   leaves is covered by a collar that overlaps it by a good margin — which is
   also, conveniently, what a docking port looks like.  There is no inner shell:
   the rooms are closed boxes, so from inside you never see the sphere, and from
   outside the sphere hides the boxes.  Half the shell triangles for nothing.

   The docking sequence is scripted, for the same reason the planetary landing
   is.  Fighting a physics sim through a hole in a wall is not the interesting
   part of arriving at a station; the approach is.  The path is a Catmull-Rom
   through the door, down the throat, into the bay and onto a free pad, and the
   last leg turns the ship around so it is pointing back out when it settles.

   Walking is done room by room rather than by a general collision system.  Each
   room is an axis-aligned box in station space, the walker clamps to whichever
   one it is in, and the arena is reached from a transit pad rather than by a
   corridor — a kilometre of corridor is a kilometre of walking.
   ============================================================================ */

const STATION = {
  R: 1500,                 // hull radius — ten times what it started at
  doorW: 150, doorH: 92,   // half-size of the opening you fly through
  holeW: 300, holeH: 205,  // half-size of the window cut in the shell
  collarW: 380, collarH: 275,
  collarZ0: -1640,         // outer face of the docking port
  collarZ1: -640,          // where the throat meets the bay's front wall

  /* Rooms, in station-local metres.  `front`/`back` are along Z. */
  rooms: {
    bay:   { x: 300, floor: -260, roof: 220, front: -640, back: 260 },
    arena: { x: 240, floor: -260, roof: 130, front: 460, back: 1000 }
  },

  dockRange: 900,          // how close to the port before it takes the ship
  gravity: 9.4,            // whatever the deck plating is set to
  crew: 7,
  padR: 26
};

/* Pads, in station-local metres.  Pad 0 is kept for whoever is flying. */
const STATION_PADS = [
  [-170, -380], [0, -380], [170, -380],
  [-215, -180], [-72, -180], [72, -180], [215, -180]
];

/* Where you stand to use each of the station's facilities. */
const STATION_KIOSKS = [
  { id: 'shop', label: 'Outfitter', x: -230, z: 60, col: [0.35, 0.9, 1.0] },
  { id: 'arena', label: 'Arena Transit', x: 230, z: 60, col: [1.0, 0.42, 0.3] }
];
const STATION_ARENA_EXIT = { x: 0, z: 500 };

/* --------------------------------------------------------------------------
   Geometry.
   -------------------------------------------------------------------------- */
function buildStationMesh(gl) {
  const S = STATION, R = S.R;
  const B = new MeshBuilder();
  const hull = [0.36, 0.38, 0.42];
  const hull2 = [0.27, 0.29, 0.33];
  const trim = [0.16, 0.18, 0.22];
  const lit = [0.55, 0.85, 1.0];
  const amber = [1.0, 0.55, 0.16];

  /* ---- shell, with the door window skipped ---- */
  const LAT = 30, LON = 60;
  const inWindow = (x, y, z) =>
    z < -R * 0.55 && Math.abs(x) < S.holeW && Math.abs(y) < S.holeH;
  const sp = (i, j) => {
    const th = (i / LAT) * PI, ph = (j / LON) * TAU;
    const st = Math.sin(th);
    return [R * st * Math.cos(ph), R * Math.cos(th), R * st * Math.sin(ph)];
  };
  for (let i = 0; i < LAT; i++) {
    for (let j = 0; j < LON; j++) {
      const a = sp(i, j), b = sp(i, j + 1), c = sp(i + 1, j + 1), d = sp(i + 1, j);
      const cx = (a[0] + b[0] + c[0] + d[0]) / 4;
      const cy = (a[1] + b[1] + c[1] + d[1]) / 4;
      const cz = (a[2] + b[2] + c[2] + d[2]) / 4;
      if (inWindow(cx, cy, cz)) continue;
      /* Panelling, with bands of windows so the thing reads as inhabited from
         tens of kilometres out. */
      const band = (Math.abs(cy) < R * 0.10 || Math.abs(Math.abs(cy) - R * 0.42) < R * 0.05) && (j % 3 === 0);
      const col = band ? lit : (((i + j) & 1) ? hull : hull2);
      B.quad(a, b, c, d, col, 0, band ? 1 : 0);
    }
  }

  /* ---- docking collar: covers the ragged window edge and makes the port ---- */
  const cw = S.collarW, ch = S.collarH, dw = S.doorW, dh = S.doorH;
  const z0 = S.collarZ0, z1 = S.collarZ1;
  B.quad([-cw, -ch, z0], [cw, -ch, z0], [cw, -dh, z0], [-cw, -dh, z0], hull2, 0, 0);
  B.quad([-cw, dh, z0], [cw, dh, z0], [cw, ch, z0], [-cw, ch, z0], hull2, 0, 0);
  B.quad([-cw, -dh, z0], [-dw, -dh, z0], [-dw, dh, z0], [-cw, dh, z0], hull2, 0, 0);
  B.quad([dw, -dh, z0], [cw, -dh, z0], [cw, dh, z0], [dw, dh, z0], hull2, 0, 0);
  B.quad([-cw, -ch, z0], [-cw, -ch, z1], [-cw, ch, z1], [-cw, ch, z0], trim, 0, 0);
  B.quad([cw, -ch, z0], [cw, ch, z0], [cw, ch, z1], [cw, -ch, z1], trim, 0, 0);
  B.quad([-cw, ch, z0], [-cw, ch, z1], [cw, ch, z1], [cw, ch, z0], trim, 0, 0);
  B.quad([-cw, -ch, z0], [cw, -ch, z0], [cw, -ch, z1], [-cw, -ch, z1], trim, 0, 0);
  /* the throat you fly down */
  B.quad([-dw, -dh, z0], [-dw, dh, z0], [-dw, dh, z1], [-dw, -dh, z1], hull, 0, 0);
  B.quad([dw, -dh, z0], [dw, -dh, z1], [dw, dh, z1], [dw, dh, z0], hull, 0, 0);
  B.quad([-dw, dh, z0], [dw, dh, z0], [dw, dh, z1], [-dw, dh, z1], hull, 0, 0);
  B.quad([-dw, -dh, z0], [-dw, -dh, z1], [dw, -dh, z1], [dw, -dh, z0], hull, 0, 0);
  /* the lit rim: the one thing you steer at from a distance */
  const rimT = 16;
  B.box(-dw - rimT, -dh - rimT, z0 - 9, dw + rimT, -dh, z0 + 7, amber, 0, 1);
  B.box(-dw - rimT, dh, z0 - 9, dw + rimT, dh + rimT, z0 + 7, amber, 0, 1);
  B.box(-dw - rimT, -dh, z0 - 9, -dw, dh, z0 + 7, amber, 0, 1);
  B.box(dw, -dh, z0 - 9, dw + rimT, dh, z0 + 7, amber, 0, 1);
  /* approach strobes marching down the throat */
  for (let k = 0; k < 12; k++) {
    const z = lerp(z0 + 40, z1 - 40, k / 11);
    B.box(-dw + 1, -dh + 1, z - 5, -dw + 13, -dh + 20, z + 5, lit, 0, 1);
    B.box(dw - 13, -dh + 1, z - 5, dw - 1, -dh + 20, z + 5, lit, 0, 1);
  }

  buildRoom(B, S.rooms.bay, true, hull, hull2, lit, amber);
  buildArena(B, S.rooms.arena, hull, hull2, lit);

  /* ---- landing pads ---- */
  const fy = S.rooms.bay.floor;
  for (const p of STATION_PADS) {
    const [px, pz] = p;
    B.cylinderY(px, pz, fy + 0.1, fy + 1.1, S.padR, S.padR - 0.8, 26, [0.26, 0.27, 0.30], 0, 0, true, false);
    B.cylinderY(px, pz, fy + 1.1, fy + 1.9, S.padR - 0.2, S.padR - 1.4, 26, amber, 0, 1, false, false);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      B.box(px + Math.cos(a) * (S.padR + 5) - 1.4, fy, pz + Math.sin(a) * (S.padR + 5) - 1.4,
        px + Math.cos(a) * (S.padR + 5) + 1.4, fy + 3.6, pz + Math.sin(a) * (S.padR + 5) + 1.4, lit, 0, 1);
    }
  }

  /* ---- kiosks: the two things there are to do here ---- */
  for (const k of STATION_KIOSKS) {
    B.cylinderY(k.x, k.z, fy + 0.1, fy + 0.8, 9, 9, 20, [0.22, 0.23, 0.26], 0, 0, true, false);
    B.cylinderY(k.x, k.z, fy + 0.8, fy + 1.4, 8.6, 7.8, 20, k.col, 0, 1, false, false);
    B.box(k.x - 2.6, fy + 0.8, k.z - 1.4, k.x + 2.6, fy + 5.2, k.z + 1.4, [0.25, 0.26, 0.30], 0, 0);
    B.box(k.x - 2.2, fy + 5.2, k.z - 1.0, k.x + 2.2, fy + 8.6, k.z + 1.0, k.col, 0, 1);
  }
  /* the way back out of the arena */
  const ay = S.rooms.arena.floor;
  B.cylinderY(STATION_ARENA_EXIT.x, STATION_ARENA_EXIT.z, ay + 0.1, ay + 0.8, 9, 9, 20, [0.22, 0.23, 0.26], 0, 0, true, false);
  B.cylinderY(STATION_ARENA_EXIT.x, STATION_ARENA_EXIT.z, ay + 0.8, ay + 1.4, 8.6, 7.8, 20, [0.35, 0.9, 1.0], 0, 1, false, false);

  return B.build(gl);
}

/* A closed box room: floor plates, ceiling panels, four walls.  `hasDoor`
   punches the docking throat through the front wall. */
function buildRoom(B, r, hasDoor, hull, hull2, lit, amber) {
  const S = STATION;
  const bx = r.x, fy = r.floor, ry = r.roof, z1 = r.front, bz = r.back;
  const floorA = [0.20, 0.21, 0.24], floorB = [0.15, 0.16, 0.19];
  const NX = 12, NZ = 14;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const x0 = lerp(-bx, bx, i / NX), x1 = lerp(-bx, bx, (i + 1) / NX);
      const zz0 = lerp(z1, bz, j / NZ), zz1 = lerp(z1, bz, (j + 1) / NZ);
      B.quad([x0, fy, zz0], [x0, fy, zz1], [x1, fy, zz1], [x1, fy, zz0],
        ((i + j) & 1) ? floorA : floorB, 0, 0);
    }
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 9; j++) {
      const x0 = lerp(-bx, bx, i / 8), x1 = lerp(-bx, bx, (i + 1) / 8);
      const zz0 = lerp(z1, bz, j / 9), zz1 = lerp(z1, bz, (j + 1) / 9);
      const panel = ((i + j) & 1) === 0;
      B.quad([x0, ry, zz1], [x0, ry, zz0], [x1, ry, zz0], [x1, ry, zz1],
        panel ? [0.75, 0.86, 1.0] : hull2, 0, panel ? 1 : 0);
    }
  }
  B.quad([-bx, fy, z1], [-bx, ry, z1], [-bx, ry, bz], [-bx, fy, bz], hull2, 0, 0);
  B.quad([bx, fy, z1], [bx, fy, bz], [bx, ry, bz], [bx, ry, z1], hull2, 0, 0);
  B.quad([-bx, fy, bz], [-bx, ry, bz], [bx, ry, bz], [bx, fy, bz], hull, 0, 0);
  if (hasDoor) {
    const dw = S.doorW, dh = S.doorH;
    B.quad([-bx, fy, z1], [bx, fy, z1], [bx, -dh, z1], [-bx, -dh, z1], hull, 0, 0);
    B.quad([-bx, dh, z1], [bx, dh, z1], [bx, ry, z1], [-bx, ry, z1], hull, 0, 0);
    B.quad([-bx, -dh, z1], [-dw, -dh, z1], [-dw, dh, z1], [-bx, dh, z1], hull, 0, 0);
    B.quad([dw, -dh, z1], [bx, -dh, z1], [bx, dh, z1], [dw, dh, z1], hull, 0, 0);
  } else {
    B.quad([-bx, fy, z1], [bx, fy, z1], [bx, ry, z1], [-bx, ry, z1], hull, 0, 0);
  }

  /* galleries, light strips and consoles, so it is not an empty box */
  for (const sx of [-1, 1]) {
    B.box(sx * bx - sx * 34, fy + 60, z1 + 40, sx * bx, fy + 70, bz - 40, hull, 0, 0);
    B.box(sx * bx - sx * 32, fy + 70, z1 + 46, sx * bx - sx * 29, fy + 74, bz - 46, lit, 0, 1);
    const n = Math.max(4, Math.round((bz - z1) / 110));
    for (let k = 0; k < n; k++) {
      const z = lerp(z1 + 60, bz - 60, k / (n - 1));
      B.box(sx * bx - sx * 11, fy + 90, z - 18, sx * bx, ry - 26, z + 18, hull2, 0, 0);
      B.box(sx * bx - sx * 13, fy + 104, z - 11, sx * bx - sx * 11, fy + 140, z + 11, amber || lit, 0, 1);
    }
  }
  const nb = Math.max(5, Math.round(bx / 40));
  for (let k = 0; k < nb; k++) {
    const x = lerp(-bx + 55, bx - 55, k / (nb - 1));
    B.box(x - 20, fy, bz - 32, x + 20, fy + 12, bz - 7, hull2, 0, 0);
    B.box(x - 17, fy + 12, bz - 30, x + 17, fy + 21, bz - 23, [0.4, 0.9, 1.0], 0, 1);
  }
}

/* The arena: the same shell as a room, plus cover to fight around. */
function buildArena(B, r, hull, hull2, lit) {
  buildRoom(B, r, false, hull, hull2, lit, [1.0, 0.35, 0.28]);
  const fy = r.floor;
  const cover = [0.23, 0.24, 0.27], edge = [1.0, 0.35, 0.28];
  const blocks = [
    [-150, 600, 34, 22], [150, 600, 34, 22], [0, 700, 46, 16],
    [-90, 820, 26, 30], [90, 820, 26, 30], [0, 930, 60, 12],
    [-190, 740, 22, 26], [190, 740, 22, 26]
  ];
  for (const [x, z, w, h] of blocks) {
    B.box(x - w, fy, z - w * 0.6, x + w, fy + h, z + w * 0.6, cover, 0, 0);
    B.box(x - w, fy + h, z - w * 0.6, x + w, fy + h + 1.4, z + w * 0.6, edge, 0, 1);
  }
  /* a stripe down the middle of the floor so the space reads as a court */
  B.box(-3, fy + 0.1, r.front + 40, 3, fy + 0.4, r.back - 40, edge, 0, 1);
}

/* The shield across the doorway: additive, so it glows without hiding what is
   behind it.  Its own mesh because it is the only part that is not opaque. */
function buildShieldMesh(gl) {
  const S = STATION, B = new MeshBuilder();
  const z = S.collarZ0 + 14;
  B.quad([-S.doorW, -S.doorH, z], [S.doorW, -S.doorH, z],
    [S.doorW, S.doorH, z], [-S.doorW, S.doorH, z], [1.0, 0.52, 0.14], 0, 1);
  return B.build(gl);
}

/* --------------------------------------------------------------------------
   The station itself.
   -------------------------------------------------------------------------- */
const Station = {
  active: null,

  build(gl, system) {
    this.dispose();
    const rng = makeRNG((system.seed ^ 0x3a17be05) >>> 0);
    /* Parked above a world, far enough out to be clear of the atmosphere and
       the debris, close enough that you meet it on the way in. */
    const host = system.planets[(rng() * system.planets.length) | 0];
    const dir = V3.new();
    const z = rng() * 2 - 1, a = rng() * TAU, r = Math.sqrt(Math.max(0, 1 - z * z));
    V3.set(dir, Math.cos(a) * r, Math.sin(a) * r, z);
    const orbit = Math.max(host.radius * 2.15, host.atmoRadius + 12000);

    const pos = V3.new();
    V3.addScaled(pos, host.pos, dir, orbit);

    /* Face the door at the planet: you arrive from the world, so that is the
       side you will see it from. */
    const fwd = V3.new();
    V3.scale(fwd, dir, -1);
    const up = V3.new(0, 1, 0);
    if (Math.abs(V3.dot(up, fwd)) > 0.95) V3.set(up, 1, 0, 0);
    V3.planeProject(up, up, fwd); V3.normalize(up, up);
    const right = V3.new(); V3.normalize(right, V3.cross(right, fwd, up));
    const rot = Q4.new();
    Q4.fromBasis(rot, right, up, fwd);

    this.active = {
      pos, rot, host,
      name: stationName(rng),
      mesh: buildStationMesh(gl),
      shield: buildShieldMesh(gl),
      pads: STATION_PADS.map((p, i) => ({ i, x: p[0], z: p[1], holder: null })),
      crew: [],
      time: 0
    };
    this.buildCrew(rng);
  },

  /* --------------------------------------------------------------- crew -- */
  /* Figures on the deck, using the player's own skinned model and locomotion.
     Each gets its own pose and its own phase, so nobody walks in lockstep.
     Nothing here is clever — they pace between points on the floor — but a
     hangar with people crossing it reads as somewhere, and an empty one reads
     as a model. */
  buildCrew(rng) {
    const s = this.active, r = STATION.rooms.bay;
    for (let i = 0; i < STATION.crew; i++) {
      const x = lerp(-r.x + 60, r.x - 60, rng());
      const z = lerp(r.front + 120, r.back - 40, rng());
      s.crew.push({
        pos: V3.new(x, r.floor, z),
        home: [x, z],
        target: V3.new(x, r.floor, z),
        fwd: V3.new(Math.cos(rng() * TAU), 0, Math.sin(rng() * TAU)),
        speed: 0,
        wait: rng() * 6,
        anim: null,
        tint: [0.72 + rng() * 0.5, 0.72 + rng() * 0.45, 0.78 + rng() * 0.4]
      });
    }
  },

  updateCrew(dt, s) {
    const r = STATION.rooms.bay;
    for (const c of s.crew) {
      c.wait -= dt;
      V3.sub(_stCTo, c.target, c.pos);
      _stCTo[1] = 0;
      const d = V3.len(_stCTo);
      if (d < 3 || c.wait <= 0) {
        const rn = Math.random;
        V3.set(c.target,
          clamp(c.home[0] + (rn() - 0.5) * 260, -r.x + 40, r.x - 40),
          r.floor,
          clamp(c.home[1] + (rn() - 0.5) * 260, r.front + 90, r.back - 30));
        c.wait = 10 + rn() * 20;
      }
      V3.sub(_stCTo, c.target, c.pos);
      _stCTo[1] = 0;
      const dist = V3.len(_stCTo);
      const want = dist > 4 ? 3.0 : 0;
      c.speed = damp(c.speed, want, 2.5, dt);
      if (dist > 1e-4) {
        V3.scale(_stCTo, _stCTo, 1 / dist);
        V3.lerp(c.fwd, c.fwd, _stCTo, 1 - Math.exp(-dt * 3.5));
        c.fwd[1] = 0;
        V3.normalize(c.fwd, c.fwd);
        V3.addScaled(c.pos, c.pos, c.fwd, c.speed * dt);
      }
      if (c.anim) c.anim.update(dt, c.speed, true, 0, 0, false);
    }
  },

  /* ---- frames ---- */
  toWorld(out, local) {
    const s = this.active;
    V3.rotQuat(out, local, s.rot);
    return V3.add(out, out, s.pos);
  },
  toLocal(out, world) {
    const s = this.active;
    V3.sub(out, world, s.pos);
    Q4.conjugate(_stQ, s.rot);
    return V3.rotQuat(out, out, _stQ);
  },
  axis(out, local) { return V3.rotQuat(out, local, this.active.rot); },

  /* Pad 0 is kept for whoever is flying.  Without it the traffic fills the bay
     and you come back to your own station to be told there is no room. */
  freePad(forPlayer) {
    const s = this.active;
    if (!s) return null;
    for (const p of s.pads) {
      if (p.holder) continue;
      if (!forPlayer && p.i === 0) continue;
      return p;
    }
    return null;
  },

  /* Where a ship sitting on pad `p` belongs, and how it should be facing. */
  padPose(p, outPos, outRot) {
    V3.set(_stL, p.x, STATION.rooms.bay.floor + Ships.landHeight(), p.z);
    this.toWorld(outPos, _stL);
    /* Nose toward the door, so launching is a straight run out. */
    V3.set(_stL, 0, 0, -1); this.axis(_stFwd, _stL);
    V3.set(_stL, 0, 1, 0); this.axis(_stUp, _stL);
    V3.normalize(_stRight, V3.cross(_stRight, _stFwd, _stUp));
    return Q4.fromBasis(outRot, _stRight, _stUp, _stFwd);
  },

  /* The path in: outside the door, down the throat, into the bay, onto the
     pad.  Returned in world space. */
  dockPath(p) {
    const S = STATION, r = S.rooms.bay;
    const pts = [
      [0, 0, S.collarZ0 - S.dockRange - 300],
      [0, 0, S.collarZ0 - 160],
      [0, 0, S.collarZ1 - 120],
      [p.x * 0.35, r.floor + 260, S.collarZ1 + 220],
      [p.x, r.floor + 180, p.z],
      [p.x, r.floor + Ships.landHeight(), p.z]
    ];
    return pts.map(l => {
      const w = V3.new();
      V3.set(_stL, l[0], l[1], l[2]);
      return this.toWorld(w, _stL);
    });
  },

  inCatchment(worldPos, vel) {
    const s = this.active;
    if (!s) return false;
    this.toLocal(_stL, worldPos);
    if (_stL[2] > STATION.collarZ0 + 60) return false;
    /* Distance out in front of the port face.  collarZ0 is negative, so this
       is a subtraction, not an addition — getting it the wrong way round makes
       the catchment recede as you approach and it never fires. */
    const back = STATION.collarZ0 - _stL[2];
    if (back <= 0 || back > STATION.dockRange) return false;
    const d = Math.hypot(_stL[0], _stL[1]);
    if (d > 300 + back * 0.35) return false;
    /* Heading in, not out: otherwise the station grabs its own departures back
       the moment they clear the door. */
    if (vel && V3.lenSq(vel) > 4) {
      V3.set(_stL, 0, 0, 1);
      this.axis(_stFwd, _stL);
      if (V3.dot(vel, _stFwd) <= 0) return false;
    }
    return true;
  },

  /* 1 well inside a room, 0 outside the hull, with a ramp through the door so
     the fill light does not snap on as you cross the threshold. */
  interiorFade(worldPos) {
    const s = this.active;
    if (!s) return 0;
    if (V3.distSq(worldPos, s.pos) > STATION.R * STATION.R * 1.6) return 0;
    this.toLocal(_stL, worldPos);
    for (const key in STATION.rooms) {
      const r = STATION.rooms[key];
      if (Math.abs(_stL[0]) > r.x + 40 || _stL[1] < r.floor - 30 ||
          _stL[1] > r.roof + 30 || _stL[2] < r.front - 20 || _stL[2] > r.back + 40) continue;
      return key === 'bay' ? saturate((_stL[2] - STATION.collarZ0) / 500) : 1;
    }
    return 0;
  },

  /* Which kiosk, if any, is within reach of `worldPos`. */
  kioskAt(worldPos, room) {
    if (!this.active) return null;
    this.toLocal(_stL, worldPos);
    if (room === 'arena') {
      const d = Math.hypot(_stL[0] - STATION_ARENA_EXIT.x, _stL[2] - STATION_ARENA_EXIT.z);
      return d < 13 ? { id: 'leave', label: 'Return to Hangar' } : null;
    }
    for (const k of STATION_KIOSKS) {
      if (Math.hypot(_stL[0] - k.x, _stL[2] - k.z) < 13) return k;
    }
    return null;
  },

  update(dt, game) {
    const s = this.active;
    if (!s) return;
    s.time += dt;
    this.updateCrew(dt, s);
  },

  dispose() {
    if (this.active) { this.active.mesh.dispose(); this.active.shield.dispose(); }
    this.active = null;
  }
};

const _STATION_A = ['Aster', 'Vorn', 'Helio', 'Cassi', 'Kethra', 'Orbis', 'Tal', 'Nyx'];
const _STATION_B = ['Gate', 'Reach', 'Anchor', 'Waypoint', 'Terminus', 'Halt', 'Bastion'];
function stationName(rng) {
  return _STATION_A[(rng() * _STATION_A.length) | 0] + ' ' +
    _STATION_B[(rng() * _STATION_B.length) | 0];
}

/* Catmull-Rom through the waypoints, evaluated at u in [0,1]. */
function splineAt(out, pts, u) {
  const n = pts.length - 1;
  const f = clamp(u, 0, 1) * n;
  let i = Math.min(Math.floor(f), n - 1);
  const t = f - i;
  const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
  const t2 = t * t, t3 = t2 * t;
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

const _stL = V3.new(), _stFwd = V3.new(), _stUp = V3.new(), _stRight = V3.new();
const _stCTo = V3.new();
const _stQ = Q4.new();
