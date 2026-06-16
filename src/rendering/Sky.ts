import * as THREE from 'three';
import { SKY_FUNCTION, SKY_UNIFORM_DECL } from './shaders/skyCommon';

export interface SkyParams {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sunColor: THREE.Color;
  sunDir: THREE.Vector3;
  sunIntensity: number;
  fog: THREE.Color;
  /** 0 day .. 1 night, drives stars + moon. */
  nightFactor: number;
  /** Directional light intensity for the sun. */
  sunLightIntensity: number;
  /** Ambient/hemisphere intensity. */
  ambientIntensity: number;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // force onto far plane
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
${SKY_UNIFORM_DECL}
uniform float uStarStrength;
varying vec3 vDir;
${SKY_FUNCTION}

// Hash for procedural stars.
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 col = computeSky(dir);

  // Stars: only above the horizon and at night.
  if (dir.y > 0.0 && uStarStrength > 0.01) {
    vec3 cell = floor(dir * 240.0);
    float h = hash(cell);
    float star = smoothstep(0.9975, 1.0, h);
    float twinkle = 0.6 + 0.4 * sin(uStarStrength * 6.28 + h * 50.0);
    col += vec3(star) * uStarStrength * twinkle * dir.y;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Sky dome + sun/moon directional lighting + hemisphere fill.
 * Visual parameters are pushed in each frame by DayNightCycle.
 */
export class Sky {
  readonly group = new THREE.Group();
  readonly sunLight: THREE.DirectionalLight;
  readonly moonLight: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  private readonly material: THREE.ShaderMaterial;
  private readonly moon: THREE.Mesh;

  constructor(shadowMapSize: number, shadowsEnabled: boolean) {
    const geo = new THREE.SphereGeometry(4000, 32, 16);
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenithColor: { value: new THREE.Color(0x2a6cc0) },
        uHorizonColor: { value: new THREE.Color(0xbfd8e8) },
        uSunColor: { value: new THREE.Color(0xfff2d8) },
        uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.2).normalize() },
        uSunIntensity: { value: 1 },
        uFogColor: { value: new THREE.Color(0xbfd8e8) },
        uStarStrength: { value: 0 },
      },
    });
    const dome = new THREE.Mesh(geo, this.material);
    dome.frustumCulled = false;
    this.group.add(dome);

    this.sunLight = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.sunLight.castShadow = shadowsEnabled;
    this.configureShadow(this.sunLight, shadowMapSize);
    this.group.add(this.sunLight);
    this.group.add(this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight(0x9fb8e0, 0.0);
    this.group.add(this.moonLight);
    this.group.add(this.moonLight.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8e8, 0x14323f, 0.5);
    this.group.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x8098a8, 0.25);
    this.group.add(this.ambient);

    const moonGeo = new THREE.SphereGeometry(60, 16, 12);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe6f0, fog: false });
    this.moon = new THREE.Mesh(moonGeo, moonMat);
    this.group.add(this.moon);
  }

  private configureShadow(light: THREE.DirectionalLight, size: number): void {
    light.shadow.mapSize.set(size, size);
    const cam = light.shadow.camera;
    cam.near = 1;
    cam.far = 220;
    cam.left = -60;
    cam.right = 60;
    cam.top = 60;
    cam.bottom = -60;
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = 0.04;
  }

  apply(p: SkyParams, cameraPos: THREE.Vector3): void {
    const u = this.material.uniforms;
    (u.uZenithColor.value as THREE.Color).copy(p.zenith);
    (u.uHorizonColor.value as THREE.Color).copy(p.horizon);
    (u.uSunColor.value as THREE.Color).copy(p.sunColor);
    (u.uSunDir.value as THREE.Vector3).copy(p.sunDir);
    u.uSunIntensity.value = p.sunIntensity;
    (u.uFogColor.value as THREE.Color).copy(p.fog);
    u.uStarStrength.value = p.nightFactor;

    // Keep dome + lights centred on the player.
    this.group.position.copy(cameraPos);

    // Sun light follows the sun direction; target is the player.
    this.sunLight.position.copy(p.sunDir).multiplyScalar(140);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.color.copy(p.sunColor);
    this.sunLight.intensity = p.sunLightIntensity;

    // Moon opposite the sun.
    this.moonLight.position.copy(p.sunDir).multiplyScalar(-140);
    this.moonLight.intensity = p.nightFactor * 0.3;
    this.moon.position.copy(p.sunDir).multiplyScalar(-2500);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = p.nightFactor;
    this.moon.visible = p.nightFactor > 0.05;

    this.hemi.intensity = p.ambientIntensity;
    this.hemi.color.copy(p.zenith);
    this.hemi.groundColor.copy(p.fog).multiplyScalar(0.3);
    this.ambient.intensity = 0.18 + p.ambientIntensity * 0.3;
  }

  dispose(): void {
    this.material.dispose();
    (this.moon.geometry as THREE.BufferGeometry).dispose();
    (this.moon.material as THREE.Material).dispose();
  }
}
