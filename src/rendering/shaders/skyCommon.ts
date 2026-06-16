/**
 * Shared GLSL for procedural sky colour. Included by both the sky dome and the
 * ocean shader so reflections match the visible sky exactly. The driving
 * uniforms are updated each frame by DayNightCycle / WeatherSystem.
 */
export const SKY_UNIFORM_DECL = /* glsl */ `
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunIntensity;
uniform vec3 uFogColor;
`;

export const SKY_FUNCTION = /* glsl */ `
// Procedural sky colour for a normalised view ray direction.
vec3 computeSky(vec3 dir) {
  float h = clamp(dir.y, -0.1, 1.0);
  float grad = pow(clamp(h, 0.0, 1.0), 0.42);
  vec3 base = mix(uHorizonColor, uZenithColor, grad);

  // Sun disk + glow.
  float sd = max(dot(normalize(dir), normalize(uSunDir)), 0.0);
  float disk = pow(sd, 1800.0) * 18.0;
  float glow = pow(sd, 8.0) * 0.6 + pow(sd, 2.0) * 0.18;
  vec3 sun = uSunColor * (disk + glow) * uSunIntensity;

  // Haze near the horizon.
  float haze = pow(1.0 - clamp(h, 0.0, 1.0), 3.0);
  base = mix(base, uFogColor, haze * 0.5);

  return base + sun;
}
`;
