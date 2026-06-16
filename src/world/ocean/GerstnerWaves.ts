import * as THREE from 'three';

/**
 * A single Gerstner wave component.
 * The same parameters drive the GPU vertex shader and the CPU buoyancy sampler,
 * so floating objects and the raft track the visible surface exactly.
 */
export interface GerstnerWave {
  /** Normalised 2D direction on the XZ plane. */
  direction: [number, number];
  amplitude: number;
  wavelength: number;
  /** Phase speed (world units / second). */
  speed: number;
  /** 0..1 — horizontal pinch that sharpens crests. */
  steepness: number;
}

/** Default open-sea wave set. Index 0/1 are swell, the rest are chop. */
export const DEFAULT_WAVES: GerstnerWave[] = [
  { direction: norm(1.0, 0.35), amplitude: 0.62, wavelength: 34, speed: 5.2, steepness: 0.55 },
  { direction: norm(0.65, 1.0), amplitude: 0.42, wavelength: 22, speed: 4.4, steepness: 0.5 },
  { direction: norm(-0.7, 0.55), amplitude: 0.22, wavelength: 12, speed: 3.4, steepness: 0.42 },
  { direction: norm(0.2, -1.0), amplitude: 0.12, wavelength: 7.5, speed: 2.7, steepness: 0.4 },
  { direction: norm(-0.85, -0.4), amplitude: 0.07, wavelength: 4.4, speed: 2.1, steepness: 0.35 },
];

export const MAX_WAVES = 8;

function norm(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/**
 * Samples Gerstner displacement at base grid position (x, z).
 * Returns the displaced world position. Gerstner waves move points
 * horizontally too, so `out.x/out.z` differ slightly from the input.
 */
export function sampleGerstner(
  x: number,
  z: number,
  time: number,
  waves: GerstnerWave[],
  amplitudeScale: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  let px = x;
  let pz = z;
  let py = 0;
  for (const w of waves) {
    const k = (2 * Math.PI) / w.wavelength;
    const amp = w.amplitude * amplitudeScale;
    const c = w.speed * k;
    const dirDot = w.direction[0] * x + w.direction[1] * z;
    const phase = dirDot * k + time * c;
    const cosP = Math.cos(phase);
    const sinP = Math.sin(phase);
    const q = w.steepness / (k * amp * waves.length + 1e-5);
    px += q * amp * w.direction[0] * cosP;
    pz += q * amp * w.direction[1] * cosP;
    py += amp * sinP;
  }
  out.set(px, py, pz);
  return out;
}

/**
 * Vertical surface height at world (x, z). Good enough for buoyancy:
 * we ignore the small horizontal Gerstner pinch and evaluate the sum-of-sines
 * height directly at the query point.
 */
export function sampleHeight(
  x: number,
  z: number,
  time: number,
  waves: GerstnerWave[],
  amplitudeScale: number,
): number {
  let py = 0;
  for (const w of waves) {
    const k = (2 * Math.PI) / w.wavelength;
    const amp = w.amplitude * amplitudeScale;
    const c = w.speed * k;
    const phase = (w.direction[0] * x + w.direction[1] * z) * k + time * c;
    py += amp * Math.sin(phase);
  }
  return py;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Approximate surface normal via finite differences of the Gerstner field. */
export function sampleNormal(
  x: number,
  z: number,
  time: number,
  waves: GerstnerWave[],
  amplitudeScale: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const e = 0.6;
  sampleGerstner(x - e, z, time, waves, amplitudeScale, _a);
  sampleGerstner(x + e, z, time, waves, amplitudeScale, _b);
  sampleGerstner(x, z + e, time, waves, amplitudeScale, _c);
  const tx = _b.clone().sub(_a);
  const tz = _c.clone().sub(_a);
  return out.crossVectors(tz, tx).normalize();
}

/** Encodes the wave set as uniform arrays for the GLSL shader. */
export function wavesToUniform(waves: GerstnerWave[]): {
  uWaveDir: THREE.Vector2[];
  uWaveParams: THREE.Vector4[];
  uWaveCount: number;
} {
  const uWaveDir: THREE.Vector2[] = [];
  const uWaveParams: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_WAVES; i++) {
    const w = waves[i];
    if (w) {
      uWaveDir.push(new THREE.Vector2(w.direction[0], w.direction[1]));
      // x: amplitude, y: wavelength, z: speed, w: steepness
      uWaveParams.push(new THREE.Vector4(w.amplitude, w.wavelength, w.speed, w.steepness));
    } else {
      uWaveDir.push(new THREE.Vector2(1, 0));
      uWaveParams.push(new THREE.Vector4(0, 1, 0, 0));
    }
  }
  return { uWaveDir, uWaveParams, uWaveCount: Math.min(waves.length, MAX_WAVES) };
}
