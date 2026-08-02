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

/* ---- logarithmic depth ----
   Every scene shader writes gl_FragDepth = logDepth(1 + w), which is what makes
   a metre-scale ship and a sixty-kilometre world share one depth buffer.

   What no scene shader does is push that value back into gl_Position.z.  It is
   tempting — it is what most log-depth write-ups tell you to do — and it is
   wrong for any triangle with one vertex behind the camera.  Clipping happens
   before the fragment stage, in homogeneous space, and it finds where the edge
   crosses the near plane by interpolating z and w *linearly*.  Substitute a
   logarithm for z and that intersection lands somewhere else entirely, so the
   clipper cuts the triangle in the wrong place and the near half of it simply
   is not drawn.  A hangar floor is exactly that triangle — it passes under you
   and out behind you — and the symptom was a deck that stopped in a straight
   line a hundred metres in front of the camera with the hull visible through
   the gap.  Leaving gl_Position.z as the projection produced it costs nothing:
   it is only ever used for clipping, because gl_FragDepth replaces it. */
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
  /* gl_Position.z is left alone on purpose — see logDepth in SH.common. */
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
uniform float uMinAngular;            // smallest apparent radius, in radians

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
  /* uModelRot carries the belt's rotation, so the whole field turns without
     touching the instance buffer. */
  vec3 centre = uModelRot * iOffset + uOffset;
  float dist = length(centre);
  /* Floor the apparent size: without it a belt dissolves into sub-pixel
     flicker from orbit instead of reading as a band. */
  float grow = max(1.0, dist * uMinAngular / max(iTint.a, 1e-4));
  lp = uModelRot * qrot(iRot, lp * (iTint.a * grow));
  nn = uModelRot * qrot(iRot, nn);
  vec3 p = lp + centre;
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
  /* gl_Position.z is left alone on purpose — see logDepth in SH.common. */
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
   STATION — the same vertex format as the objects, textured triplanar.

   A three-kilometre hull has no UVs and could not usefully be given any: it is
   generated, not modelled.  So the surface is projected on from three axes in
   the station's own frame, and the low seven bits of the vertex flag — which
   the object shader spends on part indices the station does not have — choose
   which of four hull sets to project and at what size.  That turns the whole
   station, inside and out, into textured surface without a single UV.

   The tiles are folded rather than repeated (ping-pong, see fold below), so no
   source tile has to be seamless; the price is a mirror symmetry every other
   tile, which on hull plating reads as panelling.
   ============================================================================ */
SH.stationVS = SH.head + SH.common + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aFlag;

uniform mat4 uViewProj;
uniform mat3 uModelRot;
uniform vec3 uOffset;
uniform float uFcoefHalf;

out vec3 vPos;
out vec3 vNormal;
out vec3 vColor;
out vec3 vLocal;
out vec3 vLocalN;
/* flat, not smooth: these are material *indices*, and an index interpolated to
   1.9999 truncates to the wrong material — which showed up as interior walls
   picking up the exterior's window lights. */
flat out float vMat;
flat out float vEmis;
out float vLogZ;

void main(){
  vec3 p = uModelRot * aPos + uOffset;
  vPos = p;
  vNormal = uModelRot * aNormal;
  vColor = aColor;
  vLocal = aPos;
  vLocalN = aNormal;
  vMat = mod(aFlag, 8.0);
  vEmis = floor(aFlag / 8.0);

  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  /* gl_Position.z is left alone on purpose — see logDepth in SH.common. */
  gl_Position = cp;
}
`;

SH.stationFS = SH.head + SH.common + `
in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
in vec3 vLocal;
in vec3 vLocalN;
flat in float vMat;
flat in float vEmis;
in float vLogZ;

uniform vec3 uSunDir, uSunColor, uAmbient;
uniform vec3 uPlanetC;
uniform float uFcoefHalf;
uniform float uTime;
uniform vec4 uLightPos;
uniform vec3 uLightCol;
uniform vec3 uLightDir;
uniform sampler2D uBase;
uniform sampler2D uEmissive;
uniform float uSunMask;   // 0 once the camera is inside, where sun cannot reach

out vec4 fragColor;

/* tile index, metres per tile, emissive gain — indexed by the vertex flag.

   The emissive gains are what separate outside from inside.  The window-light
   pass belongs on the shell, where it is the only thing giving a three
   kilometre ball a sense of being inhabited; the same pass on an interior wall
   turns a hangar into a disco.  Same texture, two orders of magnitude apart. */
const vec3 MAT[8] = vec3[8](
  vec3(0.0, 34.0, 1.30),   // 0 hull plating       — shell, ring, throat
  vec3(2.0, 150.0, 1.60),  // 1 tech panel, huge   — the lit belt, the port face
  vec3(1.0, 26.0, 0.10),   // 2 dark plating       — walls and ceilings
  vec3(3.0,  7.0, 0.25),   // 3 hex deck           — floors
  vec3(2.0,  3.4, 0.55),   // 4 tech panel, fine   — consoles, pads, stairs
  vec3(1.0,  9.0, 0.12),   // 5 dark plating, mid  — ribs, trusses, columns
  vec3(1.0,  3.0, 0.08),   // 6 dark plating, fine — crates, cover
  vec3(3.0, 26.0, 1.00)    // 7 hex, large         — solar wings
);

/* Ping-pong into [0,1]: mirrors instead of wrapping, so tile edges always
   meet themselves. */
vec2 fold(vec2 p){
  vec2 f = fract(p * 0.5) * 2.0;
  return min(f, 2.0 - f);
}

vec2 cell(vec2 f, float tile){
  /* The atlas is written with tile 0 top-left and uploaded flipped, so tile 0
     occupies the TOP half in GL's v. */
  vec2 off = vec2(mod(tile, 2.0) * 0.5, (1.0 - floor(tile * 0.5)) * 0.5);
  return off + clamp(f, 0.004, 0.996) * 0.5;
}

vec3 tap(sampler2D s, vec2 p, float tile, float blur){
  /* Clamped so that at three kilometres the sampler does not walk off the end
     of the mip chain and start averaging one tile into the next. */
  vec2 dx = clamp(dFdx(p) * 0.5 * blur, -0.05, 0.05);
  vec2 dy = clamp(dFdy(p) * 0.5 * blur, -0.05, 0.05);
  return textureGrad(s, cell(fold(p), tile), dx, dy).rgb;
}

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
  float dist = length(vPos);

  vec3 albedo = vColor;
  vec3 glow = vec3(0.0);

  if (vEmis < 0.5){
    vec3 M = MAT[int(vMat + 0.5)];
    float inv = 1.0 / M.y;
    vec3 nl = normalize(vLocalN);
    vec3 w = pow(abs(nl), vec3(6.0));
    w /= (w.x + w.y + w.z);

    vec2 px = vLocal.zy * inv, py = vLocal.xz * inv, pz = vLocal.xy * inv;
    vec3 t = tap(uBase, px, M.x, 1.0) * w.x
           + tap(uBase, py, M.x, 1.0) * w.y
           + tap(uBase, pz, M.x, 1.0) * w.z;

    /* Detail is only worth carrying so far; past a couple of kilometres it is
       sub-pixel and all it can do is shimmer. */
    float fade = 1.0 - smoothstep(2600.0, 9000.0, dist);
    albedo *= mix(1.0, t.r * 2.0, fade);

    /* One emissive tap on the dominant axis, blurred with distance so the
       window lights gather into a glow instead of aliasing. */
    vec2 pe = (w.x > w.y && w.x > w.z) ? px : (w.y > w.z ? py : pz);
    float blur = 1.0 + dist * 0.006;
    glow = tap(uEmissive, pe, M.x, blur) * M.z;
    glow *= glow;
    glow *= 2.6;
  }

  /* A station in orbit is in sunlight whether or not the world below it is, so
     unlike a ship on a surface there is no terminator term here.  What there is
     instead is a mask: the rooms are closed boxes with no shadowing, so once
     the camera is inside one the sun has to be switched off by hand or it
     lights the far wall straight through the hull. */
  float ndl = max(dot(n, uSunDir), 0.0) * uSunMask;

  vec3 col = albedo * uSunColor * ndl;
  col += albedo * uAmbient * (0.55 + 0.45 * dot(n, up));

  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 48.0) * uSunMask;
  col += uSunColor * spec * 0.35;

  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  col += uAmbient * fres * 0.6;

  col += headlight(vPos, n, albedo);
  col += glow;

  /* Flagged-emissive geometry — strobes, rim lights, the shield — is its own
     colour outright, with a slow beat so the hull never reads as static. */
  if (vEmis > 0.5){
    col += vColor * (0.80 + 0.16 * sin(uTime * 2.4 + vLocal.z * 0.02));
  }

  fragColor = vec4(col, 1.0);
  gl_FragDepth = logDepth(vLogZ, uFcoefHalf);
}
`;

/* ============================================================================
   SPRAY — the water a ship lifts off an ocean.

   Camera-facing discs, not spheres.  A lit sphere reads as a marble at any
   size, because what tells you something is water is the soft edge and the
   light coming through it, and a triangle mesh has neither.  Each disc is
   shaded as if it were a sphere — the quad offset is the normal's screen-space
   xy, the third component follows — so it still turns with the sun, but its
   outline dissolves and its rim glows where the light scatters through.

   They write depth, which is not optional here: the ocean is drawn
   analytically in the sky pass and paints over anything in front of it that
   the depth buffer does not know about.  Writing depth means no sorting and no
   double-blending either — the nearest disc wins the pixel and blends once
   over whatever is behind it.
   ============================================================================ */
SH.sprayVS = SH.head + SH.common + `
layout(location=0) in vec2 aCorner;    // unit quad, -1..1
layout(location=1) in vec4 iPos;       // xyz camera-relative, w radius
layout(location=2) in vec4 iParam;     // x opacity, y seed, z foam, w unused

uniform mat4 uViewProj;
uniform vec3 uCamRight, uCamUp;
uniform float uFcoefHalf;
uniform float uMinAngular;             // smallest apparent radius, in radians

out vec2 vQuad;
out float vAlpha;
out float vSeed;
out float vFoam;
out vec3 vPos;
out float vLogZ;

void main(){
  float d = length(iPos.xyz);
  float r = max(iPos.w, d * uMinAngular);
  vec3 p = iPos.xyz + (uCamRight * aCorner.x + uCamUp * aCorner.y) * r;
  vQuad = aCorner;
  /* Fade out anything close enough to fill the frame.  These discs write
     depth, so a near one hides every parcel behind it, and a two-metre puff
     three metres from the eye becomes a white sheet with the rest of the plume
     cut out around it.  Fading it instead costs nothing and is what a
     depth-of-field would have done anyway. */
  vAlpha = iParam.x * smoothstep(0.7, 5.0, d);
  vSeed = iParam.y;
  vFoam = iParam.z;
  vPos = p;

  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  gl_Position = cp;
}
`;

SH.sprayFS = SH.head + SH.common + `
in vec2 vQuad;
in float vAlpha;
in float vSeed;
in float vFoam;
in vec3 vPos;
in float vLogZ;

uniform vec3 uSunDir, uSunColor, uAmbient;
uniform vec3 uCamRight, uCamUp;
uniform float uFcoefHalf;

out vec4 fragColor;

void main(){
  float d = length(vQuad);
  if (d > 1.0) discard;

  /* A droplet is not a disc.  Wobbling the outline by a couple of harmonics of
     the angle, seeded per particle, is the difference between spray and a bag
     of marbles — at three pixels across it is the only shape cue there is. */
  float ang = atan(vQuad.y, vQuad.x);
  float wob = 0.93 + 0.07 * sin(ang * 3.0 + vSeed * 6.2831) * sin(ang * 5.0 - vSeed * 3.1);
  /* Quadratic falloff to nothing at the rim.  A parcel has no hard edge
     anywhere, which is the single most important thing about drawing water at
     this size — an outline is what makes a puff read as an object. */
  float k = clamp(1.0 - d / wob, 0.0, 1.0);
  float a = vAlpha * k * k;
  if (a < 0.003) discard;

  /* Shade it as the sphere it is standing in for: the quad offset is the
     normal's screen-space xy, and the rest follows from the unit length. */
  vec3 view = normalize(-vPos);
  vec3 n = normalize(uCamRight * vQuad.x + uCamUp * vQuad.y +
                     view * sqrt(max(0.0, 1.0 - d * d)));
  float ndl = max(dot(n, uSunDir), 0.0);

  /* Water is mostly forward-scattering: a droplet with the sun behind it is
     brighter than one with the sun on it, which is why sea spray blows out
     against a low sun and reads grey against a high one. */
  float through = pow(max(dot(-uSunDir, view), 0.0), 3.0);

  /* Bright, and deliberately so.  Sunlit spray is several times the luminance
     of the sea it came out of — that is the whole reason it reads as white
     against blue — and this pass composites over the finished water rather
     than over the black scene buffer, so anything near the water's own
     brightness simply disappears into it. */
  vec3 col = uAmbient * 4.0 + uSunColor * (1.05 + 1.25 * ndl + 0.85 * through);
  col *= mix(vec3(0.74, 0.84, 0.97), vec3(1.0), vFoam);
  /* the lit rim, where the light comes through the edge of the drop */
  col += uSunColor * pow(d, 5.0) * (0.35 + 0.7 * through);

  /* Premultiplied: the scene buffer is cleared to black, so where there is no
     geometry behind, what lands in it is exactly what the sky pass should add
     back over the water. */
  fragColor = vec4(col * a, a);
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

  /* Additive, depth-less things — the engine plumes — are blended into the
     scene buffer against a black clear, and would otherwise be thrown away
     here: with no depth written, their pixels read as empty sky.  Keep what is
     already in the buffer and add it back over the finished sky at the end, so
     a drive trail against starfield survives and still reads as emissive. */
  vec3 emissive = vec3(0.0);

  if (hasScene){
    float w = exp2(rawD * uInvLogK) - 1.0;
    dist = w / max(dot(rd, uCamFwd), 1e-4);
    col = texture(uScene, vUV).rgb;
  } else {
    emissive = texture(uScene, vUV).rgb;
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
    /* The h.x < dist test matters more than it looks: without it the analytic world
       paints straight over anything the scene pass drew in front of it, and
       from inside a station in orbit that is the entire room you are standing
       in — the planet appears as a dark arc across the deck. */
    if (h.y > 0.0 && h.x > 0.0 && h.x < dist){
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

  fragColor = vec4(col + emissive, 1.0);
}
`;

/* ============================================================================
   TREES — instanced, alpha-masked foliage with procedural wind.

   The source model shipped a morph-target wind bake; it is replaced here by a
   sway computed from world position and height up the trunk.  That costs no
   extra vertex data and, more importantly, gives every instance its own phase
   — a forest where every tree leans in lockstep looks worse than one that does
   not move at all.
   ============================================================================ */
SH.treeVS = SH.head + SH.common + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in vec3 iOffset;   // relative to the chunk centre
layout(location=4) in vec4 iRot;      // orientation on the surface
layout(location=5) in vec4 iTint;     // rgb tint, a = scale

uniform mat4 uViewProj;
uniform vec3 uOffset;
uniform float uFcoefHalf;
uniform float uTime;
uniform float uWind;
uniform float uTreeH;

out vec3 vPos;
out vec3 vNormal;
out vec2 vUV;
out vec3 vTint;
out float vLogZ;

vec3 qrot(vec4 q, vec3 v){ return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }

void main(){
  vec3 lp = aPos;

  /* Sway grows with height up the trunk and is phased by instance position. */
  float h = clamp(aPos.y / uTreeH, 0.0, 1.0);
  float sway = h * h;
  float ph = dot(iOffset, vec3(0.13, 0.09, 0.17));
  lp.x += (sin(uTime * 1.25 + ph) * 0.55 + sin(uTime * 3.1 + ph * 2.3) * 0.20) * sway * uWind;
  lp.z += (cos(uTime * 1.05 + ph * 1.4) * 0.45 + sin(uTime * 2.6 + ph) * 0.18) * sway * uWind;

  lp = qrot(iRot, lp * iTint.a);
  vec3 p = lp + iOffset + uOffset;

  vPos = p;
  vNormal = qrot(iRot, aNormal);
  vUV = aUV;
  vTint = iTint.rgb;

  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  /* gl_Position.z is left alone on purpose — see logDepth in SH.common. */
  gl_Position = cp;
}
`;

SH.treeFS = SH.head + SH.common + `
in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in vec3 vTint;
in float vLogZ;

uniform sampler2D uTex;
uniform vec2 uTexSize;
uniform float uAlphaCutoff;
uniform float uTintMix;
uniform float uTranslucency;
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform vec3 uPlanetC;
uniform float uFcoefHalf;
uniform vec4 uLightPos;
uniform vec3 uLightCol;
uniform vec3 uLightDir;

out vec4 fragColor;

void main(){
  vec4 t = texture(uTex, vUV);
  if (uAlphaCutoff > 0.0){
    /* Every mip level averages more empty space into the mask, so a fixed
       cutoff strips the canopy bare as it recedes — a stand of trees turns
       into a stand of sticks.  Estimate the mip from the UV derivatives and
       relax the test to match. */
    vec2 dx = dFdx(vUV * uTexSize), dy = dFdy(vUV * uTexSize);
    float lod = 0.5 * log2(max(dot(dx, dx), dot(dy, dy)) + 1e-8);
    if (t.a < uAlphaCutoff * clamp(1.0 - lod * 0.22, 0.30, 1.0)) discard;
  }

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;          // foliage cards are two-sided
  vec3 up = normalize(vPos - uPlanetC);
  /* The biome tint is a hue shift with unit average, so it recolours foliage
     without darkening it; bark only takes a little of it and stays bark. */
  vec3 albedo = t.rgb * mix(vec3(1.0), vTint, uTintMix);

  float ndl = max(dot(n, uSunDir), 0.0);
  float shade = smoothstep(-0.12, 0.10, dot(up, uSunDir));
  vec3 col = albedo * uSunColor * ndl * shade;
  col += albedo * uAmbient * (0.55 + 0.45 * dot(n, up));

  /* Leaves lit from behind glow — without it a canopy reads as cardboard. */
  if (uTranslucency > 0.0){
    float back = pow(max(dot(-n, uSunDir), 0.0), 1.7);
    col += albedo * uSunColor * back * uTranslucency * shade;
  }

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
  /* gl_Position.z is left alone on purpose — see logDepth in SH.common. */
  gl_Position = cp;
}
`;

/* ============================================================================
   SKIN — the astronaut and anything else deformed by a skeleton.

   The palette rides in a plain uniform array rather than a bone texture: the
   bake prunes the rig to 25 joints, and 25 affine transforms is 75 vec4s, which
   fits inside the smallest vertex-uniform budget WebGL 2 guarantees with room
   to spare.  Each joint is three rows of a 3x4 — the bottom row of a skinning
   matrix is always (0,0,0,1), so storing it would waste a quarter of the
   budget.
   ============================================================================ */
const SKIN_MAX_JOINTS = 32;      // the bake asserts against this

SH.skinVS = SH.head + SH.common + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in vec4 aJoint;    // four joint indices, as floats
layout(location=4) in vec4 aWeight;

uniform mat4 uViewProj;
uniform mat3 uModelRot;
uniform vec3 uOffset;
uniform float uFcoefHalf;
uniform vec4 uBones[` + (SKIN_MAX_JOINTS * 3) + `];

out vec3 vPos;
out vec3 vNormal;
out vec2 vUV;
out float vLogZ;

void skinOne(int j, float w, vec4 p4, vec3 n, inout vec3 sp, inout vec3 sn){
  vec4 r0 = uBones[j * 3];
  vec4 r1 = uBones[j * 3 + 1];
  vec4 r2 = uBones[j * 3 + 2];
  sp += w * vec3(dot(r0, p4), dot(r1, p4), dot(r2, p4));
  sn += w * vec3(dot(r0.xyz, n), dot(r1.xyz, n), dot(r2.xyz, n));
}

void main(){
  vec4 p4 = vec4(aPos, 1.0);
  vec3 sp = vec3(0.0), sn = vec3(0.0);
  skinOne(int(aJoint.x), aWeight.x, p4, aNormal, sp, sn);
  skinOne(int(aJoint.y), aWeight.y, p4, aNormal, sp, sn);
  skinOne(int(aJoint.z), aWeight.z, p4, aNormal, sp, sn);
  skinOne(int(aJoint.w), aWeight.w, p4, aNormal, sp, sn);

  vec3 p = uModelRot * sp + uOffset;
  vPos = p;
  vNormal = uModelRot * sn;
  vUV = aUV;
  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  /* gl_Position.z is left alone on purpose — see logDepth in SH.common. */
  gl_Position = cp;
}
`;

SH.skinFS = SH.head + SH.common + `
in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in float vLogZ;

uniform sampler2D uTex;
uniform vec3 uTint;
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform vec3 uPlanetC;
uniform float uFcoefHalf;
uniform vec4 uLightPos;
uniform vec3 uLightCol;
uniform vec3 uLightDir;

out vec4 fragColor;

void main(){
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-vPos);
  vec3 up = normalize(vPos - uPlanetC);

  vec3 albedo = texture(uTex, vUV).rgb * uTint;

  float ndl = max(dot(n, uSunDir), 0.0);
  float shade = smoothstep(-0.12, 0.10, dot(up, uSunDir));
  vec3 col = albedo * uSunColor * ndl * shade;
  col += albedo * uAmbient * (0.55 + 0.45 * dot(n, up));

  vec3 h = normalize(uSunDir + v);
  col += uSunColor * pow(max(dot(n, h), 0.0), 38.0) * 0.22 * shade;
  col += uAmbient * pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.45;

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

SH.shipFS = SH.head + SH.common + `
in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in float vLogZ;

uniform sampler2D uTex;
uniform sampler2D uEmissive;
uniform float uEmissiveAmt;
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

  vec3 albedo = texture(uTex, vUV).rgb * 0.95;

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

  /* Emissive map: engine cores and running lights.  Driven by the drive state
     so the ship visibly spools up rather than glowing at a constant level. */
  col += texture(uEmissive, vUV).rgb * uEmissiveAmt;

  fragColor = vec4(col, 1.0);
  gl_FragDepth = logDepth(vLogZ, uFcoefHalf);
}
`;

/* ============================================================================
   THRUSTERS — a camera-facing exhaust beam rather than a cone.

   A cone is wrong for a plume in two ways: its silhouette is a hard polygon
   from every angle, and it collapses to a flat disc exactly when you are
   behind the ship, which is where the chase camera lives.  This builds the
   plume as a beam whose width always faces the viewer, cross-fading into a
   camera-facing disc as the view lines up with the exhaust axis.  Density,
   shock diamonds and turbulence are all evaluated per fragment.
   ============================================================================ */
SH.thrusterVS = SH.head + SH.common + `
layout(location=0) in vec4 aData;     // beam: (side, t, 0, -); disc: (cx, cy, 1, -)
layout(location=1) in vec3 aCenter;   // nozzle position in ship space
layout(location=2) in vec2 aInfo;     // x: radius profile at t

uniform mat4 uViewProj;
uniform mat3 uModelRot;
uniform vec3 uOffset;
uniform vec3 uCamRight, uCamUp;
uniform float uFcoefHalf;
uniform float uLen;
uniform float uRad;
uniform float uMinWidth;   // smallest half-width in radians, so the trail
                           // never falls below a couple of pixels
uniform float uFlameLen;   // how far the fire reaches aft
uniform float uFlameRad;

out float vT;
out vec2 vQuad;     // beam: (side, 0); disc/flame: the 2D corner offset
out float vKind;
out float vAlign;
out float vSeed;
out vec3 vLocal;
out float vLogZ;

void main(){
  vec3 nozzle = uModelRot * aCenter + uOffset;
  vec3 axis = normalize(uModelRot * vec3(0.0, 0.0, 1.0));   // +Z is aft
  float kind = aData.z;

  vec3 p;
  if (kind < 0.5){
    vec3 spine = nozzle + axis * (aData.y * uLen);
    vec3 view = normalize(spine);
    vec3 right = cross(axis, view);
    float rl = length(right);
    /* Looking straight down the exhaust the cross product degenerates; the
       disc takes over there, so any stable fallback will do. */
    right = rl > 1e-4 ? right / rl : normalize(cross(axis, vec3(0.0, 1.0, 0.0)) + vec3(1e-3));
    /* A trail this thin is often under a pixel wide, and a sub-pixel triangle
       strip misses pixel centres and flickers out entirely.  Hold it to a
       minimum angular width instead. */
    float w = max(aInfo.x * uRad, length(spine) * uMinWidth);
    p = spine + right * (aData.x * w);
    vAlign = abs(dot(axis, view));
    vT = aData.y;
    vQuad = vec2(aData.x, 0.0);
    vLocal = spine;
  } else if (kind > 1.5){
    /* One card of the flame stack.  It grows away from the throat and then
       tapers, which is the silhouette of a plume expanding into vacuum, and it
       always faces the camera so the stack never shows an edge. */
    float t = aInfo.x;
    float w = uFlameRad * (0.55 + 1.35 * t) * pow(1.0 - t * 0.92, 0.55);
    vec3 c = nozzle + axis * (t * uFlameLen);
    p = c + (uCamRight * aData.x + uCamUp * aData.y) * w;
    vAlign = abs(dot(axis, normalize(c)));
    vT = t;
    vQuad = aData.xy;
    vSeed = aInfo.y;
    vLocal = c;
  } else {
    p = nozzle + (uCamRight * aData.x + uCamUp * aData.y) * uRad * 3.2;
    vAlign = abs(dot(axis, normalize(nozzle)));
    vT = 0.0;
    /* The 2D offset has to be interpolated and the radius taken per fragment;
       passing its length from the vertex shader gives a constant across the
       quad (every corner is the same distance out) and the glow vanishes. */
    vQuad = aData.xy;
    vLocal = nozzle;
  }
  vKind = kind;

  vec4 cp = uViewProj * vec4(p, 1.0);
  vLogZ = 1.0 + cp.w;
  /* gl_Position.z is left alone on purpose — see logDepth in SH.common. */
  gl_Position = cp;
}
`;

SH.thrusterFS = SH.head + SH.common + `
in float vT;
in vec2 vQuad;
in float vKind;
in float vAlign;
in float vSeed;
in vec3 vLocal;
in float vLogZ;

uniform sampler3D uNoise;
uniform vec3 uCore;        // colour at the throat
uniform vec3 uTip;         // colour at the far end
uniform float uIntensity;
uniform float uTrail;      // beam visibility — boost and ultra only
uniform float uFlame;      // flame strength, 0 with the engine cold
uniform float uPlasma;     // how far the fire is displaced by the drive colour
uniform float uShock;      // shock-diamond strength, 0 in vacuum idle
uniform float uTime;
uniform float uFcoefHalf;

out vec4 fragColor;

/* Blackbody-ish fire ramp: dull red at the edges through orange and yellow to
   white at the hottest.  Written as a ramp rather than sampled from a gradient
   texture so the drive colour can be mixed into the hot end per fragment. */
vec3 fireRamp(float h){
  vec3 c = mix(vec3(0.30, 0.020, 0.002), vec3(1.00, 0.230, 0.020), smoothstep(0.00, 0.34, h));
  c = mix(c, vec3(1.00, 0.640, 0.130), smoothstep(0.30, 0.62, h));
  c = mix(c, vec3(1.00, 0.930, 0.640), smoothstep(0.58, 0.86, h));
  return mix(c, vec3(1.00, 0.985, 0.960), smoothstep(0.84, 1.00, h));
}

void main(){
  float a;
  vec3 col;

  if (vKind > 1.5){
    /* ---- flame card ---- */
    float r = length(vQuad);
    float t = vT;

    /* Two octaves of the shared volume, scrolling aft at different rates, is
       enough to break the disc into licks of flame.  The slower one gives the
       plume its large-scale billowing, the faster one the flicker. */
    vec3 np = vec3(vQuad * 0.85, t * 1.6 - uTime * 2.4 + vSeed);
    float n1 = texture(uNoise, np * 0.55).r;
    float n2 = texture(uNoise, np * 1.9 + vec3(3.1, 1.7, -uTime * 1.7)).g;
    float turb = n1 * 0.65 + n2 * 0.35;

    /* Push the circular edge around with the noise so the outline is ragged
       rather than a stack of visible discs, and let it fray more downstream
       where a real plume is coming apart. */
    float fray = 0.20 + 0.75 * t;
    float edge = 1.0 - r - (turb - 0.45) * fray;
    /* A card with a flat top sums with its neighbours into scallops.  Peaking
       it towards the middle, and adding a wide soft envelope underneath, is
       what turns the stack into one continuous volume. */
    float body = smoothstep(0.0, 0.50, edge) * pow(max(1.0 - r, 0.0), 0.9);
    float soft = pow(max(1.0 - r, 0.0), 2.6);
    if (body + soft <= 0.002){ discard; }

    /* Heat: hottest in the throat and on the axis, cooling downstream and
       outward, with the turbulence carving cooler channels through it. */
    float heat = pow(1.0 - t, 1.35) * (1.0 - r * 0.62) * (0.62 + 0.55 * turb);
    heat = clamp(heat * 1.35, 0.0, 1.0);

    col = fireRamp(heat);
    /* A chemical rocket burns orange; a fusion drive does not.  The hot core
       takes the drive's own colour, and the fire survives around its edges,
       which is what keeps a violet ultra plume from looking like a neon tube. */
    col = mix(col, uCore * 1.25, uPlasma * smoothstep(0.40, 0.95, heat));

    /* Normalised for the number of cards: they blend additively, so the count
       and the per-card strength trade off against each other. */
    a = (body * 0.72 + soft * 0.30) * (0.10 + 0.90 * heat) * uFlame * 0.42;
    a *= smoothstep(1.0, 0.72, t);
    fragColor = vec4(col * a * uIntensity, 1.0);
    gl_FragDepth = logDepth(vLogZ, uFcoefHalf);
    return;
  }

  if (vKind < 0.5){
    float r = abs(vQuad.x);
    float t = vT;

    /* A tight bright filament with a soft halo around it — the shape that
       reads as a neon drive trail rather than a puff of flame. */
    float core = pow(max(1.0 - r, 0.0), 6.0);
    float halo = pow(max(1.0 - r * r, 0.0), 2.2);
    float radial = core * 1.9 + halo * 0.42;

    /* Turbulence, scrolling aft.  Sampling the shared volume is far cheaper
       than evaluating noise, and the plume only needs to shimmer. */
    vec3 np = vec3(t * 2.4 - uTime * 1.9, vQuad.x * 0.7, vLocal.z * 0.03);
    float turb = texture(uNoise, np).g * 0.6 + texture(uNoise, np * 2.7 + 5.0).b * 0.4;

    /* Shock diamonds: standing waves in an over-expanded exhaust.  They only
       appear once the drive is actually working, and they fade downstream. */
    float dia = 0.5 + 0.5 * sin(t * 34.0 - uTime * 6.0);
    dia = pow(dia, 7.0) * uShock * exp(-t * 2.6);

    /* White-hot at the throat, drive colour along the body, dark at the tip. */
    float hot = exp(-t * 5.5);
    col = mix(uCore, uTip, smoothstep(0.02, 0.80, t));
    /* White only in the filament itself; the halo keeps the drive colour, so
       the trail stays saturated instead of washing out to grey. */
    col = mix(col, vec3(1.0, 0.98, 0.95), min(hot * 0.6 + core * 0.55, 0.9));
    col += uCore * dia * 1.6;

    /* Barely tapers along its length: the trail should stay bright most of
       the way and then fall off hard at the very end. */
    a = radial * pow(max(1.0 - t, 0.0), 0.45) * (0.80 + 0.35 * turb);
    a *= 0.82 + 0.18 * hot + dia;
    a *= smoothstep(1.0, 0.86, t);
    /* Fade the beam out as it turns edge-on to the viewer — the disc below
       carries the look from directly behind. */
    a *= 1.0 - pow(vAlign, 3.0);
    a *= uTrail;
  } else {
    /* ---- throat ----
       A tight white core inside a wide coloured halo, with a thin bright ring
       at the nozzle lip.  Looking straight up the exhaust this is most of what
       you see, so it carries the drive's colour rather than the flame's. */
    float r = clamp(length(vQuad), 0.0, 1.0);
    float core = pow(max(1.0 - r, 0.0), 9.0);
    float halo = pow(max(1.0 - r, 0.0), 2.2);
    float ring = exp(-pow((r - 0.34) * 6.5, 2.0)) * 0.55;
    float flick = 0.90 + 0.10 * sin(uTime * 41.0) * sin(uTime * 17.0 + 1.3);
    col = uCore * (halo * 0.85 + ring);
    col = mix(col, vec3(1.0, 0.97, 0.92), min(core * 1.1, 0.92));
    a = (halo * 0.55 + core * 1.5 + ring * 0.9) * flick * (0.35 + 0.65 * pow(vAlign, 2.0));
  }

  fragColor = vec4(col * a * uIntensity, 1.0);
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
