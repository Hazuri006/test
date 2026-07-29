/* ============================================================
   Animator — samples a clip into a pose buffer, cross-fades
   between clips, and writes euler angles onto the rig bones.
   ============================================================ */
import { BONES, POSES, POSE_LEN, CLIPS } from './poses.js';
import { smoothstep, lerp, clamp } from '../core/utils.js';

const OFF = BONES.length * 3;

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.cur = null;
    this.curT = 0;
    this.prevBuf = new Float32Array(POSE_LEN);
    this.buf = new Float32Array(POSE_LEN);
    this.out = new Float32Array(POSE_LEN);
    this.fade = 0; this.fadeDur = 0.12;
    this.speed = 1;
    this.events = [];      // fired this frame
    this.firedKeys = new Set();
    this.finished = false;
    this.onEvent = null;
    this.additive = new Float32Array(POSE_LEN);
    this.play('idle', { fade: 0 });
  }

  play(name, opts = {}) {
    const clip = CLIPS[name];
    if (!clip) return;
    if (this.cur === clip && !opts.restart && clip.loop) return;
    this.prevBuf.set(this.out);
    this.cur = clip;
    this.curT = 0;
    this.fade = 0;
    this.fadeDur = opts.fade ?? 0.11;
    this.speed = opts.speed ?? 1;
    this.firedKeys.clear();
    this.finished = false;
    this.clipName = name;
  }

  get normalized() { return this.cur ? clamp(this.curT / (this.cur.dur / this.speed), 0, 1) : 0; }

  sample(clip, u, out) {
    const keys = clip.keys;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t < u) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(1e-5, b.t - a.t);
    const k = smoothstep(clamp((u - a.t) / span, 0, 1));
    const pa = POSES[a.p], pb = POSES[b.p];
    for (let j = 0; j < POSE_LEN; j++) out[j] = pa[j] + (pb[j] - pa[j]) * k;
  }

  update(dt) {
    if (!this.cur) return;
    const clip = this.cur;
    const dur = clip.dur / this.speed;
    const prevT = this.curT;
    this.curT += dt;

    let u;
    if (clip.loop) {
      u = (this.curT % dur) / dur;
    } else {
      u = clamp(this.curT / dur, 0, 1);
      if (this.curT >= dur) this.finished = true;
    }

    // keyframe events
    const uPrev = clip.loop ? (prevT % dur) / dur : clamp(prevT / dur, 0, 1);
    for (let i = 0; i < clip.keys.length; i++) {
      const key = clip.keys[i];
      if (!key.ev) continue;
      const id = `${i}`;
      const passed = clip.loop
        ? (uPrev <= key.t && u >= key.t) || (u < uPrev && (key.t >= uPrev || key.t <= u))
        : (uPrev <= key.t && u >= key.t);
      if (passed && !this.firedKeys.has(id)) {
        this.firedKeys.add(id);
        this.onEvent?.(key.ev, this);
      }
    }
    if (clip.loop && u < uPrev) this.firedKeys.clear();

    this.sample(clip, u, this.buf);

    if (this.fade < 1) {
      this.fade = this.fadeDur <= 0 ? 1 : Math.min(1, this.fade + dt / this.fadeDur);
      const f = smoothstep(this.fade);
      for (let j = 0; j < POSE_LEN; j++) {
        this.out[j] = this.prevBuf[j] + (this.buf[j] - this.prevBuf[j]) * f;
      }
    } else {
      this.out.set(this.buf);
    }
  }

  /** write the sampled pose to the bones, plus procedural extras */
  apply(extra) {
    const B = this.rig.bones;
    const o = this.out;
    for (let i = 0; i < BONES.length; i++) {
      const b = B[BONES[i]];
      if (!b) continue;
      const j = i * 3;
      b.rotation.set(o[j] + (extra?.[BONES[i]]?.[0] ?? 0),
                     o[j + 1] + (extra?.[BONES[i]]?.[1] ?? 0),
                     o[j + 2] + (extra?.[BONES[i]]?.[2] ?? 0));
    }
    return { x: o[OFF], y: o[OFF + 1], z: o[OFF + 2] };
  }
}
