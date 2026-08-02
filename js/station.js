'use strict';
/* ============================================================================
   station.js — the orbital station.

   One per system, hanging above a world: a sphere a hundred and fifty metres
   across with a rectangular docking port cut into one face, a hangar bay behind
   it, and a crew.  You fly at the port, the station takes the ship off you and
   flies it in, and you can get out and walk around.

   Three things about the construction are worth knowing.

   The hull has an actual hole in it.  The shell is a lat/long sphere whose
   quads are skipped where the door window falls, and the ragged edge that
   leaves is covered by a collar that overlaps it by a good margin — which is
   also, conveniently, what a docking port looks like.  There is no inner shell:
   the bay is a closed box, so from inside you never see the sphere, and from
   outside the sphere hides the box.  Half the shell triangles for nothing.

   The docking sequence is scripted, for the same reason the planetary landing
   is.  Fighting a physics sim through a hole in a wall is not the interesting
   part of arriving at a station; the approach is.  The path is a Catmull-Rom
   through the door, down the throat, into the bay and onto a free pad, and the
   last leg turns the ship around so it is pointing back out when it settles.

   The traffic uses the same pads and the same path.  That is most of what makes
   the place feel inhabited: ships you did not fly arriving and leaving on their
   own schedule, in the room you are standing in.
   ============================================================================ */

const STATION = {
  R: 150,                 // hull radius
  doorW: 26, doorH: 15,   // half-size of the opening you fly through
  holeW: 52, holeH: 34,   // half-size of the window cut in the shell
  collarW: 66, collarH: 46,
  collarZ0: -164,         // outer face of the docking port
  collarZ1: -96,          // where it meets the bay's front wall
  bayX: 88, bayFloor: -50, bayRoof: 54, bayBack: 80,
  padY: -50,
  dockRange: 260,         // how close to the port before it takes the ship
  gravity: 9.4,           // whatever the deck plating is set to
  crew: 5
};

/* Pads, in station-local metres. */
const STATION_PADS = [
  [-58, 18], [0, 22], [58, 18], [-32, 62], [32, 62]
];

/* --------------------------------------------------------------------------
   Geometry.
   -------------------------------------------------------------------------- */
function buildStationMesh(gl, rng) {
  const S = STATION, R = S.R;
  const B = new MeshBuilder();
  const hull = [0.36, 0.38, 0.42];
  const hull2 = [0.27, 0.29, 0.33];
  const trim = [0.16, 0.18, 0.22];
  const lit = [0.55, 0.85, 1.0];
  const amber = [1.0, 0.55, 0.16];

  /* ---- shell, with the door window skipped ---- */
  const LAT = 26, LON = 52;
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
      /* Panelling: alternating plates, with a band of windows round the
         equator so the thing reads as inhabited from a kilometre out. */
      const band = Math.abs(cy) < R * 0.13 && (j % 3 === 0);
      const col = band ? lit : (((i + j) & 1) ? hull : hull2);
      B.quad(a, b, c, d, col, 0, band ? 1 : 0);
    }
  }

  /* ---- docking collar: covers the ragged window edge and makes the port ---- */
  const cw = S.collarW, ch = S.collarH, dw = S.doorW, dh = S.doorH;
  const z0 = S.collarZ0, z1 = S.collarZ1;
  const rect = (w, h, z) => [[-w, -h, z], [w, -h, z], [w, h, z], [-w, h, z]];
  const of0 = rect(cw, ch, z0), if0 = rect(dw, dh, z0);
  /* front face as four plates around the opening */
  B.quad([-cw, -ch, z0], [cw, -ch, z0], [cw, -dh, z0], [-cw, -dh, z0], hull2, 0, 0);
  B.quad([-cw, dh, z0], [cw, dh, z0], [cw, ch, z0], [-cw, ch, z0], hull2, 0, 0);
  B.quad([-cw, -dh, z0], [-dw, -dh, z0], [-dw, dh, z0], [-cw, dh, z0], hull2, 0, 0);
  B.quad([dw, -dh, z0], [cw, -dh, z0], [cw, dh, z0], [dw, dh, z0], hull2, 0, 0);
  /* outer walls of the port */
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
  const rimT = 2.6;
  B.box(-dw - rimT, -dh - rimT, z0 - 1.4, dw + rimT, -dh, z0 + 1.0, amber, 0, 1);
  B.box(-dw - rimT, dh, z0 - 1.4, dw + rimT, dh + rimT, z0 + 1.0, amber, 0, 1);
  B.box(-dw - rimT, -dh, z0 - 1.4, -dw, dh, z0 + 1.0, amber, 0, 1);
  B.box(dw, -dh, z0 - 1.4, dw + rimT, dh, z0 + 1.0, amber, 0, 1);
  /* approach strobes marching down the throat */
  for (let k = 0; k < 6; k++) {
    const z = lerp(z0 + 6, z1 - 6, k / 5);
    B.box(-dw + 0.2, -dh + 0.2, z - 0.7, -dw + 2.2, -dh + 3.2, z + 0.7, lit, 0, 1);
    B.box(dw - 2.2, -dh + 0.2, z - 0.7, dw - 0.2, -dh + 3.2, z + 0.7, lit, 0, 1);
  }

  /* ---- hangar bay: a closed box with the throat opening in its front ---- */
  const bx = S.bayX, fy = S.bayFloor, ry = S.bayRoof, bz = S.bayBack;
  const floorA = [0.20, 0.21, 0.24], floorB = [0.15, 0.16, 0.19];
  /* floor, as plates so it reads as a surface rather than a plane */
  const NX = 10, NZ = 10;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const x0 = lerp(-bx, bx, i / NX), x1 = lerp(-bx, bx, (i + 1) / NX);
      const zz0 = lerp(z1, bz, j / NZ), zz1 = lerp(z1, bz, (j + 1) / NZ);
      B.quad([x0, fy, zz0], [x0, fy, zz1], [x1, fy, zz1], [x1, fy, zz0],
        ((i + j) & 1) ? floorA : floorB, 0, 0);
    }
  }
  /* ceiling, with light panels */
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const x0 = lerp(-bx, bx, i / 6), x1 = lerp(-bx, bx, (i + 1) / 6);
      const zz0 = lerp(z1, bz, j / 6), zz1 = lerp(z1, bz, (j + 1) / 6);
      const panel = ((i + j) & 1) === 0;
      B.quad([x0, ry, zz1], [x0, ry, zz0], [x1, ry, zz0], [x1, ry, zz1],
        panel ? [0.75, 0.86, 1.0] : hull2, 0, panel ? 1 : 0);
    }
  }
  /* side walls, back wall, and the front wall with the throat opening */
  B.quad([-bx, fy, z1], [-bx, ry, z1], [-bx, ry, bz], [-bx, fy, bz], hull2, 0, 0);
  B.quad([bx, fy, z1], [bx, fy, bz], [bx, ry, bz], [bx, ry, z1], hull2, 0, 0);
  B.quad([-bx, fy, bz], [-bx, ry, bz], [bx, ry, bz], [bx, fy, bz], hull, 0, 0);
  B.quad([-bx, fy, z1], [bx, fy, z1], [bx, -dh, z1], [-bx, -dh, z1], hull, 0, 0);
  B.quad([-bx, dh, z1], [bx, dh, z1], [bx, ry, z1], [-bx, ry, z1], hull, 0, 0);
  B.quad([-bx, -dh, z1], [-dw, -dh, z1], [-dw, dh, z1], [-bx, dh, z1], hull, 0, 0);
  B.quad([dw, -dh, z1], [bx, -dh, z1], [bx, dh, z1], [dw, dh, z1], hull, 0, 0);

  /* wall galleries and light strips, so the bay is not an empty box */
  for (const sx of [-1, 1]) {
    B.box(sx * bx - sx * 12, fy + 16, z1 + 10, sx * bx, fy + 20, bz - 10, hull, 0, 0);
    B.box(sx * bx - sx * 11.4, fy + 20, z1 + 12, sx * bx - sx * 10.6, fy + 21.2, bz - 12, lit, 0, 1);
    for (let k = 0; k < 7; k++) {
      const z = lerp(z1 + 16, bz - 16, k / 6);
      B.box(sx * bx - sx * 3.2, fy + 26, z - 5, sx * bx, ry - 8, z + 5, hull2, 0, 0);
      B.box(sx * bx - sx * 3.6, fy + 30, z - 3, sx * bx - sx * 3.2, fy + 40, z + 3, amber, 0, 1);
    }
  }
  /* a bank of consoles along the back wall — somewhere for the crew to be */
  for (let k = 0; k < 7; k++) {
    const x = lerp(-bx + 16, bx - 16, k / 6);
    B.box(x - 6, fy, bz - 9, x + 6, fy + 3.6, bz - 2, hull2, 0, 0);
    B.box(x - 5, fy + 3.6, bz - 8.4, x + 5, fy + 6.4, bz - 6.4, [0.4, 0.9, 1.0], 0, 1);
  }

  /* ---- landing pads ---- */
  for (const p of STATION_PADS) {
    const [px, pz] = p;
    /* Only the rim glows.  An emissive disc the size of a landing pad turns the
       whole bay orange and washes out everything standing on it. */
    B.cylinderY(px, pz, fy + 0.05, fy + 0.55, 13, 12.6, 22, [0.26, 0.27, 0.30], 0, 0, true, false);
    B.cylinderY(px, pz, fy + 0.55, fy + 0.95, 12.9, 12.3, 22, amber, 0, 1, false, false);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      B.box(px + Math.cos(a) * 15 - 0.7, fy, pz + Math.sin(a) * 15 - 0.7,
        px + Math.cos(a) * 15 + 0.7, fy + 1.8, pz + Math.sin(a) * 15 + 0.7, lit, 0, 1);
    }
  }

  return B.build(gl);
}

/* The shield across the doorway: additive, so it glows without hiding what is
   behind it.  Its own mesh because it is the only part that is not opaque. */
function buildShieldMesh(gl) {
  const S = STATION, B = new MeshBuilder();
  const z = S.collarZ0 + 2.0;
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
    const orbit = Math.max(host.radius * 2.15, host.atmoRadius + 4000);

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
    /* Local -Z is the way the ship flies when it leaves, so the door faces
       -fwd: the station looks back along its own approach. */
    Q4.fromBasis(rot, right, up, fwd);

    this.active = {
      pos, rot, host,
      name: stationName(rng),
      mesh: buildStationMesh(gl, rng),
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
    const s = this.active, S = STATION;
    for (let i = 0; i < S.crew; i++) {
      const x = lerp(-S.bayX + 20, S.bayX - 20, rng());
      const z = lerp(S.collarZ1 + 30, S.bayBack - 14, rng());
      s.crew.push({
        pos: V3.new(x, S.bayFloor, z),
        home: [x, z],
        target: V3.new(x, S.bayFloor, z),
        fwd: V3.new(Math.cos(rng() * TAU), 0, Math.sin(rng() * TAU)),
        speed: 0,
        wait: rng() * 6,
        anim: null,
        tint: [0.72 + rng() * 0.5, 0.72 + rng() * 0.45, 0.78 + rng() * 0.4]
      });
    }
  },

  updateCrew(dt, s) {
    const S = STATION;
    for (const c of s.crew) {
      c.wait -= dt;
      V3.sub(_stCTo, c.target, c.pos);
      _stCTo[1] = 0;
      const d = V3.len(_stCTo);
      if (d < 1.5 || c.wait <= 0) {
        if (d < 1.5 && c.wait > -1e5 && c.wait > 0) {
          /* arrived early: stand about for a bit */
        } else {
          const r = Math.random;
          V3.set(c.target,
            clamp(c.home[0] + (r() - 0.5) * 70, -S.bayX + 14, S.bayX - 14),
            S.bayFloor,
            clamp(c.home[1] + (r() - 0.5) * 70, S.collarZ1 + 20, S.bayBack - 12));
          c.wait = 6 + r() * 12;
        }
      }
      V3.sub(_stCTo, c.target, c.pos);
      _stCTo[1] = 0;
      const dist = V3.len(_stCTo);
      const want = dist > 2.5 ? 2.4 : 0;
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
    const s = this.active;
    V3.set(_stL, p.x, STATION.padY + SHIP_CFG.landHeight, p.z);
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
    const S = STATION;
    const pts = [
      [0, 0, S.collarZ0 - S.dockRange - 90],
      [0, 0, S.collarZ0 - 30],
      [0, 0, S.collarZ1 - 20],
      [p.x * 0.35, S.padY + 46, S.collarZ1 + 46],
      [p.x, S.padY + 34, p.z],
      [p.x, S.padY + SHIP_CFG.landHeight, p.z]
    ];
    return pts.map(l => {
      const w = V3.new();
      V3.set(_stL, l[0], l[1], l[2]);
      return this.toWorld(w, _stL);
    });
  },

  /* Is `worldPos` close enough, and lined up enough, for the station to take
     the ship?  The dot product is what stops it grabbing you as you fly past
     the back of the hull. */
  inCatchment(worldPos, vel) {
    const s = this.active;
    if (!s) return false;
    this.toLocal(_stL, worldPos);
    if (_stL[2] > STATION.collarZ0 + 10) return false;
    /* Distance out in front of the port face.  collarZ0 is negative, so this
       is a subtraction, not an addition — getting it the wrong way round makes
       the catchment recede as you approach and it never fires. */
    const back = STATION.collarZ0 - _stL[2];
    if (back <= 0 || back > STATION.dockRange) return false;
    const d = Math.hypot(_stL[0], _stL[1]);
    if (d > 60 + back * 0.35) return false;
    /* Heading in, not out: otherwise the station grabs its own departures back
       the moment they clear the door. */
    if (vel && V3.lenSq(vel) > 4) {
      V3.set(_stL, 0, 0, 1);
      this.axis(_stFwd, _stL);
      if (V3.dot(vel, _stFwd) <= 0) return false;
    }
    return true;
  },

  /* 1 well inside the bay, 0 outside the hull, with a short ramp through the
     door so the fill light does not snap on as you cross the threshold. */
  interiorFade(worldPos) {
    const s = this.active;
    if (!s) return 0;
    if (V3.distSq(worldPos, s.pos) > STATION.R * STATION.R * 1.6) return 0;
    this.toLocal(_stL, worldPos);
    const S = STATION;
    if (Math.abs(_stL[0]) > S.bayX + 6 || _stL[1] < S.bayFloor - 4 ||
        _stL[1] > S.bayRoof + 4 || _stL[2] > S.bayBack + 6) return 0;
    return saturate((_stL[2] - S.collarZ0) / 90);
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
