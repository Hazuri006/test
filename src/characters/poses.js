/* ============================================================
   Pose library.
   A pose is a flat Float32Array: 19 bones x 3 euler angles,
   plus 3 trailing floats for a root offset (x, y, z).
   Poses are authored as sparse objects in DEGREES and resolved
   against the neutral fighting stance.

   Sign conventions (bones hang along -Y):
     upperArm  X- = forward,  Z+ = out (left side)
     forearm   X- = elbow bend
     thigh     X- = knee up/forward
     shin      X+ = knee bend
     chest     X+ = lean forward
     head      X+ = look down
   ============================================================ */

export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'forearmL', 'handL',
  'shoulderR', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
];
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b, i]));
export const POSE_LEN = BONES.length * 3 + 3;
const OFF = BONES.length * 3;
const D = Math.PI / 180;

/** neutral = grounded fighting stance */
const NEUTRAL_DEF = {
  hips: [0, 10, 0],
  spine: [3, -4, 0],
  chest: [4, -8, 0],
  neck: [-4, 2, 0],
  head: [-2, 8, 0],
  shoulderL: [0, 0, 8], upperArmL: [-24, 8, 22], forearmL: [-78, 10, 0], handL: [0, 0, 0],
  shoulderR: [0, 0, -8], upperArmR: [-30, -8, -26], forearmR: [-88, -10, 0], handR: [0, 0, 0],
  thighL: [-12, 4, 3], shinL: [20, 0, 0], footL: [-8, 0, 0],
  thighR: [10, -6, -4], shinR: [16, 0, 0], footR: [-4, 0, 0],
  o: [0, 0, 0],
};

export function makePose(def = {}) {
  const arr = new Float32Array(POSE_LEN);
  const src = { ...NEUTRAL_DEF, ...def };
  for (const name of BONES) {
    const v = src[name] || [0, 0, 0];
    const i = BONE_INDEX[name] * 3;
    arr[i] = v[0] * D; arr[i + 1] = v[1] * D; arr[i + 2] = v[2] * D;
  }
  const o = src.o || [0, 0, 0];
  arr[OFF] = o[0]; arr[OFF + 1] = o[1]; arr[OFF + 2] = o[2];
  return arr;
}

/** pose built on top of another definition object */
const from = (base, over) => ({ ...base, ...over });

/* ---------------- pose definitions ---------------- */

const P = {};

P.idle = NEUTRAL_DEF;
P.idleBreath = from(NEUTRAL_DEF, {
  chest: [6, -8, 0], neck: [-6, 2, 0],
  upperArmL: [-20, 8, 26], upperArmR: [-26, -8, -30],
  o: [0, 0.035, 0],
});

P.stanceOpen = from(NEUTRAL_DEF, {
  hips: [0, 4, 0], chest: [2, -4, 0],
  upperArmL: [-8, 4, 30], forearmL: [-38, 0, 0],
  upperArmR: [-10, -4, -32], forearmR: [-42, 0, 0],
  thighL: [-6, 6, 4], thighR: [4, -8, -5], shinL: [10, 0, 0], shinR: [10, 0, 0],
});

/* --- locomotion --- */
P.walkA = from(NEUTRAL_DEF, {
  thighL: [-34, 4, 3], shinL: [12, 0, 0], footL: [-14, 0, 0],
  thighR: [28, -6, -4], shinR: [38, 0, 0], footR: [10, 0, 0],
  upperArmL: [-8, 8, 20], upperArmR: [-44, -8, -24],
  chest: [7, -6, 0], o: [0, -0.02, 0],
});
P.walkB = from(NEUTRAL_DEF, {
  thighL: [28, 4, 3], shinL: [38, 0, 0], footL: [10, 0, 0],
  thighR: [-34, -6, -4], shinR: [12, 0, 0], footR: [-14, 0, 0],
  upperArmL: [-44, 8, 20], upperArmR: [-8, -8, -24],
  chest: [7, -6, 0], o: [0, -0.02, 0],
});
P.walkMid = from(NEUTRAL_DEF, { o: [0, 0.03, 0], chest: [5, -6, 0] });

P.dash = from(NEUTRAL_DEF, {
  hips: [0, 16, 0], spine: [10, -6, 0], chest: [16, -10, 0], neck: [-12, 4, 0], head: [-8, 10, 0],
  upperArmL: [58, 14, 14], forearmL: [-24, 0, 0],
  upperArmR: [50, -14, -18], forearmR: [-30, 0, 0],
  thighL: [-40, 4, 3], shinL: [58, 0, 0], footL: [-16, 0, 0],
  thighR: [22, -6, -4], shinR: [46, 0, 0], footR: [16, 0, 0],
  o: [0, -0.08, 0],
});

P.fly = from(NEUTRAL_DEF, {
  hips: [-6, 10, 0], chest: [6, -8, 0],
  upperArmL: [-16, 10, 26], forearmL: [-62, 10, 0],
  upperArmR: [-20, -10, -28], forearmR: [-70, -10, 0],
  thighL: [-26, 6, 6], shinL: [46, 0, 0], footL: [-18, 0, 0],
  thighR: [-14, -6, -8], shinR: [34, 0, 0], footR: [-14, 0, 0],
});
P.flyFast = from(P.fly, {
  hips: [-24, 12, 0], spine: [10, 0, 0], chest: [18, -8, 0], neck: [-22, 0, 0], head: [-16, 8, 0],
  upperArmL: [166, 8, 8], forearmL: [-12, 0, 0],
  upperArmR: [166, -8, -8], forearmR: [-12, 0, 0],
  thighL: [8, 4, 4], shinL: [24, 0, 0], thighR: [14, -4, -4], shinR: [30, 0, 0],
});

/* --- guard --- */
P.guard = from(NEUTRAL_DEF, {
  hips: [0, 22, 0], spine: [8, -6, 0], chest: [10, -14, 0], neck: [-6, 6, 0], head: [4, 12, 0],
  shoulderL: [0, 0, 22], upperArmL: [-56, 26, 42], forearmL: [-112, -30, 0],
  shoulderR: [0, 0, -20], upperArmR: [-52, -22, -44], forearmR: [-108, 26, 0],
  thighL: [-14, 6, 5], shinL: [26, 0, 0],
  thighR: [16, -8, -6], shinR: [26, 0, 0],
  o: [0, -0.05, 0],
});
P.guardHit = from(P.guard, {
  chest: [16, -14, 0], head: [10, 12, 0],
  upperArmL: [-70, 26, 50], upperArmR: [-66, -22, -52],
  o: [0, -0.09, -0.12],
});

/* --- rush combo --- */
P.windup = from(NEUTRAL_DEF, {
  hips: [0, 34, 0], chest: [4, -22, 0], head: [0, 22, 0],
  upperArmR: [-14, -20, -34], forearmR: [-118, -20, 0],
  upperArmL: [-40, 20, 30], forearmL: [-64, 20, 0],
});
P.punchR = from(NEUTRAL_DEF, {
  hips: [0, -18, 0], spine: [6, 10, 0], chest: [8, 22, 0], neck: [-6, -8, 0], head: [-2, -12, 0],
  shoulderR: [0, -14, -4],
  upperArmR: [-92, -6, -10], forearmR: [-6, 0, 0], handR: [0, 0, 0],
  upperArmL: [-6, 16, 28], forearmL: [-108, 20, 0],
  thighL: [-20, 4, 3], shinL: [28, 0, 0],
  thighR: [16, -6, -4], shinR: [22, 0, 0],
  o: [0, -0.02, 0.16],
});
P.punchL = from(NEUTRAL_DEF, {
  hips: [0, 30, 0], spine: [6, -10, 0], chest: [8, -24, 0], neck: [-6, 8, 0], head: [-2, 16, 0],
  shoulderL: [0, 14, 6],
  upperArmL: [-90, 8, 12], forearmL: [-8, 0, 0],
  upperArmR: [-10, -18, -30], forearmR: [-112, -22, 0],
  thighL: [-14, 4, 3], shinL: [22, 0, 0],
  thighR: [18, -6, -4], shinR: [26, 0, 0],
  o: [0, -0.02, 0.16],
});
P.hookL = from(NEUTRAL_DEF, {
  hips: [0, -30, 0], chest: [6, 26, 0], head: [-2, -18, 0],
  upperArmL: [-74, 46, 56], forearmL: [-52, 0, 0],
  upperArmR: [-16, -14, -34], forearmR: [-104, -18, 0],
  o: [0, 0, 0.1],
});
P.uppercut = from(NEUTRAL_DEF, {
  hips: [-8, 16, 0], spine: [-10, 0, 0], chest: [-16, -10, 0], neck: [10, 0, 0], head: [-14, 8, 0],
  upperArmR: [-140, -6, -16], forearmR: [-26, 0, 0],
  upperArmL: [-20, 14, 30], forearmL: [-96, 16, 0],
  thighL: [-30, 4, 3], shinL: [22, 0, 0],
  thighR: [-8, -6, -4], shinR: [40, 0, 0],
  o: [0, 0.14, 0.06],
});
P.kickHigh = from(NEUTRAL_DEF, {
  hips: [0, -34, 0], spine: [-4, 8, 0], chest: [-6, 20, 0], head: [-6, -14, 0],
  thighL: [-96, 10, 22], shinL: [16, 0, 0], footL: [-16, 0, 0],
  thighR: [10, -8, -6], shinR: [14, 0, 0],
  upperArmL: [-40, 30, 54], forearmL: [-70, 0, 0],
  upperArmR: [-26, -30, -60], forearmR: [-58, 0, 0],
  o: [0, -0.04, 0.06],
});
P.spinKick = from(NEUTRAL_DEF, {
  hips: [0, 120, 0], spine: [4, -20, 0], chest: [8, -26, 0], head: [0, -60, 0],
  thighR: [-72, -30, -60], shinR: [10, 0, 0], footR: [-12, 0, 0],
  thighL: [12, 10, 8], shinL: [26, 0, 0],
  upperArmL: [-30, 40, 70], forearmL: [-46, 0, 0],
  upperArmR: [-30, -40, -70], forearmR: [-46, 0, 0],
  o: [0, -0.02, 0.04],
});
P.smashWind = from(NEUTRAL_DEF, {
  hips: [0, 40, 0], spine: [-8, -14, 0], chest: [-14, -24, 0], neck: [8, 8, 0],
  upperArmR: [-160, -20, -40], forearmR: [-40, 0, 0],
  upperArmL: [-30, 24, 36], forearmL: [-70, 0, 0],
  thighR: [16, -8, -6], shinR: [30, 0, 0],
  o: [0, 0.04, -0.06],
});
P.smashHit = from(NEUTRAL_DEF, {
  hips: [0, -26, 0], spine: [22, 14, 0], chest: [26, 24, 0], neck: [-14, -8, 0], head: [8, -14, 0],
  upperArmR: [-30, -4, -8], forearmR: [-14, 0, 0],
  upperArmL: [-6, 16, 26], forearmL: [-96, 18, 0],
  thighL: [-26, 4, 3], shinL: [30, 0, 0],
  thighR: [22, -6, -4], shinR: [34, 0, 0],
  o: [0, -0.12, 0.2],
});

/* --- ki --- */
P.kiCharge = from(NEUTRAL_DEF, {
  hips: [0, 0, 0], spine: [-8, 0, 0], chest: [-14, 0, 0], neck: [14, 0, 0], head: [-16, 0, 0],
  shoulderL: [0, 0, 14], shoulderR: [0, 0, -14],
  upperArmL: [12, 0, 34], forearmL: [-44, 0, 10],
  upperArmR: [12, 0, -34], forearmR: [-44, 0, -10],
  thighL: [-6, 0, 14], shinL: [26, 0, 0], footL: [-12, 0, 0],
  thighR: [-6, 0, -14], shinR: [26, 0, 0], footR: [-12, 0, 0],
  o: [0, -0.06, 0],
});
P.kiChargeHard = from(P.kiCharge, {
  spine: [-14, 0, 0], chest: [-22, 0, 0], head: [-26, 0, 0],
  upperArmL: [20, 0, 46], forearmL: [-30, 0, 14],
  upperArmR: [20, 0, -46], forearmR: [-30, 0, -14],
  thighL: [-10, 0, 18], thighR: [-10, 0, -18], shinL: [34, 0, 0], shinR: [34, 0, 0],
  o: [0, -0.1, 0],
});
P.kiBlastWind = from(NEUTRAL_DEF, {
  hips: [0, 26, 0], chest: [2, -18, 0],
  upperArmR: [-22, -24, -28], forearmR: [-116, -26, 0],
  upperArmL: [-30, 16, 28], forearmL: [-72, 0, 0],
});
P.kiBlastFire = from(NEUTRAL_DEF, {
  hips: [0, -10, 0], spine: [2, 6, 0], chest: [2, 14, 0], head: [-2, -8, 0],
  shoulderR: [0, -10, 0],
  upperArmR: [-96, -4, -12], forearmR: [-4, 0, 0],
  upperArmL: [-14, 14, 26], forearmL: [-100, 16, 0],
  o: [0, 0, 0.05],
});
P.beamCharge = from(NEUTRAL_DEF, {
  hips: [0, 40, 0], spine: [4, -10, 0], chest: [6, -22, 0], neck: [-4, 14, 0], head: [-4, 22, 0],
  shoulderL: [0, 0, 16], shoulderR: [0, 0, -16],
  upperArmL: [-38, 40, 40], forearmL: [-96, -34, 0],
  upperArmR: [-40, 34, -40], forearmR: [-98, 40, 0],
  thighL: [-16, 8, 8], shinL: [30, 0, 0],
  thighR: [20, -10, -8], shinR: [34, 0, 0],
  o: [0, -0.09, -0.04],
});
P.beamFire = from(NEUTRAL_DEF, {
  hips: [0, -6, 0], spine: [4, 4, 0], chest: [6, 8, 0], neck: [-6, 0, 0], head: [-4, -4, 0],
  shoulderL: [0, -6, 4], shoulderR: [0, 6, -4],
  upperArmL: [-88, 12, 14], forearmL: [-8, -14, 0],
  upperArmR: [-88, -12, -14], forearmR: [-8, 14, 0],
  thighL: [-24, 6, 5], shinL: [30, 0, 0],
  thighR: [24, -8, -6], shinR: [36, 0, 0],
  o: [0, -0.04, 0.16],
});
P.superPose = from(NEUTRAL_DEF, {
  hips: [0, 0, 0], spine: [-6, 0, 0], chest: [-10, 0, 0], neck: [12, 0, 0], head: [-16, 0, 0],
  upperArmR: [-170, -10, -22], forearmR: [-8, 0, 0],
  upperArmL: [-16, 0, 24], forearmL: [-52, 0, 0],
  thighL: [-6, 0, 8], thighR: [-6, 0, -8], shinL: [14, 0, 0], shinR: [14, 0, 0],
  o: [0, 0.02, 0],
});
P.ultCharge = from(NEUTRAL_DEF, {
  hips: [0, 0, 0], spine: [-12, 0, 0], chest: [-20, 0, 0], neck: [18, 0, 0], head: [-24, 0, 0],
  upperArmL: [-30, 0, 62], forearmL: [-24, 0, 26],
  upperArmR: [-30, 0, -62], forearmR: [-24, 0, -26],
  thighL: [-10, 0, 16], thighR: [-10, 0, -16], shinL: [30, 0, 0], shinR: [30, 0, 0],
  o: [0, -0.05, 0],
});
P.ultFire = from(NEUTRAL_DEF, {
  hips: [0, 0, 0], spine: [10, 0, 0], chest: [16, 0, 0], neck: [-10, 0, 0], head: [-4, 0, 0],
  upperArmL: [-96, 8, 16], forearmL: [-6, -10, 0],
  upperArmR: [-96, -8, -16], forearmR: [-6, 10, 0],
  thighL: [-28, 6, 6], shinL: [34, 0, 0],
  thighR: [26, -6, -6], shinR: [38, 0, 0],
  o: [0, -0.06, 0.2],
});

/* --- reactions --- */
P.hitLight = from(NEUTRAL_DEF, {
  hips: [0, 6, 0], spine: [-8, 0, 0], chest: [-14, -6, 0], neck: [16, 0, 0], head: [-24, -10, 0],
  upperArmL: [-16, 14, 34], forearmL: [-56, 0, 0],
  upperArmR: [-14, -14, -36], forearmR: [-50, 0, 0],
  o: [0, -0.02, -0.1],
});
P.hitBody = from(NEUTRAL_DEF, {
  hips: [0, 4, 0], spine: [16, 0, 0], chest: [24, -4, 0], neck: [-16, 0, 0], head: [16, -6, 0],
  upperArmL: [-40, 20, 24], forearmL: [-96, 0, 0],
  upperArmR: [-38, -20, -26], forearmR: [-92, 0, 0],
  thighL: [-24, 4, 4], shinL: [40, 0, 0],
  thighR: [-18, -4, -4], shinR: [36, 0, 0],
  o: [0, -0.1, -0.14],
});
P.blowAway = from(NEUTRAL_DEF, {
  hips: [-16, 0, 0], spine: [-14, 0, 0], chest: [-22, 0, 0], neck: [18, 0, 0], head: [-10, 0, 0],
  upperArmL: [40, 20, 62], forearmL: [-30, 0, 0],
  upperArmR: [40, -20, -64], forearmR: [-30, 0, 0],
  thighL: [-34, 6, 10], shinL: [56, 0, 0],
  thighR: [-24, -6, -12], shinR: [44, 0, 0],
});
P.tumble = from(P.blowAway, {
  hips: [-40, 0, 0], chest: [-10, 0, 0],
  thighL: [-70, 6, 12], shinL: [80, 0, 0],
  thighR: [-50, -6, -14], shinR: [70, 0, 0],
});
P.knockdown = from(NEUTRAL_DEF, {
  hips: [-86, 0, 0], spine: [8, 0, 0], chest: [10, 0, 0], neck: [-16, 0, 0], head: [-20, 0, 0],
  upperArmL: [76, 10, 68], forearmL: [-26, 0, 0],
  upperArmR: [76, -10, -70], forearmR: [-26, 0, 0],
  thighL: [-84, 6, 12], shinL: [24, 0, 0], footL: [-24, 0, 0],
  thighR: [-80, -6, -14], shinR: [30, 0, 0], footR: [-24, 0, 0],
  o: [0, -0.86, 0],
});
P.getUp = from(NEUTRAL_DEF, {
  hips: [-20, 0, 0], spine: [18, 0, 0], chest: [22, 0, 0], neck: [-18, 0, 0],
  upperArmL: [-24, 16, 40], forearmL: [-70, 0, 0],
  upperArmR: [-24, -16, -42], forearmR: [-70, 0, 0],
  thighL: [-70, 6, 10], shinL: [76, 0, 0],
  thighR: [-40, -6, -10], shinR: [70, 0, 0],
  o: [0, -0.4, 0],
});

/* --- flavour --- */
P.victory = from(NEUTRAL_DEF, {
  hips: [0, 12, 0], spine: [-6, 0, 0], chest: [-8, -6, 0], neck: [6, 0, 0], head: [-8, 10, 0],
  upperArmR: [-164, -14, -26], forearmR: [-16, 0, 0],
  upperArmL: [-10, 10, 22], forearmL: [-40, 0, 0],
  thighL: [-8, 6, 6], shinL: [16, 0, 0], thighR: [6, -6, -6], shinR: [14, 0, 0],
});
P.victory2 = from(P.victory, {
  hips: [0, -8, 0], chest: [-4, 8, 0], head: [-6, -8, 0],
  upperArmR: [-150, -14, -40], o: [0, 0.05, 0],
});
P.defeat = from(P.knockdown, { head: [-6, 24, 0], hips: [-88, 10, 0] });
P.taunt = from(NEUTRAL_DEF, {
  hips: [0, -14, 0], chest: [-6, 12, 0], neck: [4, 0, 0], head: [-6, -12, 0],
  upperArmR: [-52, -18, -24], forearmR: [-116, -30, 0],
  upperArmL: [10, 0, 16], forearmL: [-20, 0, 0],
});
P.entrance = from(NEUTRAL_DEF, {
  hips: [0, 0, 0], spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-6, 0, 0],
  upperArmL: [-6, 0, 18], forearmL: [-16, 0, 0],
  upperArmR: [-6, 0, -18], forearmR: [-16, 0, 0],
  thighL: [-2, 0, 5], thighR: [-2, 0, -5], shinL: [6, 0, 0], shinR: [6, 0, 0],
});
P.sparkBurst = from(P.kiChargeHard, {
  spine: [-20, 0, 0], chest: [-30, 0, 0], head: [-34, 0, 0],
  upperArmL: [34, 0, 58], forearmL: [-20, 0, 20],
  upperArmR: [34, 0, -58], forearmR: [-20, 0, -20],
  o: [0, 0.06, 0],
});

/* ---------------- resolve ---------------- */
const POSES = {};
for (const k in P) POSES[k] = makePose(P[k]);
export { POSES };

/* ---------------- clips ---------------- */
/* key: { t (0..1 of dur), pose, ev? }                         */

const C = (name, dur, keys, opts = {}) => ({ name, dur, keys, loop: !!opts.loop, ...opts });

export const CLIPS = {
  idle: C('idle', 2.6, [
    { t: 0, p: 'idle' }, { t: 0.5, p: 'idleBreath' }, { t: 1, p: 'idle' },
  ], { loop: true }),

  idleAir: C('idleAir', 3.0, [
    { t: 0, p: 'fly' }, { t: 0.5, p: 'idleBreath' }, { t: 1, p: 'fly' },
  ], { loop: true }),

  walk: C('walk', 0.72, [
    { t: 0, p: 'walkA' }, { t: 0.25, p: 'walkMid' },
    { t: 0.5, p: 'walkB' }, { t: 0.75, p: 'walkMid' }, { t: 1, p: 'walkA' },
  ], { loop: true }),

  dash: C('dash', 0.5, [{ t: 0, p: 'dash' }, { t: 1, p: 'dash' }], { loop: true }),
  fly: C('fly', 3.2, [{ t: 0, p: 'fly' }, { t: 0.5, p: 'idleBreath' }, { t: 1, p: 'fly' }], { loop: true }),
  flyFast: C('flyFast', 0.6, [{ t: 0, p: 'flyFast' }, { t: 1, p: 'flyFast' }], { loop: true }),

  guard: C('guard', 0.4, [{ t: 0, p: 'guard' }, { t: 1, p: 'guard' }], { loop: true }),
  guardHit: C('guardHit', 0.22, [
    { t: 0, p: 'guardHit' }, { t: 1, p: 'guard' },
  ]),

  rush1: C('rush1', 0.34, [
    { t: 0, p: 'windup' }, { t: 0.4, p: 'punchR', ev: 'hit' }, { t: 0.62, p: 'punchR' }, { t: 1, p: 'stanceOpen' },
  ]),
  rush2: C('rush2', 0.32, [
    { t: 0, p: 'punchR' }, { t: 0.4, p: 'punchL', ev: 'hit' }, { t: 0.62, p: 'punchL' }, { t: 1, p: 'stanceOpen' },
  ]),
  rush3: C('rush3', 0.36, [
    { t: 0, p: 'punchL' }, { t: 0.42, p: 'hookL', ev: 'hit' }, { t: 0.66, p: 'hookL' }, { t: 1, p: 'stanceOpen' },
  ]),
  rush4: C('rush4', 0.42, [
    { t: 0, p: 'stanceOpen' }, { t: 0.34, p: 'kickHigh', ev: 'hit' }, { t: 0.6, p: 'kickHigh' }, { t: 1, p: 'stanceOpen' },
  ]),
  rush5: C('rush5', 0.5, [
    { t: 0, p: 'windup' }, { t: 0.38, p: 'spinKick', ev: 'hit' }, { t: 0.66, p: 'spinKick' }, { t: 1, p: 'stanceOpen' },
  ]),

  smash: C('smash', 0.62, [
    { t: 0, p: 'stanceOpen' }, { t: 0.32, p: 'smashWind' },
    { t: 0.56, p: 'smashHit', ev: 'hit' }, { t: 0.74, p: 'smashHit' }, { t: 1, p: 'stanceOpen' },
  ]),
  launcher: C('launcher', 0.56, [
    { t: 0, p: 'stanceOpen' }, { t: 0.26, p: 'windup' },
    { t: 0.5, p: 'uppercut', ev: 'hit' }, { t: 0.72, p: 'uppercut' }, { t: 1, p: 'stanceOpen' },
  ]),

  kiblast: C('kiblast', 0.42, [
    { t: 0, p: 'kiBlastWind' }, { t: 0.38, p: 'kiBlastFire', ev: 'fire' },
    { t: 0.6, p: 'kiBlastFire' }, { t: 1, p: 'stanceOpen' },
  ]),

  charge: C('charge', 0.9, [
    { t: 0, p: 'kiCharge' }, { t: 0.5, p: 'kiChargeHard' }, { t: 1, p: 'kiCharge' },
  ], { loop: true }),

  sparkBurst: C('sparkBurst', 0.85, [
    { t: 0, p: 'kiCharge' }, { t: 0.25, p: 'sparkBurst', ev: 'burst' },
    { t: 0.7, p: 'sparkBurst' }, { t: 1, p: 'stanceOpen' },
  ]),

  beam: C('beam', 2.1, [
    { t: 0, p: 'stanceOpen' }, { t: 0.14, p: 'beamCharge', ev: 'charge' },
    { t: 0.42, p: 'beamCharge' }, { t: 0.5, p: 'beamFire', ev: 'fire' },
    { t: 0.9, p: 'beamFire' }, { t: 1, p: 'stanceOpen' },
  ]),

  super: C('super', 1.1, [
    { t: 0, p: 'stanceOpen' }, { t: 0.22, p: 'superPose', ev: 'charge' },
    { t: 0.45, p: 'superPose' }, { t: 0.55, p: 'kiBlastFire', ev: 'fire' },
    { t: 0.8, p: 'kiBlastFire' }, { t: 1, p: 'stanceOpen' },
  ]),

  ultimate: C('ultimate', 3.4, [
    { t: 0, p: 'stanceOpen' }, { t: 0.1, p: 'ultCharge', ev: 'charge' },
    { t: 0.5, p: 'ultCharge' }, { t: 0.58, p: 'ultFire', ev: 'fire' },
    { t: 0.94, p: 'ultFire' }, { t: 1, p: 'stanceOpen' },
  ]),

  hitLight: C('hitLight', 0.26, [
    { t: 0, p: 'hitLight' }, { t: 0.55, p: 'hitLight' }, { t: 1, p: 'stanceOpen' },
  ]),
  hitBody: C('hitBody', 0.32, [
    { t: 0, p: 'hitBody' }, { t: 0.55, p: 'hitBody' }, { t: 1, p: 'stanceOpen' },
  ]),
  blowAway: C('blowAway', 0.9, [
    { t: 0, p: 'blowAway' }, { t: 0.5, p: 'tumble' }, { t: 1, p: 'blowAway' },
  ], { loop: true }),
  knockdown: C('knockdown', 0.5, [
    { t: 0, p: 'tumble' }, { t: 0.5, p: 'knockdown' }, { t: 1, p: 'knockdown' },
  ]),
  getUp: C('getUp', 0.7, [
    { t: 0, p: 'knockdown' }, { t: 0.45, p: 'getUp' }, { t: 1, p: 'stanceOpen' },
  ]),

  victory: C('victory', 2.4, [
    { t: 0, p: 'stanceOpen' }, { t: 0.25, p: 'victory' },
    { t: 0.6, p: 'victory2' }, { t: 1, p: 'victory' },
  ], { loop: true }),
  defeat: C('defeat', 1.2, [
    { t: 0, p: 'tumble' }, { t: 0.6, p: 'defeat' }, { t: 1, p: 'defeat' },
  ]),
  taunt: C('taunt', 1.1, [
    { t: 0, p: 'stanceOpen' }, { t: 0.3, p: 'taunt' }, { t: 0.7, p: 'taunt' }, { t: 1, p: 'stanceOpen' },
  ]),
  entrance: C('entrance', 1.6, [
    { t: 0, p: 'entrance' }, { t: 0.5, p: 'entrance' }, { t: 1, p: 'stanceOpen' },
  ]),
  pose: C('pose', 4.0, [
    { t: 0, p: 'stanceOpen' }, { t: 0.35, p: 'victory' }, { t: 0.7, p: 'taunt' }, { t: 1, p: 'stanceOpen' },
  ], { loop: true }),
};
