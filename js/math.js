'use strict';
/* ============================================================================
   math.js — vectors, quaternions, matrices, PRNG and noise.

   World positions are stored in Float64Array so that a 60 km planet and a 6 m
   ship can share one coordinate system without the ship jittering.  Everything
   handed to the GPU is camera-relative and therefore safely inside float32.
   ============================================================================ */

const TAU = Math.PI * 2;
const PI = Math.PI;
const DEG = Math.PI / 180;

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function saturate(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }
function sign(x) { return x < 0 ? -1 : 1; }

/* ---------------------------------------------------------------- vec3 ---- */
const V3 = {
  new: (x = 0, y = 0, z = 0) => { const o = new Float64Array(3); o[0] = x; o[1] = y; o[2] = z; return o; },
  set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; },
  copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
  clone(a) { return V3.new(a[0], a[1], a[2]); },
  add(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  sub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  mul(o, a, b) { o[0] = a[0] * b[0]; o[1] = a[1] * b[1]; o[2] = a[2] * b[2]; return o; },
  scale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  addScaled(o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  cross(o, a, b) {
    const ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
    o[0] = ay * bz - az * by; o[1] = az * bx - ax * bz; o[2] = ax * by - ay * bx; return o;
  },
  lenSq(a) { return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; },
  len(a) { return Math.hypot(a[0], a[1], a[2]); },
  distSq(a, b) { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; },
  dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); },
  normalize(o, a) {
    const l = Math.hypot(a[0], a[1], a[2]);
    if (l > 0) { const s = 1 / l; o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; }
    else { o[0] = 0; o[1] = 0; o[2] = 0; }
    return o;
  },
  negate(o, a) { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; return o; },
  lerp(o, a, b, t) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; },
  zero(o) { o[0] = 0; o[1] = 0; o[2] = 0; return o; },
  /* rotate a by unit quaternion q */
  rotQuat(o, a, q) {
    const x = a[0], y = a[1], z = a[2];
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    o[0] = x + qw * tx + (qy * tz - qz * ty);
    o[1] = y + qw * ty + (qz * tx - qx * tz);
    o[2] = z + qw * tz + (qx * ty - qy * tx);
    return o;
  },
  /* project a onto the plane whose normal is the unit vector n */
  planeProject(o, a, n) {
    const d = V3.dot(a, n);
    o[0] = a[0] - n[0] * d; o[1] = a[1] - n[1] * d; o[2] = a[2] - n[2] * d; return o;
  }
};

/* ------------------------------------------------------------ quaternion --- */
/* [x, y, z, w] */
const Q4 = {
  new: () => { const o = new Float64Array(4); o[3] = 1; return o; },
  identity(o) { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; },
  copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; },
  clone(a) { const o = new Float64Array(4); o.set(a); return o; },
  mul(o, a, b) {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3];
    const bx = b[0], by = b[1], bz = b[2], bw = b[3];
    o[0] = aw * bx + ax * bw + ay * bz - az * by;
    o[1] = aw * by - ax * bz + ay * bw + az * bx;
    o[2] = aw * bz + ax * by - ay * bx + az * bw;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
  },
  fromAxisAngle(o, axis, rad) {
    const h = rad * 0.5, s = Math.sin(h);
    o[0] = axis[0] * s; o[1] = axis[1] * s; o[2] = axis[2] * s; o[3] = Math.cos(h);
    return o;
  },
  normalize(o, a) {
    let l = Math.hypot(a[0], a[1], a[2], a[3]);
    if (l === 0) return Q4.identity(o);
    l = 1 / l;
    o[0] = a[0] * l; o[1] = a[1] * l; o[2] = a[2] * l; o[3] = a[3] * l;
    return o;
  },
  conjugate(o, a) { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = a[3]; return o; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; },
  slerp(o, a, b, t) {
    let cos = Q4.dot(a, b);
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0, s1;
    if (1 - cos > 1e-6) {
      const om = Math.acos(cos), sin = Math.sin(om);
      s0 = Math.sin((1 - t) * om) / sin;
      s1 = Math.sin(t * om) / sin;
    } else { s0 = 1 - t; s1 = t; }
    o[0] = a[0] * s0 + bx * s1; o[1] = a[1] * s0 + by * s1;
    o[2] = a[2] * s0 + bz * s1; o[3] = a[3] * s0 + bw * s1;
    return Q4.normalize(o, o);
  },
  /* Build an orientation from an orthonormal basis (right, up, forward).
     Our convention: local -Z is forward, +Y is up, +X is right (GL style). */
  fromBasis(o, right, up, fwd) {
    // rotation matrix columns are right, up, -fwd
    const m00 = right[0], m01 = up[0], m02 = -fwd[0];
    const m10 = right[1], m11 = up[1], m12 = -fwd[1];
    const m20 = right[2], m21 = up[2], m22 = -fwd[2];
    const tr = m00 + m11 + m22;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      o[3] = 0.25 * s; o[0] = (m21 - m12) / s; o[1] = (m02 - m20) / s; o[2] = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      o[3] = (m21 - m12) / s; o[0] = 0.25 * s; o[1] = (m01 + m10) / s; o[2] = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      o[3] = (m02 - m20) / s; o[0] = (m01 + m10) / s; o[1] = 0.25 * s; o[2] = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      o[3] = (m10 - m01) / s; o[0] = (m02 + m20) / s; o[1] = (m12 + m21) / s; o[2] = 0.25 * s;
    }
    return Q4.normalize(o, o);
  },
  /* column-major mat3 into a Float32Array(9) */
  toMat3(out, q) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy;
    out[3] = xy - wz; out[4] = 1 - (xx + zz); out[5] = yz + wx;
    out[6] = xz + wy; out[7] = yz - wx; out[8] = 1 - (xx + yy);
    return out;
  }
};

/* Convenience: pull the basis vectors out of a quaternion. */
const _bx = V3.new(1, 0, 0), _by = V3.new(0, 1, 0), _bz = V3.new(0, 0, -1);
function quatRight(o, q) { return V3.rotQuat(o, _bx, q); }
function quatUp(o, q) { return V3.rotQuat(o, _by, q); }
function quatFwd(o, q) { return V3.rotQuat(o, _bz, q); }

/* ---------------------------------------------------------------- mat4 ---- */
const M4 = {
  new: () => new Float32Array(16),
  identity(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy * 0.5);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[11] = -1;
    o[10] = (far + near) / (near - far);
    o[14] = (2 * far * near) / (near - far);
    return o;
  },
  mul(o, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  },
  /* Pure-rotation view matrix from a camera orientation quaternion
     (the camera always sits at the origin of the render space). */
  viewFromQuat(o, q) {
    const m = new Float32Array(9);
    Q4.toMat3(m, q);
    o.fill(0);
    // view = transpose(rotation)
    o[0] = m[0]; o[1] = m[3]; o[2] = m[6];
    o[4] = m[1]; o[5] = m[4]; o[6] = m[7];
    o[8] = m[2]; o[9] = m[5]; o[10] = m[8];
    o[15] = 1;
    return o;
  }
};

/* ---------------------------------------------------------------- PRNG ---- */
/* mulberry32 — small, fast, good enough for world generation. */
function makeRNG(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(x) {
  x = (x ^ 61) ^ (x >>> 16); x = x + (x << 3);
  x = x ^ (x >>> 4); x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return (x >>> 0) / 4294967296;
}

/* ----------------------------------------------------- 3D simplex noise ---
   A faithful scalar port of Ashima's GLSL `snoise`.  Keeping the CPU and GPU
   implementations identical means a planet drawn as an analytic sphere from
   orbit and the same planet drawn as streamed terrain up close agree on where
   the continents are — which is what makes the approach fade invisible.       */

function _mod289(x) { return x - Math.floor(x * (1.0 / 289.0)) * 289.0; }
function _permute(x) { return _mod289(((x * 34.0) + 1.0) * x); }

const _F32 = Math.fround;

let _gx = 0, _gy = 0, _gz = 0;
const _NSX = 0.285714285714, _NSY = -0.928571428571, _NSZ = 0.142857142857;
function _gradient(p) {
  /* p is an exact integer, so index the 7x7 gradient table with exact integer
     arithmetic.  The textbook version multiplies by literal approximations of
     1/49 and 1/7; at exact multiples those round down, the index runs one past
     the end of the octahedron, and the Taylor-series normalisation below goes
     NEGATIVE — which is what produced ±4 noise spikes and kilometre-high
     needles on the terrain. */
  let j = p % 49;
  let xf = Math.floor(j / 7);
  let yf = j - 7 * xf;
  if (yf >= 7) { yf -= 7; xf += 1; }
  const x = xf * _NSX + _NSY;
  const y = yf * _NSX + _NSY;
  const h = 1.0 - Math.abs(x) - Math.abs(y);
  const sh = (h <= 0.0) ? -1.0 : 0.0;
  _gx = x + (Math.floor(x) * 2.0 + 1.0) * sh;
  _gy = y + (Math.floor(y) * 2.0 + 1.0) * sh;
  _gz = h;
}

function snoise3(vx, vy, vz) {
  // Round the inputs to float32 so CPU and GPU agree on cell boundaries.
  vx = _F32(vx); vy = _F32(vy); vz = _F32(vz);
  const C = 1.0 / 6.0, C2 = 1.0 / 3.0;

  const s = (vx + vy + vz) * C2;
  let ix = Math.floor(vx + s), iy = Math.floor(vy + s), iz = Math.floor(vz + s);
  const t = (ix + iy + iz) * C;
  const x0x = vx - ix + t, x0y = vy - iy + t, x0z = vz - iz + t;

  const gx = x0x >= x0y ? 1 : 0, gy = x0y >= x0z ? 1 : 0, gz = x0z >= x0x ? 1 : 0;
  const lx = 1 - gx, ly = 1 - gy, lz = 1 - gz;
  const i1x = Math.min(gx, lz), i1y = Math.min(gy, lx), i1z = Math.min(gz, ly);
  const i2x = Math.max(gx, lz), i2y = Math.max(gy, lx), i2z = Math.max(gz, ly);

  const x1x = x0x - i1x + C, x1y = x0y - i1y + C, x1z = x0z - i1z + C;
  const x2x = x0x - i2x + C2, x2y = x0y - i2y + C2, x2z = x0z - i2z + C2;
  const x3x = x0x - 0.5, x3y = x0y - 0.5, x3z = x0z - 0.5;

  ix = _mod289(ix); iy = _mod289(iy); iz = _mod289(iz);

  const z0 = _permute(iz), z1 = _permute(iz + i1z), z2 = _permute(iz + i2z), z3 = _permute(iz + 1);
  const y0 = _permute(z0 + iy), y1 = _permute(z1 + iy + i1y), y2 = _permute(z2 + iy + i2y), y3 = _permute(z3 + iy + 1);
  const p0 = _permute(y0 + ix), p1 = _permute(y1 + ix + i1x), p2 = _permute(y2 + ix + i2x), p3 = _permute(y3 + ix + 1);

  let n = 0;

  _gradient(p0);
  let d = _gx * _gx + _gy * _gy + _gz * _gz;
  let inv = 1.79284291400159 - 0.85373472095314 * d;
  let m = 0.6 - (x0x * x0x + x0y * x0y + x0z * x0z);
  if (m > 0) { m *= m; n += m * m * (_gx * x0x + _gy * x0y + _gz * x0z) * inv; }

  _gradient(p1);
  d = _gx * _gx + _gy * _gy + _gz * _gz;
  inv = 1.79284291400159 - 0.85373472095314 * d;
  m = 0.6 - (x1x * x1x + x1y * x1y + x1z * x1z);
  if (m > 0) { m *= m; n += m * m * (_gx * x1x + _gy * x1y + _gz * x1z) * inv; }

  _gradient(p2);
  d = _gx * _gx + _gy * _gy + _gz * _gz;
  inv = 1.79284291400159 - 0.85373472095314 * d;
  m = 0.6 - (x2x * x2x + x2y * x2y + x2z * x2z);
  if (m > 0) { m *= m; n += m * m * (_gx * x2x + _gy * x2y + _gz * x2z) * inv; }

  _gradient(p3);
  d = _gx * _gx + _gy * _gy + _gz * _gz;
  inv = 1.79284291400159 - 0.85373472095314 * d;
  m = 0.6 - (x3x * x3x + x3y * x3y + x3z * x3z);
  if (m > 0) { m *= m; n += m * m * (_gx * x3x + _gy * x3y + _gz * x3z) * inv; }

  return 42.0 * n;
}

/* Octave-to-octave rotation, identical to the one used in the shaders.
   Without it, fbm shows obvious axis-aligned streaking. */
const R00 = 0.00, R01 = 0.80, R02 = 0.60;
const R10 = -0.80, R11 = 0.36, R12 = -0.48;
const R20 = -0.60, R21 = -0.48, R22 = 0.64;

/* `lod` fades octaves in smoothly instead of switching them on, so a chunk and
   its four children never disagree by a visible step.

   Both functions normalise by a fixed 1.0 (never by the amplitudes actually
   summed).  Adding octaves therefore only *adds* detail — it does not rescale
   the terrain — which is what lets the low-octave GPU version in shaders.js
   agree with this one about where the continents are. */
function fbm3(x, y, z, octaves, lod) {
  let amp = 0.5, sum = 0;
  let px = x, py = y, pz = z;
  for (let i = 0; i < octaves; i++) {
    const w = clamp(lod - i, 0, 1);
    if (w <= 0) break;
    sum += w * amp * snoise3(px, py, pz);
    amp *= 0.5;
    const tx = R00 * px + R01 * py + R02 * pz;
    const ty = R10 * px + R11 * py + R12 * pz;
    const tz = R20 * px + R21 * py + R22 * pz;
    px = tx * 2; py = ty * 2; pz = tz * 2;
  }
  return sum;
}

/* Ridged multifractal — the sharp-crested variant used for mountain chains. */
function ridged3(x, y, z, octaves, lod) {
  let amp = 0.5, sum = 0, prev = 1;
  let px = x, py = y, pz = z;
  for (let i = 0; i < octaves; i++) {
    const w = clamp(lod - i, 0, 1);
    if (w <= 0) break;
    /* clamped so the squaring can never amplify an out-of-range sample */
    let n = 1.0 - Math.abs(snoise3(px, py, pz));
    if (n < 0) n = 0;
    n *= n;
    sum += w * amp * n * prev;
    prev = lerp(1, n, w);
    amp *= 0.5;
    const tx = R00 * px + R01 * py + R02 * pz;
    const ty = R10 * px + R11 * py + R12 * pz;
    const tz = R20 * px + R21 * py + R22 * pz;
    px = tx * 2; py = ty * 2; pz = tz * 2;
  }
  return sum;
}

/* ------------------------------------------------------- ray primitives --- */
/* Returns [tNear, tFar] of a ray/sphere intersection, or null.
   `ro` is the ray origin relative to the sphere centre. */
function raySphere(rox, roy, roz, rdx, rdy, rdz, radius) {
  const b = rox * rdx + roy * rdy + roz * rdz;
  const c = rox * rox + roy * roy + roz * roz - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const sq = Math.sqrt(h);
  return [-b - sq, -b + sq];
}
