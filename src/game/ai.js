/* ============================================================
   AI — drives a Fighter through a synthetic input device, so
   CPU and human go through exactly the same code path.
   ============================================================ */
import { ACTIONS } from '../core/input.js';
import { clamp, rand, pick } from '../core/utils.js';

class FakeInput {
  constructor() {
    this.state = {}; this.prev = {};
    this.axis = { x: 0, y: 0 };
    for (const a of ACTIONS) { this.state[a] = false; this.prev[a] = false; }
    this.mvx = 0; this.mvy = 0;
  }
  begin() { Object.assign(this.prev, this.state); for (const a of ACTIONS) this.state[a] = false; }
  set(a, v = true) { this.state[a] = v; }
  held(a) { return !!this.state[a]; }
  pressed(a) { return !!this.state[a] && !this.prev[a]; }
  released(a) { return !this.state[a] && !!this.prev[a]; }
  move() {
    const m = Math.hypot(this.mvx, this.mvy);
    return { x: this.mvx, y: this.mvy, mag: Math.min(1, m) };
  }
}

/**
 * Difficulty ladder. Beyond the behaviour weights, each level scales the
 * damage the CPU deals (`dmg`) and how fast it builds ki (`ki`), so the
 * easy end is actually forgiving instead of merely slower to react.
 */
export const DIFFICULTIES = [
  {
    id: 0, name: 'TRÈS FACILE', sub: 'Idéal pour apprendre les commandes',
    react: 0.8, aggro: 0.18, guard: 0.08, vanish: 0, combo: 0.12, blast: 0.1,
    think: [1.0, 1.8], dmg: 0.45, ki: 0.5, idle: 0.45,
  },
  {
    id: 1, name: 'FACILE', sub: 'Adversaire prudent, frappe peu',
    react: 0.6, aggro: 0.34, guard: 0.18, vanish: 0.02, combo: 0.3, blast: 0.22,
    think: [0.75, 1.4], dmg: 0.7, ki: 0.75, idle: 0.22,
  },
  {
    id: 2, name: 'NORMAL', sub: 'Combat équilibré',
    react: 0.36, aggro: 0.55, guard: 0.35, vanish: 0.12, combo: 0.6, blast: 0.45,
    think: [0.45, 0.9], dmg: 1.0, ki: 1.0, idle: 0.06,
  },
  {
    id: 3, name: 'DIFFICILE', sub: 'Enchaîne, garde et contre',
    react: 0.22, aggro: 0.72, guard: 0.5, vanish: 0.3, combo: 0.8, blast: 0.6,
    think: [0.3, 0.6], dmg: 1.15, ki: 1.25, idle: 0,
  },
  {
    id: 4, name: 'LÉGENDE', sub: 'Sans pitié — contres au réflexe',
    react: 0.12, aggro: 0.88, guard: 0.66, vanish: 0.55, combo: 0.95, blast: 0.78,
    think: [0.18, 0.4], dmg: 1.35, ki: 1.5, idle: 0,
  },
];

export const DEFAULT_DIFFICULTY = 2;

export class AIController {
  constructor(fighter, level = 1) {
    this.f = fighter;
    this.input = new FakeInput();
    this.setLevel(level);
    this.plan = 'approach';
    this.planT = 0;
    this.reactT = 0;
    this.holdCharge = 0;
    this.strafeDir = pick([-1, 1]);
    this.strafeT = 0;
  }

  setLevel(l) {
    this.level = clamp(l, 0, DIFFICULTIES.length - 1);
    this.d = DIFFICULTIES[this.level];
    const f = this.f;
    // outgoing damage handicap, read by Fighter.takeHit
    f.dmgScale = this.d.dmg;
    // ki economy handicap
    if (f.baseKiRegen === undefined) f.baseKiRegen = f.tune.kiRegen;
    f.tune.kiRegen = f.baseKiRegen * this.d.ki;
  }

  update(dt) {
    const f = this.f, foe = f.foe;
    const inp = this.input;
    inp.begin();
    inp.mvx = 0; inp.mvy = 0;

    if (f.dead || !foe || f.locked) { f.update(dt, inp); return; }

    // hesitation window: on the easy levels the CPU regularly does nothing,
    // which is what actually makes it beatable for a new player
    if (this.d.idle > 0) {
      this.idleT = (this.idleT ?? 0) - dt;
      if (this.idleT <= 0) {
        this.idleT = rand(0.35, 1.1);
        this.idling = Math.random() < this.d.idle;
      }
      if (this.idling) { f.update(dt, inp); return; }
    }

    this.planT -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = rand(0.8, 2.2); this.strafeDir = pick([-1, 1]); }

    const d = f.distTo(foe);
    const dy = foe.pos.y - f.pos.y;
    const hpFrac = f.hp / f.maxHp;
    const foeAttacking = foe.state === 'attack' || foe.state === 'rushin';
    const foeCasting = foe.state === 'cast';

    /* ---- reactive layer ---- */
    // vanish out of a combo
    if ((f.state === 'hit' || f.state === 'blown') && f.vanishWindow > 0 &&
        f.ki >= 22 && Math.random() < this.d.vanish * dt * 30) {
      inp.set('boost');
      f.update(dt, inp);
      return;
    }
    // guard incoming pressure
    if ((foeAttacking && d < 6) || (foeCasting && d < 30)) {
      if (Math.random() < this.d.guard * dt * 12) this.plan = 'guard', this.planT = rand(0.4, 0.9);
    }

    /* ---- planning ---- */
    if (this.planT <= 0) {
      this.planT = rand(this.d.think[0], this.d.think[1]);
      const r = Math.random();
      if (f.sparking && f.ki > 55 && d < 26 && r < 0.55) this.plan = 'ultimate';
      else if (f.ki >= 92 && !f.sparking && r < 0.35 + this.d.aggro * 0.3) this.plan = 'spark';
      else if (f.ki >= 45 && d < 30 && r < this.d.blast * 0.55) this.plan = 'blast2';
      else if (f.ki >= 25 && r < this.d.blast * 0.3) this.plan = 'blast1';
      else if (f.ki < 24 && d > 14) this.plan = 'charge';
      else if (hpFrac < 0.28 && f.ki < 60 && d > 18 && r < 0.4) this.plan = 'charge';
      else if (d > 9) this.plan = r < this.d.aggro ? 'approach' : (r < this.d.aggro + 0.2 ? 'snipe' : 'charge');
      else if (d < 4.2) this.plan = r < this.d.aggro ? 'melee' : (r < 0.85 ? 'guard' : 'retreat');
      else this.plan = r < 0.7 ? 'approach' : 'snipe';
    }

    /* ---- act ---- */
    const towards = () => { inp.mvy = 1; };
    const away = () => { inp.mvy = -1; };
    const strafe = (k = 0.7) => { inp.mvx = this.strafeDir * k; };

    // vertical matching
    if (Math.abs(dy) > 2.2) {
      if (dy > 0) inp.set('ascend');
      else if (f.pos.y > 0.5) inp.set('descend');
    }

    switch (this.plan) {
      case 'approach':
        towards(); strafe(0.35);
        if (d > 12 && f.ki > 18) inp.set('boost');
        if (d < 4.6) { this.plan = 'melee'; this.planT = 0.4; }
        break;

      case 'melee': {
        if (d > 5.5) { towards(); if (f.ki > 20) inp.set('boost'); break; }
        strafe(0.25);
        if (f.canAct) {
          if (Math.random() < 0.22 && f.combo === 0) inp.set('smash');
          else inp.set('rush');
        } else if (f.state === 'attack' && f.chainWindow > 0 && Math.random() < this.d.combo) {
          inp.set('rush');
        }
        break;
      }

      case 'snipe':
        strafe(0.6);
        if (d > 20) towards();
        if (f.ki > 8 && Math.random() < 0.5) inp.set('kiblast');
        break;

      case 'guard':
        inp.set('guard');
        if (d < 3.2) away();
        break;

      case 'retreat':
        away(); strafe(0.5);
        if (f.ki > 20 && Math.random() < 0.4) inp.set('boost');
        break;

      case 'charge':
        if (d < 12) { away(); if (f.ki > 12) inp.set('boost'); }
        else {
          inp.set('charge');
          if (f.ki >= 96) { this.plan = 'approach'; this.planT = 0.3; }
        }
        break;

      case 'blast1':
        if (f.canAct) { inp.set('blast1'); this.plan = 'approach'; this.planT = 0.4; }
        break;

      case 'blast2':
        if (f.canAct && d < 34) {
          inp.set('blast2'); this.plan = 'approach'; this.planT = 1.2;
        } else towards();
        break;

      case 'ultimate':
        if (f.canAct && d < 30) { inp.set('ultimate'); this.plan = 'approach'; this.planT = 2.0; }
        else towards();
        break;

      case 'spark':
        if (f.canAct) { inp.set('charge'); inp.set('guard'); this.plan = 'melee'; this.planT = 1.2; }
        break;
    }

    f.update(dt, inp);
  }
}
