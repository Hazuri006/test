'use strict';
/* ============================================================================
   character.js — skinned characters: the skeleton, the skinning palette, and
   the locomotion that drives it.

   The astronaut arrives from playermodel.js with 25 joints, a bind pose and a
   single idle clip.  There is no walk, no run and no jump in the source, so
   they are generated here.

   The trick that makes procedural locomotion tractable is doing it in *parent*
   space.  To swing a thigh forward you want to rotate it about the character's
   left-right axis — but the joint's local axes are whatever the rigger left
   them as, and on a Character Creator skeleton they are nothing so convenient.
   Rotating the limb about a world axis `a` means pre-multiplying its local
   rotation by that axis expressed in its parent's frame, which forward
   kinematics has already computed by the time it reaches the child.  So the
   pose pass walks the hierarchy once, and each control joint asks for its
   swing in terms it understands.

   Phase is driven by distance travelled, not by time, so the feet do not skate
   when the character speeds up or slows down.
   ============================================================================ */

const CHAR_CFG = {
  /* Metres of ground covered per full stride cycle, per gait.  Getting these
     close to the real stride length is what stops the feet sliding. */
  walkStride: 3.4,
  runStride: 5.6,
  walkSpeed: 6.4,       // matches FOOT.walkSpeed
  runSpeed: 13.5
};

/* --------------------------------------------------------------------------
   Skinned mesh + skeleton, decoded once from a baked model.
   -------------------------------------------------------------------------- */
class SkinnedModel {
  constructor(gl, M) {
    this.M = M;
    this.jointCount = M.joints.length;
    if (this.jointCount > SKIN_MAX_JOINTS) {
      throw new Error('skinned model has ' + this.jointCount + ' joints, shader allows ' + SKIN_MAX_JOINTS);
    }

    const pos = new Int16Array(decodeBase64(M.pos));
    const nrm = new Int8Array(decodeBase64(M.nrm));
    const uv = new Uint16Array(decodeBase64(M.uv));
    const jnt = new Uint8Array(decodeBase64(M.jnt));
    const wgt = new Uint8Array(decodeBase64(M.wgt));
    const idx = new Uint16Array(decodeBase64(M.idx));

    const n = M.vertexCount;
    const v = new Float32Array(n * 16);
    for (let i = 0; i < n; i++) {
      const s = i * 16, q = i * 3, u = i * 2, j = i * 4;
      v[s]     = pos[q]     / 32767 * M.posScale[0] + M.posBias[0];
      v[s + 1] = pos[q + 1] / 32767 * M.posScale[1] + M.posBias[1];
      v[s + 2] = pos[q + 2] / 32767 * M.posScale[2] + M.posBias[2];
      v[s + 3] = nrm[q] / 127; v[s + 4] = nrm[q + 1] / 127; v[s + 5] = nrm[q + 2] / 127;
      v[s + 6] = uv[u] / 65535; v[s + 7] = uv[u + 1] / 65535;
      v[s + 8] = jnt[j]; v[s + 9] = jnt[j + 1]; v[s + 10] = jnt[j + 2]; v[s + 11] = jnt[j + 3];
      /* Renormalise: the weights were quantised to bytes independently, so
         they no longer sum to exactly one and the model would breathe. */
      const w0 = wgt[j], w1 = wgt[j + 1], w2 = wgt[j + 2], w3 = wgt[j + 3];
      const inv = 1 / Math.max(w0 + w1 + w2 + w3, 1);
      v[s + 12] = w0 * inv; v[s + 13] = w1 * inv; v[s + 14] = w2 * inv; v[s + 15] = w3 * inv;
    }

    this.mesh = new Mesh(gl, [
      { name: 'aPos', size: 3 }, { name: 'aNormal', size: 3 }, { name: 'aUV', size: 2 },
      { name: 'aJoint', size: 4 }, { name: 'aWeight', size: 4 }
    ]);
    this.mesh.upload(v, idx);

    this.ibm = new Float32Array(decodeBase64(M.ibm));       // column-major mat4 each
    this.idleRot = new Int16Array(decodeBase64(M.idle.rot));
    this.idlePos = new Float32Array(decodeBase64(M.idle.pos));

    this.parents = new Int32Array(this.jointCount);
    this.byName = {};
    for (let i = 0; i < this.jointCount; i++) {
      this.parents[i] = M.joints[i].parent;
      this.byName[M.joints[i].name] = i;
    }
  }

  jointOf(name) {
    const i = this.byName[name];
    return i === undefined ? -1 : i;
  }
}

/* --------------------------------------------------------------------------
   A pose: local TRS per joint, forward kinematics, and the palette upload.
   -------------------------------------------------------------------------- */
class Pose {
  constructor(model) {
    this.model = model;
    const n = model.jointCount;
    this.localT = new Float32Array(n * 3);
    this.localR = new Float32Array(n * 4);
    this.scale = new Float32Array(n);
    /* World rotation and position per joint, kept as quaternion + vector
       because every joint on this rig has a uniform scale — matrices would
       cost three times the work for nothing. */
    this.worldR = new Float32Array(n * 4);
    this.worldT = new Float32Array(n * 3);
    this.worldS = new Float32Array(n);
    this.palette = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) this.scale[i] = model.M.joints[i].s;
    this.reset();
  }

  reset() {
    const J = this.model.M.joints;
    for (let i = 0; i < J.length; i++) {
      const t = J[i].t, r = J[i].r;
      this.localT[i * 3] = t[0]; this.localT[i * 3 + 1] = t[1]; this.localT[i * 3 + 2] = t[2];
      this.localR[i * 4] = r[0]; this.localR[i * 4 + 1] = r[1];
      this.localR[i * 4 + 2] = r[2]; this.localR[i * 4 + 3] = r[3];
    }
  }

  /* Blend the baked idle clip into the local pose at time t (seconds). */
  sampleIdle(time, weight) {
    const M = this.model.M, n = this.model.jointCount;
    const F = M.idle.frames, hz = M.idle.hz;
    const x = (time * hz) % F;
    const f0 = Math.floor(x), f1 = (f0 + 1) % F, u = x - f0;
    const R = this.model.idleRot, T = this.model.idlePos;
    for (let i = 0; i < n; i++) {
      const a = (f0 * n + i) * 4, b = (f1 * n + i) * 4;
      _cqa[0] = R[a] / 32767; _cqa[1] = R[a + 1] / 32767;
      _cqa[2] = R[a + 2] / 32767; _cqa[3] = R[a + 3] / 32767;
      _cqb[0] = R[b] / 32767; _cqb[1] = R[b + 1] / 32767;
      _cqb[2] = R[b + 2] / 32767; _cqb[3] = R[b + 3] / 32767;
      Q4.slerp(_cqa, _cqa, _cqb, u);
      const o = i * 4;
      if (weight >= 0.999) {
        this.localR[o] = _cqa[0]; this.localR[o + 1] = _cqa[1];
        this.localR[o + 2] = _cqa[2]; this.localR[o + 3] = _cqa[3];
      } else {
        _cqb[0] = this.localR[o]; _cqb[1] = this.localR[o + 1];
        _cqb[2] = this.localR[o + 2]; _cqb[3] = this.localR[o + 3];
        Q4.slerp(_cqa, _cqb, _cqa, weight);
        this.localR[o] = _cqa[0]; this.localR[o + 1] = _cqa[1];
        this.localR[o + 2] = _cqa[2]; this.localR[o + 3] = _cqa[3];
      }
      const p = (f0 * n + i) * 3, p1 = (f1 * n + i) * 3, q = i * 3;
      this.localT[q]     = lerp(T[p], T[p1], u);
      this.localT[q + 1] = lerp(T[p + 1], T[p1 + 1], u);
      this.localT[q + 2] = lerp(T[p + 2], T[p1 + 2], u);
    }
  }

  /* Rotate joint `j` and everything under it about a world-space axis.  Must be
     called from inside the FK walk, after the parent's world frame is known. */
  swing(j, axisWorld, angleIn) {
    /* Nothing on a body bends past this, and a runaway term should read as a
       stiff pose rather than as a limb folded through the torso. */
    const angle = clamp(angleIn, -1.7, 1.7);
    if (Math.abs(angle) < 1e-5) return;
    const p = this.model.parents[j];
    if (p >= 0) {
      _cqa[0] = -this.worldR[p * 4]; _cqa[1] = -this.worldR[p * 4 + 1];
      _cqa[2] = -this.worldR[p * 4 + 2]; _cqa[3] = this.worldR[p * 4 + 3];
      V3.rotQuat(_cax, axisWorld, _cqa);
    } else {
      V3.copy(_cax, axisWorld);
    }
    Q4.fromAxisAngle(_cqb, _cax, angle);
    const o = j * 4;
    _cqa[0] = this.localR[o]; _cqa[1] = this.localR[o + 1];
    _cqa[2] = this.localR[o + 2]; _cqa[3] = this.localR[o + 3];
    Q4.mul(_cqa, _cqb, _cqa);
    this.localR[o] = _cqa[0]; this.localR[o + 1] = _cqa[1];
    this.localR[o + 2] = _cqa[2]; this.localR[o + 3] = _cqa[3];
  }

  /* Compose one joint's world frame from its parent's. */
  fkJoint(i) {
    const p = this.model.parents[i];
    const o4 = i * 4, o3 = i * 3;
    if (p < 0) {
      this.worldR[o4] = this.localR[o4]; this.worldR[o4 + 1] = this.localR[o4 + 1];
      this.worldR[o4 + 2] = this.localR[o4 + 2]; this.worldR[o4 + 3] = this.localR[o4 + 3];
      this.worldT[o3] = this.localT[o3]; this.worldT[o3 + 1] = this.localT[o3 + 1];
      this.worldT[o3 + 2] = this.localT[o3 + 2];
      this.worldS[i] = this.scale[i];
      return;
    }
    const p4 = p * 4, p3 = p * 3, ps = this.worldS[p];
    _cqa[0] = this.worldR[p4]; _cqa[1] = this.worldR[p4 + 1];
    _cqa[2] = this.worldR[p4 + 2]; _cqa[3] = this.worldR[p4 + 3];
    _cqb[0] = this.localR[o4]; _cqb[1] = this.localR[o4 + 1];
    _cqb[2] = this.localR[o4 + 2]; _cqb[3] = this.localR[o4 + 3];
    Q4.mul(_cqc, _cqa, _cqb);
    this.worldR[o4] = _cqc[0]; this.worldR[o4 + 1] = _cqc[1];
    this.worldR[o4 + 2] = _cqc[2]; this.worldR[o4 + 3] = _cqc[3];

    V3.set(_cax, this.localT[o3] * ps, this.localT[o3 + 1] * ps, this.localT[o3 + 2] * ps);
    V3.rotQuat(_cax, _cax, _cqa);
    this.worldT[o3] = this.worldT[p3] + _cax[0];
    this.worldT[o3 + 1] = this.worldT[p3 + 1] + _cax[1];
    this.worldT[o3 + 2] = this.worldT[p3 + 2] + _cax[2];
    this.worldS[i] = ps * this.scale[i];
  }

  /* Full FK, then world * inverseBind into the row-major 3x4 palette. */
  build(perJoint) {
    const n = this.model.jointCount, ibm = this.model.ibm;
    for (let i = 0; i < n; i++) {
      if (perJoint) perJoint(i);
      this.fkJoint(i);
    }
    for (let i = 0; i < n; i++) {
      const o4 = i * 4, o3 = i * 3, s = this.worldS[i];
      _cqa[0] = this.worldR[o4]; _cqa[1] = this.worldR[o4 + 1];
      _cqa[2] = this.worldR[o4 + 2]; _cqa[3] = this.worldR[o4 + 3];
      Q4.toMat3(_cm3, _cqa);
      /* world = T * R * S, as a row-major 3x4 */
      _cw[0] = _cm3[0] * s; _cw[1] = _cm3[3] * s; _cw[2] = _cm3[6] * s; _cw[3] = this.worldT[o3];
      _cw[4] = _cm3[1] * s; _cw[5] = _cm3[4] * s; _cw[6] = _cm3[7] * s; _cw[7] = this.worldT[o3 + 1];
      _cw[8] = _cm3[2] * s; _cw[9] = _cm3[5] * s; _cw[10] = _cm3[8] * s; _cw[11] = this.worldT[o3 + 2];

      const b = i * 16, d = i * 12;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          /* ibm is column-major: element (r,c) is ibm[c*4+r]. */
          this.palette[d + r * 4 + c] =
            _cw[r * 4] * ibm[b + c * 4] +
            _cw[r * 4 + 1] * ibm[b + c * 4 + 1] +
            _cw[r * 4 + 2] * ibm[b + c * 4 + 2] +
            (c === 3 ? _cw[r * 4 + 3] : 0);
        }
      }
    }
    return this.palette;
  }
}

/* --------------------------------------------------------------------------
   Locomotion: idle / walk / run / jump, layered on the baked idle.
   -------------------------------------------------------------------------- */
class PlayerAnimator {
  constructor(model) {
    this.model = model;
    this.pose = new Pose(model);
    this.time = 0;
    this.phase = 0;          // stride phase in radians, driven by distance
    this.gait = 0;           // 0 idle .. 1 walk .. 2 run
    this.air = 0;            // 0 grounded .. 1 airborne
    this.lean = 0;
    this.turn = 0;

    const j = n => model.jointOf(n);
    this.J = {
      hip: j('CC_Base_Hip'), waist: j('CC_Base_Waist'),
      spine1: j('CC_Base_Spine01'), spine2: j('CC_Base_Spine02'),
      neck: j('CC_Base_NeckTwist01'), head: j('CC_Base_Head'),
      lThigh: j('CC_Base_L_Thigh'), lCalf: j('CC_Base_L_Calf'),
      lFoot: j('CC_Base_L_Foot'), lToe: j('CC_Base_L_ToeBase'),
      rThigh: j('CC_Base_R_Thigh'), rCalf: j('CC_Base_R_Calf'),
      rFoot: j('CC_Base_R_Foot'), rToe: j('CC_Base_R_ToeBase'),
      lArm: j('CC_Base_L_Upperarm'), lFore: j('CC_Base_L_Forearm'),
      rArm: j('CC_Base_R_Upperarm'), rFore: j('CC_Base_R_Forearm'),
      lClav: j('CC_Base_L_Clavicle'), rClav: j('CC_Base_R_Clavicle')
    };
    /* Model-space axes.  The bake leaves the character facing +Z with +Y up, and
       the draw applies PLAYER_MODEL.yaw to turn it around; working in model
       space here keeps the animation independent of that. */
    this.axSide = V3.new(1, 0, 0);      // pitch limbs fore and aft
    this.axUp = V3.new(0, 1, 0);        // yaw
    this.axFwd = V3.new(0, 0, 1);       // roll / splay
  }

  /* `speed` is ground speed in m/s, `grounded` and `vertVel` come from the
     walker.  `turnRate` is radians per second of heading change. */
  update(dt, speed, grounded, vertVel, turnRate) {
    this.time += dt;

    const run = saturate((speed - CHAR_CFG.walkSpeed * 0.8) /
      Math.max(CHAR_CFG.runSpeed - CHAR_CFG.walkSpeed * 0.8, 0.1));
    const moving = saturate(speed / 1.6);
    this.gait = damp(this.gait, moving * (1 + run), 11, dt);
    this.air = damp(this.air, grounded ? 0 : 1, 8, dt);
    this.turn = damp(this.turn, clamp(turnRate * 0.22, -0.5, 0.5), 6, dt);
    this.lean = damp(this.lean, saturate(speed / CHAR_CFG.runSpeed) * 0.30, 5, dt);

    /* Distance-driven phase: one cycle per stride length, so contact points
       stay put on the ground however the speed changes. */
    const stride = lerp(CHAR_CFG.walkStride, CHAR_CFG.runStride, run);
    if (grounded) this.phase += (speed / Math.max(stride, 0.5)) * TAU * dt;
    else this.phase += dt * 2.0;
    if (this.phase > 1e6) this.phase -= 1e6;

    this.vertVel = damp(this.vertVel || 0, vertVel, 10, dt);
  }

  /* Build the skinning palette for this frame. */
  palette() {
    const P = this.pose, J = this.J;
    /* The idle is always the base layer: even at a run it keeps the shoulders
       and spine alive, and it is the whole pose when standing still. */
    P.sampleIdle(this.time, 1);

    const g = this.gait;
    const walkAmt = saturate(g) * (1 - this.air);
    const runAmt = saturate(g - 1) * (1 - this.air);
    const ph = this.phase;

    /* Sign convention, measured against the rig rather than assumed: a
       positive swing about the lateral axis carries a hanging limb BEHIND the
       character.  So a thigh swinging forward is negative, and a knee — which
       only ever folds the heel up and back — is always positive.  Getting that
       one backwards folds the knee the wrong way and throws the shin out in
       front of the body, which is exactly what it looks like. */
    const sL = Math.sin(ph), sR = Math.sin(ph + PI);
    /* Knee flexion peaks just after the leg reaches its rearmost point: that is
       toe-off, where the heel comes up and the foot has to clear the ground. */
    const kL = Math.max(0, Math.sin(ph - 0.35));
    const kR = Math.max(0, Math.sin(ph + PI - 0.35));
    const aL = Math.max(0, Math.sin(ph - 0.10));
    const aR = Math.max(0, Math.sin(ph + PI - 0.10));
    const c = Math.cos(ph);
    const s2 = Math.sin(ph * 2);

    /* Amplitudes grow from walk to run. */
    const legSwing = (0.40 + runAmt * 0.26) * walkAmt;
    const kneeBend = (0.70 + runAmt * 0.55) * walkAmt;
    const armSwing = (0.28 + runAmt * 0.26) * walkAmt;
    const elbow = (0.30 + runAmt * 0.45) * walkAmt;
    const bounce = (0.030 + runAmt * 0.045) * walkAmt;

    const air = this.air;
    const fall = saturate(-this.vertVel / 8);
    const rise = saturate(this.vertVel / 6);
    /* Airborne: knees fold, thighs come up, arms drop back and out.  Coming
       down the legs reach for the ground again. */
    const tuck = air * (0.45 + rise * 0.35) * (1 - fall * 0.7);

    P.build((i) => {
      switch (i) {
        case J.hip: {
          /* Vertical bob twice a stride, plus a lean into the direction of
             travel and a counter-roll from the turn.  The hip's translation is
             in the rig's centimetres. */
          const o3 = i * 3;
          P.localT[o3 + 1] += (Math.abs(s2) * bounce - bounce * 0.5) * 100;
          P.swing(i, this.axSide, this.lean * (1 - air) + air * (fall * 0.25 - rise * 0.20));
          P.swing(i, this.axFwd, -this.turn * 0.5 + c * 0.05 * walkAmt);
          P.swing(i, this.axUp, sL * 0.09 * walkAmt);
          break;
        }
        case J.spine2:
          P.swing(i, this.axUp, -sL * 0.11 * walkAmt);
          P.swing(i, this.axSide, this.lean * 0.35);
          break;
        case J.head:
          /* Keep the head level as the body leans — the eyes lead the run. */
          P.swing(i, this.axSide, -this.lean * 0.9 - air * fall * 0.25);
          break;

        /* ---- legs ---- */
        case J.lThigh: P.swing(i, this.axSide, sL * legSwing - tuck); break;
        case J.lCalf:  P.swing(i, this.axSide, kL * kneeBend + 0.05 * walkAmt + air * (0.95 - fall * 0.55)); break;
        case J.lFoot:  P.swing(i, this.axSide, (aL * 0.30 - 0.08) * walkAmt + air * 0.30); break;
        case J.rThigh: P.swing(i, this.axSide, sR * legSwing - tuck * 0.55); break;
        case J.rCalf:  P.swing(i, this.axSide, kR * kneeBend + 0.05 * walkAmt + air * (0.55 - fall * 0.30)); break;
        case J.rFoot:  P.swing(i, this.axSide, (aR * 0.30 - 0.08) * walkAmt + air * 0.22); break;

        /* ---- arms: opposite the same-side leg, elbows always a little bent -- */
        case J.lArm:
          P.swing(i, this.axSide, -sL * armSwing + air * 0.30);
          P.swing(i, this.axFwd, -runAmt * 0.14 - air * 0.22);
          break;
        case J.lFore: P.swing(i, this.axSide, -(elbow + Math.max(-sL, 0) * 0.22 * walkAmt) - air * 0.45); break;
        case J.rArm:
          P.swing(i, this.axSide, -sR * armSwing + air * 0.30);
          P.swing(i, this.axFwd, runAmt * 0.14 + air * 0.22);
          break;
        case J.rFore: P.swing(i, this.axSide, -(elbow + Math.max(-sR, 0) * 0.22 * walkAmt) - air * 0.45); break;
      }
    });
    return P.palette;
  }
}

const _cqa = Q4.new(), _cqb = Q4.new(), _cqc = Q4.new();
const _cax = V3.new();
const _cm3 = new Float32Array(9);
const _cw = new Float32Array(12);
