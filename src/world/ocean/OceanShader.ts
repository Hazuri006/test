import { MAX_WAVES } from './GerstnerWaves';
import { SKY_FUNCTION, SKY_UNIFORM_DECL } from '../../rendering/shaders/skyCommon';

/**
 * GLSL for the ocean surface. The vertex stage applies the same Gerstner
 * formula as the CPU buoyancy sampler (GerstnerWaves.ts). Normals are computed
 * analytically (GPU Gems style) for crisp specular highlights.
 */
export const OCEAN_VERTEX = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uAmplitudeScale;
uniform vec2 uWaveDir[${MAX_WAVES}];
uniform vec4 uWaveParams[${MAX_WAVES}]; // amplitude, wavelength, speed, steepness
uniform int uWaveCount;
uniform vec3 uCameraPos;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;
varying float vViewDist;

void main() {
  vec3 pos = position;
  // The plane is centred on the camera (managed on CPU); use world XZ for waves.
  float x = pos.x + uCameraPos.x;
  float z = pos.z + uCameraPos.z;

  vec3 displaced = vec3(x, 0.0, z);
  float sumX = 0.0;
  float sumY = 0.0;
  float sumZ = 0.0;
  float fold = 0.0;

  for (int i = 0; i < ${MAX_WAVES}; i++) {
    if (i >= uWaveCount) break;
    vec2 dir = uWaveDir[i];
    float amp = uWaveParams[i].x * uAmplitudeScale;
    float wavelength = uWaveParams[i].y;
    float speed = uWaveParams[i].z;
    float steep = uWaveParams[i].w;
    float k = 6.28318530718 / wavelength;
    float c = speed * k;
    float phase = dot(dir, vec2(x, z)) * k + uTime * c;
    float s = sin(phase);
    float cphase = cos(phase);
    float q = steep / (k * amp * float(uWaveCount) + 1e-5);

    displaced.x += q * amp * dir.x * cphase;
    displaced.z += q * amp * dir.y * cphase;
    displaced.y += amp * s;

    float WA = k * amp;
    sumX += dir.x * WA * cphase;
    sumZ += dir.y * WA * cphase;
    sumY += q * WA * s;
    fold += q * WA * s;
  }

  vec3 n = normalize(vec3(-sumX, 1.0 - sumY, -sumZ));

  // Foam where crests fold (high jacobian) and at the very top of swells.
  vFoam = clamp(fold * 1.6 + smoothstep(0.45, 0.9, displaced.y * uAmplitudeScale * 0.6), 0.0, 1.0);

  vWorldPos = displaced;
  vNormal = n;

  vec4 mvPosition = modelViewMatrix * vec4(displaced.x - uCameraPos.x, displaced.y, displaced.z - uCameraPos.z, 1.0);
  vViewDist = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const OCEAN_FRAGMENT = /* glsl */ `
precision highp float;

${SKY_UNIFORM_DECL}
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2D uNormalMap;
uniform float uDetailStrength;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;
varying float vViewDist;

${SKY_FUNCTION}

void main() {
  vec3 viewDir = normalize(uCameraPos - vWorldPos);

  // Detail normals: two scrolling samples of the tiling normal map.
  vec2 uv1 = vWorldPos.xz * 0.05 + vec2(uTime * 0.015, uTime * 0.01);
  vec2 uv2 = vWorldPos.xz * 0.11 - vec2(uTime * 0.012, uTime * 0.018);
  vec3 dn1 = texture2D(uNormalMap, uv1).xyz * 2.0 - 1.0;
  vec3 dn2 = texture2D(uNormalMap, uv2).xyz * 2.0 - 1.0;
  vec3 detail = normalize(dn1 + dn2);
  vec3 normal = normalize(vNormal + vec3(detail.x, 0.0, detail.y) * uDetailStrength);

  // Fresnel.
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
  fresnel = clamp(0.02 + fresnel * 0.98, 0.0, 1.0);

  // Reflected sky.
  vec3 reflectDir = reflect(-viewDir, normal);
  reflectDir.y = abs(reflectDir.y);
  vec3 skyRefl = computeSky(reflectDir);

  // Water body colour: deep vs shallow by view angle (proxy for depth).
  float depthMix = pow(clamp(dot(viewDir, normal), 0.0, 1.0), 0.6);
  vec3 water = mix(uDeepColor, uShallowColor, depthMix);

  // Sub-surface scattering on the lit side of crests.
  float sss = pow(max(dot(viewDir, -uSunDir), 0.0), 3.0) * smoothstep(0.0, 1.0, vWorldPos.y);
  water += uSunColor * sss * 0.12;

  vec3 color = mix(water, skyRefl, fresnel);

  // Sun specular.
  vec3 halfV = normalize(viewDir + uSunDir);
  float spec = pow(max(dot(normal, halfV), 0.0), 220.0);
  color += uSunColor * spec * uSunIntensity * 1.4;

  // Foam.
  float foam = smoothstep(0.55, 0.95, vFoam);
  color = mix(color, vec3(0.92, 0.96, 0.98), foam * 0.85);

  // Distance fog blends into the sky/horizon.
  float fog = clamp((vViewDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  color = mix(color, uFogColor, fog);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
