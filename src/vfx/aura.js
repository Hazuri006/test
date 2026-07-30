/* ============================================================
   Aura — the ki flame, built the way the anime draws it.

   The old version was a smooth noise-thresholded cone, which reads as
   fog. A real ki aura is a set of DISCRETE flame tongues: hard cel
   edges, pointed tips, a pale core hugging the body, gaps between the
   licks, and every tongue flickering on its own timing.

   So the mesh is literally a ring of separate petals. Each petal
   carries its own index as an attribute, and the vertex shader gives it
   an independent lick height and sway. The fragment shader tapers it to
   a point and cuts the alpha hard.
   ============================================================ */
import * as THREE from 'three';
import { TAU } from '../core/utils.js';

/**
 * Ring of flame petals on a unit-height flame.
 * y spans 0..1 (scaled by the shader), xz follow a body-hugging profile.
 */
function flameGeometry(petals = 10, rings = 7, gap = 0.14, profile) {
  const pos = [], petal = [], vAttr = [], uAttr = [];
  const prof = profile || ((v) => {
    // wide and flared at the hips, tight at the shoulders, thin at the tips
    const a = 1 - v;
    return 0.30 + a * a * 0.26 + Math.sin(v * Math.PI) * 0.08;
  });

  for (let p = 0; p < petals; p++) {
    const span = (1 - gap) / petals;
    const a0 = (p / petals) * TAU;
    const a1 = a0 + span * TAU;
    for (let r = 0; r < rings; r++) {
      const v0 = r / rings, v1 = (r + 1) / rings;
      const r0 = prof(v0), r1 = prof(v1);
      const c0 = [Math.cos(a0), Math.sin(a0)], c1 = [Math.cos(a1), Math.sin(a1)];
      // quad corners: (a0,v0) (a1,v0) (a1,v1) (a0,v1)
      const P = [
        [c0[0] * r0, v0, c0[1] * r0, 0, v0],
        [c1[0] * r0, v0, c1[1] * r0, 1, v0],
        [c1[0] * r1, v1, c1[1] * r1, 1, v1],
        [c0[0] * r1, v1, c0[1] * r1, 0, v1],
      ];
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const q = P[idx];
        pos.push(q[0], q[1], q[2]);
        uAttr.push(q[3]);
        vAttr.push(q[4]);
        petal.push(p);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPetal', new THREE.Float32BufferAttribute(petal, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(vAttr, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(uAttr, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4);
  return g;
}

const VERT = /* glsl */`
  attribute float aPetal;
  attribute float aV;
  attribute float aU;
  uniform float uTime;
  uniform float uPower;
  uniform float uHeight;
  uniform float uSpread;
  uniform float uSpeed;
  varying float vV;
  varying float vU;
  varying float vLick;

  float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  float n11(float x) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), f);
  }

  void main() {
    float ph = hash11(aPetal + 0.37) * 17.0;

    // each tongue licks upward on its own clock: a fast flicker on top of
    // a slower surge, so the silhouette never repeats
    float fast = n11(uTime * uSpeed * 3.1 + ph * 13.0);
    float slow = n11(uTime * uSpeed * 0.9 + ph * 5.0);
    float lick = fast * 0.65 + slow * 0.35;
    vLick = lick;

    // reach: short and licking at rest, a tall column at full power
    float reach = mix(0.34, 1.0, clamp(uPower, 0.0, 1.0)) * (0.5 + lick * 0.85);

    vec3 p = position;
    float v = aV;
    p.y *= uHeight * reach;

    // tongues bend as they rise, more when powered up
    float bend = (n11(uTime * uSpeed * 1.7 + ph * 7.0) - 0.5) * v * v;
    p.x += bend * 0.42 * (0.5 + uPower);
    p.z += bend * 0.3 * (0.5 + uPower);
    p.xz *= uSpread * (1.0 + lick * 0.16 * v);

    vV = v;
    vU = aU;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform float uPower;
  uniform float uOpacity;
  uniform float uEdge;
  varying float vV;
  varying float vU;
  varying float vLick;

  void main() {
    // taper across the petal so every tongue ends in a point
    float w = 1.0 - abs(vU * 2.0 - 1.0);
    float shape = w * 0.92 - vV * vV * 0.6;
    float a = smoothstep(0.0, uEdge, shape);   // hard cel edge
    a *= smoothstep(1.0, 0.68, vV);            // dissolve the tip
    a *= smoothstep(0.0, 0.05, vV);            // stay off the feet

    // two flat tones: pale core near the body, ki colour outward
    float core = smoothstep(0.42, 0.04, vV) * smoothstep(0.05, 0.42, w);
    vec3 col = mix(uColor, uCore, core);
    col *= 0.85 + uPower * 0.55 + vLick * 0.18;

    float alpha = a * uOpacity;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

function flameMaterial(color, core, side) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPower: { value: 0 },
      uHeight: { value: 2.7 },
      uSpread: { value: 1 },
      uSpeed: { value: 1 },
      uOpacity: { value: 1 },
      uEdge: { value: 0.2 },
      uColor: { value: new THREE.Color(color) },
      uCore: { value: new THREE.Color(core) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side,
  });
}

/**
 * Three stacked layers make it read as volume:
 *   core  — pale, behind the body only, hugs tight
 *   main  — the ki colour, long tongues, both sides
 *   skirt — short outward flare at the feet
 */
export class Aura {
  constructor(parent, palette, scale = 1) {
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    parent.add(this.group);

    const col = palette.aura;
    const core = palette.auraCore ?? 0xffffff;
    const pale = new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.32);

    const mainGeo = flameGeometry(10, 7, 0.14);
    const coreGeo = flameGeometry(8, 6, 0.2, (v) => {
      const a = 1 - v;
      return 0.24 + a * a * 0.2 + Math.sin(v * Math.PI) * 0.05;
    });
    const skirtGeo = flameGeometry(10, 4, 0.18, (v) => 0.42 + v * 0.5);

    this.main = new THREE.Mesh(mainGeo, flameMaterial(col, pale, THREE.DoubleSide));
    this.core = new THREE.Mesh(coreGeo, flameMaterial(pale, core, THREE.BackSide));
    this.skirt = new THREE.Mesh(skirtGeo, flameMaterial(col, pale, THREE.DoubleSide));

    this.main.renderOrder = 6;
    this.core.renderOrder = 5;
    this.skirt.renderOrder = 6;

    this.core.material.uniforms.uHeight.value = 2.0;
    this.core.material.uniforms.uEdge.value = 0.2;
    this.skirt.material.uniforms.uHeight.value = 0.5;
    this.skirt.material.uniforms.uSpeed.value = 1.6;
    this.skirt.material.uniforms.uEdge.value = 0.18;

    for (const m of [this.main, this.core, this.skirt]) {
      m.frustumCulled = false;
      m.scale.setScalar(scale);
      this.group.add(m);
    }
    this.layers = [this.main, this.core, this.skirt];
    this.visible = false;
    this.group.visible = false;
    this.power = 0;
  }

  setColors(color, core) {
    const pale = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.32);
    this.main.material.uniforms.uColor.value.set(color);
    this.main.material.uniforms.uCore.value.copy(pale);
    this.core.material.uniforms.uColor.value.copy(pale);
    this.core.material.uniforms.uCore.value.set(core ?? 0xffffff);
    this.skirt.material.uniforms.uColor.value.set(color);
    this.skirt.material.uniforms.uCore.value.copy(pale);
  }

  /** power 0..1.4; above ~1 the aura becomes a column (Sparking) */
  update(dt, power) {
    this.power = power;
    const on = power > 0.04;
    this.group.visible = on;
    if (!on) return;
    for (const m of this.layers) {
      const u = m.material.uniforms;
      u.uTime.value += dt;
      u.uPower.value = power;
      u.uOpacity.value = Math.min(0.95, power * 0.95);
    }
    // at high power the flame stops licking and starts roaring straight up
    this.main.material.uniforms.uSpeed.value = 1 + power * 0.9;
    this.main.material.uniforms.uHeight.value = 2.7 + Math.min(power, 1.4) * 0.8;
    this.core.material.uniforms.uHeight.value = 2.0 + Math.min(power, 1.4) * 0.5;
    this.skirt.material.uniforms.uOpacity.value = Math.min(1, power * 0.9);
  }

  dispose() {
    for (const m of this.layers) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.group.parent?.remove(this.group);
  }
}

/* ============================================================
   Sparking crackle — the lightning that snaps around a powered-up
   fighter. Pooled billboards, no allocation per spark.
   ============================================================ */
export class Crackle {
  constructor(parent, map, color, count = 7) {
    this.sprites = [];
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    parent.add(this.group);
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map, color, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
      }));
      s.visible = false;
      this.group.add(s);
      this.sprites.push({ s, life: 0, dur: 0.1 });
    }
    this.cursor = 0;
    this.timer = 0;
  }

  setColor(c) { for (const it of this.sprites) it.s.material.color.set(c); }

  /** call every frame; spawns bolts while `rate` > 0 */
  update(dt, rate, height = 1.8, radius = 0.7) {
    this.timer -= dt;
    if (rate > 0 && this.timer <= 0) {
      this.timer = 0.03 + Math.random() * 0.09 / Math.max(0.2, rate);
      const it = this.sprites[this.cursor];
      this.cursor = (this.cursor + 1) % this.sprites.length;
      const a = Math.random() * TAU;
      const r = radius * (0.5 + Math.random() * 0.8);
      it.s.position.set(Math.cos(a) * r, height * (0.15 + Math.random() * 0.95), Math.sin(a) * r);
      const s = 0.9 + Math.random() * 1.3;
      it.s.scale.set(s * 0.5, s, 1);
      it.s.material.rotation = (Math.random() - 0.5) * 1.2;
      it.dur = 0.09 + Math.random() * 0.11;
      it.life = it.dur;
      it.s.visible = true;
    }
    for (const it of this.sprites) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.s.visible = false; it.s.material.opacity = 0; continue; }
      it.s.material.opacity = (it.life / it.dur) * 0.95;
    }
  }

  dispose() {
    for (const it of this.sprites) it.s.material.dispose();
    this.group.parent?.remove(this.group);
  }
}
