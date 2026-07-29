/* ============================================================
   Effects — the VFX library: impacts, shockwaves, explosions,
   beams, afterimages, swing trails, ki debris, transformations.
   ============================================================ */
import * as THREE from 'three';
import { sprites, noiseMap } from '../graphics/textures.js';
import { createEnergyMaterial } from '../graphics/materials.js';
import { ParticleField } from './particles.js';
import { rand, randInt, clamp, TAU, easeOutCubic } from '../core/utils.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sp = sprites();
    this.time = 0;
    this.transients = [];
    this.pools = new Map();
    this.beams = [];
    this.trails = [];
    this.shakeAmp = 0; this.shakeFreq = 34; this.shakeT = 0;
    this.hooks = { flash: null, wave: null, radial: null, hitstop: null };

    this.fx = {
      spark: new ParticleField({ map: this.sp.glow, count: 900, gravity: -6, drag: 1.1 }),
      star: new ParticleField({ map: this.sp.star, count: 220, gravity: 0, drag: 2.4 }),
      smoke: new ParticleField({
        map: this.sp.smoke, count: 420, gravity: 1.6, drag: 1.4,
        blending: THREE.NormalBlending, renderOrder: 9,
      }),
      ember: new ParticleField({ map: this.sp.glow, count: 700, gravity: 2.2, drag: 0.5 }),
      debris: new ParticleField({ map: this.sp.streak, count: 380, gravity: -14, drag: 0.25 }),
      dust: new ParticleField({
        map: this.sp.smoke, count: 300, gravity: 0.4, drag: 1.9,
        blending: THREE.NormalBlending, renderOrder: 8,
      }),
    };
    for (const k in this.fx) scene.add(this.fx[k].points);
  }

  bind(hooks) { Object.assign(this.hooks, hooks); }

  /* ---------------- pooling ---------------- */

  acquire(kind, factory) {
    let pool = this.pools.get(kind);
    if (!pool) { pool = []; this.pools.set(kind, pool); }
    const o = pool.pop() || factory();
    o.visible = true;
    this.scene.add(o);
    return o;
  }

  recycle(kind, obj) {
    obj.visible = false;
    this.scene.remove(obj);
    const pool = this.pools.get(kind) || [];
    if (pool.length < 48) pool.push(obj);
    this.pools.set(kind, pool);
  }

  transient(kind, obj, dur, updater) {
    this.transients.push({ kind, obj, t: 0, dur, updater });
    return obj;
  }

  /* ---------------- primitive builders ---------------- */

  ringMesh(map = this.sp.ring) {
    return this.acquire('ring', () => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        })
      );
      m.renderOrder = 12;
      return m;
    });
  }

  billboard(map, color, blending = THREE.AdditiveBlending) {
    const s = this.acquire('bb', () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthWrite: false, toneMapped: false,
      }));
      sprite.renderOrder = 14;
      return sprite;
    });
    s.material.map = map;
    s.material.blending = blending;
    s.material.color.set(color);
    s.material.opacity = 1;
    s.material.needsUpdate = true;
    return s;
  }

  sphereMesh(core, edge, opts = {}) {
    const m = this.acquire('sphere', () => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), createEnergyMaterial());
      mesh.renderOrder = 13;
      return mesh;
    });
    const u = m.material.uniforms;
    u.uCore.value.set(core);
    u.uEdge.value.set(edge);
    u.uIntensity.value = opts.intensity ?? 1.2;
    u.uOpacity.value = opts.opacity ?? 1;
    u.uFresnel.value = opts.fresnel ?? 1.6;
    u.uWobble.value = opts.wobble ?? 0;
    u.uStripes.value = 0;
    return m;
  }

  /* ---------------- effects ---------------- */

  /** small clash spark at a melee connection */
  hitSpark(p, color = 0xffe9a0, scale = 1, heavy = false) {
    const c = new THREE.Color(color);
    const star = this.billboard(this.sp.star, c);
    star.position.copy(p);
    star.scale.setScalar(0.1);
    star.material.rotation = rand(0, TAU);
    this.transient('bb', star, heavy ? 0.34 : 0.2, (o, k) => {
      const s = easeOutCubic(k);
      o.scale.setScalar((heavy ? 3.4 : 1.9) * scale * (0.35 + s * 0.9));
      o.material.opacity = 1 - k * k;
      o.material.rotation += 0.05;
    });

    const flash = this.billboard(this.sp.glow, 0xffffff);
    flash.position.copy(p);
    this.transient('bb', flash, 0.16, (o, k) => {
      o.scale.setScalar((heavy ? 2.0 : 1.15) * scale * (0.4 + k * 1.3));
      o.material.opacity = 1 - k;
    });

    const n = heavy ? 26 : 12;
    for (let i = 0; i < n; i++) {
      const dir = _v1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      this.fx.spark.emit({
        x: p.x, y: p.y, z: p.z,
        vx: dir.x * rand(4, 17) * scale, vy: dir.y * rand(4, 17) * scale, vz: dir.z * rand(4, 17) * scale,
        size: rand(0.1, 0.3) * scale, growth: -0.6, life: rand(0.2, 0.5),
        color: c, alpha: 1,
      });
    }
    if (heavy) this.shockRing(p, color, 3.2 * scale, 0.34);
  }

  /** expanding disc facing the camera */
  shockRing(p, color = 0xbfe9ff, size = 4, dur = 0.4, tilt = null) {
    const r = this.ringMesh(this.sp.thinRing);
    r.material.color.set(color);
    r.material.opacity = 1;
    r.position.copy(p);
    if (tilt) r.quaternion.copy(tilt);
    else r.userData.face = true;
    this.transient('ring', r, dur, (o, k) => {
      const s = easeOutCubic(k) * size;
      o.scale.set(s, s, s);
      o.material.opacity = (1 - k) * 0.95;
    });
    return r;
  }

  /** flat ring lying on the ground */
  groundRing(p, color, size = 6, dur = 0.6) {
    const r = this.ringMesh(this.sp.ring);
    r.material.color.set(color);
    r.position.set(p.x, p.y + 0.06, p.z);
    r.rotation.set(-Math.PI / 2, 0, rand(0, TAU));
    this.transient('ring', r, dur, (o, k) => {
      const s = easeOutCubic(k) * size;
      o.scale.set(s, s, s);
      o.material.opacity = (1 - k) * 0.85;
    });
  }

  /** debris + dust when something slams the floor */
  groundImpact(p, power = 1, color = 0xd8c4a0) {
    this.groundRing(p, 0xffffff, 6 * power, 0.55);
    const c = new THREE.Color(color);
    for (let i = 0; i < 22 * power; i++) {
      const a = rand(0, TAU), sp = rand(3, 13) * power;
      this.fx.dust.emit({
        x: p.x + Math.cos(a) * rand(0, 1.2), y: p.y + 0.2, z: p.z + Math.sin(a) * rand(0, 1.2),
        vx: Math.cos(a) * sp, vy: rand(1.5, 6) * power, vz: Math.sin(a) * sp,
        size: rand(1.2, 3.4) * power, growth: 2.4, life: rand(0.7, 1.5),
        color: c, alpha: 0.5, rotVel: rand(-1, 1),
      });
    }
    for (let i = 0; i < 14 * power; i++) {
      const a = rand(0, TAU);
      this.fx.debris.emit({
        x: p.x, y: p.y + 0.2, z: p.z,
        vx: Math.cos(a) * rand(4, 15), vy: rand(5, 15) * power, vz: Math.sin(a) * rand(4, 15),
        size: rand(0.25, 0.7), growth: -0.3, life: rand(0.7, 1.4),
        color: c, alpha: 0.95, rotVel: rand(-8, 8),
      });
    }
    this.shake(0.55 * power, 0.35);
  }

  /** the big one */
  explosion(p, color = 0xffb43c, radius = 6, opts = {}) {
    const c = new THREE.Color(color);
    const core = this.sphereMesh(0xffffff, color, { intensity: 1.5, wobble: 0.06 });
    core.position.copy(p);
    core.scale.setScalar(0.4);
    this.transient('sphere', core, 0.55, (o, k) => {
      const s = radius * (0.25 + easeOutCubic(k) * 0.95);
      o.scale.setScalar(s);
      o.material.uniforms.uOpacity.value = 1 - k;
      o.material.uniforms.uTime.value = this.time;
    });

    const flash = this.billboard(this.sp.glow, color);
    flash.position.copy(p);
    this.transient('bb', flash, 0.4, (o, k) => {
      o.scale.setScalar(radius * (0.5 + k * 0.8));
      o.material.opacity = Math.pow(1 - k, 2) * 0.55;
    });

    this.shockRing(p, 0xffffff, radius * 2.2, 0.6);
    this.shockRing(p, color, radius * 1.5, 0.45);

    for (let i = 0; i < 46; i++) {
      const dir = _v1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      const sp = rand(6, 30) * (radius / 6);
      this.fx.spark.emit({
        x: p.x, y: p.y, z: p.z,
        vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp,
        size: rand(0.2, 0.75), growth: -0.4, life: rand(0.35, 0.95),
        color: c, alpha: 1,
      });
    }
    for (let i = 0; i < 26; i++) {
      const dir = _v1.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize();
      const sp = rand(2, 9) * (radius / 6);
      this.fx.smoke.emit({
        x: p.x + dir.x, y: p.y + dir.y, z: p.z + dir.z,
        vx: dir.x * sp, vy: dir.y * sp + 1.5, vz: dir.z * sp,
        size: rand(2.5, 6) * (radius / 6), growth: 2.2, life: rand(0.9, 1.9),
        color: new THREE.Color(0.22, 0.2, 0.2), alpha: 0.62, rotVel: rand(-1.2, 1.2),
      });
    }
    for (let i = 0; i < 18; i++) {
      const dir = _v1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      this.fx.debris.emit({
        x: p.x, y: p.y, z: p.z,
        vx: dir.x * rand(9, 26), vy: dir.y * rand(9, 26), vz: dir.z * rand(9, 26),
        size: rand(0.3, 0.9), growth: -0.2, life: rand(0.7, 1.5),
        color: c, alpha: 1, rotVel: rand(-9, 9),
      });
    }

    this.shake(opts.shake ?? clamp(radius * 0.16, 0.4, 2.4), 0.55);
    this.hooks.flash?.(clamp(radius * 0.026, 0.05, 0.3), color);
    this.hooks.wave?.(p, radius);
  }

  /** ki-charge ring pulling inward */
  chargePulse(p, color, size = 2.4) {
    const r = this.ringMesh(this.sp.thinRing);
    r.material.color.set(color);
    r.position.copy(p);
    r.userData.face = true;
    this.transient('ring', r, 0.5, (o, k) => {
      const s = size * (1.8 - easeOutCubic(k) * 1.55);
      o.scale.set(s, s, s);
      o.material.opacity = Math.sin(k * Math.PI) * 0.9;
    });
  }

  /** upward energy column used for transformations */
  pillar(p, color, height = 26, dur = 1.1) {
    const m = this.acquire('pillar', () => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 1.15, 1, 26, 1, true),
        createEnergyMaterial({ core: 0xffffff, edge: 0xffd24a, intensity: 1.35, stripes: true, fresnel: 1.1 })
      );
      mesh.renderOrder = 13;
      return mesh;
    });
    m.material.uniforms.uCore.value.set(0xffffff);
    m.material.uniforms.uEdge.value.set(color);
    m.position.set(p.x, p.y, p.z);
    this.transient('pillar', m, dur, (o, k) => {
      const w = (1 - Math.pow(k, 3)) * 1.15;
      o.scale.set(w, height, w);
      o.position.y = p.y + height / 2;
      o.material.uniforms.uOpacity.value = (1 - Math.pow(k, 2)) * 0.7;
      o.material.uniforms.uTime.value = this.time;
    });

    this.groundRing(p, color, 7, 0.9);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU), r = rand(0.5, 4);
      this.fx.ember.emit({
        x: p.x + Math.cos(a) * r, y: p.y + rand(0, 1), z: p.z + Math.sin(a) * r,
        vx: Math.cos(a) * -1.5, vy: rand(6, 20), vz: Math.sin(a) * -1.5,
        size: rand(0.2, 0.6), growth: -0.5, life: rand(0.6, 1.4),
        color: new THREE.Color(color), alpha: 1,
      });
    }
  }

  /** teleport / vanish burst */
  vanish(p, color = 0x9fe6ff) {
    const b = this.billboard(this.sp.glow, color);
    b.position.copy(p);
    this.transient('bb', b, 0.24, (o, k) => {
      o.scale.setScalar(1 + k * 5.5);
      o.material.opacity = 1 - k;
    });
    this.shockRing(p, color, 5, 0.3);
    for (let i = 0; i < 16; i++) {
      const dir = _v1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      this.fx.spark.emit({
        x: p.x, y: p.y, z: p.z,
        vx: dir.x * 12, vy: dir.y * 12, vz: dir.z * 12,
        size: rand(0.12, 0.3), growth: -0.5, life: rand(0.18, 0.38),
        color: new THREE.Color(color), alpha: 1,
      });
    }
  }

  /** trailing ki motes behind a moving fighter */
  boostTrail(p, color, amount = 1) {
    for (let i = 0; i < amount; i++) {
      this.fx.ember.emit({
        x: p.x + rand(-0.35, 0.35), y: p.y + rand(-0.5, 0.9), z: p.z + rand(-0.35, 0.35),
        vx: rand(-1.2, 1.2), vy: rand(0.5, 3.5), vz: rand(-1.2, 1.2),
        size: rand(0.18, 0.5), growth: -0.7, life: rand(0.25, 0.55),
        color: new THREE.Color(color), alpha: 0.95,
      });
    }
  }

  /** anime slash arc following a limb */
  swingTrail(color = 0xbfe9ff, width = 0.42, segments = 14) {
    const t = new SwingTrail(this.scene, color, width, segments);
    this.trails.push(t);
    return t;
  }

  /* ---------------- camera / screen ---------------- */

  shake(amp, dur = 0.4) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, dur);
    this.shakeDur = this.shakeT;
  }

  shakeOffset(out) {
    if (this.shakeT <= 0) { out.set(0, 0, 0); return out; }
    const k = this.shakeT / (this.shakeDur || 1);
    const a = this.shakeAmp * k * k;
    const t = this.time * this.shakeFreq;
    out.set(Math.sin(t * 1.7) * a, Math.sin(t * 2.3 + 1.1) * a, Math.sin(t * 1.3 + 2.4) * a * 0.6);
    return out;
  }

  /* ---------------- update ---------------- */

  update(dt, camera) {
    this.time += dt;
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);

    for (const k in this.fx) this.fx[k].update(dt);

    for (let i = this.transients.length - 1; i >= 0; i--) {
      const e = this.transients[i];
      e.t += dt;
      const k = clamp(e.t / e.dur, 0, 1);
      e.updater(e.obj, k);
      if (e.obj.userData.face && camera) e.obj.quaternion.copy(camera.quaternion);
      if (e.t >= e.dur) {
        this.transients.splice(i, 1);
        this.recycle(e.kind, e.obj);
      }
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      if (!this.beams[i].update(dt)) {
        this.beams[i].dispose();
        this.beams.splice(i, 1);
      }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      this.trails[i].update(dt);
      if (this.trails[i].dead) { this.trails[i].dispose(); this.trails.splice(i, 1); }
    }
  }

  clear() {
    for (const k in this.fx) this.fx[k].clear();
    for (const e of this.transients) this.recycle(e.kind, e.obj);
    this.transients.length = 0;
    for (const b of this.beams) b.dispose();
    this.beams.length = 0;
    for (const t of this.trails) t.dispose();
    this.trails.length = 0;
    this.shakeT = 0; this.shakeAmp = 0;
  }
}

/* ============================================================
   Swing trail — ribbon that follows a moving point
   ============================================================ */
export class SwingTrail {
  constructor(scene, color, width, segments) {
    this.scene = scene;
    this.segments = segments;
    this.width = width;
    this.pts = [];
    this.dead = false;
    this.life = 0;
    this.active = true;

    const g = new THREE.BufferGeometry();
    this.positions = new Float32Array(segments * 2 * 3);
    this.alphas = new Float32Array(segments * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */`
        attribute float aAlpha;
        varying float vA;
        void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity;
        varying float vA;
        void main() {
          gl_FragColor = vec4(uColor * (1.0 + vA * 1.6), vA * uOpacity);
        }
      `,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    scene.add(this.mesh);
    this.geo = g;
  }

  push(p, up) {
    this.pts.unshift({ p: p.clone(), up: up.clone() });
    if (this.pts.length > this.segments) this.pts.length = this.segments;
  }

  stop() { this.active = false; }

  update(dt) {
    this.life += dt;
    if (!this.active) {
      this.material.uniforms.uOpacity.value -= dt * 4;
      if (this.material.uniforms.uOpacity.value <= 0) { this.dead = true; return; }
    }
    const n = this.pts.length;
    for (let i = 0; i < this.segments; i++) {
      const s = this.pts[Math.min(i, n - 1)];
      if (!s) continue;
      const t = i / (this.segments - 1);
      const w = this.width * (1 - t) * (1 - t * 0.3);
      const a = i * 6;
      this.positions[a] = s.p.x + s.up.x * w;
      this.positions[a + 1] = s.p.y + s.up.y * w;
      this.positions[a + 2] = s.p.z + s.up.z * w;
      this.positions[a + 3] = s.p.x - s.up.x * w;
      this.positions[a + 4] = s.p.y - s.up.y * w;
      this.positions[a + 5] = s.p.z - s.up.z * w;
      const al = (1 - t) * (i < n ? 1 : 0);
      this.alphas[i * 2] = al;
      this.alphas[i * 2 + 1] = al;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.material.dispose();
  }
}

/* ============================================================
   Afterimage — pooled ghost copies of a fighter's meshes
   ============================================================ */
export class AfterimagePool {
  constructor(scene, sourceMeshes, color = 0x8fd8ff, count = 5) {
    this.scene = scene;
    this.ghosts = [];
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.5 } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 wp = modelMatrix * vec4(position,1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 1.8);
          gl_FragColor = vec4(uColor * (0.45 + f * 2.2), uOpacity * (0.35 + f * 0.8));
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const parts = [];
      for (const m of sourceMeshes) {
        const mesh = new THREE.Mesh(m.geometry, this.material);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        g.add(mesh);
        parts.push(mesh);
      }
      g.visible = false;
      g.renderOrder = 8;
      scene.add(g);
      this.ghosts.push({ group: g, parts, life: 0, dur: 0.3 });
    }
    this.sourceMeshes = sourceMeshes;
    this.cursor = 0;
  }

  spawn(dur = 0.3) {
    const gh = this.ghosts[this.cursor];
    this.cursor = (this.cursor + 1) % this.ghosts.length;
    // a transformation can append new hair meshes to the source list after
    // the pool was built, so never index past the ghost's own parts
    const n = Math.min(gh.parts.length, this.sourceMeshes.length);
    for (let i = 0; i < n; i++) {
      const src = this.sourceMeshes[i];
      gh.parts[i].matrix.copy(src.matrixWorld);
      gh.parts[i].matrixWorld.copy(src.matrixWorld);
      gh.parts[i].visible = src.visible;
    }
    gh.life = dur; gh.dur = dur;
    gh.group.visible = true;
  }

  setColor(c) { this.material.uniforms.uColor.value.set(c); }

  update(dt) {
    let maxA = 0;
    for (const gh of this.ghosts) {
      if (gh.life <= 0) continue;
      gh.life -= dt;
      if (gh.life <= 0) { gh.group.visible = false; continue; }
      maxA = Math.max(maxA, gh.life / gh.dur);
    }
    this.material.uniforms.uOpacity.value = 0.62 * maxA;
  }

  dispose() {
    for (const gh of this.ghosts) this.scene.remove(gh.group);
    this.material.dispose();
  }
}

/* ============================================================
   Beam — the signature energy wave
   ============================================================ */
export class Beam {
  constructor(effects, opts = {}) {
    this.fx = effects;
    this.scene = effects.scene;
    this.color = new THREE.Color(opts.color ?? 0x4fd6ff);
    this.core = new THREE.Color(opts.core ?? 0xffffff);
    this.radius = opts.radius ?? 0.75;
    this.speed = opts.speed ?? 70;
    this.maxLength = opts.maxLength ?? 90;
    this.life = opts.life ?? 2.2;
    this.origin = new THREE.Vector3().copy(opts.origin ?? new THREE.Vector3());
    this.dir = new THREE.Vector3().copy(opts.dir ?? new THREE.Vector3(0, 0, 1)).normalize();
    this.length = 0;
    this.t = 0;
    this.blocked = false;
    this.onHit = opts.onHit || null;
    this.owner = opts.owner || null;

    const geo = new THREE.CylinderGeometry(1, 1, 1, 22, 1, true);
    geo.translate(0, 0.5, 0);

    // shell keeps the ki colour, only the thin inner core goes white-hot,
    // otherwise the whole beam saturates to a plain white tube
    const pale = this.color.clone().lerp(new THREE.Color(0xffffff), 0.45);
    this.shell = new THREE.Mesh(geo, createEnergyMaterial({
      core: pale, edge: this.color, intensity: 1.15, fresnel: 1.5, stripes: true, wobble: 0.02,
    }));
    this.inner = new THREE.Mesh(geo, createEnergyMaterial({
      core: 0xffffff, edge: pale, intensity: 1.3, fresnel: 0.8,
    }));
    this.shell.renderOrder = 13; this.inner.renderOrder = 14;
    this.shell.frustumCulled = false; this.inner.frustumCulled = false;
    this.scene.add(this.shell, this.inner);

    this.muzzle = effects.sphereMesh(pale, this.color, { intensity: 1.5, opacity: 0.6, fresnel: 2.2 });
    this.muzzle.scale.setScalar(this.radius * 1.35);
    this.tip = effects.sphereMesh(pale, this.color, { intensity: 1.4, wobble: 0.08, opacity: 0.75, fresnel: 1.9 });
    this.tipPos = new THREE.Vector3();
  }

  setOrigin(p) { this.origin.copy(p); }
  setDir(d) { this.dir.copy(d).normalize(); }

  update(dt) {
    this.t += dt;
    if (!this.blocked) this.length = Math.min(this.maxLength, this.length + this.speed * dt);

    const fade = clamp((this.life - this.t) / 0.45, 0, 1);
    const grow = clamp(this.t / 0.12, 0, 1);
    const r = this.radius * grow * (0.92 + Math.sin(this.t * 34) * 0.08) * fade;

    for (const m of [this.shell, this.inner]) {
      m.position.copy(this.origin);
      _q.setFromUnitVectors(UP, this.dir);
      m.quaternion.copy(_q);
      m.material.uniforms.uTime.value = this.fx.time;
      m.material.uniforms.uOpacity.value = fade;
    }
    this.shell.scale.set(r, this.length, r);
    this.inner.scale.set(r * 0.36, this.length, r * 0.36);

    this.muzzle.position.copy(this.origin);
    this.muzzle.scale.setScalar(r * 1.15);
    this.muzzle.material.uniforms.uTime.value = this.fx.time;
    this.muzzle.material.uniforms.uOpacity.value = fade * 0.6;

    this.tipPos.copy(this.dir).multiplyScalar(this.length).add(this.origin);
    this.tip.position.copy(this.tipPos);
    this.tip.scale.setScalar(r * 1.75 * (1 + Math.sin(this.t * 22) * 0.1));
    this.tip.material.uniforms.uTime.value = this.fx.time;
    this.tip.material.uniforms.uOpacity.value = fade * 0.8;

    // swirling motes along the beam
    if (Math.random() < 0.9) {
      const d = rand(0, this.length);
      const a = rand(0, TAU);
      const side = _v1.set(-this.dir.z, 0, this.dir.x).normalize().multiplyScalar(Math.cos(a) * r * 1.6);
      const up = _v2.copy(this.dir).cross(side).normalize().multiplyScalar(Math.sin(a) * r * 1.6);
      this.fx.fx.ember.emit({
        x: this.origin.x + this.dir.x * d + side.x + up.x,
        y: this.origin.y + this.dir.y * d + side.y + up.y,
        z: this.origin.z + this.dir.z * d + side.z + up.z,
        vx: -this.dir.x * 8, vy: -this.dir.y * 8 + 2, vz: -this.dir.z * 8,
        size: rand(0.15, 0.45), growth: -0.5, life: rand(0.2, 0.5),
        color: this.color, alpha: 0.9,
      });
    }

    return this.t < this.life;
  }

  dispose() {
    this.scene.remove(this.shell, this.inner);
    this.shell.geometry.dispose();
    this.shell.material.dispose();
    this.inner.material.dispose();
    this.fx.recycle('sphere', this.muzzle);
    this.fx.recycle('sphere', this.tip);
  }
}
