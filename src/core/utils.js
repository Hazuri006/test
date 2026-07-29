import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

/** frame-rate independent exponential damping */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export function angleDelta(a, b) {
  return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/** deterministic value noise, good enough for shaders' CPU cousin */
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  return lerp(h(i), h(i + 1), smoothstep(f)) * 2 - 1;
}

export function fbm1(x, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * noise1(x * f); f *= 2; a *= 0.5; }
  return v;
}

const _v = new THREE.Vector3();
/** horizontal distance between two objects */
export function flatDist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function yawTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Simple object pool */
export class Pool {
  constructor(factory, reset, size = 64) {
    this.factory = factory; this.reset = reset;
    this.free = []; this.used = [];
    for (let i = 0; i < size; i++) this.free.push(factory());
  }
  get() {
    const o = this.free.pop() || this.factory();
    this.used.push(o);
    return o;
  }
  release(o) {
    const i = this.used.indexOf(o);
    if (i >= 0) this.used.splice(i, 1);
    this.reset(o);
    this.free.push(o);
  }
  releaseAll() {
    while (this.used.length) this.release(this.used[0]);
  }
}

/** Timed event scheduler used by cinematics */
export class Timeline {
  constructor() { this.events = []; this.t = 0; this.done = false; }
  at(time, fn) { this.events.push({ time, fn, fired: false }); return this; }
  update(dt) {
    this.t += dt;
    let pending = 0;
    for (const e of this.events) {
      if (!e.fired && this.t >= e.time) { e.fired = true; e.fn(this.t); }
      if (!e.fired) pending++;
    }
    if (pending === 0) this.done = true;
    return this.done;
  }
  reset() { this.t = 0; this.done = false; this.events.forEach(e => (e.fired = false)); }
}

export function disposeObject(obj) {
  obj.traverse?.((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}
