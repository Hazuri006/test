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

   Walking is done against a list of boxes rather than by a general collision
   system.  Every solid the builder emits registers an axis-aligned box in
   station space in the same call that draws it, so the two cannot drift apart,
   and the walker resolves against that list plus the walls of whichever room it
   is in.  Anything shorter than a step is walked over rather than into, which
   is what makes the pads, the mezzanine stairs and the arena cover usable.

   The arena is reached from a transit pad rather than by a corridor — a
   kilometre of corridor is a kilometre of walking.
   ============================================================================ */

const STATION = {
  R: 1500,                 // hull radius — ten times what it started at
  doorW: 150, doorH: 92,   // half-size of the opening you fly through
  holeW: 300, holeH: 205,  // half-size of the window cut in the shell
  collarW: 380, collarH: 275,
  collarZ0: -1640,         // outer face of the docking port
  collarZ1: -640,          // where the throat meets the bay's front wall

  ringR: 2420, ringT: 130, // the gate ring the hull hangs inside

  /* Rooms, in station-local metres.  `front`/`back` are along Z.

     These are much flatter than the hull is wide, and deliberately so: the
     first cut made the bay half a kilometre tall because the sphere is three
     across, and the result was a grey box with a person in it.  A hangar reads
     as a hangar at the scale of the things parked in it. */
  rooms: {
    bay:   { x: 270, floor: -190, roof: 140, front: -640, back: -110 },
    arena: { x: 150, floor: -190, roof: -120, front: 380, back: 860 }
  },

  dockRange: 900,          // how close to the port before it takes the ship
  gravity: 9.4,            // whatever the deck plating is set to
  crew: 7,
  padR: 26,
  step: 0.72,              // how high the walker steps without jumping
  walkRad: 1.4             // and how wide it is
};

/* Pads, in station-local metres.  Pad 0 is kept for whoever is flying. */
const STATION_PADS = [
  [-160, -520], [0, -520], [160, -520],
  [-200, -330], [-67, -330], [67, -330], [200, -330]
];

/* Where you stand to use each of the station's facilities. */
const STATION_KIOSKS = [
  { id: 'shop', label: 'Outfitter', x: -150, z: -200, col: [0.35, 0.9, 1.0] },
  { id: 'arena', label: 'Arena Transit', x: 150, z: -200, col: [1.0, 0.42, 0.3] }
];
const STATION_ARENA_EXIT = { x: 0, z: 800 };

/* Vertex flags double as material ids for the station shader: which of the
   four hull sets to project and how big to project it. */
const MAT_HULL = 0, MAT_GLOW = 1, MAT_WALL = 2, MAT_DECK = 3;
const MAT_TECH = 4, MAT_RIB = 5, MAT_CRATE = 6, MAT_SOLAR = 7;

/* --------------------------------------------------------------------------
   Geometry.

   Colours here are what the plating texture is *multiplied* by, so they sit
   around mid-grey and let the projection carry the detail.  Anything the walker
   can hit goes through `sbox`, which draws the box and registers it as a
   collider in the same call.
   -------------------------------------------------------------------------- */
const HULL = [0.41, 0.44, 0.49];
const HULL2 = [0.27, 0.29, 0.34];
const WALL = [0.30, 0.32, 0.38];
const DECK = [0.36, 0.38, 0.44];
const TRIM = [0.20, 0.21, 0.26];
const LIT = [0.55, 0.85, 1.0];
const AMBER = [1.0, 0.55, 0.16];
const RED = [1.0, 0.33, 0.24];

let _stSolids = null;

function solid(x0, y0, z0, x1, y1, z1) {
  if (_stSolids) _stSolids.push({ x0, y0, z0, x1, y1, z1 });
}

/* Draw a box and make it solid at the same time.  Keeping the two in one call
   is the whole trick: a collider list maintained separately from the geometry
   is a collider list that is wrong within a week. */
function sbox(B, x0, y0, z0, x1, y1, z1, col, flag, emis) {
  B.box(x0, y0, z0, x1, y1, z1, col, flag, emis);
  solid(x0, y0, z0, x1, y1, z1);
}

/* A torus whose axis is `ax` (0=x, 1=y, 2=z), offset `d` along that axis.
   Smooth normals, because a ring this size wants to read as turned metal and
   not as a polygon count. */
function torusMesh(B, ax, d, R, t, nMaj, nMin, col, flag, emis) {
  const A = [(ax + 1) % 3, (ax + 2) % 3];
  const base = B.vertCount;
  const f = (flag || 0) + (emis || 0) * 8;
  const p = [0, 0, 0], n = [0, 0, 0];
  for (let i = 0; i <= nMaj; i++) {
    const a = (i / nMaj) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j <= nMin; j++) {
      const bb = (j / nMin) * TAU, cb = Math.cos(bb), sb = Math.sin(bb);
      p[A[0]] = (R + t * cb) * ca; p[A[1]] = (R + t * cb) * sa; p[ax] = d + t * sb;
      n[A[0]] = ca * cb; n[A[1]] = sa * cb; n[ax] = sb;
      B.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], f);
    }
  }
  for (let i = 0; i < nMaj; i++) {
    for (let j = 0; j < nMin; j++) {
      const o = base + i * (nMin + 1) + j, o2 = o + nMin + 1;
      B.i.push(o, o2, o2 + 1, o, o2 + 1, o + 1);
    }
  }
}

/* A box built in the XY plane and then turned about Z — everything hung off
   the gate ring is placed this way. */
function boxAboutZ(B, ang, cx, cy, cz, hx, hy, hz, col, flag, emis) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (sx, sy, sz) => {
    const x = cx + sx * hx, y = cy + sy * hy;
    return [x * ca - y * sa, x * sa + y * ca, cz + sz * hz];
  };
  const a = P(-1, -1, -1), b = P(1, -1, -1), c = P(1, 1, -1), d = P(-1, 1, -1);
  const e = P(-1, -1, 1), f = P(1, -1, 1), g = P(1, 1, 1), h = P(-1, 1, 1);
  B.quad(e, f, g, h, col, flag, emis);
  B.quad(b, a, d, c, col, flag, emis);
  B.quad(a, b, f, e, col, flag, emis);
  B.quad(c, d, h, g, col, flag, emis);
  B.quad(b, c, g, f, col, flag, emis);
  B.quad(d, a, e, h, col, flag, emis);
}

function buildStationMesh(gl) {
  const B = new MeshBuilder();
  _stSolids = [];
  buildShell(B);
  buildGateRing(B);
  buildPort(B);
  buildBay(B, STATION.rooms.bay);
  buildArena(B, STATION.rooms.arena);
  const mesh = B.build(gl);
  const solids = _stSolids;
  _stSolids = null;
  return { mesh, solids };
}

/* --------------------------------------------------------------- the shell --
   A lat/long sphere with the door window skipped, and a radius that wanders by
   a fraction of a percent.  The wander is a pure function of the grid indices,
   which matters more than it sounds: displace whole quads and the shell opens
   metre-wide cracks at every seam, but displace shared vertices and it stays
   watertight while the flat facet normals do the rest.  From ten kilometres out
   that is the difference between a hull and a billiard ball. */
function buildShell(B) {
  const S = STATION, R = S.R;
  const LAT = 44, LON = 88;
  const bump = (i, j) => {
    const a = ((((j % LON) + LON) % LON) / LON) * TAU;
    return 0.0038 * Math.sin(i * 1.7) * Math.cos(a * 6.0) +
           0.0026 * Math.cos(i * 0.8 + a * 11.0) +
           0.0016 * Math.sin(i * 3.1 + a * 3.0);
  };
  const sp = (i, j) => {
    const th = (i / LAT) * PI, ph = (j / LON) * TAU;
    const st = Math.sin(th), r = R * (1 + bump(i, j));
    return [r * st * Math.cos(ph), r * Math.cos(th), r * st * Math.sin(ph)];
  };
  const inWindow = (x, y, z) =>
    z < -R * 0.55 && Math.abs(x) < S.holeW && Math.abs(y) < S.holeH;

  for (let i = 0; i < LAT; i++) {
    for (let j = 0; j < LON; j++) {
      const a = sp(i, j), b = sp(i, j + 1), c = sp(i + 1, j + 1), d = sp(i + 1, j);
      const cx = (a[0] + b[0] + c[0] + d[0]) / 4;
      const cy = (a[1] + b[1] + c[1] + d[1]) / 4;
      const cz = (a[2] + b[2] + c[2] + d[2]) / 4;
      if (inWindow(cx, cy, cz)) continue;
      /* A lit band around the equator and a second one two thirds up: the
         inhabited decks, and the only thing that gives the hull a scale from
         far enough away that the collar is a dot. */
      const belt = Math.abs(cy) < R * 0.085 || Math.abs(Math.abs(cy) - R * 0.55) < R * 0.035;
      /* No checkerboard.  Two alternating hull greys over eighty-eight
         segments is a golf ball from any distance where the plating texture has
         already faded out — which is most of them.  One grey, and let the facet
         normals off the radius wander do the variation. */
      B.quad(a, b, c, d, belt ? [0.58, 0.56, 0.54] : HULL, belt ? MAT_GLOW : MAT_HULL, 0);
    }
  }

  /* Structural ribs: raised hoops at four latitudes, which is what stops the
     eye reading the whole thing as one smooth ball. */
  for (const f of [-0.62, -0.3, 0.3, 0.62]) {
    const y = R * f, rr = Math.sqrt(Math.max(0, R * R - y * y));
    torusMesh(B, 1, y, rr - 4, 22, 80, 8, HULL2, MAT_HULL, 0);
  }
  /* Polar caps: a comms mast north, radiators south. */
  B.cylinderY(0, 0, R - 20, R + 120, 90, 46, 24, HULL2, MAT_HULL, 0, false, true);
  B.cylinderY(0, 0, R + 120, R + 340, 14, 9, 12, TRIM, MAT_RIB, 0, false, false);
  B.cylinderY(0, 0, R + 340, R + 372, 96, 12, 22, HULL, MAT_HULL, 0, true, false);
  B.box(-9, R + 372, -9, 9, R + 396, 9, LIT, 0, 1);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    boxAboutZ(B, 0, Math.cos(a) * 260, -R - 130, Math.sin(a) * 260, 130, 90, 6,
      HULL2, MAT_WALL, 0);
  }
}

/* ----------------------------------------------------------- the gate ring --
   The reference model hangs its sphere inside a torus.  Ours puts the torus in
   the plane of the door instead of around the equator, because a ring across
   the approach is a ring you fly through, and one you have to fly around is a
   navigation hazard the docking spline knows nothing about. */
function buildGateRing(B) {
  const S = STATION, RR = S.ringR, T = S.ringT;
  torusMesh(B, 2, 0, RR, T, 108, 18, HULL, MAT_HULL, 0);
  torusMesh(B, 2, 0, RR, T * 0.62, 108, 12, [0.58, 0.56, 0.54], MAT_GLOW, 0);
  /* the inner rim, lit: from the approach this is the ring you steer inside */
  torusMesh(B, 2, 0, RR - T - 16, 11, 96, 6, LIT, MAT_HULL, 1);
  torusMesh(B, 2, 0, RR + T + 16, 8, 96, 6, [0.30, 0.55, 0.8], MAT_HULL, 1);

  const spokeC = (S.R + RR - T) * 0.5, spokeH = (RR - T - S.R) * 0.5 + 30;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    boxAboutZ(B, a, spokeC, 0, 0, spokeH, 44, 44, HULL2, MAT_RIB, 0);
    boxAboutZ(B, a, spokeC, 0, 46, spokeH * 0.82, 8, 3, LIT, MAT_HULL, 1);
    boxAboutZ(B, a, spokeC, 0, -46, spokeH * 0.82, 8, 3, LIT, MAT_HULL, 1);
  }

  /* Solar wings, four of them, canted off the ring on short booms. */
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + PI / 4;
    boxAboutZ(B, a, RR + T + 110, 0, 0, 110, 26, 26, HULL2, MAT_RIB, 0);
    boxAboutZ(B, a, RR + T + 560, 0, 0, 340, 12, 220, [0.30, 0.38, 0.52], MAT_SOLAR, 0);
    boxAboutZ(B, a, RR + T + 560, 0, 224, 340, 5, 4, [0.4, 0.75, 1.0], MAT_HULL, 1);
    boxAboutZ(B, a, RR + T + 560, 0, -224, 340, 5, 4, [0.4, 0.75, 1.0], MAT_HULL, 1);
  }

  /* Navigation strobes: red to port, green to starboard, the way they are on
     everything else that moves through a shipping lane. */
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const col = Math.cos(a) > 0.3 ? [0.3, 1.0, 0.4] : (Math.cos(a) < -0.3 ? RED : [1.0, 0.9, 0.7]);
    boxAboutZ(B, a, RR, 0, -T - 12, 26, 26, 14, col, MAT_HULL, 1);
  }
}

/* ------------------------------------------------------------------ the port --
   The collar covers the ragged edge the window left in the shell, the buttresses
   stop it reading as a box glued to a ball, and the throat behind it is the
   thousand metres of tunnel that make arriving feel like arriving. */
function buildPort(B) {
  const S = STATION;
  const cw = S.collarW, ch = S.collarH, dw = S.doorW, dh = S.doorH;
  const z0 = S.collarZ0, z1 = S.collarZ1;

  /* port face, in four panels around the opening.  This is the one surface of
     the station you look straight at while you are still deciding whether to
     come in, so it gets the gold tech plate and its glow. */
  const face = [0.72, 0.70, 0.66];
  B.quad([-cw, -ch, z0], [cw, -ch, z0], [cw, -dh, z0], [-cw, -dh, z0], face, MAT_GLOW, 0);
  B.quad([-cw, dh, z0], [cw, dh, z0], [cw, ch, z0], [-cw, ch, z0], face, MAT_GLOW, 0);
  B.quad([-cw, -dh, z0], [-dw, -dh, z0], [-dw, dh, z0], [-cw, dh, z0], face, MAT_GLOW, 0);
  B.quad([dw, -dh, z0], [cw, -dh, z0], [cw, dh, z0], [dw, dh, z0], face, MAT_GLOW, 0);
  /* a chamfer back to the collar body, so the face is not a slab edge */
  const cw2 = cw + 70, ch2 = ch + 70, zc = z0 + 90;
  B.quad([-cw, -ch, z0], [cw, -ch, z0], [cw2, -ch2, zc], [-cw2, -ch2, zc], HULL, MAT_HULL, 0);
  B.quad([-cw, ch, z0], [-cw2, ch2, zc], [cw2, ch2, zc], [cw, ch, z0], HULL, MAT_HULL, 0);
  B.quad([-cw, -ch, z0], [-cw2, -ch2, zc], [-cw2, ch2, zc], [-cw, ch, z0], HULL, MAT_HULL, 0);
  B.quad([cw, -ch, z0], [cw, ch, z0], [cw2, ch2, zc], [cw2, -ch2, zc], HULL, MAT_HULL, 0);
  /* collar body */
  B.quad([-cw2, -ch2, zc], [-cw2, -ch2, z1], [-cw2, ch2, z1], [-cw2, ch2, zc], TRIM, MAT_HULL, 0);
  B.quad([cw2, -ch2, zc], [cw2, ch2, zc], [cw2, ch2, z1], [cw2, -ch2, z1], TRIM, MAT_HULL, 0);
  B.quad([-cw2, ch2, zc], [-cw2, ch2, z1], [cw2, ch2, z1], [cw2, ch2, zc], TRIM, MAT_HULL, 0);
  B.quad([-cw2, -ch2, zc], [cw2, -ch2, zc], [cw2, -ch2, z1], [-cw2, -ch2, z1], TRIM, MAT_HULL, 0);

  /* Buttresses out to the hull.  Each is a single tapering web running from the
     collar wall down to where the shell has curved away underneath it, which is
     what stops the port reading as a box glued onto a ball. */
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + PI / 8;
    const ca = Math.cos(a), sa = Math.sin(a);
    const r0 = 420, r1 = 900, w = 24;
    const zh = -Math.sqrt(Math.max(1, STATION.R * STATION.R - r1 * r1)) + 30;
    /* A point in the fin's own plane: `r` out along the buttress, `z` along the
       station, `s` to one side of it. */
    const P = (r, z, s) => [ca * r - sa * s * w, sa * r + ca * s * w, z];
    for (const s of [-1, 1]) {
      B.quad(P(r0, zc + 30, s), P(r1, zh, s), P(r1, zh + 400, s), P(r0, z1, s),
        HULL2, MAT_RIB, 0);
    }
    B.quad(P(r0, zc + 30, -1), P(r0, zc + 30, 1), P(r1, zh, 1), P(r1, zh, -1),
      HULL2, MAT_RIB, 0);
    B.quad(P(r0, z1, -1), P(r1, zh + 400, -1), P(r1, zh + 400, 1), P(r0, z1, 1),
      HULL2, MAT_RIB, 0);
  }

  /* the lit rim: the one thing you steer at from a distance */
  const rimT = 16;
  B.box(-dw - rimT, -dh - rimT, z0 - 9, dw + rimT, -dh, z0 + 7, AMBER, MAT_HULL, 1);
  B.box(-dw - rimT, dh, z0 - 9, dw + rimT, dh + rimT, z0 + 7, AMBER, MAT_HULL, 1);
  B.box(-dw - rimT, -dh, z0 - 9, -dw, dh, z0 + 7, AMBER, MAT_HULL, 1);
  B.box(dw, -dh, z0 - 9, dw + rimT, dh, z0 + 7, AMBER, MAT_HULL, 1);

  /* the throat: framed every eighty metres, with strobes marching inward */
  B.quad([-dw, -dh, z0], [-dw, dh, z0], [-dw, dh, z1], [-dw, -dh, z1], HULL, MAT_HULL, 0);
  B.quad([dw, -dh, z0], [dw, -dh, z1], [dw, dh, z1], [dw, dh, z0], HULL, MAT_HULL, 0);
  B.quad([-dw, dh, z0], [dw, dh, z0], [dw, dh, z1], [-dw, dh, z1], HULL, MAT_HULL, 0);
  B.quad([-dw, -dh, z0], [-dw, -dh, z1], [dw, -dh, z1], [dw, -dh, z0], HULL, MAT_HULL, 0);
  /* Twelve frames, each carrying a full ring of light that brightens as it runs
     in.  Nothing else lights a tunnel a kilometre deep inside an opaque hull —
     and a lit ring receding to a point is the whole reason to fly down one. */
  const NF = 12;
  for (let k = 0; k < NF; k++) {
    const z = lerp(z0 + 40, z1 - 40, k / (NF - 1));
    B.box(-dw + 1, -dh + 1, z - 9, -dw + 20, dh - 1, z + 9, HULL2, MAT_RIB, 0);
    B.box(dw - 20, -dh + 1, z - 9, dw - 1, dh - 1, z + 9, HULL2, MAT_RIB, 0);
    B.box(-dw + 1, dh - 20, z - 9, dw - 1, dh - 1, z + 9, HULL2, MAT_RIB, 0);
    B.box(-dw + 1, -dh + 1, z - 9, dw - 1, -dh + 20, z + 9, HULL2, MAT_RIB, 0);
    /* The light sits between two frames, not level with one: at the frame it is
       hidden behind the frame from the only angle anybody sees it — straight
       down the tunnel. */
    const zl = z + (z1 - z0) / NF * 0.5;
    const g = 0.5 + 1.1 * (k / (NF - 1));
    const amb = [AMBER[0] * g, AMBER[1] * g, AMBER[2] * g];
    const cyan = [LIT[0] * g, LIT[1] * g, LIT[2] * g];
    B.box(-dw + 6, -dh + 2, zl - 9, dw - 6, -dh + 8, zl + 9, amb, MAT_HULL, 1);
    B.box(-dw + 6, dh - 8, zl - 9, dw - 6, dh - 2, zl + 9, amb, MAT_HULL, 1);
    B.box(-dw + 2, -dh + 6, zl - 9, -dw + 8, dh - 6, zl + 9, cyan, MAT_HULL, 1);
    B.box(dw - 8, -dh + 6, zl - 9, dw - 2, dh - 6, zl + 9, cyan, MAT_HULL, 1);
  }
}

/* ------------------------------------------------------------------ rooms --
   A room is a closed box: from inside you never see the shell, and from
   outside the shell hides the box.  Half the triangles, for nothing. */
function roomShell(B, r, hasDoor) {
  const S = STATION;
  const bx = r.x, fy = r.floor, ry = r.roof, z0 = r.front, z1 = r.back;

  /* deck, one quad — the projection does the pattern, so cutting it into
     fifty-metre tiles only bought a checkerboard */
  B.quad([-bx, fy, z0], [-bx, fy, z1], [bx, fy, z1], [bx, fy, z0], DECK, MAT_DECK, 0);
  B.quad([-bx, ry, z0], [bx, ry, z0], [bx, ry, z1], [-bx, ry, z1], HULL2, MAT_WALL, 0);
  B.quad([-bx, fy, z0], [-bx, ry, z0], [-bx, ry, z1], [-bx, fy, z1], WALL, MAT_WALL, 0);
  B.quad([bx, fy, z0], [bx, fy, z1], [bx, ry, z1], [bx, ry, z0], WALL, MAT_WALL, 0);
  B.quad([-bx, fy, z1], [-bx, ry, z1], [bx, ry, z1], [bx, fy, z1], WALL, MAT_WALL, 0);
  if (hasDoor) {
    const dw = S.doorW, dh = S.doorH;
    B.quad([-bx, fy, z0], [bx, fy, z0], [bx, -dh, z0], [-bx, -dh, z0], WALL, MAT_WALL, 0);
    B.quad([-bx, dh, z0], [bx, dh, z0], [bx, ry, z0], [-bx, ry, z0], WALL, MAT_WALL, 0);
    B.quad([-bx, -dh, z0], [-dw, -dh, z0], [-dw, dh, z0], [-bx, dh, z0], WALL, MAT_WALL, 0);
    B.quad([dw, -dh, z0], [bx, -dh, z0], [bx, dh, z0], [dw, dh, z0], WALL, MAT_WALL, 0);
  } else {
    B.quad([-bx, fy, z0], [bx, fy, z0], [bx, ry, z0], [-bx, ry, z0], WALL, MAT_WALL, 0);
  }

  /* Wall structure: a rib every sixty metres carrying a light strip, a service
     band along the bottom, and a run of lit gallery windows overhead.  Three
     scales of detail on one wall is what keeps a big room from reading flat. */
  const n = Math.max(4, Math.round((z1 - z0) / 62));
  for (let k = 0; k <= n; k++) {
    const z = lerp(z0 + 12, z1 - 12, k / n);
    for (const sx of [-1, 1]) {
      B.box(sx * bx - sx * 9, fy, z - 5, sx * bx, ry, z + 5, HULL2, MAT_RIB, 0);
      B.box(sx * bx - sx * 11, fy + 26, z - 2, sx * bx - sx * 9, ry - 26, z + 2, LIT, MAT_HULL, 1);
    }
    B.box(-bx, ry - 9, z - 5, bx, ry, z + 5, HULL2, MAT_RIB, 0);
  }
  for (const sx of [-1, 1]) {
    B.box(sx * bx - sx * 6, fy, z0 + 6, sx * bx, fy + 11, z1 - 6, HULL2, MAT_TECH, 0);
    /* gallery windows: lit rooms behind glass, high on the wall */
    const m = Math.max(3, Math.round((z1 - z0) / 78));
    for (let k = 0; k < m; k++) {
      const zc = lerp(z0 + 60, z1 - 60, m > 1 ? k / (m - 1) : 0.5);
      B.box(sx * bx - sx * 7, fy + 44, zc - 22, sx * bx - sx * 5, fy + 62, zc + 22,
        [0.62, 0.80, 1.0], MAT_HULL, 1);
    }
  }
  /* ceiling: trusses hung below the panels, with light coffers between them */
  const tz0 = z0 + 20, tz1 = z1 - 20;
  for (let k = -2; k <= 2; k++) {
    const x = k * (bx * 0.42);
    B.box(x - 7, ry - 22, tz0, x + 7, ry - 6, tz1, HULL2, MAT_RIB, 0);
  }
  for (let k = -2; k < 2; k++) {
    const x = (k + 0.5) * (bx * 0.42);
    B.box(x - 16, ry - 8, tz0 + 10, x + 16, ry - 5, tz1 - 10, [0.85, 0.93, 1.0], MAT_HULL, 1);
  }
}

/* ------------------------------------------------------------- the hangar -- */
function buildBay(B, r) {
  const fy = r.floor;
  roomShell(B, r, true);

  /* Deck markings: a lit spine down the middle and a lane out to each pad row.
     Flush with the plating, so nothing here is a collider. */
  B.box(-1.3, fy + 0.05, r.front + 20, 1.3, fy + 0.35, r.back - 20, [0.34, 0.19, 0.05], MAT_HULL, 1);
  for (const z of [-520, -330]) {
    B.box(-r.x + 30, fy + 0.05, z - 1.6, r.x - 30, fy + 0.35, z + 1.6, [0.14, 0.24, 0.34], MAT_HULL, 1);
  }
  /* Chevrons down the service lanes, pointing the way in. */
  for (let k = 0; k < 9; k++) {
    const z = lerp(r.front + 40, r.back - 40, k / 8);
    for (const sx of [-1, 1]) {
      const cx = sx * (r.x - 26);
      for (const s2 of [-1, 1]) {
        B.box(cx + (s2 < 0 ? -8 : 0), fy + 0.05, z - 1.2 + s2 * 4, cx + (s2 < 0 ? 0 : 8), fy + 0.3, z + 1.2 + s2 * 4,
          [0.45, 0.32, 0.09], MAT_HULL, 1);
      }
    }
  }

  /* Landing pads.  Half a metre proud of the deck and no more: the walker has
     to be able to step onto one, and a pad you have to jump onto is a pad you
     spend the whole visit standing next to. */
  for (const [px, pz] of STATION_PADS) {
    B.cylinderY(px, pz, fy + 0.08, fy + 0.5, STATION.padR, STATION.padR - 0.5, 30,
      DECK, MAT_TECH, 0, true, true);
    solid(px - STATION.padR, fy, pz - STATION.padR, px + STATION.padR, fy + 0.5, pz + STATION.padR);
    /* The rim glows, not the disc: a whole pad lit amber washes the bay. */
    B.cylinderY(px, pz, fy + 0.5, fy + 0.62, STATION.padR - 0.2, STATION.padR - 3.2, 30,
      [0.55, 0.30, 0.09], MAT_HULL, 1, false, false);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU, cx = px + Math.cos(a) * (STATION.padR + 6), cz = pz + Math.sin(a) * (STATION.padR + 6);
      sbox(B, cx - 1.1, fy, cz - 1.1, cx + 1.1, fy + 2.4, cz + 1.1, HULL2, MAT_RIB, 0);
      B.box(cx - 0.8, fy + 2.4, cz - 0.8, cx + 0.8, fy + 3.0, cz + 0.8, LIT, MAT_HULL, 1);
    }
  }

  /* Structural columns down both sides, clear of the pads. */
  for (const z of [-570, -430, -260, -150]) {
    for (const sx of [-1, 1]) {
      const x = sx * (r.x - 22);
      sbox(B, x - 8, fy, z - 8, x + 8, r.roof, z + 8, HULL2, MAT_RIB, 0);
      B.box(x - 9, fy + 3, z - 2, x + 9, fy + 26, z + 2, LIT, MAT_HULL, 1);
    }
  }

  /* The concourse: a mezzanine along the back wall with a stair up to it,
     consoles on the rail, and the two kiosks on the deck below. */
  const my = fy + 7.2, mz0 = -172, mz1 = r.back;
  sbox(B, -r.x + 20, my - 1.2, mz0, r.x - 20, my, mz1, HULL2, MAT_RIB, 0);
  for (let k = 0; k < 12; k++) {
    const y = fy + (k + 1) * 0.6, z = mz0 - 8.4 + k * 0.7;
    sbox(B, -14, y - 0.6, z, 14, y, z + 0.7, DECK, MAT_TECH, 0);
  }
  for (let k = 0; k < 26; k++) {
    const x = lerp(-r.x + 22, r.x - 22, k / 25);
    if (Math.abs(x) < 16) continue;
    sbox(B, x - 0.16, my, mz0 - 0.4, x + 0.16, my + 1.15, mz0 - 0.1, TRIM, MAT_RIB, 0);
  }
  B.box(-r.x + 22, my + 1.05, mz0 - 0.5, r.x - 22, my + 1.2, mz0, LIT, MAT_HULL, 1);
  for (let k = 0; k < 6; k++) {
    const x = lerp(-r.x + 60, r.x - 60, k / 5);
    sbox(B, x - 5, my, mz1 - 7, x + 5, my + 1.3, mz1 - 3.4, HULL2, MAT_TECH, 0);
    B.box(x - 4.4, my + 1.3, mz1 - 6.6, x + 4.4, my + 4.6, mz1 - 5.4, [0.4, 0.85, 1.0], MAT_HULL, 1);
  }

  /* Cargo, stacked where cargo goes: against the walls, out of the lanes. */
  const crates = [
    [-235, -600, 3], [-235, -585, 2], [-218, -600, 1],
    [235, -600, 3], [235, -585, 1], [218, -600, 2],
    [-240, -220, 2], [-224, -220, 1], [240, -220, 2], [224, -220, 3]
  ];
  for (const [x, z, n] of crates) {
    for (let k = 0; k < n; k++) {
      const y = fy + k * 5.2;
      sbox(B, x - 6, y, z - 6, x + 6, y + 5, z + 6,
        (k & 1) ? [0.42, 0.36, 0.30] : [0.30, 0.36, 0.42], MAT_CRATE, 0);
      B.box(x - 4, y + 4.5, z - 6.15, x + 4, y + 4.9, z - 5.95, AMBER, MAT_HULL, 1);
    }
  }

  /* An overhead gantry over each pad row, with a trolley hanging off it.  It is
     out of reach, and that is the point: it puts something between the eye and
     the ceiling so the room has a middle distance. */
  for (const z of [-520, -330]) {
    B.box(-r.x + 18, r.roof - 46, z - 4, r.x - 18, r.roof - 38, z + 4, HULL2, MAT_RIB, 0);
    for (const sx of [-1, 1]) {
      B.box(sx * (r.x - 22) - 5, r.roof - 46, z - 3, sx * (r.x - 22) + 5, r.roof - 6, z + 3, HULL2, MAT_RIB, 0);
    }
    const tx = z < -400 ? -70 : 90;
    B.box(tx - 14, r.roof - 62, z - 9, tx + 14, r.roof - 46, z + 9, HULL2, MAT_TECH, 0);
    B.box(tx - 2, r.roof - 96, z - 2, tx + 2, r.roof - 62, z + 2, TRIM, MAT_RIB, 0);
    B.box(tx - 9, r.roof - 104, z - 9, tx + 9, r.roof - 96, z + 9, [0.30, 0.17, 0.05], MAT_HULL, 1);
  }

  /* the two things there are to do here */
  for (const k of STATION_KIOSKS) {
    B.cylinderY(k.x, k.z, fy + 0.08, fy + 0.35, 5.5, 5.5, 22, DECK, MAT_TECH, 0, false, true);
    B.cylinderY(k.x, k.z, fy + 0.35, fy + 0.5, 5.3, 4.4, 22, k.col, MAT_HULL, 1, false, true);
    sbox(B, k.x - 1.5, fy + 0.35, k.z - 0.8, k.x + 1.5, fy + 2.6, k.z + 0.8, HULL2, MAT_TECH, 0);
    B.box(k.x - 1.25, fy + 2.6, k.z - 0.55, k.x + 1.25, fy + 4.3, k.z + 0.55, k.col, MAT_HULL, 1);
    B.box(k.x - 0.3, fy + 4.3, k.z - 0.3, k.x + 0.3, fy + 5.4, k.z + 0.3, TRIM, MAT_RIB, 0);
  }
}

/* -------------------------------------------------------------- the arena --
   The same shell, at a size a person can cross, with cover to fight around and
   a gallery for whoever is betting on it. */
function buildArena(B, r) {
  roomShell(B, r, false);
  const fy = r.floor;
  const cover = [0.38, 0.40, 0.45], edge = RED;

  const blocks = [
    [-62, 470, 13, 4.5], [62, 470, 13, 4.5], [0, 530, 19, 6.5],
    [-104, 590, 11, 8.0], [104, 590, 11, 8.0], [0, 655, 24, 3.6],
    [-56, 715, 10, 5.5], [56, 715, 10, 5.5],
    [-118, 505, 9, 7.0], [118, 505, 9, 7.0],
    [-30, 620, 7, 2.4], [30, 620, 7, 2.4]
  ];
  for (const [x, z, w, h] of blocks) {
    sbox(B, x - w, fy, z - w * 0.6, x + w, fy + h, z + w * 0.6, cover, MAT_CRATE, 0);
    B.box(x - w, fy + h, z - w * 0.6, x + w, fy + h + 0.35, z + w * 0.6, edge, MAT_HULL, 1);
  }
  /* a court line down the middle, and a scoreboard you can see from anywhere */
  B.box(-1.2, fy + 0.05, r.front + 20, 1.2, fy + 0.3, r.back - 20, edge, MAT_HULL, 1);
  B.box(-40, fy + 34, r.front + 2, 40, fy + 56, r.front + 4, [1.0, 0.5, 0.35], MAT_HULL, 1);

  /* the way back out */
  const e = STATION_ARENA_EXIT;
  B.cylinderY(e.x, e.z, fy + 0.08, fy + 0.35, 5.5, 5.5, 22, DECK, MAT_TECH, 0, false, true);
  B.cylinderY(e.x, e.z, fy + 0.35, fy + 0.5, 5.3, 4.4, 22, LIT, MAT_HULL, 1, false, true);
  sbox(B, e.x - 1.5, fy + 0.35, e.z - 0.8, e.x + 1.5, fy + 2.6, e.z + 0.8, HULL2, MAT_TECH, 0);
  B.box(e.x - 1.25, fy + 2.6, e.z - 0.55, e.x + 1.25, fy + 4.3, e.z + 0.55, LIT, MAT_HULL, 1);
}

/* The shield across the doorway: additive, so it glows without hiding what is
   behind it.  Its own mesh because it is the only part that is not opaque. */
function buildShieldMesh(gl) {
  const S = STATION, B = new MeshBuilder();
  const z = S.collarZ0 + 14;
  B.quad([-S.doorW, -S.doorH, z], [S.doorW, -S.doorH, z],
    [S.doorW, S.doorH, z], [-S.doorW, S.doorH, z], [0.30, 0.15, 0.04], 0, 1);
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

    const built = buildStationMesh(gl);
    this.active = {
      pos, rot, host,
      name: stationName(rng),
      mesh: built.mesh,
      solids: built.solids,
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
      const z = lerp(-300, r.back - 30, rng());
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
          clamp(c.home[0] + (rn() - 0.5) * 200, -r.x + 40, r.x - 40),
          r.floor,
          clamp(c.home[1] + (rn() - 0.5) * 200, -420, r.back - 25));
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
    /* The throat counts as inside.  It is a closed tube buried in an opaque
       hull, so it wants the interior fill light and — more to the point — it
       wants the sun switched off, or the shell lights the tunnel from behind. */
    if (_stL[2] > STATION.collarZ0 && _stL[2] < STATION.collarZ1 &&
        Math.abs(_stL[0]) < STATION.doorW + 30 && Math.abs(_stL[1]) < STATION.doorH + 30) {
      return saturate((_stL[2] - STATION.collarZ0) / 260);
    }
    for (const key in STATION.rooms) {
      const r = STATION.rooms[key];
      if (Math.abs(_stL[0]) > r.x + 40 || _stL[1] < r.floor - 30 ||
          _stL[1] > r.roof + 30 || _stL[2] < r.front - 20 || _stL[2] > r.back + 40) continue;
      return key === 'bay' ? saturate((_stL[2] - STATION.collarZ0) / 500) : 1;
    }
    return 0;
  },

  /* ------------------------------------------------------------ walking --
     Resolve a walker, in station-local space, against the room it is in and
     every box the builder registered.  `local` is the *eye* position, because
     that is what the walker tracks; feet are `eyeH` below it.

     The rules are the ones that make a room walkable rather than merely
     enclosed.  Anything whose top is within a step of where your feet already
     are is floor, not wall — that is what lets you walk up onto a landing pad,
     over a cover block and up the mezzanine stair without a single ramp
     surface.  Anything taller is a wall, and you are pushed out of it along
     whichever axis you are least far into, which for a box is always the axis
     you came in by.  Horizontal first, then the support height, because
     resolving the other way round drops you through a wall you were standing
     against.

     `res` comes back with what was hit so the caller can cancel the matching
     component of velocity — the walker holds its velocity in world space and
     only this function knows which local axis moved. */
  resolveWalker(local, r, eyeH, res, extra) {
    const s = this.active;
    const rad = STATION.walkRad, step = STATION.step;
    res.ground = false; res.ceil = false; res.hitX = false; res.hitZ = false;
    res.floorY = r.floor;
    let feet = local[1] - eyeH;

    const boxes = s ? s.solids : null;
    const head = feet + eyeH + 0.15;

    /* 1. what is under us, and how high is it */
    let support = r.floor;
    const rise = feet + step;
    if (boxes) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.y1 <= support || b.y1 > rise) continue;
        if (local[0] < b.x0 - rad || local[0] > b.x1 + rad) continue;
        if (local[2] < b.z0 - rad || local[2] > b.z1 + rad) continue;
        support = b.y1;
      }
    }

    /* 2. push out of anything standing taller than that */
    const solidTop = support + step;
    for (let pass = 0; pass < 2; pass++) {
      if (boxes) {
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (b.y1 <= solidTop || b.y0 >= head || b.y1 <= feet + 0.05) continue;
          this.pushOut(local, b, rad, res);
        }
      }
      if (extra) {
        for (let i = 0; i < extra.length; i++) {
          const b = extra[i];
          if (b.y0 >= head || b.y1 <= feet + 0.05) continue;
          this.pushOut(local, b, rad, res);
        }
      }
      if (!res.hitX && !res.hitZ) break;
    }

    /* 3. the room's own walls */
    const wx = clamp(local[0], -r.x + rad + 1, r.x - rad - 1);
    if (wx !== local[0]) { local[0] = wx; res.hitX = true; }
    const wz = clamp(local[2], r.front + rad + 1, r.back - rad - 1);
    if (wz !== local[2]) { local[2] = wz; res.hitZ = true; }

    /* 4. re-read the support at the resolved position, then floor and ceiling */
    support = r.floor;
    if (boxes) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.y1 <= support || b.y1 > rise) continue;
        if (local[0] < b.x0 - rad || local[0] > b.x1 + rad) continue;
        if (local[2] < b.z0 - rad || local[2] > b.z1 + rad) continue;
        support = b.y1;
      }
    }
    res.floorY = support;
    feet = local[1] - eyeH;
    if (feet <= support + 0.02) {
      local[1] = support + eyeH;
      res.ground = true;
    } else if (local[1] > r.roof - 0.6) {
      local[1] = r.roof - 0.6;
      res.ceil = true;
    }
    return res;
  },

  /* Square-on-square push-out along the shallower overlap. */
  pushOut(local, b, rad, res) {
    const ox0 = local[0] + rad - b.x0, ox1 = b.x1 + rad - local[0];
    if (ox0 <= 0 || ox1 <= 0) return;
    const oz0 = local[2] + rad - b.z0, oz1 = b.z1 + rad - local[2];
    if (oz0 <= 0 || oz1 <= 0) return;
    const ox = Math.min(ox0, ox1), oz = Math.min(oz0, oz1);
    if (ox < oz) {
      local[0] += ox0 < ox1 ? -ox : ox;
      res.hitX = true;
    } else {
      local[2] += oz0 < oz1 ? -oz : oz;
      res.hitZ = true;
    }
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
