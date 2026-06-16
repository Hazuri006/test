import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/EventBus';
import { RNG } from '../core/RNG';
import { TextureFactory } from '../rendering/TextureFactory';
import type { GraphicsConfig } from '../core/SettingsManager';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm';

interface WeatherProfile {
  seaAmplitude: number;
  fogDensity: number;
  rainIntensity: number;
  windIntensity: number;
  cloudOpacity: number;
}

const PROFILES: Record<WeatherKind, WeatherProfile> = {
  clear: {
    seaAmplitude: 0.85,
    fogDensity: 0.6,
    rainIntensity: 0,
    windIntensity: 0.15,
    cloudOpacity: 0.05,
  },
  cloudy: {
    seaAmplitude: 1.05,
    fogDensity: 0.85,
    rainIntensity: 0,
    windIntensity: 0.35,
    cloudOpacity: 0.4,
  },
  rain: {
    seaAmplitude: 1.35,
    fogDensity: 1.3,
    rainIntensity: 0.6,
    windIntensity: 0.6,
    cloudOpacity: 0.7,
  },
  storm: {
    seaAmplitude: 1.9,
    fogDensity: 1.7,
    rainIntensity: 1.0,
    windIntensity: 1.0,
    cloudOpacity: 0.92,
  },
};

/**
 * Weather state machine with rain particles, drifting cloud layer, wind and
 * lightning. Exposes blended parameters the rest of the game reads each frame.
 */
export class WeatherSystem {
  kind: WeatherKind = 'clear';
  private current: WeatherProfile = { ...PROFILES.clear };
  private target: WeatherProfile = { ...PROFILES.clear };
  private timer = 0;
  private nextChange = 35;
  private rng = new RNG(Date.now() & 0xffff);

  /** Lightning flash intensity [0..1], decays over time. */
  flash = 0;
  private thunderPending = -1;

  private readonly rain: THREE.Points;
  private readonly rainVel: Float32Array;
  private readonly rainCount: number;
  private readonly clouds: THREE.Mesh;
  readonly group = new THREE.Group();
  private windDir = new THREE.Vector2(1, 0.3).normalize();

  constructor(
    private readonly bus: EventBus<GameEvents>,
    graphics: GraphicsConfig,
  ) {
    // Rain particle field around the player.
    this.rainCount = Math.floor(2600 * graphics.particleScale);
    const positions = new Float32Array(this.rainCount * 3);
    this.rainVel = new Float32Array(this.rainCount);
    for (let i = 0; i < this.rainCount; i++) {
      positions[i * 3] = this.rng.range(-40, 40);
      positions[i * 3 + 1] = this.rng.range(0, 40);
      positions[i * 3 + 2] = this.rng.range(-40, 40);
      this.rainVel[i] = this.rng.range(28, 42);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xaac4d8,
      size: 0.5,
      map: TextureFactory.softParticle(32, '#cfe4f2'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });
    this.rain = new THREE.Points(geo, rainMat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);

    // Cloud layer: large plane with a soft noise texture, scrolling.
    const cloudTex = TextureFactory.noiseNormal(99, 256, 1);
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.repeat.set(4, 4);
    const cloudGeo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
    cloudGeo.rotateX(Math.PI / 2);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0x9aa6b0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      map: cloudTex,
    });
    this.clouds = new THREE.Mesh(cloudGeo, cloudMat);
    this.clouds.position.y = 240;
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
  }

  setWeather(kind: WeatherKind): void {
    this.kind = kind;
    this.target = { ...PROFILES[kind] };
    this.bus.emit('weather:changed', { weather: kind });
  }

  get windVector(): THREE.Vector2 {
    return this.windDir.clone().multiplyScalar(this.current.windIntensity);
  }
  get seaAmplitude(): number {
    return this.current.seaAmplitude;
  }
  get fogDensity(): number {
    return this.current.fogDensity;
  }
  get rainIntensity(): number {
    return this.current.rainIntensity;
  }
  get windIntensity(): number {
    return this.current.windIntensity;
  }

  update(dt: number, playerPos: THREE.Vector3, isNight: boolean): void {
    // Random weather transitions.
    this.timer += dt;
    if (this.timer >= this.nextChange) {
      this.timer = 0;
      this.nextChange = this.rng.range(40, 110);
      this.rollWeather();
    }

    // Blend current toward target.
    const k = Math.min(1, dt * 0.4);
    this.current.seaAmplitude += (this.target.seaAmplitude - this.current.seaAmplitude) * k;
    this.current.fogDensity += (this.target.fogDensity - this.current.fogDensity) * k;
    this.current.rainIntensity += (this.target.rainIntensity - this.current.rainIntensity) * k;
    this.current.windIntensity += (this.target.windIntensity - this.current.windIntensity) * k;
    this.current.cloudOpacity += (this.target.cloudOpacity - this.current.cloudOpacity) * k;

    // Update rain particles.
    const positions = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = positions.array as Float32Array;
    const wind = this.windVector;
    for (let i = 0; i < this.rainCount; i++) {
      const idx = i * 3;
      arr[idx + 1] -= this.rainVel[i] * dt;
      arr[idx] += wind.x * dt * 4;
      arr[idx + 2] += wind.y * dt * 4;
      if (arr[idx + 1] < -2) {
        arr[idx] = this.rng.range(-40, 40);
        arr[idx + 1] = this.rng.range(30, 45);
        arr[idx + 2] = this.rng.range(-40, 40);
      }
    }
    positions.needsUpdate = true;
    this.rain.position.set(playerPos.x, playerPos.y, playerPos.z);
    (this.rain.material as THREE.PointsMaterial).opacity = this.current.rainIntensity * 0.9;
    this.rain.visible = this.current.rainIntensity > 0.02;

    // Clouds.
    this.clouds.position.x = playerPos.x;
    this.clouds.position.z = playerPos.z;
    const cloudMat = this.clouds.material as THREE.MeshBasicMaterial;
    cloudMat.opacity = this.current.cloudOpacity * 0.5;
    cloudMat.map?.offset.set(performance.now() * 0.000004, performance.now() * 0.000002);
    cloudMat.color.setHex(isNight ? 0x2a3038 : 0x9aa6b0);

    // Lightning during storms.
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.kind === 'storm' && this.rng.chance(dt * 0.18)) {
      this.flash = 1;
      this.thunderPending = this.rng.range(0.4, 2.2);
    }
    if (this.thunderPending > 0) {
      this.thunderPending -= dt;
      if (this.thunderPending <= 0) {
        this.thunderPending = -1;
        this.bus.emit('notify', { message: '⚡ Tonnerre', kind: 'info' });
      }
    }
  }

  private rollWeather(): void {
    const roll = this.rng.next();
    if (this.kind === 'clear') {
      this.setWeather(roll < 0.55 ? 'clear' : roll < 0.85 ? 'cloudy' : 'rain');
    } else if (this.kind === 'cloudy') {
      this.setWeather(
        roll < 0.4 ? 'clear' : roll < 0.7 ? 'cloudy' : roll < 0.92 ? 'rain' : 'storm',
      );
    } else if (this.kind === 'rain') {
      this.setWeather(roll < 0.4 ? 'cloudy' : roll < 0.75 ? 'rain' : 'storm');
    } else {
      this.setWeather(roll < 0.5 ? 'rain' : roll < 0.85 ? 'cloudy' : 'storm');
    }
  }

  serialize(): { kind: WeatherKind } {
    return { kind: this.kind };
  }

  load(s: { kind: WeatherKind }): void {
    this.setWeather(s.kind);
    this.current = { ...PROFILES[s.kind] };
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.clouds.geometry.dispose();
    (this.clouds.material as THREE.Material).dispose();
  }
}
