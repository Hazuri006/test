'use strict';
/* ============================================================================
   ships.js — the ships you can own, and the weapons you can carry.

   Six hulls, cheapest first, because that is the order you will buy them in.
   Five come from shipmodels.js — static glTF bakes, each one mesh with an
   atlas — and the last is the animated gunship from shipmodel.js.

   The consequence for the renderer is that the player's ship draws one of two
   ways: the gunship as a list of animated parts through the ship shader,
   anything else as a single mesh through the same shader with an identity
   part transform.  Both carry a texture atlas, so the only real difference is
   the animation.
   ============================================================================ */

const SHIP_SPECS = [
  { id: 'drifter', hull: 0, name: 'Drifter',        price: 0,
    thrust: 0.80, top: 0.85, landH: 2.6,
    blurb: 'Twenty years past its last refit. It is yours, and it flies.' },
  { id: 'mule', hull: 1, name: 'Mule Freighter',    price: 14000,
    thrust: 0.78, top: 0.92, landH: 3.2,
    blurb: 'Slung containers and a stubborn engine. Takes a beating.' },
  { id: 'harrier', hull: 2, name: 'Harrier',        price: 36000,
    thrust: 1.10, top: 1.10, landH: 2.4,
    blurb: 'A clean delta with nothing bolted to it. Quick and honest.' },
  { id: 'falcon', hull: 3, name: 'Falcon',          price: 68000,
    thrust: 1.28, top: 1.22, landH: 2.2,
    blurb: 'Light fighter. All engine, no cargo room whatsoever.' },
  { id: 'paladin', hull: 4, name: 'Paladin',        price: 120000,
    thrust: 1.42, top: 1.34, landH: 3.4,
    blurb: 'Forward-swept and heavy. Built to be somewhere first.' },
  { id: 'warden', hull: -1, name: 'Warden Gunship', price: 220000,
    thrust: 1.60, top: 1.48, landH: 3.0,
    blurb: 'A hundred and thirty-seven thousand triangles of military hull.' }
];

/* Weapons for the arena.  Hitscan, because a projectile that can be dodged at
   these ranges is a projectile you cannot see. */
const WEAPON_SPECS = [
  { id: 'blaster', name: 'MK1 Blaster',  price: 0,
    dmg: 20, rate: 0.20, range: 320, pellets: 1, spread: 0.006,
    col: [0.45, 1.0, 0.65],
    blurb: 'Standard issue. Fires as fast as you can click.' },
  { id: 'pulse', name: 'Pulse Rifle',    price: 6000,
    dmg: 34, rate: 0.17, range: 420, pellets: 1, spread: 0.004,
    col: [0.45, 0.80, 1.0],
    blurb: 'Tighter, harder, longer reach.' },
  { id: 'scatter', name: 'Scattergun',   price: 15000,
    dmg: 13, rate: 0.62, range: 95, pellets: 8, spread: 0.055,
    col: [1.0, 0.72, 0.30],
    blurb: 'Eight pellets. Devastating close, useless far.' },
  { id: 'rail', name: 'Railgun',         price: 42000,
    dmg: 130, rate: 0.85, range: 700, pellets: 1, spread: 0.0,
    col: [1.0, 0.40, 1.0],
    blurb: 'One shot, one drone, if you can lead it.' }
];

const Ships = {
  owned: [true, false, false, false, false, false],
  index: 0,
  weaponsOwned: [true, false, false, false],
  weapon: 0,
  meshes: null,           // decoded hulls from shipmodels.js
  textures: null,

  async init(gl, game) {
    this.meshes = [];
    this.textures = [];
    for (const h of SHIP_HULLS) {
      this.meshes.push(buildHullMesh(gl, h));
      this.textures.push(await game.loadTexture(h.tex));
    }
    this.select(0, null);
  },

  spec() { return SHIP_SPECS[this.index]; },
  hull() { const h = this.spec().hull; return h < 0 ? null : SHIP_HULLS[h]; },
  landHeight() { return SHIP_SPECS[this.index].landH; },
  weaponSpec() { return WEAPON_SPECS[this.weapon]; },

  /* Nose-to-tail length, which is what the chase camera has to clear.  The
     bought hulls run to nearly forty metres against the gunship's sixteen, so a
     fixed camera distance parks the viewpoint inside the fuselage. */
  length() {
    const h = this.hull();
    const b = h ? h.bounds : SHIP_MODEL.bounds;
    /* Width counts as much as length for framing: the Drifter is wider than it
       is long, and a camera set by length alone ends up inside a nacelle. */
    return Math.max(b.hi[2] - b.lo[2], b.hi[0] - b.lo[0]);
  },

  /* The engine mounts, in metres, for whichever ship is active. */
  engines() {
    const h = this.hull();
    return h ? h.engines : SHIP_MODEL.engines;
  },

  select(i, game) {
    if (!this.owned[i]) return false;
    this.index = i;
    const s = SHIP_SPECS[i];
    /* Everything downstream reads landHeight off SHIP_CFG, so keeping it in
       sync here is cheaper than threading the spec through six call sites. */
    SHIP_CFG.landHeight = s.landH;
    if (game) {
      if (game.thrusterMesh) game.thrusterMesh.dispose();
      game.thrusterMesh = buildThrusterMesh(game.gl, this.engines());
      game.notify('SHIP: ' + s.name.toUpperCase(), 'ok');
      game.audio.ui();
    }
    return true;
  },

  buy(i, game) {
    const s = SHIP_SPECS[i];
    if (this.owned[i]) return 'owned';
    if (game.credits < s.price) return 'poor';
    game.credits -= s.price;
    this.owned[i] = true;
    game.notify('PURCHASED — ' + s.name.toUpperCase(), 'ok');
    game.audio.ui();
    return 'ok';
  },

  buyWeapon(i, game) {
    const w = WEAPON_SPECS[i];
    if (this.weaponsOwned[i]) return 'owned';
    if (game.credits < w.price) return 'poor';
    game.credits -= w.price;
    this.weaponsOwned[i] = true;
    this.weapon = i;
    game.notify('ARMED — ' + w.name.toUpperCase(), 'ok');
    game.audio.ui();
    return 'ok';
  }
};

/* Decode one baked hull into a drawable mesh, the same quantised layout the
   starship uses: int16 positions against the model's own box, int8 normals,
   uint16 UVs. */
function buildHullMesh(gl, H) {
  const pos = new Int16Array(decodeBase64(H.pos));
  const nrm = new Int8Array(decodeBase64(H.nrm));
  const uv = new Uint16Array(decodeBase64(H.uv));
  const idx = new Uint16Array(decodeBase64(H.idx));
  const v = new Float32Array(H.vertexCount * 8);
  for (let i = 0; i < H.vertexCount; i++) {
    const s = i * 8, q = i * 3, u = i * 2;
    v[s]     = pos[q]     / 32767 * H.posScale[0] + H.posBias[0];
    v[s + 1] = pos[q + 1] / 32767 * H.posScale[1] + H.posBias[1];
    v[s + 2] = pos[q + 2] / 32767 * H.posScale[2] + H.posBias[2];
    v[s + 3] = nrm[q] / 127; v[s + 4] = nrm[q + 1] / 127; v[s + 5] = nrm[q + 2] / 127;
    v[s + 6] = uv[u] / 65535; v[s + 7] = uv[u + 1] / 65535;
  }
  const mesh = new Mesh(gl, [
    { name: 'aPos', size: 3 }, { name: 'aNormal', size: 3 }, { name: 'aUV', size: 2 }
  ]);
  mesh.upload(v, idx);
  return mesh;
}
