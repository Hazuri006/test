/* ============================================================
   Procedural textures — everything is generated at runtime on a
   2D canvas, so the game ships with zero external assets.
   ============================================================ */
import * as THREE from 'three';
import { rand, TAU, clamp } from '../core/utils.js';

const cache = new Map();

/**
 * THREE.Color converts hex literals from sRGB into linear working space.
 * Canvas pixels are sRGB, so writing a converted colour straight into
 * ImageData darkens it twice. Read the hex as raw channel values instead.
 */
function rawColor(hex) {
  return new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/* ---------- value noise helpers ---------- */

/**
 * Value noise on a wrapped lattice, so the resulting texture tiles
 * seamlessly — otherwise every ground plane shows a hard grid of seams.
 */
function valueNoiseField(size, cells, seed = 1) {
  const grid = new Float32Array(cells * cells);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x, y) => grid[(y % cells) * cells + (x % cells)];
  const out = new Float32Array(size * size);
  const sc = cells / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x * sc, fy = y * sc;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const i00 = at(x0, y0), i10 = at(x0 + 1, y0);
      const i01 = at(x0, y0 + 1), i11 = at(x0 + 1, y0 + 1);
      out[y * size + x] = (i00 * (1 - sx) + i10 * sx) * (1 - sy) + (i01 * (1 - sx) + i11 * sx) * sy;
    }
  }
  return out;
}

function fbmField(size, octaves = 5, seed = 1) {
  const out = new Float32Array(size * size);
  let amp = 0.5, cells = 4, total = 0;
  for (let o = 0; o < octaves; o++) {
    const f = valueNoiseField(size, cells, seed + o * 37);
    for (let i = 0; i < out.length; i++) out[i] += f[i] * amp;
    total += amp; amp *= 0.5; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* ---------- ground / surface textures ---------- */

export function groundTexture(kind = 'rock', tint = '#8b6a4e', size = 512) {
  return cached(`g:${kind}:${tint}:${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const base = rawColor(tint);
    const f1 = fbmField(size, 5, kind.length + 3);
    const f2 = fbmField(size, 3, kind.length + 91);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      let n = f1[i], m = f2[i];
      let shade;
      switch (kind) {
        case 'sand':
          shade = 0.72 + n * 0.36 + Math.sin(i * 0.7) * 0.008;
          break;
        case 'stone': {
          // large flagstones with grout
          const x = i % size, y = (i / size) | 0;
          const gx = (x % 128) / 128, gy = (y % 128) / 128;
          const edge = Math.min(gx, 1 - gx, gy, 1 - gy);
          shade = 0.78 + n * 0.28 - (edge < 0.045 ? 0.42 : 0);
          break;
        }
        case 'lava': {
          const veins = Math.pow(clamp(1 - Math.abs(m - 0.5) * 5.5, 0, 1), 2.2);
          shade = 0.35 + n * 0.3 + veins * 1.9;
          break;
        }
        case 'grass':
          shade = 0.74 + n * 0.3 + m * 0.14;
          break;
        case 'metal': {
          const x = i % size, y = (i / size) | 0;
          const grid = (x % 64 < 2 || y % 64 < 2) ? -0.28 : 0;
          shade = 0.8 + n * 0.16 + grid;
          break;
        }
        case 'crystal': {
          shade = 0.6 + n * 0.5 + Math.pow(m, 4) * 1.2;
          break;
        }
        default: // rock
          shade = 0.72 + n * 0.36 - m * 0.14;
      }
      const k = i * 4;
      const cr = clamp(base.r * shade, 0, 1);
      const cg = clamp(base.g * shade, 0, 1);
      const cb = clamp(base.b * shade, 0, 1);
      img.data[k] = cr * 255; img.data[k + 1] = cg * 255; img.data[k + 2] = cb * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // scattered detail: pebbles / cracks, drawn wrapped so the tile stays seamless
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 200; i++) {
      const x = rand(0, size), y = rand(0, size), r = rand(0.8, 2.6);
      ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          if (Math.abs(x + ox - size / 2) > size * 0.75 || Math.abs(y + oy - size / 2) > size * 0.75) continue;
          ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    return c;
  });
}

export function groundMap(kind, tint, repeat = 24) {
  const t = toTexture(groundTexture(kind, tint));
  t.repeat.set(repeat, repeat);
  return t;
}

/** grayscale bump-ish map derived from the same field, used for normal perturbation */
export function noiseTexture(size = 256, octaves = 5, seed = 7) {
  return cached(`n:${size}:${octaves}:${seed}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const f = fbmField(size, octaves, seed);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = f[i] * 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

export function noiseMap(size = 256, octaves = 5, seed = 7) {
  const t = toTexture(noiseTexture(size, octaves, seed), { srgb: false });
  return t;
}

/* ---------- sprites for VFX ---------- */

export function glowSprite(color = '#ffffff', power = 2.4, size = 128) {
  return cached(`glow:${color}:${power}:${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const col = rawColor(color);
    const img = ctx.createImageData(size, size);
    const half = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - half + 0.5, y - half + 0.5) / half;
        const a = Math.pow(clamp(1 - d, 0, 1), power);
        const core = Math.pow(clamp(1 - d * 2.6, 0, 1), 1.5);
        const k = (y * size + x) * 4;
        img.data[k] = clamp(col.r + core, 0, 1) * 255;
        img.data[k + 1] = clamp(col.g + core, 0, 1) * 255;
        img.data[k + 2] = clamp(col.b + core, 0, 1) * 255;
        img.data[k + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

export function glowMap(color, power, size) {
  const t = new THREE.CanvasTexture(glowSprite(color, power, size));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** four-point star flare, the classic anime impact twinkle */
export function starSprite(size = 256) {
  return cached(`star:${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const h = size / 2;
    ctx.translate(h, h);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,.85)');
    g.addColorStop(0.4, 'rgba(190,235,255,.18)');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, h, 0, TAU); ctx.fill();
    // spikes
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      const grd = ctx.createLinearGradient(0, 0, 0, -h);
      grd.addColorStop(0, 'rgba(255,255,255,.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(-h * 0.055, 0);
      ctx.lineTo(0, -h * 0.98);
      ctx.lineTo(h * 0.055, 0);
      ctx.closePath(); ctx.fill();
    }
    return c;
  });
}

export function smokeSprite(size = 256) {
  return cached(`smoke:${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const f = fbmField(size, 5, 23);
    const img = ctx.createImageData(size, size);
    const h = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - h, y - h) / h;
        const falloff = Math.pow(clamp(1 - d, 0, 1), 1.7);
        const n = f[y * size + x];
        const a = clamp(falloff * (0.35 + n * 1.15) - 0.06, 0, 1);
        const k = (y * size + x) * 4;
        const v = 200 + n * 55;
        img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v;
        img.data[k + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

export function ringSprite(size = 256, thickness = 0.09) {
  return cached(`ring:${size}:${thickness}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const h = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - h, y - h) / h;
        const band = clamp(1 - Math.abs(d - (1 - thickness * 1.6)) / thickness, 0, 1);
        const a = Math.pow(band, 1.6) * clamp(1 - d, 0, 1) * 1.4;
        const k = (y * size + x) * 4;
        img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255;
        img.data[k + 3] = clamp(a, 0, 1) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

/** streak used for ki debris and speed particles */
export function streakSprite(size = 128) {
  return cached(`streak:${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, size / 2, size, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,.9)');
    g.addColorStop(0.55, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size / 2, size * 0.055, 0, 0, TAU);
    ctx.fill();
    return c;
  });
}

export function lightningSprite(size = 256) {
  return cached(`bolt:${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.shadowColor = '#9fdcff';
    ctx.shadowBlur = 16;
    for (let b = 0; b < 3; b++) {
      ctx.lineWidth = 5 - b;
      ctx.beginPath();
      let x = size * 0.5 + rand(-20, 20), y = 4;
      ctx.moveTo(x, y);
      while (y < size - 6) {
        y += rand(14, 30);
        x += rand(-34, 34);
        ctx.lineTo(clamp(x, 6, size - 6), y);
      }
      ctx.stroke();
    }
    return c;
  });
}

export function spriteMap(canvasFn, ...args) {
  const t = new THREE.CanvasTexture(canvasFn(...args));
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ---------- shared, lazily-built sprite set ---------- */
let SPRITES = null;
export function sprites() {
  if (!SPRITES) {
    SPRITES = {
      glow: spriteMap(glowSprite, '#ffffff', 2.4, 128),
      softGlow: spriteMap(glowSprite, '#ffffff', 1.4, 128),
      star: spriteMap(starSprite, 256),
      smoke: spriteMap(smokeSprite, 256),
      ring: spriteMap(ringSprite, 256, 0.1),
      thinRing: spriteMap(ringSprite, 256, 0.035),
      streak: spriteMap(streakSprite, 128),
      bolt: spriteMap(lightningSprite, 256),
    };
  }
  return SPRITES;
}

export function clearTextureCache() { cache.clear(); }
