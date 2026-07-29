/* ============================================================
   Sky dome — gradient + sun + animated cloud bands + stars.
   One shader drives every stage's atmosphere.
   ============================================================ */
import * as THREE from 'three';
import { noiseMap } from './textures.js';

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at far plane
  }
`;

const FRAG = /* glsl */`
  uniform vec3  uTop;
  uniform vec3  uMid;
  uniform vec3  uBottom;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform float uSunSize;
  uniform float uSunGlow;
  uniform float uClouds;
  uniform vec3  uCloudColor;
  uniform vec3  uCloudDark;
  uniform float uStars;
  uniform float uNebula;
  uniform vec3  uNebulaColor;
  uniform float uTime;
  uniform sampler2D uNoise;
  varying vec3 vDir;

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += texture2D(uNoise, p).r * a;
      p *= 2.03; p += vec2(0.13, -0.07);
      a *= 0.5;
    }
    return v;
  }

  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

    vec3 sky = mix(uBottom, uMid, smoothstep(0.42, 0.58, h));
    sky = mix(sky, uTop, smoothstep(0.62, 0.96, h));

    // horizon haze
    float horizon = pow(1.0 - abs(d.y), 9.0);
    sky += uBottom * horizon * 0.28;

    // sun
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sd);
    float glow = pow(sd, uSunGlow);
    sky += uSunColor * (disc * 2.6 + glow * 0.85);

    // stars (space stages)
    if (uStars > 0.0) {
      vec2 sp = d.xz / (abs(d.y) + 0.35) * 6.0;
      vec2 cell = floor(sp * 30.0);
      float r = hash21(cell);
      float tw = 0.6 + 0.4 * sin(uTime * 2.3 + r * 40.0);
      float star = step(0.9945, r) * tw;
      vec2 f = fract(sp * 30.0) - 0.5;
      star *= smoothstep(0.34, 0.0, length(f));
      sky += vec3(star) * uStars * 3.0;

      if (uNebula > 0.0) {
        float n = fbm(d.xz * 0.55 + vec2(0.2, 0.0) + uTime * 0.004);
        float n2 = fbm(d.xz * 1.1 - vec2(0.4, 0.15));
        float cloud = smoothstep(0.42, 0.85, n * 0.7 + n2 * 0.45);
        sky += uNebulaColor * cloud * uNebula;
      }
    }

    // clouds — layered banks that keep working down at the horizon
    if (uClouds > 0.0 && d.y > 0.002) {
      vec2 cuv = d.xz / (d.y * 0.9 + 0.06);
      float drift = uTime * 0.010;
      float n = fbm(cuv * 0.055 + vec2(drift, drift * 0.4));
      float n2 = fbm(cuv * 0.16 - vec2(drift * 1.6, 0.0));
      float c = smoothstep(0.44, 0.72, n * 0.72 + n2 * 0.42);
      c *= smoothstep(0.0, 0.12, d.y) * smoothstep(1.0, 0.45, d.y);
      float lit = smoothstep(0.34, 0.86, n2);
      vec3 cc = mix(uCloudDark, uCloudColor, lit);
      cc += uSunColor * pow(sd, 6.0) * 0.9;
      sky = mix(sky, cc, clamp(c * uClouds, 0.0, 1.0));
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export function createSky(cfg = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(cfg.top ?? 0x1a4a9c) },
      uMid: { value: new THREE.Color(cfg.mid ?? 0x6ba8e0) },
      uBottom: { value: new THREE.Color(cfg.bottom ?? 0xd9c4a0) },
      uSunDir: { value: (cfg.sunDir ?? new THREE.Vector3(0.4, 0.5, 0.6)).clone().normalize() },
      uSunColor: { value: new THREE.Color(cfg.sunColor ?? 0xfff0c0) },
      uSunSize: { value: cfg.sunSize ?? 0.008 },
      uSunGlow: { value: cfg.sunGlow ?? 220 },
      uClouds: { value: cfg.clouds ?? 0.75 },
      uCloudColor: { value: new THREE.Color(cfg.cloudColor ?? 0xffffff) },
      uCloudDark: { value: new THREE.Color(cfg.cloudDark ?? 0x8fa6c4) },
      uStars: { value: cfg.stars ?? 0 },
      uNebula: { value: cfg.nebula ?? 0 },
      uNebulaColor: { value: new THREE.Color(cfg.nebulaColor ?? 0x7a3fd0) },
      uTime: { value: 0 },
      uNoise: { value: noiseMap(256, 5, 17) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData.sky = true;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.position.copy(camera.position);
  };
  return mesh;
}
