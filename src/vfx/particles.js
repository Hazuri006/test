/* ============================================================
   Particles — one THREE.Points buffer per look (glow / smoke /
   star / streak). CPU simulated, written straight into the
   attribute arrays each frame.
   ============================================================ */
import * as THREE from 'three';
import { rand } from '../core/utils.js';

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aRot;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  varying float vRot;
  void main() {
    vColor = aColor;
    vRot = aRot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 1.0, 640.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying vec4 vColor;
  varying float vRot;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    uv = mat2(c, -s, s, c) * uv + 0.5;
    vec4 t = texture2D(uMap, uv);
    if (t.a * vColor.a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a);
  }
`;

export class ParticleField {
  /**
   * @param {object} o  { map, count, blending, gravity, drag, depthWrite }
   */
  constructor(o = {}) {
    this.count = o.count ?? 900;
    this.gravity = o.gravity ?? 0;
    this.drag = o.drag ?? 0.6;
    this.cursor = 0;

    const n = this.count;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.rotVel = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    this.mode = new Uint8Array(n); // 0 free, 1 alive

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, n);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: o.map }, uScale: { value: 620 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: o.blending ?? THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = o.renderOrder ?? 10;
    this.geo = g;
  }

  /**
   * emit one particle
   * o: { x,y,z, vx,vy,vz, size, growth, life, color(THREE.Color), alpha, rot, rotVel }
   */
  emit(o) {
    let i = -1;
    for (let k = 0; k < this.count; k++) {
      const idx = (this.cursor + k) % this.count;
      if (this.mode[idx] === 0) { i = idx; break; }
    }
    if (i < 0) { i = this.cursor % this.count; }        // steal oldest slot
    this.cursor = (i + 1) % this.count;

    const p3 = i * 3, c4 = i * 4;
    this.pos[p3] = o.x; this.pos[p3 + 1] = o.y; this.pos[p3 + 2] = o.z;
    this.vel[p3] = o.vx ?? 0; this.vel[p3 + 1] = o.vy ?? 0; this.vel[p3 + 2] = o.vz ?? 0;
    const c = o.color ?? WHITE;
    this.col[c4] = c.r; this.col[c4 + 1] = c.g; this.col[c4 + 2] = c.b;
    this.alpha0[i] = o.alpha ?? 1;
    this.col[c4 + 3] = this.alpha0[i];
    this.size0[i] = o.size ?? 1;
    this.size[i] = this.size0[i];
    this.grow[i] = o.growth ?? 0;
    this.rot[i] = o.rot ?? rand(0, Math.PI * 2);
    this.rotVel[i] = o.rotVel ?? 0;
    this.maxLife[i] = this.life[i] = o.life ?? 0.7;
    this.mode[i] = 1;
    return i;
  }

  update(dt) {
    const { pos, vel, col, size, rot, life, maxLife, mode } = this;
    const dragF = Math.exp(-this.drag * dt);
    let anyAlive = false;
    for (let i = 0; i < this.count; i++) {
      if (mode[i] === 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { mode[i] = 0; col[i * 4 + 3] = 0; size[i] = 0; continue; }
      anyAlive = true;
      const p3 = i * 3;
      vel[p3 + 1] += this.gravity * dt;
      vel[p3] *= dragF; vel[p3 + 1] *= dragF; vel[p3 + 2] *= dragF;
      pos[p3] += vel[p3] * dt;
      pos[p3 + 1] += vel[p3 + 1] * dt;
      pos[p3 + 2] += vel[p3 + 2] * dt;
      rot[i] += this.rotVel[i] * dt;
      const t = 1 - life[i] / maxLife[i];
      size[i] = Math.max(0, this.size0[i] * (1 + this.grow[i] * t));
      col[i * 4 + 3] = this.alpha0[i] * (1 - t * t);
    }
    this.alive = anyAlive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aRot.needsUpdate = true;
  }

  clear() {
    this.mode.fill(0);
    this.col.fill(0);
    this.size.fill(0);
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
