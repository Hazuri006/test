'use strict';
/* ============================================================================
   shaders.js — all GLSL ES 3.00 sources.

   Two ideas drive the whole renderer:

   1. Logarithmic depth.  A single depth buffer has to hold a 3 m landing skid
      and a planet 400 km away.  Every shader that writes to the scene depth
      buffer uses the same log-z encoding, and the post pass inverts it to get
      world-space distance back.

   2. Everything is camera-relative.  The CPU keeps float64 world positions;
      the GPU only ever sees offsets from the camera, which stay small.
   ============================================================================ */

const SH = {};

/* -------------------------------------------------------------- preamble -- */
SH.head = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
`;

/* Shared helpers: log depth, hashes, the simplex noise that matches math.js,
   and the surface palette used by both the terrain and the orbital sphere. */
SH.common = `
const float PI = 3.14159265359;

/* ---- logarithmic depth ---- */
float logDepth(float logz, float fcoefHalf){ return log2(logz) * fcoefHalf; }

/* ---- hashes ---- */
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
vec3 hash33(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453123);
}

/* ---- Ashima simplex noise (bit-for-bit partner of snoise3 in math.js) ---- */
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  /* Index the 7x7 gradient table exactly.  The textbook form multiplies by
     approximations of 1/49 and 1/7, which round down at exact multiples; the
     index then runs one past the end of the octahedron and taylorInvSqrt
     returns a NEGATIVE scale — the source of ±4 noise spikes.  Divide, then
     carry, so this matches the CPU copy in math.js. */
  vec4 j = p - 49.0 * floor(p / 49.0);
  j -= 49.0 * step(49.0, j);
  vec4 x_ = floor(j / 7.0);
  vec4 y_ = j - 7.0 * x_;
  vec4 carry = step(7.0, y_);
  x_ += carry;
  y_ -= 7.0 * carry;
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)) );
}

const mat3 OCT_ROT = mat3( 0.00, -0.80, -0.60,
                           0.80,  0.36, -0.48,
                           0.60, -0.48,  0.64 );

/* Note: both fbm variants normalise by a *fixed* 1.0 rather than by the sum of
   the amplitudes actually used.  That is deliberate — it means adding octaves
   only adds detail instead of rescaling everything, so the CPU version (many
   octaves) and this GPU version (few octaves) agree on the large shapes. */
float fbm(vec3 p, int octaves){
  float amp = 0.5, sum = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= octaves) break;
    sum += amp * snoise(p);
    amp *= 0.5;
    p = OCT_ROT * p * 2.0;
  }
  return sum;
}

float ridged(vec3 p, int octaves){
  float amp = 0.5, sum = 0.0, prev = 1.0;
  for (int i = 0; i < 8; i++){
    if (i >= octaves) break;
    float n = max(1.0 - abs(snoise(p)), 0.0);
    n *= n;
    sum += amp * n * prev;
    prev = n;
    amp *= 0.5;
    p = OCT_ROT * p * 2.0;
  }
  return sum;
}

float craterField(vec3 dir, float freq, float amp){
  if (amp <= 0.0) return 0.0;
  float n = snoise(dir * freq);
  float a = 1.0 - abs(n);
  float bowl = smoothstep(0.70, 0.98, a);
  float rim  = smoothstep(0.55, 0.70, a) * (1.0 - bowl);
  return (rim * 0.5 - bowl) * amp;
}

/* Low-detail twin of Planet.heightAt() — used for the orbital sphere so the
   continents line up with the streamed terrain during the hand-off. */
float planetHeight(vec3 dir, vec4 A, vec4 B, int oct){
  float cont = fbm(dir * A.x, oct);
  float h = cont * A.y;
  float m = ridged(dir * A.z, oct);
  float mask = smoothstep(-0.15, 0.35, cont);
  h += pow(max(m, 0.0), B.x) * A.w * (0.25 + 0.75 * mask);
  h += fbm(dir * B.y, max(oct - 3, 1)) * B.z;
  h += craterField(dir, A.z * 3.0, B.w);
  return h;
}

/* Altitude/slope/latitude driven palette, shared by terrain and orbital view */
vec3 surfaceAlbedo(float alt, float slope, float lat, float variation,
                   float seaH, float maxE,
                   vec3 cSand, vec3 cLow, vec3 cMid, vec3 cHigh, vec3 cCliff, vec3 cPolar)
{
  float a = (alt - seaH) / max(maxE, 1.0);          // 0 at shoreline, 1 at peaks
  float v = variation * 2.0 - 1.0;

  vec3 col = cLow;
  col = mix(cSand, col, smoothstep(0.0, 0.055 + v*0.02, a));
  col = mix(col, cMid, smoothstep(0.22 + v*0.08, 0.55, a));
  col = mix(col, cHigh, smoothstep(0.6 + v*0.1, 0.92, a));

  // steep faces expose bare rock regardless of altitude
  col = mix(col, cCliff, smoothstep(0.35, 0.72, slope));

  // polar caps
  float polar = smoothstep(0.74 + v*0.05, 0.93, lat);
  col = mix(col, cPolar, polar * (1.0 - smoothstep(0.4, 0.8, slope)));

  /* Patchiness.  Without it a biome's low ground is one flat colour across a
     whole continent, which reads as untextured rather than as grassland. */
  col = mix(col, cMid, smoothstep(0.62, 0.95, variation) * 0.40);
  col *= 0.80 + variation * 0.42;
  return col;
}

/* Ray/sphere.  Returns (near, far).  A miss returns far < 0 AND a near of
   +infinity: callers that only test the near value must not be able to mistake
   a miss for a hit right in front of the camera. */
vec2 raySphere(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r*r;
  float h = b*b - c;
  if (h < 0.0) return vec2(1e30, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
`;

/* ============================================================================
   TERRAIN
   ============================================================================ */
SH.terrainVS = SH.head + SH.common + `
layout(location=0) in vec3 aPos;     // relative to chunk centre
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aInfo;    // x: altitude above mean radius, y: skirt

uniform mat4 uViewProj;              // projection * rotation-only view
uniform vec3 uOffset;                // chunkCentre - cameraPos
uniform float uFcoefHalf;

out vec3 vPos;
out vec3 vNormal;
out float vAlt;
out float vLogZ;
out float vSkirt;

void main(){
  vec3 p = aPos + uOffset;
  vPos = p;
  vNormal = aNormal;
  vAlt = aInfo.x;
  vSkirt = aInfo.y;
  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  cp.z = (logDepth(max(1e-6, vLogZ), uFcoefHalf) * 2.0 - 1.0) * cp.w;
  gl_Position = cp;
}
`;

SH.terrainFS = SH.head + SH.common + `
in vec3 vPos;
in vec3 vNormal;
in float vAlt;
in float vLogZ;
in float vSkirt;

uniform sampler3D uNoise;
uniform vec3 uPlanetC;
uniform float uR, uSeaH, uMaxE;
uniform float uWaterH;   // actual sea level; uSeaH is the palette reference
uniform vec3 uAxis;
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform vec3 uCSand, uCLow, uCMid, uCHigh, uCCliff, uCPolar;
uniform vec4 uEmissive;      // rgb glow colour, a = altitude below which it glows
uniform float uFcoefHalf;
uniform float uTime;
uniform float uHasWater;
uniform vec4 uLightPos;      // xyz relative to camera, w = range (<=0 disables)
uniform vec3 uLightCol;
uniform vec3 uLightDir;      // cone axis

out vec4 fragColor;

/* Ship landing light / suit torch.  Without it, the night side of an airless
   world is genuinely pitch black — accurate, but you cannot land on it. */
vec3 headlight(vec3 pos, vec3 n, vec3 albedo){
  if (uLightPos.w <= 0.0) return vec3(0.0);
  vec3 L = uLightPos.xyz - pos;
  float d = length(L);
  if (d > uLightPos.w) return vec3(0.0);
  L /= d;
  float att = 1.0 - d / uLightPos.w;
  att *= att;
  float cone = smoothstep(0.32, 0.78, dot(-L, uLightDir));
  return albedo * uLightCol * max(dot(n, L), 0.0) * att * (0.22 + 0.78 * cone);
}

void main(){
  vec3 lp = vPos - uPlanetC;            // planet-local: stable, no swimming
  float r = length(lp);
  vec3 up = lp / r;
  float alt = r - uR;
  vec3 n = normalize(vNormal);
  float viewDist = length(vPos);

  /* --- fine surface detail from the tiling 3D noise volume --- */
  float macro = texture(uNoise, lp * 0.0016).r;
  float meso  = texture(uNoise, lp * 0.0075).g;
  float variation = clamp(macro * 0.65 + meso * 0.35, 0.0, 1.0);

  /* bump mapping, faded out with distance so it never aliases */
  float bumpFade = exp(-viewDist / 420.0);
  if (bumpFade > 0.004){
    vec3 t1 = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
    vec3 t2 = cross(up, t1);
    /* One noise repeat per ~30 m.  Any finer and the surface reads as
       television static rather than ground. */
    float ds = 0.032;
    float e = 3.5;
    float h0 = texture(uNoise, lp*ds).b;
    float hx = texture(uNoise, (lp + t1*e)*ds).b;
    float hy = texture(uNoise, (lp + t2*e)*ds).b;
    n = normalize(n - (t1*(hx-h0) + t2*(hy-h0)) * 1.9 * bumpFade);
  }

  float slope = 1.0 - clamp(dot(n, up), 0.0, 1.0);
  float lat = abs(dot(up, uAxis));

  vec3 albedo = surfaceAlbedo(alt, slope, lat, variation, uSeaH, uMaxE,
                              uCSand, uCLow, uCMid, uCHigh, uCCliff, uCPolar);

  /* Wet, darker sand right at the waterline. */
  if (uHasWater > 0.5){
    float band = 1.0 - smoothstep(0.0, 26.0, abs(alt - uWaterH));
    albedo *= 1.0 - band * 0.34;
  }

  /* Skirt geometry only exists to hide LOD seams — flatten its shading so it
     never draws attention to itself. */
  albedo = mix(albedo, albedo * 0.9, vSkirt);

  /* --- lighting --- */
  float ndl = dot(n, uSunDir);
  float shade = smoothstep(-0.12, 0.10, dot(up, uSunDir));   // soft terminator
  vec3 col = albedo * uSunColor * max(ndl, 0.0) * shade;

  float sky = 0.5 + 0.5 * dot(n, up);
  col += albedo * uAmbient * sky;

  /* Rim/backscatter — cheap but does a lot for readability at dusk. */
  float rim = pow(1.0 - clamp(dot(n, normalize(-vPos)), 0.0, 1.0), 3.0);
  col += uSunColor * uAmbient * rim * 0.35 * shade;

  col += headlight(vPos, n, albedo);

  /* Emissive lows (lava seams, glowing flora bloom). */
  if (uEmissive.a > -9000.0){
    float g = 1.0 - smoothstep(uEmissive.a - 40.0, uEmissive.a + 60.0, alt);
    g *= smoothstep(0.55, 0.15, slope);
    float pulse = 0.75 + 0.25 * sin(uTime*0.7 + variation*22.0);
    col += uEmissive.rgb * g * pulse;
  }

  fragColor = vec4(col, 1.0);
  gl_FragDepth = logDepth(vLogZ, uFcoefHalf);
}
`;

/* ============================================================================
   OBJECTS — ship, props.  One source, two variants via INSTANCED.
   ============================================================================ */
function objectVS(instanced) {
  return SH.head + SH.common + (instanced ? '#define INSTANCED 1\n' : '') + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aFlag;
#ifdef INSTANCED
layout(location=4) in vec3 iOffset;   // instance position relative to chunk centre
layout(location=5) in vec4 iRot;      // quaternion
layout(location=6) in vec4 iTint;     // rgb tint, a = uniform scale
#endif

uniform mat4 uViewProj;
uniform mat3 uModelRot;
uniform vec3 uOffset;
uniform float uFcoefHalf;
uniform float uGear;                  // landing-gear extension 0..1
uniform float uHideCanopy;            // 1 when the camera is inside the cockpit

out vec3 vPos;
out vec3 vNormal;
out vec3 vColor;
out float vFlag;
out float vLogZ;

vec3 qrot(vec4 q, vec3 v){
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

void main(){
  vec3 lp = aPos;
  vec3 nn = aNormal;
  float flag = mod(aFlag, 8.0);
  float emis = floor(aFlag / 8.0);

#ifdef INSTANCED
  lp = qrot(iRot, lp * iTint.a);
  nn = qrot(iRot, nn);
  vec3 p = lp + iOffset + uOffset;
  vColor = aColor * iTint.rgb;
#else
  /* flag 1 marks landing-gear vertices: they retract into the hull. */
  if (flag > 0.5 && flag < 1.5) lp.y += (1.0 - uGear) * 1.35;
  /* flag 2 is canopy glass: clipped away when viewed from inside. */
  if (uHideCanopy > 0.5 && flag > 1.5 && flag < 2.5){
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vPos = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0);
    vColor = vec3(0.0); vFlag = 0.0; vLogZ = 1.0;
    return;
  }
  vec3 p = uModelRot * lp + uOffset;
  nn = uModelRot * nn;
  vColor = aColor;
#endif

  vPos = p;
  vNormal = nn;
  vFlag = emis;

  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  cp.z = (logDepth(max(1e-6, vLogZ), uFcoefHalf) * 2.0 - 1.0) * cp.w;
  gl_Position = cp;
}
`;
}
SH.objectVS = objectVS(false);
SH.objectInstVS = objectVS(true);

SH.objectFS = SH.head + SH.common + `
in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
in float vFlag;
in float vLogZ;

uniform vec3 uSunDir, uSunColor, uAmbient;
uniform vec3 uPlanetC;
uniform float uR;
uniform float uFcoefHalf;
uniform float uTime;
uniform float uThrust;
uniform vec4 uLightPos;
uniform vec3 uLightCol;
uniform vec3 uLightDir;

out vec4 fragColor;

vec3 headlight(vec3 pos, vec3 n, vec3 albedo){
  if (uLightPos.w <= 0.0) return vec3(0.0);
  vec3 L = uLightPos.xyz - pos;
  float d = length(L);
  if (d > uLightPos.w) return vec3(0.0);
  L /= d;
  float att = 1.0 - d / uLightPos.w;
  att *= att;
  float cone = smoothstep(0.32, 0.78, dot(-L, uLightDir));
  return albedo * uLightCol * max(dot(n, L), 0.0) * att * (0.22 + 0.78 * cone);
}

void main(){
  vec3 n = normalize(vNormal);
  vec3 v = normalize(-vPos);
  vec3 up = normalize(vPos - uPlanetC);

  float ndl = max(dot(n, uSunDir), 0.0);
  float shade = smoothstep(-0.12, 0.10, dot(up, uSunDir));

  vec3 col = vColor * uSunColor * ndl * shade;
  col += vColor * uAmbient * (0.55 + 0.45 * dot(n, up));

  /* Metallic-ish highlight so the hull reads as painted panelling. */
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 48.0);
  col += uSunColor * spec * 0.55 * shade;

  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  col += uAmbient * fres * 0.6;

  col += headlight(vPos, n, vColor);

  /* Emissive parts: canopy glass, engine nozzles, running lights. */
  if (vFlag > 0.5){
    float pulse = 0.65 + 0.35 * uThrust + 0.05 * sin(uTime * 6.0);
    col += vColor * (1.35 * pulse);
  }

  fragColor = vec4(col, 1.0);
  gl_FragDepth = logDepth(vLogZ, uFcoefHalf);
}
`;

/* ============================================================================
   FULLSCREEN TRIANGLE
   ============================================================================ */
SH.fullVS = SH.head + `
out vec2 vUV;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/* ============================================================================
   SKY / ATMOSPHERE / OCEAN / CLOUDS — the main deferred pass.
   ============================================================================ */
SH.skyFS = SH.head + SH.common + `
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler3D uNoise;

uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform vec2 uTanFov;
uniform float uInvLogK;
uniform float uTime;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunAng;        // angular radius of the star, radians

/* active world ---------------------------------------------------------- */
uniform vec3  uAPC;
uniform float uAPR, uAPAtmoR, uAPSeaR;
uniform vec3  uAPBetaR;
uniform float uAPBetaM;
uniform float uAPAtmoAmt;
uniform vec4  uAPCloud;       // coverage, lowR, highR, density
uniform vec3  uAPCloudTint;
uniform vec3  uAPWaterDeep, uAPWaterShallow;
uniform float uAPFade;        // 1 = analytic sphere, 0 = streamed terrain
uniform vec4  uAPHeightA, uAPHeightB;
uniform vec3  uAPc0, uAPc1, uAPc2, uAPc3, uAPc4, uAPc5;
uniform vec3  uAPAxis;
uniform float uAPSeaH, uAPMaxE;
uniform float uAPWaterH;
uniform float uAPHasWater;

/* other worlds ---------------------------------------------------------- */
uniform int  uDPCount;
uniform vec4 uDP[8];
uniform vec4 uDPColA[8];
uniform vec4 uDPColB[8];

uniform vec4 uScan;           // xyz origin relative to camera, w radius
uniform vec3 uNebulaTint;
uniform float uStarDim;   // 1 in space / at night, ~0 in a daylit atmosphere
uniform int  uSteps;
uniform int  uCloudSteps;

/* ---------------------------------------------------------------- stars -- */
/* One star per occupied cell.  'size' is tuned so a star lands on two or three
   pixels — any smaller and the whole sky scintillates as the camera turns. */
float starLayer(vec3 rd, float scale, float thresh, float size, out float tintSeed){
  vec3 p = rd * scale;
  vec3 ip = floor(p);
  vec3 fp = p - ip;
  vec3 h = hash33(ip);
  tintSeed = h.z;
  if (h.x > thresh) return 0.0;
  vec3 c = vec3(0.2) + h.yzx * 0.6;
  float d = length(fp - c);
  float s = max(0.0, 1.0 - d * size);
  return pow(s, 8.0) * (0.30 + h.y * 1.1);
}

vec3 background(vec3 rd){
  /* Nebula, kept faint and banded.  A uniform wash reads as "the black is
     broken" rather than as a galaxy, and it lifts the whole sky off black. */
  float n1 = texture(uNoise, rd * 1.3).r;
  float n2 = texture(uNoise, rd * 3.4 + 11.3).g;
  float n3 = texture(uNoise, rd * 8.2 + 3.7).b;
  float neb = pow(clamp(n1 * 0.55 + n2 * 0.32 + n3 * 0.22, 0.0, 1.0), 4.2);

  vec3 galN = normalize(vec3(0.32, 0.88, -0.35));
  float band = pow(clamp(1.0 - abs(dot(rd, galN)), 0.0, 1.0), 11.0);

  vec3 col = uNebulaTint * neb * band * 0.34 * uStarDim;
  col += uNebulaTint.bgr * pow(neb, 1.8) * band * 0.09 * uStarDim;

  /* faint stellar haze along the galactic plane */
  col += uNebulaTint * band * 0.012 * uStarDim;

  float t0, t1, t2;
  float s = starLayer(rd, 95.0,  0.34, 7.0,  t0) * 1.00
          + starLayer(rd, 215.0, 0.26, 10.0, t1) * 0.55
          + starLayer(rd, 470.0, 0.17, 14.0, t2) * 0.28;
  vec3 tint = mix(vec3(0.70, 0.82, 1.0), vec3(1.0, 0.84, 0.64), t0);
  col += tint * s * (1.9 + band * 1.6) * uStarDim;

  /* dust lanes cutting the band */
  col *= 1.0 - band * pow(texture(uNoise, rd * 4.6 + 41.0).a, 2.0) * 0.5;
  return col;
}

vec3 starDisc(vec3 rd){
  float cosA = dot(rd, uSunDir);
  float ang = acos(clamp(cosA, -1.0, 1.0));
  float disc = smoothstep(uSunAng * 1.06, uSunAng * 0.94, ang);
  float glow = pow(max(cosA, 0.0), 2200.0) * 3.0
             + pow(max(cosA, 0.0), 160.0) * 0.35
             + pow(max(cosA, 0.0), 22.0) * 0.05;
  return uSunColor * (disc * 24.0 + glow * 3.2);
}

/* ------------------------------------------------------------ atmosphere -- */
/* Single-scattering Rayleigh + Mie.  tMax is where the ray is blocked
   (terrain, ocean, or the far side of the atmosphere). */
vec3 atmosphere(vec3 ro, vec3 rd, float tMax, out vec3 transmit){
  transmit = vec3(1.0);
  float Ra = uAPAtmoR, Rp = uAPR;
  if (uAPAtmoAmt <= 0.001) return vec3(0.0);

  vec2 hit = raySphere(ro, rd, Ra);
  if (hit.y < 0.0) return vec3(0.0);
  float t0 = max(hit.x, 0.0);
  float t1 = min(hit.y, tMax);
  if (t1 <= t0) return vec3(0.0);

  float thickness = Ra - Rp;
  float Hr = thickness * 0.22;
  float Hm = thickness * 0.075;

  int N = uSteps;
  float segLen = (t1 - t0) / float(N);
  float mu = dot(rd, uSunDir);
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = 0.76;
  float gg = g * g;
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - gg) * (1.0 + mu * mu)) /
                 ((2.0 + gg) * pow(max(1.0 + gg - 2.0 * g * mu, 1e-4), 1.5));

  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;

  vec3 betaR = uAPBetaR * uAPAtmoAmt;
  float betaM = uAPBetaM * uAPAtmoAmt;

  for (int i = 0; i < 24; i++){
    if (i >= N) break;
    float t = t0 + (float(i) + 0.5) * segLen;
    vec3 p = ro + rd * t;
    float h = length(p) - Rp;
    if (h < 0.0) h = 0.0;
    float hr = exp(-h / Hr) * segLen;
    float hm = exp(-h / Hm) * segLen;
    odR += hr; odM += hm;

    /* light ray towards the star */
    vec2 lh = raySphere(p, uSunDir, Ra);
    float lodR = 0.0, lodM = 0.0;
    bool lit = true;
    vec2 gh = raySphere(p, uSunDir, Rp * 0.999);
    if (gh.y > 0.0 && gh.x > 0.0) lit = false;      // planet blocks the sun
    if (lit && lh.y > 0.0){
      int M = max(uSteps / 3, 3);
      float ls = lh.y / float(M);
      for (int j = 0; j < 8; j++){
        if (j >= M) break;
        vec3 lp = p + uSunDir * ((float(j) + 0.5) * ls);
        float lhh = max(length(lp) - Rp, 0.0);
        lodR += exp(-lhh / Hr) * ls;
        lodM += exp(-lhh / Hm) * ls;
      }
      vec3 tau = betaR * (odR + lodR) + vec3(betaM * 1.1) * (odM + lodM);
      vec3 att = exp(-tau);
      sumR += att * hr;
      sumM += att * hm;
    }
  }

  transmit = exp(-(betaR * odR + vec3(betaM * 1.1) * odM));
  return (sumR * betaR * phaseR + sumM * betaM * phaseM) * uSunColor * 22.0;
}

/* ---------------------------------------------------------------- clouds -- */
float cloudDensity(vec3 lp, float r){
  float lowR = uAPCloud.y, highR = uAPCloud.z;
  float hn = clamp((r - lowR) / max(highR - lowR, 1.0), 0.0, 1.0);
  /* rounded vertical profile: flat base, billowing top */
  float prof = smoothstep(0.0, 0.18, hn) * (1.0 - smoothstep(0.45, 1.0, hn));

  vec3 wind = vec3(uTime * 7.0, 0.0, uTime * 4.0);
  float base = texture(uNoise, (lp + wind) * 0.00013).r;
  float det  = texture(uNoise, (lp + wind * 2.0) * 0.00075).g;
  float fine = texture(uNoise, (lp + wind * 3.0) * 0.0035).b;

  float d = base * 0.62 + det * 0.26 + fine * 0.12;
  d = smoothstep(uAPCloud.x, uAPCloud.x + 0.30, d);
  return d * prof * uAPCloud.w;
}

vec4 marchClouds(vec3 ro, vec3 rd, float tMax){
  if (uAPCloud.w <= 0.001 || uCloudSteps <= 0) return vec4(0.0);
  float lowR = uAPCloud.y, highR = uAPCloud.z;
  vec2 outer = raySphere(ro, rd, highR);
  if (outer.y < 0.0) return vec4(0.0);
  vec2 inner = raySphere(ro, rd, lowR);
  float camR = length(ro);

  float t0, t1;
  if (camR > highR){
    t0 = max(outer.x, 0.0);
    t1 = (inner.y > 0.0 && inner.x > 0.0) ? inner.x : outer.y;
  } else if (camR > lowR){
    t0 = 0.0;
    t1 = (inner.y > 0.0 && inner.x > 0.0) ? inner.x : outer.y;
  } else {
    if (inner.y <= 0.0) return vec4(0.0);
    t0 = inner.y;
    t1 = outer.y;
  }
  t1 = min(t1, tMax);
  if (t1 <= t0) return vec4(0.0);

  /* Never let a grazing ray blow the step budget. */
  float maxSpan = (highR - lowR) * 9.0;
  t1 = min(t1, t0 + maxSpan);

  int N = uCloudSteps;
  float step = (t1 - t0) / float(N);
  float jitter = hash11(gl_FragCoord.x * 3.71 + gl_FragCoord.y * 7.13 + uTime * 13.0);

  vec3 acc = vec3(0.0);
  float trans = 1.0;
  float mu = dot(rd, uSunDir);
  float hg = 0.5 * (1.0 + mu * mu) * 0.6 + pow(max(mu, 0.0), 8.0) * 0.9 + 0.35;

  for (int i = 0; i < 40; i++){
    if (i >= N || trans < 0.012) break;
    /* ro is already relative to the planet centre, so marched points are
       planet-local — the noise lookup does not swim as the camera moves. */
    float t = t0 + (float(i) + jitter) * step;
    vec3 lp = ro + rd * t;
    float r = length(lp);
    float d = cloudDensity(lp, r);
    if (d > 0.001){
      /* Two-tap shadow march towards the star.  Each tap costs three volume
         fetches, so this is the single most expensive term in the frame — a
         third tap buys almost nothing visually. */
      float ls = (highR - lowR) * 0.34;
      float sh = cloudDensity(lp + uSunDir * ls, length(lp + uSunDir * ls))
               + cloudDensity(lp + uSunDir * (ls * 2.0), length(lp + uSunDir * (ls * 2.0)));
      float light = exp(-sh * ls * 0.075);
      float powder = 1.0 - exp(-d * 4.0);
      float sunUp = smoothstep(-0.18, 0.12, dot(normalize(lp), uSunDir));

      vec3 lum = uSunColor * (light * hg * powder * 2.1 + 0.06) * sunUp;
      lum += uAPCloudTint * (0.14 + 0.3 * sunUp);

      float a = 1.0 - exp(-d * step * 0.012);
      acc += lum * a * trans;
      trans *= 1.0 - a;
    }
  }
  return vec4(acc, 1.0 - trans);
}

/* ----------------------------------------------------------------- ocean -- */
vec3 waveNormal(vec3 lp, vec3 up){
  vec3 t1 = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
  vec3 t2 = cross(up, t1);
  float s1 = 0.05, s2 = 0.011;
  vec3 w = vec3(uTime * 0.9, uTime * 0.55, uTime * 0.7);
  float e = 1.2;
  float h0 = texture(uNoise, lp*s1 + w).r * 0.6 + texture(uNoise, lp*s2 - w*0.4).g * 0.4;
  float hx = texture(uNoise, (lp+t1*e)*s1 + w).r * 0.6 + texture(uNoise, (lp+t1*e)*s2 - w*0.4).g * 0.4;
  float hy = texture(uNoise, (lp+t2*e)*s1 + w).r * 0.6 + texture(uNoise, (lp+t2*e)*s2 - w*0.4).g * 0.4;
  return normalize(up - (t1*(hx-h0) + t2*(hy-h0)) * 6.0);
}

/* ------------------------------------------------- orbital planet surface -- */
vec3 shadeWorldSphere(vec3 lp, float radius, vec3 sunDir, vec4 hA, vec4 hB,
                      vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5,
                      vec3 axis, float seaH, float waterH, float maxE, float hasWater,
                      vec3 waterCol, int oct)
{
  vec3 up = normalize(lp);
  float h = planetHeight(up, hA, hB, oct);
  float variation = 0.5 + 0.5 * snoise(up * hB.y * 0.5);
  float lat = abs(dot(up, axis));

  vec3 albedo;
  if (hasWater > 0.5 && h < waterH){
    float depth = clamp((waterH - h) / max(maxE * 0.5, 1.0), 0.0, 1.0);
    albedo = mix(waterCol * 1.5, waterCol * 0.55, depth);
    /* pack ice at the poles */
    albedo = mix(albedo, c5, smoothstep(0.80, 0.95, lat));
  } else {
    albedo = surfaceAlbedo(h, 0.12, lat, variation, seaH, maxE, c0, c1, c2, c3, c4, c5);
    albedo *= 0.92 + 0.16 * clamp(h / max(maxE,1.0), -1.0, 1.0);
  }

  float ndl = dot(up, sunDir);
  float lit = smoothstep(-0.09, 0.16, ndl);
  vec3 col = albedo * uSunColor * max(ndl, 0.0) * lit;
  col += albedo * uSunColor * 0.02;
  return col;
}

/* ============================================================================ */
void main(){
  vec2 ndc = vUV * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * (ndc.x * uTanFov.x) + uCamUp * (ndc.y * uTanFov.y));

  float rawD = texture(uDepth, vUV).r;
  bool hasScene = rawD < 0.9999999;
  float dist = 1e20;
  vec3 col;

  if (hasScene){
    float w = exp2(rawD * uInvLogK) - 1.0;
    dist = w / max(dot(rd, uCamFwd), 1e-4);
    col = texture(uScene, vUV).rgb;
  } else {
    col = background(rd) + starDisc(rd);
  }

  vec3 apRO = -uAPC;                 // camera position relative to planet centre
  float camR = length(apRO);

  /* ---- other worlds in the system ---- */
  for (int i = 0; i < 8; i++){
    if (i >= uDPCount) break;
    vec3 c = uDP[i].xyz;
    float R = uDP[i].w;
    vec2 h = raySphere(-c, rd, R);
    if (h.y > 0.0 && h.x > 0.0 && h.x < dist){
      vec3 lp = (rd * h.x) - c;
      vec3 up = normalize(lp);
      float nv = 0.5 + 0.5 * snoise(up * 2.3);
      float nv2 = 0.5 + 0.5 * snoise(up * 7.1);
      vec3 base = mix(uDPColA[i].rgb, uDPColB[i].rgb, smoothstep(0.35, 0.7, nv * 0.7 + nv2 * 0.3));
      float ndl = dot(up, uSunDir);
      vec3 pc = base * uSunColor * max(ndl, 0.0) * smoothstep(-0.07, 0.15, ndl);
      /* thin atmospheric limb */
      float rim = pow(1.0 - clamp(dot(up, -rd), 0.0, 1.0), 4.0);
      pc += uDPColB[i].a * rim * uSunColor * max(ndl + 0.25, 0.0) * 0.9 * uDPColA[i].a;
      col = pc;
      dist = h.x;
    }
  }

  /* ---- the active world, still drawn analytically while far away ---- */
  if (uAPFade > 0.002){
    vec2 h = raySphere(apRO, rd, uAPR);
    if (h.y > 0.0 && h.x > 0.0){
      vec3 lp = apRO + rd * h.x;
      vec3 sc = shadeWorldSphere(lp, uAPR, uSunDir, uAPHeightA, uAPHeightB,
                                 uAPc0, uAPc1, uAPc2, uAPc3, uAPc4, uAPc5,
                                 uAPAxis, uAPSeaH, uAPWaterH, uAPMaxE, uAPHasWater,
                                 uAPWaterDeep, 5);
      col = mix(col, sc, uAPFade);
      dist = min(dist, h.x);
    }
  }

  /* ---- ocean ---- */
  bool underwater = false;
  if (uAPHasWater > 0.5 && uAPSeaR > 0.0){
    float oceanWeight = 1.0 - uAPFade;
    if (oceanWeight > 0.002){
      vec2 h = raySphere(apRO, rd, uAPSeaR);
      underwater = camR < uAPSeaR;
      float t = -1.0;
      /* h.y > 0.0 is the hit test — checking only h.x would treat a miss as a
         hit and paint the sea across the sky. */
      if (h.y > 0.0) t = underwater ? h.y : (h.x > 0.0 ? h.x : -1.0);

      if (t > 0.0 && t < dist){
        vec3 pos = apRO + rd * t;
        vec3 up = normalize(pos);

        /* Wave normals and a tight specular lobe are correct up close and pure
           aliasing from orbit, where one pixel spans hundreds of metres of
           water.  Fade to a smooth sphere with a broad highlight instead — the
           alternative is a screenful of crawling white speckles. */
        float waveFade = exp(-t / 5000.0);
        vec3 n = up;
        if (waveFade > 0.004) n = normalize(mix(up, waveNormal(pos, up), waveFade));
        if (underwater) n = -n;
        float specPow = mix(38.0, 340.0, waveFade);
        float specAmt = mix(0.9, 5.0, waveFade);

        float waterDepth = clamp((dist - t) * 0.06, 0.0, 1.0);
        vec3 deep = mix(uAPWaterShallow, uAPWaterDeep, waterDepth);

        float ndl = max(dot(n, uSunDir), 0.0);
        float lit = smoothstep(-0.10, 0.12, dot(up, uSunDir));

        vec3 vdir = -rd;
        float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, vdir), 0.0, 1.0), 5.0);
        vec3 refl = reflect(rd, n);
        float upness = clamp(dot(refl, up), 0.0, 1.0);
        vec3 skyTint = mix(uAPCloudTint * 1.1, normalize(uAPBetaR + 0.0001) * 1.4, upness);
        vec3 hv = normalize(uSunDir + vdir);
        float spec = pow(max(dot(n, hv), 0.0), specPow) * specAmt;

        vec3 wc = deep * uSunColor * (0.10 + 0.55 * ndl) * lit;
        wc = mix(wc, skyTint * uSunColor * 0.9, fres * (underwater ? 0.25 : 0.85));
        wc += uSunColor * spec * lit;

        /* foam where the sea meets the shore */
        float shore = 1.0 - smoothstep(0.0, 1.0, (dist - t) * 0.09);
        wc += vec3(0.9, 0.95, 1.0) * shore * 0.55 * lit * (underwater ? 0.0 : 1.0);

        col = mix(col, wc, oceanWeight);
        dist = t;
      }
    }
  }

  /* underwater absorption */
  if (underwater && camR < uAPSeaR){
    float d = min(dist, 900.0);
    float f = 1.0 - exp(-d * 0.010);
    float lit = smoothstep(-0.15, 0.25, dot(normalize(apRO), uSunDir));
    col = mix(col, uAPWaterDeep * uSunColor * (0.05 + 0.45 * lit), f);
  }

  /* ---- clouds, then atmosphere over the lot ---- */
  if (!underwater){
    vec4 cl = marchClouds(apRO, rd, min(dist, 1e19));
    col = col * (1.0 - cl.a) + cl.rgb;
  }

  vec3 transmit;
  vec3 inscat = atmosphere(apRO, rd, min(dist, 1e19), transmit);
  col = col * transmit + inscat;

  /* ---- analysis-visor scan pulse ---- */
  if (uScan.w > 0.0 && dist < 1e19){
    vec3 hitP = rd * dist;
    float dd = length(hitP - uScan.xyz);
    float ring = 1.0 - smoothstep(0.0, 26.0, abs(dd - uScan.w));
    float fade = 1.0 - smoothstep(60.0, 520.0, uScan.w);
    col += vec3(0.25, 0.85, 1.0) * ring * ring * fade * 2.8;
    float wash = (1.0 - smoothstep(uScan.w - 90.0, uScan.w, dd)) * fade * 0.24;
    col = mix(col, col * vec3(0.55, 0.95, 1.25) + vec3(0.02, 0.09, 0.13), wash);
  }

  fragColor = vec4(col, 1.0);
}
`;

/* ============================================================================
   SHIP — textured glTF hull.  Its own program because the model carries UVs
   and a base-colour atlas, where props carry per-vertex colour.
   ============================================================================ */
SH.shipVS = SH.head + SH.common + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;

uniform mat4 uViewProj;
uniform mat3 uModelRot;
uniform vec3 uOffset;
uniform float uFcoefHalf;

out vec3 vPos;
out vec3 vNormal;
out vec2 vUV;
out float vLogZ;

void main(){
  vec3 p = uModelRot * aPos + uOffset;
  vPos = p;
  vNormal = uModelRot * aNormal;
  vUV = aUV;
  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  cp.z = (logDepth(max(1e-6, vLogZ), uFcoefHalf) * 2.0 - 1.0) * cp.w;
  gl_Position = cp;
}
`;

SH.shipFS = SH.head + SH.common + `
in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in float vLogZ;

uniform sampler2D uTex;
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform vec3 uPlanetC;
uniform float uFcoefHalf;
uniform vec4 uLightPos;
uniform vec3 uLightCol;
uniform vec3 uLightDir;

out vec4 fragColor;

void main(){
  vec3 n = normalize(vNormal);
  /* The hull is authored double-sided and is open at the exhausts, so from
     behind you look straight into the fuselage.  Flipping the normal towards
     the viewer lights those interior faces instead of leaving a black void in
     the middle of the ship. */
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-vPos);
  vec3 up = normalize(vPos - uPlanetC);

  vec3 albedo = texture(uTex, vUV).rgb;
  /* The atlas is authored bright white; pull it down so sunlight has somewhere
     to go before the tonemap clips. */
  albedo *= 0.72;

  float ndl = max(dot(n, uSunDir), 0.0);
  float shade = smoothstep(-0.12, 0.10, dot(up, uSunDir));
  vec3 col = albedo * uSunColor * ndl * shade;
  col += albedo * uAmbient * (0.55 + 0.45 * dot(n, up));

  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 54.0);
  col += uSunColor * spec * 0.40 * shade;

  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  col += uAmbient * fres * 0.5;

  /* landing light */
  if (uLightPos.w > 0.0){
    vec3 L = uLightPos.xyz - vPos;
    float d = length(L);
    if (d < uLightPos.w){
      L /= d;
      float att = 1.0 - d / uLightPos.w; att *= att;
      float cone = smoothstep(0.32, 0.78, dot(-L, uLightDir));
      col += albedo * uLightCol * max(dot(n, L), 0.0) * att * (0.22 + 0.78 * cone);
    }
  }

  fragColor = vec4(col, 1.0);
  gl_FragDepth = logDepth(vLogZ, uFcoefHalf);
}
`;

/* ============================================================================
   THRUSTERS — additive exhaust plumes anchored to the engine nozzles.
   Geometry is baked once with a normalised axis; length, width and colour all
   come from uniforms so the plume can stretch with the drive.
   ============================================================================ */
SH.thrusterVS = SH.head + SH.common + `
layout(location=0) in vec3 aPos;      // xy: unit radial offset, z: 0..1 along the plume
layout(location=1) in vec3 aCenter;   // nozzle position in ship space
layout(location=2) in vec3 aInfo;     // x: t along plume, y: nozzle disc, z: radius

uniform mat4 uViewProj;
uniform mat3 uModelRot;
uniform vec3 uOffset;
uniform float uFcoefHalf;
uniform float uLen;
uniform float uRad;

out float vT;
out float vDisc;
out float vR;
out float vLogZ;

void main(){
  vec3 lp = vec3(aCenter.xy + aPos.xy * uRad, aCenter.z + aPos.z * uLen);
  vec3 p = uModelRot * lp + uOffset;
  vT = aInfo.x;
  vDisc = aInfo.y;
  vR = aInfo.z;
  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  cp.z = (logDepth(max(1e-6, vLogZ), uFcoefHalf) * 2.0 - 1.0) * cp.w;
  gl_Position = cp;
}
`;

SH.thrusterFS = SH.head + SH.common + `
in float vT;
in float vDisc;
in float vR;
in float vLogZ;

uniform vec3 uCore;        // colour at the nozzle
uniform vec3 uTip;         // colour at the far end
uniform float uIntensity;
uniform float uTime;
uniform float uFcoefHalf;

out vec4 fragColor;

void main(){
  /* Flicker is what stops an exhaust plume looking like a plastic cone. */
  float flick = 0.86 + 0.14 * sin(uTime * 47.0 + vT * 12.0)
                     + 0.06 * sin(uTime * 113.0 + vT * 31.0);
  /* The cone body is deliberately dim: seen end-on from the chase camera its
     open throat is a hard-edged polygon, and at full brightness it clips to a
     white rectangle.  The soft disc below carries the glow instead; the cone
     is there to give the plume a shape from the side. */
  float falloff = pow(max(1.0 - vT, 0.0), 1.7);
  vec3 col = mix(uCore, uTip, vT) * falloff * flick * 0.42;
  if (vDisc > 0.5){
    /* Soft round glow at the throat — this is the face you see from the chase
       camera, and a flat polygon there reads as a sticker. */
    float soft = pow(max(1.0 - vR, 0.0), 2.2);
    col = mix(uCore, vec3(1.0), 0.25) * (3.1 * soft) * flick;
  }
  fragColor = vec4(col * uIntensity, 1.0);
  gl_FragDepth = logDepth(vLogZ, uFcoefHalf);
}
`;

/* ============================================================================
   POST — bright pass, blur, composite
   ============================================================================ */
SH.brightFS = SH.head + `
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uThreshold;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  fragColor = vec4(c * k, 1.0);
}
`;

SH.blurFS = SH.head + `
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDir;        // texel-sized step along one axis
void main(){
  vec3 c = texture(uTex, vUV).rgb * 0.2270270270;
  c += texture(uTex, vUV + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUV - uDir * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(c, 1.0);
}
`;

SH.compositeFS = SH.head + SH.common + `
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmount;
uniform float uExposure;
uniform float uTime;
uniform float uPulse;       // pulse / ultra warp streaks
uniform float uVignette;
uniform float uFlash;       // white flash on impact / boost
uniform vec2  uRes;

/* ACES filmic tonemap (Narkowicz fit) */
vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

void main(){
  vec2 uv = vUV;
  vec2 cen = uv - 0.5;
  float r2 = dot(cen, cen);

  /* Lens distortion + chromatic aberration, dialled up during pulse flight. */
  float ca = (0.0012 + uPulse * 0.010) * (0.35 + r2);
  vec3 col;
  col.r = texture(uScene, uv + cen * ca).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - cen * ca).b;

  /* Radial streaking while the pulse drive is engaged. */
  if (uPulse > 0.001){
    vec3 s = vec3(0.0);
    float w = 0.0;
    for (int i = 1; i <= 8; i++){
      float f = float(i) / 8.0;
      float scale = 1.0 - f * 0.16 * uPulse;
      vec2 suv = cen * scale + 0.5;
      float wt = 1.0 - f;
      s += texture(uScene, suv).rgb * wt;
      w += wt;
    }
    col = mix(col, max(col, s / w * 1.05), uPulse * 0.75);
  }

  col += texture(uBloom, uv).rgb * uBloomAmount;

  col += vec3(1.0) * uFlash;

  col *= uExposure;
  col = aces(col);

  /* subtle filmic finish */
  float vig = 1.0 - uVignette * smoothstep(0.15, 0.85, r2);
  col *= vig;

  float grain = hash11(uv.x * 3711.0 + uv.y * 1279.0 + uTime * 91.0) - 0.5;
  col += grain * 0.016;

  /* mild filmic contrast + gentle desaturation of the very darkest values */
  col = pow(max(col, 0.0), vec3(0.9545));
  fragColor = vec4(col, 1.0);
}
`;
