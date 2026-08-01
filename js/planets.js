'use strict';
/* ============================================================================
   planets.js — procedural star system, biome archetypes, terrain functions.

   Planet.heightAt() is the single source of truth for the surface.  The GPU
   copy in shaders.js (planetHeight) evaluates the same series with fewer
   octaves, which is what makes the orbit-to-ground hand-off invisible.
   ============================================================================ */

/* Earth-referenced scattering coefficients (per metre, at an 8 km scale
   height).  They get rescaled to each planet's actual scale height so a small
   world still gets a believable sky. */
const BETA_EARTH = [3.8e-6, 13.5e-6, 33.1e-6];
const BETA_M_EARTH = 21e-6;

const BIOMES = [
  {
    id: 'lush', label: 'Lush', climate: 'Temperate',
    weather: ['Gentle Breezes', 'Warm Rain', 'Drifting Mist', 'Clear Skies'],
    flora: 'Abundant', fauna: 'Plentiful', hazard: 'None Detected',
    sky: [0.55, 0.80, 1.00], atmo: 1.0, waterChance: 1.0,
    col: {
      sand: [0.76, 0.70, 0.50], low: [0.24, 0.46, 0.20], mid: [0.34, 0.38, 0.26],
      high: [0.52, 0.52, 0.48], cliff: [0.31, 0.29, 0.26], polar: [0.90, 0.93, 0.96]
    },
    water: { deep: [0.02, 0.13, 0.22], shallow: [0.10, 0.45, 0.50] },
    cloud: { coverage: 0.42, density: 1.0, tint: [0.62, 0.74, 0.92] },
    terrain: { cont: 1.5, contAmp: 0.55, mtn: 4.5, mtnAmp: 1.0, pow: 2.3, det: 42, detAmp: 0.05, crater: 0 },
    props: { rock: 0.35, tree: 1.0, crystal: 0.0, tint: [0.35, 0.55, 0.25] }
  },
  {
    id: 'desert', label: 'Arid', climate: 'Scorched',
    weather: ['Dust Devils', 'Blistering Heat', 'Sand Haze', 'Still Air'],
    flora: 'Sparse', fauna: 'Rare', hazard: 'Extreme Heat',
    sky: [1.00, 0.72, 0.44], atmo: 0.75, waterChance: 0.15,
    col: {
      sand: [0.86, 0.68, 0.42], low: [0.78, 0.56, 0.32], mid: [0.62, 0.40, 0.26],
      high: [0.72, 0.55, 0.40], cliff: [0.45, 0.28, 0.20], polar: [0.85, 0.76, 0.62]
    },
    water: { deep: [0.10, 0.16, 0.14], shallow: [0.28, 0.36, 0.28] },
    cloud: { coverage: 0.70, density: 0.45, tint: [0.92, 0.74, 0.52] },
    terrain: { cont: 1.1, contAmp: 0.42, mtn: 3.0, mtnAmp: 0.85, pow: 3.4, det: 90, detAmp: 0.07, crater: 0 },
    props: { rock: 1.0, tree: 0.06, crystal: 0.0, tint: [0.72, 0.52, 0.34] }
  },
  {
    id: 'frozen', label: 'Frozen', climate: 'Glaciated',
    weather: ['Ice Storms', 'Whiteout', 'Bitter Frost', 'Pale Sun'],
    flora: 'Minimal', fauna: 'Sparse', hazard: 'Extreme Cold',
    sky: [0.62, 0.82, 1.00], atmo: 0.85, waterChance: 0.75,
    col: {
      sand: [0.72, 0.78, 0.84], low: [0.80, 0.87, 0.94], mid: [0.62, 0.72, 0.82],
      high: [0.94, 0.97, 1.00], cliff: [0.36, 0.44, 0.54], polar: [0.97, 0.99, 1.00]
    },
    water: { deep: [0.03, 0.10, 0.20], shallow: [0.24, 0.52, 0.62] },
    cloud: { coverage: 0.34, density: 1.15, tint: [0.72, 0.84, 1.00] },
    terrain: { cont: 1.3, contAmp: 0.50, mtn: 5.5, mtnAmp: 1.25, pow: 2.0, det: 60, detAmp: 0.06, crater: 0 },
    props: { rock: 0.7, tree: 0.18, crystal: 0.45, tint: [0.70, 0.82, 0.92] }
  },
  {
    id: 'volcanic', label: 'Scorched', climate: 'Volcanic',
    weather: ['Ash Fall', 'Firestorms', 'Sulphur Winds', 'Ember Rain'],
    flora: 'None', fauna: 'None', hazard: 'Thermal + Toxic',
    sky: [1.00, 0.40, 0.22], atmo: 1.10, waterChance: 0.0,
    col: {
      sand: [0.22, 0.16, 0.14], low: [0.17, 0.13, 0.12], mid: [0.26, 0.19, 0.17],
      high: [0.38, 0.28, 0.24], cliff: [0.12, 0.09, 0.08], polar: [0.30, 0.24, 0.22]
    },
    water: { deep: [0.30, 0.06, 0.01], shallow: [0.80, 0.22, 0.03] },
    cloud: { coverage: 0.55, density: 1.4, tint: [0.70, 0.30, 0.18] },
    terrain: { cont: 1.6, contAmp: 0.60, mtn: 6.0, mtnAmp: 1.45, pow: 1.7, det: 70, detAmp: 0.09, crater: 0.10 },
    props: { rock: 1.2, tree: 0.0, crystal: 0.10, tint: [0.30, 0.20, 0.18] },
    lava: { color: [2.4, 0.42, 0.05], depth: -0.35 }
  },
  {
    id: 'toxic', label: 'Toxic', climate: 'Corrosive',
    weather: ['Acid Rain', 'Caustic Fog', 'Spore Clouds', 'Humid Stillness'],
    flora: 'Aggressive', fauna: 'Hostile', hazard: 'Corrosive Atmosphere',
    sky: [0.62, 1.00, 0.42], atmo: 1.20, waterChance: 0.65,
    col: {
      sand: [0.50, 0.56, 0.24], low: [0.36, 0.52, 0.16], mid: [0.30, 0.36, 0.20],
      high: [0.46, 0.50, 0.30], cliff: [0.24, 0.26, 0.18], polar: [0.62, 0.72, 0.50]
    },
    water: { deep: [0.10, 0.22, 0.04], shallow: [0.42, 0.66, 0.18] },
    cloud: { coverage: 0.30, density: 1.5, tint: [0.62, 0.82, 0.40] },
    terrain: { cont: 1.4, contAmp: 0.52, mtn: 5.0, mtnAmp: 1.05, pow: 2.6, det: 55, detAmp: 0.07, crater: 0 },
    props: { rock: 0.5, tree: 0.8, crystal: 0.25, tint: [0.45, 0.66, 0.22] },
    lava: { color: [0.10, 0.75, 0.18], depth: -0.55 }
  },
  {
    id: 'barren', label: 'Barren', climate: 'Airless',
    weather: ['Vacuum', 'Absolute Silence', 'Solar Exposure'],
    flora: 'None', fauna: 'None', hazard: 'No Atmosphere',
    sky: [0.50, 0.52, 0.58], atmo: 0.0, waterChance: 0.0,
    col: {
      sand: [0.42, 0.40, 0.38], low: [0.38, 0.36, 0.34], mid: [0.46, 0.44, 0.42],
      high: [0.58, 0.56, 0.54], cliff: [0.26, 0.25, 0.24], polar: [0.62, 0.62, 0.64]
    },
    water: { deep: [0.05, 0.05, 0.06], shallow: [0.2, 0.2, 0.22] },
    cloud: { coverage: 1.0, density: 0.0, tint: [0.5, 0.5, 0.5] },
    terrain: { cont: 1.2, contAmp: 0.38, mtn: 4.0, mtnAmp: 0.70, pow: 2.8, det: 80, detAmp: 0.06, crater: 0.55 },
    props: { rock: 1.4, tree: 0.0, crystal: 0.05, tint: [0.48, 0.46, 0.44] }
  },
  {
    id: 'exotic', label: 'Exotic', climate: 'Anomalous',
    weather: ['Resonance Storms', 'Prism Light', 'Static Bloom'],
    flora: 'Crystalline', fauna: 'Unclassified', hazard: 'Radiation Spikes',
    sky: [0.85, 0.45, 1.00], atmo: 1.00, waterChance: 0.35,
    col: {
      sand: [0.62, 0.44, 0.70], low: [0.45, 0.24, 0.58], mid: [0.34, 0.24, 0.46],
      high: [0.78, 0.62, 0.92], cliff: [0.22, 0.16, 0.32], polar: [0.90, 0.82, 1.00]
    },
    water: { deep: [0.18, 0.04, 0.26], shallow: [0.52, 0.26, 0.72] },
    cloud: { coverage: 0.38, density: 1.2, tint: [0.80, 0.55, 1.00] },
    terrain: { cont: 1.9, contAmp: 0.58, mtn: 7.5, mtnAmp: 1.5, pow: 1.4, det: 48, detAmp: 0.11, crater: 0 },
    props: { rock: 0.4, tree: 0.30, crystal: 1.3, tint: [0.72, 0.42, 0.95] },
    lava: { color: [0.55, 0.15, 1.4], depth: -0.60 }
  },
  {
    id: 'oceanic', label: 'Oceanic', climate: 'Tropical',
    weather: ['Squalls', 'Trade Winds', 'Heavy Swell', 'Sun Showers'],
    flora: 'Coastal', fauna: 'Aquatic', hazard: 'None Detected',
    sky: [0.48, 0.76, 1.00], atmo: 1.1, waterChance: 1.0,
    col: {
      sand: [0.90, 0.84, 0.66], low: [0.30, 0.52, 0.28], mid: [0.34, 0.44, 0.30],
      high: [0.55, 0.56, 0.52], cliff: [0.34, 0.32, 0.28], polar: [0.92, 0.95, 0.98]
    },
    water: { deep: [0.01, 0.10, 0.20], shallow: [0.06, 0.55, 0.62] },
    cloud: { coverage: 0.36, density: 1.1, tint: [0.66, 0.80, 0.96] },
    terrain: { cont: 1.15, contAmp: 0.75, mtn: 4.0, mtnAmp: 0.80, pow: 2.6, det: 50, detAmp: 0.05, crater: 0 },
    props: { rock: 0.4, tree: 0.9, crystal: 0.0, tint: [0.40, 0.60, 0.30] },
    seaBias: 0.34
  }
];

/* ------------------------------------------------------------- naming ----- */
const SYL_A = ['Ar', 'Bel', 'Cor', 'Dra', 'Eu', 'Fen', 'Gly', 'Hy', 'Ix', 'Ka', 'Lo', 'My', 'Nu', 'Ob', 'Pa', 'Qu', 'Ry', 'Sa', 'Th', 'Ul', 'Va', 'Wo', 'Xe', 'Ya', 'Ze'];
const SYL_B = ['ka', 'ther', 'mos', 'vin', 'dara', 'lion', 'phos', 'gan', 'rex', 'nis', 'quor', 'mai', 'tesh', 'vor', 'lun', 'ades', 'trix', 'oth', 'zen', 'ura'];
const SYL_C = ['', '', '', ' Prime', ' Minor', ' Major', ' II', ' III', ' IV', ' IX', ' XI', '-Vega', '-Nine', '-Tau'];

function makeName(rng) {
  let n = SYL_A[(rng() * SYL_A.length) | 0] + SYL_B[(rng() * SYL_B.length) | 0];
  if (rng() < 0.28) n += '-' + SYL_B[(rng() * SYL_B.length) | 0];
  return n + SYL_C[(rng() * SYL_C.length) | 0];
}

/* ============================================================================
   Planet
   ============================================================================ */
class Planet {
  constructor(opts) {
    Object.assign(this, opts);

    const t = this.biome.terrain;
    /* Terrain amplitudes are expressed as fractions of maxElev so a biome
       template works at any planet size. */
    this.maxElev = this.radius * this.elevFrac;
    this.contFreq = t.cont;
    this.contAmp = t.contAmp * this.maxElev;
    this.mtnFreq = t.mtn;
    this.mtnAmp = t.mtnAmp * this.maxElev;
    this.mtnPow = t.pow;
    this.detFreq = t.det;
    this.detAmp = t.detAmp * this.maxElev;
    this.craterAmp = t.crater * this.maxElev;

    this.seaH = this.hasWater ? (this.biome.seaBias !== undefined ? this.biome.seaBias : 0.0) * this.maxElev - this.maxElev * 0.06 : -1e9;
    this.seaRadius = this.hasWater ? this.radius + this.seaH : -1;

    /* The palette is keyed to "height above the lowest ground", which on a
       water world is sea level.  Without an ocean there is no sea level, so
       pick a reference just under the valley floors — feeding the sentinel
       -1e9 into the palette would saturate every planet to its summit colour. */
    this.paletteBase = this.hasWater ? this.seaH : -this.maxElev * 0.32;

    /* Atmosphere geometry is a balancing act these worlds make harder than
       Earth does.  Earth's air is 1.6% of its radius, so the limb is a hairline.
       A 60 km planet with an Earth-thickness atmosphere would wear a halo a
       third of its own width.  So: keep the shell thin relative to the planet,
       and claw back a little optical depth (capped) so the sky still has
       colour instead of washing out to grey. */
    /* An absolute floor on thickness matters as much as the fraction: on a
       43 km world, 8% of the radius is a 3 km atmosphere, and entry would be
       over before the heat shield noticed. */
    this.atmoThickness = this.biome.atmo > 0
      ? Math.max(this.radius * (0.060 + this.biome.atmo * 0.032), 5200) : 0;
    this.atmoFrac = this.atmoThickness / this.radius;
    this.atmoRadius = this.radius + this.atmoThickness;
    this.scaleHeight = this.atmoThickness * 0.26;

    /* Linear, not sqrt: the zenith optical depth has to land near Earth's
       0.26 or the daytime sky stays dim enough to see stars through. */
    const k = this.biome.atmo > 0 ? clamp(8000 / this.scaleHeight, 1, 5.0) : 0;
    const sky = this.biome.sky;
    const mx = Math.max(sky[0], sky[1], sky[2]) || 1;
    const peak = BETA_EARTH[2] * k;
    this.betaR = [
      peak * Math.pow(sky[0] / mx, 2.5),
      peak * Math.pow(sky[1] / mx, 2.5),
      peak * Math.pow(sky[2] / mx, 2.5)
    ];
    this.betaM = BETA_M_EARTH * k;
    this.atmoAmount = this.biome.atmo;

    this.cloudLow = this.radius + this.maxElev * 0.85 + this.radius * 0.004;
    this.cloudHigh = this.cloudLow + this.radius * 0.014;

    /* Surface gravity in m/s^2 — small worlds feel floaty, which is correct. */
    this.gravity = 4.2 + (this.radius / 60000) * 5.4 * this.density;

    this.axis = V3.normalize(V3.new(), V3.new(this.tilt[0], 1, this.tilt[1]));
    this.discovered = false;

    /* HeightA/HeightB uniform packs, mirrored by the shader. */
    this.hA = new Float32Array([this.contFreq, this.contAmp, this.mtnFreq, this.mtnAmp]);
    this.hB = new Float32Array([this.mtnPow, this.detFreq, this.detAmp, this.craterAmp]);
  }

  /* ---- crater bowls, used by airless and volcanic worlds ---- */
  static crater(dx, dy, dz, freq, amp) {
    if (amp <= 0) return 0;
    const n = snoise3(dx * freq, dy * freq, dz * freq);
    const a = 1.0 - Math.abs(n);
    const bowl = smoothstep(0.70, 0.98, a);
    const rim = smoothstep(0.55, 0.70, a) * (1.0 - bowl);
    return (rim * 0.5 - bowl) * amp;
  }

  /* Elevation in metres above the mean radius, for a unit direction.
     `lod` fades in the fine octaves; pass a large value for collision. */
  heightAt(dx, dy, dz, lod) {
    if (lod === undefined) lod = 99;
    const oct = 8;
    const cont = fbm3(dx * this.contFreq, dy * this.contFreq, dz * this.contFreq, oct, Math.min(lod, oct));
    let h = cont * this.contAmp;

    const m = ridged3(dx * this.mtnFreq, dy * this.mtnFreq, dz * this.mtnFreq, oct, Math.min(lod, oct));
    const mask = smoothstep(-0.15, 0.35, cont);
    h += Math.pow(Math.max(m, 0), this.mtnPow) * this.mtnAmp * (0.25 + 0.75 * mask);

    h += fbm3(dx * this.detFreq, dy * this.detFreq, dz * this.detFreq, 7, Math.max(lod - 3, 0)) * this.detAmp;

    if (this.craterAmp > 0) h += Planet.crater(dx, dy, dz, this.mtnFreq * 3, this.craterAmp);

    /* Flatten sea floors — keeps coastlines crisp and stops the ocean from
       looking like a lid over jagged rock. */
    if (this.hasWater && h < this.seaH) h = this.seaH - (this.seaH - h) * 0.55;

    return h;
  }

  /* Terrain radius (planet centre to surface) for a unit direction. */
  surfaceRadius(dx, dy, dz, lod) { return this.radius + this.heightAt(dx, dy, dz, lod); }

  /* Geometric normal by central differences on the sphere. */
  normalAt(dir, out, eps) {
    const e = eps || Math.max(this.radius * 2e-5, 1.0);
    // build a tangent frame
    const t1 = _tmpN1, t2 = _tmpN2, a = _tmpN3;
    V3.set(a, 0, 1, 0);
    if (Math.abs(V3.dot(dir, a)) > 0.9) V3.set(a, 1, 0, 0);
    V3.normalize(t1, V3.cross(t1, a, dir));
    V3.normalize(t2, V3.cross(t2, dir, t1));

    const inv = 1 / e;
    const p = _tmpN4;
    const sample = (sx, sy) => {
      p[0] = dir[0] + t1[0] * sx * e + t2[0] * sy * e;
      p[1] = dir[1] + t1[1] * sx * e + t2[1] * sy * e;
      p[2] = dir[2] + t1[2] * sx * e + t2[2] * sy * e;
      V3.normalize(p, p);
      return this.surfaceRadius(p[0], p[1], p[2]);
    };
    const r0 = this.surfaceRadius(dir[0], dir[1], dir[2]);
    const rx = sample(1, 0), ry = sample(0, 1);

    // tangent vectors on the displaced surface
    const dx1 = (rx - r0) * inv, dy1 = (ry - r0) * inv;
    out[0] = dir[0] - (t1[0] * dx1 + t2[0] * dy1);
    out[1] = dir[1] - (t1[1] * dx1 + t2[1] * dy1);
    out[2] = dir[2] - (t1[2] * dx1 + t2[2] * dy1);
    return V3.normalize(out, out);
  }

  /* Lowest terrain height within `radius` metres of a surface point.  Used to
     check a landing site is big enough for the whole ship, not just the point
     directly under it — otherwise you touch down on a shoreline and end up
     with one wing under the sea. */
  minHeightAround(dir, radius) {
    let lo = this.heightAt(dir[0], dir[1], dir[2]);
    const t1 = _tmpN1, t2 = _tmpN2, a = _tmpN3, p = _tmpN4;
    V3.set(a, 0, 1, 0);
    if (Math.abs(V3.dot(dir, a)) > 0.9) V3.set(a, 1, 0, 0);
    V3.normalize(t1, V3.cross(t1, a, dir));
    V3.normalize(t2, V3.cross(t2, dir, t1));
    const s = radius / this.radius;
    for (let i = 0; i < 6; i++) {
      const ang = i * (TAU / 6);
      const cx = Math.cos(ang) * s, cy = Math.sin(ang) * s;
      p[0] = dir[0] + t1[0] * cx + t2[0] * cy;
      p[1] = dir[1] + t1[1] * cx + t2[1] * cy;
      p[2] = dir[2] + t1[2] * cx + t2[2] * cy;
      V3.normalize(p, p);
      const h = this.heightAt(p[0], p[1], p[2]);
      if (h < lo) lo = h;
    }
    return lo;
  }

  /* Air density 0..1, used for drag, wind audio and entry heating. */
  densityAt(altitude) {
    if (this.atmoAmount <= 0) return 0;
    const top = this.atmoRadius - this.radius;
    if (altitude > top) return 0;
    return Math.exp(-Math.max(altitude, 0) / this.scaleHeight) * this.atmoAmount;
  }

  get isAirless() { return this.atmoAmount <= 0.001; }
}

const _tmpN1 = V3.new(), _tmpN2 = V3.new(), _tmpN3 = V3.new(), _tmpN4 = V3.new();

/* ============================================================================
   Star system
   ============================================================================ */
function generateSystem(seed) {
  const rng = makeRNG(seed);

  const starTemp = rng();
  const starColor = starTemp < 0.25 ? [1.00, 0.62, 0.38]           // red dwarf
    : starTemp < 0.55 ? [1.00, 0.86, 0.66]                          // yellow
      : starTemp < 0.82 ? [1.00, 0.96, 0.92]                        // white
        : [0.76, 0.86, 1.00];                                       // blue giant
  /* Angular size matters more than realism here: a star this size subtends
     about a degree from the inner planets — a crisp disc, not a wall. */
  const starRadius = 150000 + rng() * 170000;

  const nebulaPalette = [
    [0.30, 0.16, 0.55], [0.55, 0.18, 0.34], [0.12, 0.32, 0.55],
    [0.44, 0.24, 0.12], [0.16, 0.44, 0.40]
  ];
  const nebula = nebulaPalette[(rng() * nebulaPalette.length) | 0];

  const count = 5 + ((rng() * 3) | 0);
  const planets = [];
  const used = new Set();
  let orbit = 2.6e6 + rng() * 1.2e6;

  for (let i = 0; i < count; i++) {
    let bi;
    let guard = 0;
    do { bi = (rng() * BIOMES.length) | 0; guard++; } while (used.has(bi) && guard < 12);
    used.add(bi);
    const biome = BIOMES[bi];

    const radius = 42000 + rng() * 52000;
    const hasWater = rng() < biome.waterChance;

    const ang = rng() * TAU;
    const incl = (rng() - 0.5) * 0.30;
    const pos = V3.new(
      Math.cos(ang) * orbit,
      Math.sin(incl) * orbit * 0.5,
      Math.sin(ang) * orbit
    );

    planets.push(new Planet({
      index: i,
      name: makeName(rng),
      biome, radius, hasWater, pos,
      elevFrac: 0.014 + rng() * 0.016,
      density: 0.75 + rng() * 0.5,
      tilt: [(rng() - 0.5) * 0.7, (rng() - 0.5) * 0.7],
      seed: (seed * 7919 + i * 104729) | 0,
      weather: biome.weather[(rng() * biome.weather.length) | 0],
      resource: ['Ferrite Dust', 'Sodium', 'Cobalt', 'Paraffinium', 'Emeril', 'Chromatic Metal', 'Di-hydrogen', 'Copper'][(rng() * 8) | 0]
    }));

    orbit += 1.8e6 + rng() * 3.4e6;
  }

  return {
    seed,
    name: makeName(rng).toUpperCase(),
    starColor, starRadius,
    starPos: V3.new(0, 0, 0),
    nebula,
    planets
  };
}

/* ============================================================================
   Tiling 3D noise volume — clouds, water, terrain detail and nebulae all
   sample this one texture instead of evaluating noise per pixel.
   ============================================================================ */
function buildNoiseVolume(size, onProgress) {
  const data = new Uint8Array(size * size * size * 4);

  // per-channel: [baseFrequency, octaves]
  const channels = [[3, 3], [6, 3], [11, 3], [4, 3]];

  const lattice = new Map();
  function latticeFor(f, salt) {
    const key = f + ':' + salt;
    let L = lattice.get(key);
    if (L) return L;
    L = new Float32Array(f * f * f);
    for (let i = 0; i < L.length; i++) L[i] = hash32((i * 374761393 + salt * 668265263) | 0);
    lattice.set(key, L);
    return L;
  }

  function sampleOctave(f, salt, x, y, z) {
    const L = latticeFor(f, salt);
    const fx = x * f, fy = y * f, fz = z * f;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    let tx = fx - x0, ty = fy - y0, tz = fz - z0;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty); tz = tz * tz * (3 - 2 * tz);
    const X0 = ((x0 % f) + f) % f, Y0 = ((y0 % f) + f) % f, Z0 = ((z0 % f) + f) % f;
    const X1 = (X0 + 1) % f, Y1 = (Y0 + 1) % f, Z1 = (Z0 + 1) % f;
    const idx = (a, b, c) => a + b * f + c * f * f;
    const c000 = L[idx(X0, Y0, Z0)], c100 = L[idx(X1, Y0, Z0)];
    const c010 = L[idx(X0, Y1, Z0)], c110 = L[idx(X1, Y1, Z0)];
    const c001 = L[idx(X0, Y0, Z1)], c101 = L[idx(X1, Y0, Z1)];
    const c011 = L[idx(X0, Y1, Z1)], c111 = L[idx(X1, Y1, Z1)];
    const a0 = c000 + (c100 - c000) * tx, a1 = c010 + (c110 - c010) * tx;
    const b0 = c001 + (c101 - c001) * tx, b1 = c011 + (c111 - c011) * tx;
    const d0 = a0 + (a1 - a0) * ty, d1 = b0 + (b1 - b0) * ty;
    return d0 + (d1 - d0) * tz;
  }

  const inv = 1 / size;
  for (let c = 0; c < 4; c++) {
    const [baseF, oct] = channels[c];
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let amp = 0.5, sum = 0, norm = 0, f = baseF;
          for (let o = 0; o < oct; o++) {
            sum += amp * sampleOctave(f, c * 31 + o * 7 + 1, x * inv, y * inv, z * inv);
            norm += amp; amp *= 0.5; f *= 2;
          }
          let v = sum / norm;
          if (c === 2) v = v * 1.15 - 0.075;     // more contrast for bump detail
          data[((z * size + y) * size + x) * 4 + c] = clamp(v, 0, 1) * 255;
        }
      }
      if (onProgress) onProgress((c + (z + 1) / size) / 4);
    }
  }
  return data;
}
