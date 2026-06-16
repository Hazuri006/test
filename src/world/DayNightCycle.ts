import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { SkyParams } from '../rendering/Sky';

const DAY = {
  zenith: new THREE.Color(0x2a6cc0),
  horizon: new THREE.Color(0xc6dcec),
  sun: new THREE.Color(0xfff4dc),
  fog: new THREE.Color(0xc2d8e6),
};
const NIGHT = {
  zenith: new THREE.Color(0x040b18),
  horizon: new THREE.Color(0x0a1626),
  sun: new THREE.Color(0x35507a),
  fog: new THREE.Color(0x07101c),
};
const SUNSET = {
  horizon: new THREE.Color(0xff7a3c),
  sun: new THREE.Color(0xffb066),
  zenith: new THREE.Color(0x355a92),
};

/**
 * Drives time-of-day: sun direction, sky/fog colours and light intensities.
 * One in-game day spans `dayLengthSeconds` real seconds.
 */
export class DayNightCycle {
  /** Hour of day in [0, 24). */
  hour = 8;
  day = 1;
  dayLengthSeconds = 600; // 10 real minutes per day
  private lastEmittedHour = -1;

  private readonly params: SkyParams = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    sunColor: new THREE.Color(),
    sunDir: new THREE.Vector3(),
    sunIntensity: 1,
    fog: new THREE.Color(),
    nightFactor: 0,
    sunLightIntensity: 2.2,
    ambientIntensity: 0.5,
  };

  constructor(private readonly bus: EventBus<GameEvents>) {
    this.recompute();
  }

  setHour(h: number): void {
    this.hour = ((h % 24) + 24) % 24;
    this.recompute();
  }

  update(dt: number): SkyParams {
    const hoursPerSecond = 24 / this.dayLengthSeconds;
    this.hour += dt * hoursPerSecond;
    if (this.hour >= 24) {
      this.hour -= 24;
      this.day += 1;
    }
    this.recompute();
    const h = Math.floor(this.hour);
    if (h !== this.lastEmittedHour) {
      this.lastEmittedHour = h;
      this.bus.emit('time:changed', { hour: h, day: this.day });
    }
    return this.params;
  }

  get skyParams(): SkyParams {
    return this.params;
  }

  isNight(): boolean {
    return this.params.sunDir.y < -0.02;
  }

  private recompute(): void {
    const theta = ((this.hour - 6) / 24) * Math.PI * 2;
    const sunDir = this.params.sunDir;
    sunDir.set(Math.cos(theta), Math.sin(theta), 0.35 * Math.cos(theta)).normalize();

    const sh = sunDir.y; // -1..1
    const dayFactor = smoothstep(-0.08, 0.22, sh);
    const nightFactor = 1 - smoothstep(-0.15, 0.05, sh);
    // Sunset peaks when the sun is near the horizon (but above it).
    const sunsetFactor = Math.max(0, 1 - Math.abs(sh) / 0.18) * smoothstep(-0.18, 0.0, sh);

    this.params.zenith.copy(NIGHT.zenith).lerp(DAY.zenith, dayFactor);
    this.params.horizon.copy(NIGHT.horizon).lerp(DAY.horizon, dayFactor);
    this.params.sunColor.copy(NIGHT.sun).lerp(DAY.sun, dayFactor);
    this.params.fog.copy(NIGHT.fog).lerp(DAY.fog, dayFactor);

    // Layer sunset tints near the horizon.
    this.params.horizon.lerp(SUNSET.horizon, sunsetFactor * 0.8);
    this.params.sunColor.lerp(SUNSET.sun, sunsetFactor * 0.7);
    this.params.zenith.lerp(SUNSET.zenith, sunsetFactor * 0.4);
    this.params.fog.lerp(SUNSET.horizon, sunsetFactor * 0.3);

    this.params.sunIntensity = 0.4 + dayFactor * 1.2;
    this.params.sunLightIntensity = dayFactor * 2.4;
    this.params.ambientIntensity = 0.22 + dayFactor * 0.5;
    this.params.nightFactor = nightFactor;
  }

  serialize(): { hour: number; day: number } {
    return { hour: this.hour, day: this.day };
  }

  load(s: { hour: number; day: number }): void {
    this.hour = s.hour;
    this.day = s.day;
    this.recompute();
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
