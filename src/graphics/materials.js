/* ============================================================
   Materials — hand-written cel shading, inverted-hull outlines,
   energy/aura shaders. All GLSL1 so three can patch it for
   both WebGL1 and WebGL2.
   ============================================================ */
import * as THREE from 'three';
import { noiseMap } from './textures.js';

/* Shared lighting environment, updated per stage. */
export const ENV = {
  lightDir: new THREE.Vector3(0.45, 0.85, 0.35).normalize(),
  lightColor: new THREE.Color(1.0, 0.96, 0.9),
  skyColor: new THREE.Color(0.42, 0.56, 0.78),
  groundColor: new THREE.Color(0.26, 0.2, 0.16),
  ambient: 0.55,
  rimColor: new THREE.Color(0.7, 0.9, 1.0),
  fogColor: new THREE.Color(0.55, 0.66, 0.8),
};

const TOON_VERT = /* glsl */`
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const TOON_FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform vec3  uLightDir;
  uniform vec3  uLightColor;
  uniform vec3  uSkyColor;
  uniform vec3  uGroundColor;
  uniform float uAmbient;
  uniform vec3  uRimColor;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform float uSpecStrength;
  uniform float uSpecPower;
  uniform float uShadowTint;
  uniform float uBandSoft;
  uniform float uEmissive;
  uniform float uFlash;
  uniform vec3  uFlashColor;
  uniform float uEnergy;      // powered-up glow amount
  uniform vec3  uEnergyColor;
  uniform float uOpacity;
  uniform sampler2D uFaceMap; // face features, painted into the head material
  uniform float uHasFace;

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  #include <fog_pars_fragment>

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uLightDir);

    float ndl = dot(N, L) * 0.5 + 0.5;

    // three-tone cel ramp — hard edges, that's the whole point
    float s = uBandSoft;
    float b1 = smoothstep(0.46 - s, 0.46 + s, ndl);
    float b2 = smoothstep(0.70 - s, 0.70 + s, ndl);
    float tone = 0.30 + 0.36 * b1 + 0.34 * b2;

    // the shadow band keeps the hue but shifts cool and dark
    vec3 shadowCol = uColor * vec3(0.42, 0.50, 0.72) * uShadowTint;
    vec3 base = mix(shadowCol, uColor, clamp(tone, 0.0, 1.0));

    // hemispheric bounce, kept low so bands stay readable
    float hemi = N.y * 0.5 + 0.5;
    vec3 amb = mix(uGroundColor, uSkyColor, hemi) * uAmbient * 0.34;
    vec3 col = base * uLightColor * 0.92 + uColor * amb;

    // hard anime specular
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), uSpecPower);
    spec = smoothstep(0.45, 0.6, spec);
    col += spec * uSpecStrength * uLightColor * 0.8;

    // face features, shaded with the same ramp so they sit in the skin
    if (uHasFace > 0.5) {
      vec4 fc = texture2D(uFaceMap, vUv);
      col = mix(col, fc.rgb * (0.5 + 0.5 * tone) * uLightColor, fc.a);
    }

    // rim / backlight
    float fres = pow(1.0 - max(dot(N, V), 0.0), uRimPower);
    float back = smoothstep(-0.2, 0.75, dot(N, -L)) * 0.75 + 0.25;
    col += fres * back * uRimStrength * uRimColor;

    // energy state: additive fresnel in the character's ki colour
    col += fres * uEnergy * uEnergyColor * 1.6;
    col += uEnergyColor * uEnergy * 0.18;

    col += uColor * uEmissive;
    col = mix(col, uFlashColor, uFlash);

    gl_FragColor = vec4(col, uOpacity);
    #include <fog_fragment>
  }
`;

let BLANK_TEX = null;
function blankTexture() {
  if (!BLANK_TEX) {
    BLANK_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    BLANK_TEX.needsUpdate = true;
  }
  return BLANK_TEX;
}

export function createToonMaterial(opts = {}) {
  const color = new THREE.Color(opts.color ?? 0xffffff);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uColor: { value: color },
        uLightDir: { value: ENV.lightDir.clone() },
        uLightColor: { value: ENV.lightColor.clone() },
        uSkyColor: { value: ENV.skyColor.clone() },
        uGroundColor: { value: ENV.groundColor.clone() },
        uAmbient: { value: ENV.ambient },
        uRimColor: { value: ENV.rimColor.clone() },
        uRimPower: { value: opts.rimPower ?? 2.6 },
        uRimStrength: { value: opts.rimStrength ?? 0.55 },
        uSpecStrength: { value: opts.specStrength ?? 0.35 },
        uSpecPower: { value: opts.specPower ?? 48 },
        uShadowTint: { value: opts.shadowTint ?? 0.72 },
        uBandSoft: { value: opts.bandSoft ?? 0.035 },
        uEmissive: { value: opts.emissive ?? 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(0xffffff) },
        uEnergy: { value: 0 },
        uEnergyColor: { value: new THREE.Color(opts.energyColor ?? 0x66ccff) },
        uOpacity: { value: opts.opacity ?? 1 },
        uFaceMap: { value: null },
        uHasFace: { value: opts.faceMap ? 1 : 0 },
      },
    ]),
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    fog: true,
    transparent: opts.transparent ?? false,
    side: opts.side ?? THREE.FrontSide,
  });
  mat.uniforms.uColor.value = color;
  mat.uniforms.uEnergyColor.value = new THREE.Color(opts.energyColor ?? 0x66ccff);
  mat.uniforms.uFaceMap.value = opts.faceMap ?? blankTexture();
  mat.userData.isToon = true;
  return mat;
}

/** push every toon material in the scene to the current stage lighting */
export function syncToonEnv(root) {
  root.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m.userData?.isToon) continue;
      m.uniforms.uLightDir.value.copy(ENV.lightDir);
      m.uniforms.uLightColor.value.copy(ENV.lightColor);
      m.uniforms.uSkyColor.value.copy(ENV.skyColor);
      m.uniforms.uGroundColor.value.copy(ENV.groundColor);
      m.uniforms.uAmbient.value = ENV.ambient;
      m.uniforms.uRimColor.value.copy(ENV.rimColor);
    }
  });
}

/* ---------------- outline (inverted hull) ---------------- */

const OUTLINE_VERT = /* glsl */`
  uniform float uThickness;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    // constant screen-space width: scale by view depth
    mv.xyz += n * uThickness * (-mv.z) * 0.012;
    gl_Position = projectionMatrix * mv;
  }
`;

const OUTLINE_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() { gl_FragColor = vec4(uColor, uOpacity); }
`;

export function createOutlineMaterial(color = 0x0a0d16, thickness = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uThickness: { value: thickness },
      uOpacity: { value: 1 },
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: true,
    fog: false,
  });
}

/* ---------------- energy (beams, orbs, blasts) ---------------- */

const ENERGY_VERT = /* glsl */`
  uniform float uTime;
  uniform float uWobble;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    vec3 p = position;
    if (uWobble > 0.0) {
      float w = sin(position.y * 8.0 + uTime * 14.0) * 0.5 + sin(position.x * 11.0 - uTime * 9.0) * 0.5;
      p += normal * w * uWobble;
    }
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ENERGY_FRAG = /* glsl */`
  uniform vec3  uCore;
  uniform vec3  uEdge;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uFresnel;
  uniform float uOpacity;
  uniform float uStripes;
  uniform sampler2D uNoise;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vPos;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float f = pow(1.0 - max(dot(N, V), 0.0), uFresnel);

    float n = texture2D(uNoise, vUv * vec2(2.0, 1.0) + vec2(uTime * 0.6, -uTime * 2.2)).r;
    float n2 = texture2D(uNoise, vUv * vec2(4.0, 2.0) - vec2(uTime * 0.9, uTime * 3.1)).r;
    float turb = (n * 0.6 + n2 * 0.4);

    float stripes = 1.0;
    if (uStripes > 0.0) {
      stripes = 0.72 + 0.5 * sin(vUv.y * 42.0 - uTime * 26.0 + turb * 6.0);
    }

    vec3 col = mix(uEdge, uCore, clamp(f * 0.3 + 0.34 - turb * 0.42, 0.0, 1.0));
    col *= uIntensity * stripes;
    col += uCore * f * 0.45;

    float a = clamp((0.26 + f * 0.95) * uOpacity * (0.6 + turb * 0.55), 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

export function createEnergyMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCore: { value: new THREE.Color(opts.core ?? 0xffffff) },
      uEdge: { value: new THREE.Color(opts.edge ?? 0x3fd0ff) },
      uIntensity: { value: opts.intensity ?? 1.15 },
      uTime: { value: 0 },
      uFresnel: { value: opts.fresnel ?? 2.0 },
      uOpacity: { value: opts.opacity ?? 1 },
      uWobble: { value: opts.wobble ?? 0 },
      uStripes: { value: opts.stripes ? 1 : 0 },
      uNoise: { value: noiseMap(256, 5, 11) },
    },
    vertexShader: ENERGY_VERT,
    fragmentShader: ENERGY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/* ---------------- aura (the ki flame) ---------------- */

const AURA_VERT = /* glsl */`
  uniform float uTime;
  uniform float uPower;
  varying vec2 vUv;
  varying float vH;
  void main() {
    vUv = uv;
    vH = uv.y;
    vec3 p = position;
    float flick = sin(uv.x * 26.0 + uTime * 19.0) * 0.5 + sin(uv.x * 13.0 - uTime * 11.0) * 0.5;
    // taper outward at the base, whip at the tip
    p.xz *= 1.0 + flick * 0.09 * (0.25 + uv.y) * uPower;
    p.y += flick * 0.06 * uv.y * uPower;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const AURA_FRAG = /* glsl */`
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform float uPower;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vH;

  void main() {
    vec2 uv1 = vec2(vUv.x * 4.0, vUv.y * 1.1 - uTime * 1.35);
    vec2 uv2 = vec2(vUv.x * 8.0 + 0.37, vUv.y * 1.9 - uTime * 2.35);
    float n = texture2D(uNoise, uv1).r * 0.66 + texture2D(uNoise, uv2).r * 0.34;

    // tongues of flame: thin at rest, thick when powered up
    float mask = smoothstep(0.88, 0.06, vH);
    float base = smoothstep(0.0, 0.07, vH);
    float thr = mix(0.70, 0.44, clamp(uPower, 0.0, 1.4));
    float a = smoothstep(thr, thr + 0.2, n * mask) * base * 0.9;

    vec3 col = mix(uColor, uCore, smoothstep(thr + 0.04, thr + 0.28, n * mask));
    col *= 0.85 + uPower * 0.75;
    gl_FragColor = vec4(col, a * uOpacity);
    if (gl_FragColor.a < 0.012) discard;
  }
`;

export function createAuraMaterial(color = 0xffc23c, core = 0xffffff) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: noiseMap(256, 5, 3) },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uCore: { value: new THREE.Color(core) },
      uPower: { value: 0.5 },
      uOpacity: { value: 1 },
    },
    vertexShader: AURA_VERT,
    fragmentShader: AURA_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // back faces only: the aura reads as a halo behind the silhouette
    // instead of an additive wash over the character's own pixels
    side: THREE.BackSide,
  });
}

/* ---------------- blob shadow ---------------- */

export function createBlobShadowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.5 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.7) * uOpacity;
        gl_FragColor = vec4(0.02, 0.03, 0.06, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

/* ---------------- additive sprite material helper ---------------- */

export function additiveSprite(map, color = 0xffffff, opacity = 1) {
  return new THREE.SpriteMaterial({
    map, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
}
