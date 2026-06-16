import * as THREE from 'three';
import {
  DEFAULT_WAVES,
  sampleHeight,
  sampleNormal,
  wavesToUniform,
  type GerstnerWave,
} from './GerstnerWaves';
import { OCEAN_FRAGMENT, OCEAN_VERTEX } from './OceanShader';
import { TextureFactory } from '../../rendering/TextureFactory';
import type { GraphicsConfig } from '../../core/SettingsManager';

export interface SkyUniformValues {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sunColor: THREE.Color;
  sunDir: THREE.Vector3;
  sunIntensity: number;
  fog: THREE.Color;
}

/**
 * Manages the ocean surface mesh and its shader. The grid is recentred on the
 * camera every frame; waves are evaluated in world space inside the shader so
 * the sea appears continuous and infinite without unbounded geometry.
 */
export class OceanManager {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private waves: GerstnerWave[] = DEFAULT_WAVES;
  private amplitudeScale = 1;
  private targetAmplitude = 1;
  private time = 0;
  private readonly size: number;

  constructor(graphics: GraphicsConfig) {
    this.size = Math.min(graphics.viewDistance * 1.6, 1600);
    const seg = graphics.oceanSegments;
    const geo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    geo.rotateX(-Math.PI / 2);

    const { uWaveDir, uWaveParams, uWaveCount } = wavesToUniform(this.waves);
    const normalMap = TextureFactory.noiseNormal(7, 256, 2.2);
    normalMap.repeat.set(1, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uAmplitudeScale: { value: 1 },
        uWaveDir: { value: uWaveDir },
        uWaveParams: { value: uWaveParams },
        uWaveCount: { value: uWaveCount },
        uCameraPos: { value: new THREE.Vector3() },
        uShallowColor: { value: new THREE.Color(0x2e93a8) },
        uDeepColor: { value: new THREE.Color(0x0a2a3a) },
        uNormalMap: { value: normalMap },
        uDetailStrength: { value: graphics.oceanSegments > 150 ? 0.5 : 0.32 },
        uFogNear: { value: graphics.viewDistance * 0.4 },
        uFogFar: { value: graphics.viewDistance },
        // Sky uniforms (updated by DayNightCycle).
        uZenithColor: { value: new THREE.Color(0x2a6cc0) },
        uHorizonColor: { value: new THREE.Color(0xbfd8e8) },
        uSunColor: { value: new THREE.Color(0xfff2d8) },
        uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.2).normalize() },
        uSunIntensity: { value: 1 },
        uFogColor: { value: new THREE.Color(0xbfd8e8) },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.mesh.name = 'ocean';
  }

  /** Storm/calm sea state via amplitude scaling. */
  setSeaState(amplitude: number): void {
    this.targetAmplitude = amplitude;
  }

  setSkyUniforms(v: SkyUniformValues): void {
    const u = this.material.uniforms;
    (u.uZenithColor.value as THREE.Color).copy(v.zenith);
    (u.uHorizonColor.value as THREE.Color).copy(v.horizon);
    (u.uSunColor.value as THREE.Color).copy(v.sunColor);
    (u.uSunDir.value as THREE.Vector3).copy(v.sunDir);
    u.uSunIntensity.value = v.sunIntensity;
    (u.uFogColor.value as THREE.Color).copy(v.fog);
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    this.time += dt;
    this.amplitudeScale += (this.targetAmplitude - this.amplitudeScale) * Math.min(1, dt * 0.5);
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uAmplitudeScale.value = this.amplitudeScale;
    (u.uCameraPos.value as THREE.Vector3).set(cameraPos.x, cameraPos.y, cameraPos.z);
    // Recentre grid on camera (snap to avoid vertex shimmer).
    this.mesh.position.set(cameraPos.x, 0, cameraPos.z);
  }

  /** World-space surface height at (x, z) — matches the GPU displacement. */
  getHeight(x: number, z: number): number {
    return sampleHeight(x, z, this.time, this.waves, this.amplitudeScale);
  }

  getNormal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return sampleNormal(x, z, this.time, this.waves, this.amplitudeScale, out);
  }

  isUnderwater(pos: THREE.Vector3): boolean {
    return pos.y < this.getHeight(pos.x, pos.z);
  }

  get currentTime(): number {
    return this.time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
