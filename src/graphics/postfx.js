/* ============================================================
   PostFX — hand-rolled HDR pipeline.
   scene(HDR) -> bright pass -> 3-level gaussian bloom
               -> composite (radial speed-blur, shockwave warp,
                  chromatic aberration, grade, vignette, grain)
   Written as a custom chain (instead of EffectComposer) so that
   split-screen viewports survive the whole pipeline.
   ============================================================ */
import * as THREE from 'three';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-5);
    float contrib = max(soft, l - uThreshold) / max(l, 1e-5);
    gl_FragColor = vec4(c * contrib, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;       // texel-sized direction
  varying vec2 vUv;
  void main() {
    // 9-tap gaussian
    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
    sum += texture2D(tDiffuse, vUv + uDir * 1.3846) * 0.316216;
    sum += texture2D(tDiffuse, vUv - uDir * 1.3846) * 0.316216;
    sum += texture2D(tDiffuse, vUv + uDir * 3.2308) * 0.070270;
    sum += texture2D(tDiffuse, vUv - uDir * 3.2308) * 0.070270;
    gl_FragColor = sum;
  }
`;

const COPY_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;

const COMPOSITE_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform sampler2D tBloom0;
  uniform sampler2D tBloom1;
  uniform sampler2D tBloom2;
  uniform vec2  uRes;
  uniform float uTime;
  uniform float uBloom;
  uniform float uRadial;        // speed-line strength
  uniform vec2  uRadialCenter;
  uniform float uChroma;
  uniform float uVignette;
  uniform float uFlash;
  uniform vec3  uFlashColor;
  uniform float uDesat;
  uniform float uContrast;
  uniform float uSaturate;
  uniform vec3  uTint;
  uniform float uGrain;
  uniform float uWaveAmp;
  uniform float uWaveR;
  uniform vec2  uWaveCenter;
  uniform float uSplit;         // 1.0 when split-screen
  uniform float uExposure;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 tonemap(vec3 x) {
    // gentle filmic curve; keeps cel colours flat but tames blowouts
    x *= uExposure;
    vec3 a = x * (x * 0.26 + 0.30);
    vec3 b = x * (x * 0.24 + 0.68) + 0.17;
    return clamp(a / b * 1.20, 0.0, 4.0);
  }

  void main() {
    vec2 uv = vUv;

    // --- shockwave lens warp ---
    if (uWaveAmp > 0.0001) {
      vec2 d = uv - uWaveCenter;
      d.x *= uRes.x / uRes.y;
      float dist = length(d);
      float ring = smoothstep(uWaveR - 0.09, uWaveR, dist) - smoothstep(uWaveR, uWaveR + 0.09, dist);
      uv += normalize(d + 1e-6) * ring * uWaveAmp;
    }

    // radial-blur origin: per half when split-screen
    vec2 rc = uRadialCenter;
    if (uSplit > 0.5) {
      float half_ = step(0.5, uv.x);
      rc = vec2(0.25 + half_ * 0.5, uRadialCenter.y);
    }

    vec3 col;
    if (uRadial > 0.001) {
      vec2 dir = (uv - rc);
      col = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 10; i++) {
        float t = float(i) / 9.0;
        float w = 1.0 - t * 0.55;
        vec2 suv = uv - dir * t * uRadial;
        // keep samples inside their own viewport half
        if (uSplit > 0.5) {
          float lo = step(0.5, rc.x) * 0.5;
          suv.x = clamp(suv.x, lo + 0.001, lo + 0.499);
        }
        col += texture2D(tScene, suv).rgb * w;
        total += w;
      }
      col /= total;
    } else {
      col = texture2D(tScene, uv).rgb;
    }

    // --- chromatic aberration ---
    if (uChroma > 0.0001) {
      vec2 d = (uv - rc) * uChroma;
      col.r = texture2D(tScene, uv + d).r;
      col.b = texture2D(tScene, uv - d).b;
    }

    // --- bloom ---
    vec3 bl = texture2D(tBloom0, uv).rgb
            + texture2D(tBloom1, uv).rgb * 0.78
            + texture2D(tBloom2, uv).rgb * 0.55;
    col += bl * uBloom;

    col = tonemap(col);

    // --- grade ---
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, uSaturate);
    col = mix(vec3(lum), col, 1.0 - uDesat);
    col = (col - 0.5) * uContrast + 0.5;
    col *= uTint;

    // --- vignette ---
    vec2 vd = uv - 0.5;
    if (uSplit > 0.5) vd = vec2(fract(uv.x * 2.0) - 0.5, uv.y - 0.5);
    float vig = 1.0 - dot(vd, vd) * uVignette;
    col *= clamp(vig, 0.0, 1.0);

    // --- flash + grain ---
    col = mix(col, uFlashColor, uFlash);
    float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
    col += g * uGrain;

    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <colorspace_fragment>
  }
`;

function makeRT(w, h) {
  return new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), {
    type: THREE.HalfFloatType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geo = new THREE.PlaneGeometry(2, 2);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(this.geo, null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.matBright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 1.0 }, uKnee: { value: 0.42 } },
      vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    });
    this.matBlur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.matCopy = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: QUAD_VERT, fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false,
    });
    this.matComposite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom0: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uBloom: { value: 0.42 },
        uRadial: { value: 0 },
        uRadialCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uChroma: { value: 0.0012 },
        uVignette: { value: 1.05 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uDesat: { value: 0 },
        uContrast: { value: 1.13 },
        uSaturate: { value: 1.16 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uGrain: { value: 0.016 },
        uWaveAmp: { value: 0 },
        uWaveR: { value: 0.2 },
        uWaveCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uSplit: { value: 0 },
        uExposure: { value: 0.95 },
      },
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    });

    this.sceneRT = null;
    this.levels = [];
    this.setSize(1, 1);
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;

    this.sceneRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
      samples: 0,
    });
    this.sceneRT.depthTexture = null;

    for (const l of this.levels) { l.a.dispose(); l.b.dispose(); }
    this.levels = [];
    let dw = w, dh = h;
    for (let i = 0; i < 3; i++) {
      dw = Math.max(2, Math.floor(dw / 2));
      dh = Math.max(2, Math.floor(dh / 2));
      this.levels.push({ a: makeRT(dw, dh), b: makeRT(dw, dh), w: dw, h: dh });
    }
    this.matComposite.uniforms.uRes.value.set(w, h);
  }

  blit(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.setViewport(0, 0, target ? target.width : this.w, target ? target.height : this.h);
    this.renderer.setScissorTest(false);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.scene, this.camera);
  }

  /** run bloom + composite; scene must already be rendered into this.sceneRT */
  render(dt) {
    const r = this.renderer;
    const u = this.matComposite.uniforms;
    u.uTime.value += dt;

    // bright pass into level 0
    this.matBright.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.blit(this.matBright, this.levels[0].a);

    for (let i = 0; i < this.levels.length; i++) {
      const lv = this.levels[i];
      if (i > 0) {
        this.matCopy.uniforms.tDiffuse.value = this.levels[i - 1].a.texture;
        this.blit(this.matCopy, lv.a);
      }
      const radius = 1 + i * 0.6;
      this.matBlur.uniforms.tDiffuse.value = lv.a.texture;
      this.matBlur.uniforms.uDir.value.set(radius / lv.w, 0);
      this.blit(this.matBlur, lv.b);
      this.matBlur.uniforms.tDiffuse.value = lv.b.texture;
      this.matBlur.uniforms.uDir.value.set(0, radius / lv.h);
      this.blit(this.matBlur, lv.a);
    }

    u.tScene.value = this.sceneRT.texture;
    u.tBloom0.value = this.levels[0].a.texture;
    u.tBloom1.value = this.levels[1].a.texture;
    u.tBloom2.value = this.levels[2].a.texture;
    this.blit(this.matComposite, null);
    r.setRenderTarget(null);
  }

  get u() { return this.matComposite.uniforms; }

  dispose() {
    this.sceneRT?.dispose();
    for (const l of this.levels) { l.a.dispose(); l.b.dispose(); }
    this.geo.dispose();
    [this.matBright, this.matBlur, this.matCopy, this.matComposite].forEach(m => m.dispose());
  }
}
