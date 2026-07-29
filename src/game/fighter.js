/* ============================================================
   Fighter — movement, flight, melee chains, ki economy, guard,
   vanish counters, blasts and transformation.
   ============================================================ */
import * as THREE from 'three';
import { buildFighter, retint } from '../characters/rig.js';
import { Animator } from '../characters/animator.js';
import { tuning } from '../characters/roster.js';
import { AfterimagePool, Beam } from '../vfx/effects.js';
import { createBlobShadowMaterial } from '../graphics/materials.js';
import { clamp, damp, dampAngle, lerp, rand, TAU, angleDelta } from '../core/utils.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export const S = {
  INTRO: 'intro', IDLE: 'idle', MOVE: 'move', BOOST: 'boost', GUARD: 'guard',
  ATTACK: 'attack', RUSHIN: 'rushin', HIT: 'hit', BLOWN: 'blown', DOWN: 'down',
  GETUP: 'getup', CHARGE: 'charge', CAST: 'cast', VANISH: 'vanish',
  TRANSFORM: 'transform', WIN: 'win', LOSE: 'lose',
};

const COST = {
  boost: 6,        // per second
  vanish: 22,
  kiblast: 4,
  blast1: 25,
  blast2: 45,
  ultimate: 100,
  sparking: 100,
};

const DMG = {
  rush: [20, 22, 24, 26, 40],
  smash: 58,
  launcher: 46,
  kiblast: 16,
  blast2: 118,
  ultimate: 340,
  rain: 26,
};

export class Fighter {
  constructor(world, spec, index) {
    this.world = world;
    this.spec = spec;
    this.index = index;
    this.tune = tuning(spec);

    this.rig = buildFighter(spec);
    this.root = this.rig.root;
    world.scene.add(this.root);

    this.anim = new Animator(this.rig);
    this.anim.onEvent = (ev) => this.onAnimEvent(ev);

    this.after = new AfterimagePool(world.scene, this.rig.meshes, spec.palette.aura, 6);

    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(shadowGeo, createBlobShadowMaterial());
    this.shadow.renderOrder = 3;
    world.scene.add(this.shadow);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.targetYaw = 0;
    this.state = S.IDLE; this.stateT = 0; this.stateDur = 0;
    this.flying = false; this.grounded = true;

    this.hp = this.tune.maxHp; this.maxHp = this.tune.maxHp;
    this.ki = 55; this.maxKi = 100;
    this.skill = 3; this.maxSkill = 5;
    this.sparking = false; this.sparkT = 0;
    this.transformed = false;
    this.combo = 0; this.comboTimer = 0;
    this.hitBy = 0;
    this.attackIndex = 0;
    this.chainWindow = 0;
    this.invuln = 0;
    this.vanishWindow = 0;
    this.guardHold = 0;
    this.armor = 0;
    this.speedBuff = 1; this.buffT = 0;
    this.stats = { dealt: 0, taken: 0, maxCombo: 0, blasts: 0 };
    this.aiFlags = {};
    this.trail = null;
    this.beam = null;
    this.castKind = null;
    this.auraPower = 0;
    this.faceFlash = 0;
    this.lastHitTime = -9;
    this.stunned = 0;

    this.basePalette = { ...spec.palette };
    this.energyColor = new THREE.Color(spec.palette.aura);

    this.dead = false;
    this.locked = false;      // cinematic lock
    this.dmgScale = 1;        // difficulty handicap, set by AIController
  }

  /* ---------------- helpers ---------------- */

  get foe() { return this._foe; }
  set foe(f) { this._foe = f; }

  get atkMul() {
    let m = this.tune.atk;
    if (this.sparking) m *= this.spec.transform.boost.atk;
    return m;
  }
  get defMul() {
    let m = this.tune.def;
    if (this.sparking) m /= this.spec.transform.boost.def;
    if (this.armor > 0) m *= 0.55;
    return m;
  }
  get speedMul() {
    let m = this.speedBuff;
    if (this.sparking) m *= this.spec.transform.boost.speed;
    return m;
  }
  get busy() {
    return this.state === S.ATTACK || this.state === S.CAST || this.state === S.HIT ||
           this.state === S.BLOWN || this.state === S.DOWN || this.state === S.GETUP ||
           this.state === S.TRANSFORM || this.state === S.VANISH || this.state === S.RUSHIN ||
           this.state === S.INTRO || this.locked;
    }
  get canAct() { return !this.busy && !this.dead; }

  center(out = _v) { return out.copy(this.pos).addScalar(0).setY(this.pos.y + 0.95 * (this.spec.scale ?? 1)); }
  headPos(out = _v) { return out.copy(this.pos).setY(this.pos.y + 1.55 * (this.spec.scale ?? 1)); }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.yaw = this.targetYaw = yaw;
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
  }

  setState(s, dur = 0) {
    this.state = s; this.stateT = 0; this.stateDur = dur;
  }

  addKi(v) { this.ki = clamp(this.ki + v, 0, this.maxKi); }
  spendKi(v) {
    if (this.ki < v) return false;
    this.ki -= v; return true;
  }

  /* ---------------- input driven actions ---------------- */

  handleInput(inp, dt) {
    if (this.dead || this.locked) return;
    const w = this.world;

    // --- vanish counter (during hitstun, with boost) ---
    if ((this.state === S.HIT || this.state === S.BLOWN) && this.vanishWindow > 0 &&
        inp.pressed('boost') && this.ki >= COST.vanish) {
      this.doVanish();
      return;
    }

    // --- combo chaining: buffer the next link of the rush ---
    if (this.state === S.ATTACK && this.chainWindow > 0 && inp.pressed('rush')) {
      this.queueChain();
      return;
    }

    if (!this.canAct) return;

    // --- ultimate ---
    if (inp.pressed('ultimate') && this.sparking && this.ki >= 55) {
      this.castUltimate();
      return;
    }
    // --- super ---
    if (inp.pressed('blast2') && this.ki >= COST.blast2) {
      this.castBlast2();
      return;
    }
    // --- skill ---
    if (inp.pressed('blast1') && this.ki >= COST.blast1) {
      this.castBlast1();
      return;
    }
    // --- sparking / transform: both keys held, in any order ---
    if (inp.held('charge') && inp.held('guard') && !this.sparking && this.ki >= 90) {
      this.enterSparking();
      return;
    }

    // --- melee ---
    if (inp.pressed('rush')) { this.startRush(); return; }
    if (inp.pressed('smash')) { this.startSmash(inp); return; }
    if (inp.pressed('kiblast') && this.ki >= COST.kiblast) { this.startKiBlast(); return; }

    // --- guard ---
    if (inp.held('guard')) {
      if (this.state !== S.GUARD) this.setState(S.GUARD);
      this.guardHold += dt;
      return;
    } else if (this.state === S.GUARD) {
      this.setState(S.IDLE); this.guardHold = 0;
    }

    // --- charge ki ---
    if (inp.held('charge')) {
      if (this.state !== S.CHARGE) { this.setState(S.CHARGE); w.audio.startLoop(`chg${this.index}`, 'charge', this.spec.voice); }
      this.addKi(this.tune.kiRegen * 3.4 * dt);
      if (this.ki >= this.maxKi) this.skill = Math.min(this.maxSkill, this.skill + dt * 0.9);
      return;
    } else if (this.state === S.CHARGE) {
      this.setState(S.IDLE);
      w.audio.stopLoop(`chg${this.index}`);
    }

    // --- movement ---
    const mv = inp.move();
    const boosting = inp.held('boost') && this.ki > 1;
    const ascend = inp.held('ascend'), descend = inp.held('descend');

    if (ascend && !this.flying) { this.flying = true; }
    if (this.flying && descend && this.pos.y <= 0.05) this.flying = false;

    this.moveInput = mv;
    this.boostInput = boosting;
    this.verticalInput = (ascend ? 1 : 0) - (descend ? 1 : 0);

    if (boosting) this.addKi(-COST.boost * dt);
    if (boosting && (mv.mag > 0.1 || this.verticalInput !== 0)) {
      if (this.state !== S.BOOST) this.setState(S.BOOST);
    } else if (mv.mag > 0.1) {
      if (this.state !== S.MOVE) this.setState(S.MOVE);
    } else if (this.state === S.MOVE || this.state === S.BOOST) {
      this.setState(S.IDLE);
    }
  }

  /* ---------------- actions ---------------- */

  startRush() {
    const d = this.distTo(this.foe);
    if (d > 4.2 && d < 34) {
      this.setState(S.RUSHIN, 0.55);
      this.anim.play('flyFast', { fade: 0.07 });
      this.world.audio.swish(this.spec.voice * 1.2);
      this.world.fx.boostTrail(this.center(_v3), this.spec.palette.aura, 4);
    } else {
      this.attackIndex = 0;
      this.beginAttack('rush1');
    }
  }

  continueRush() {
    const next = ['rush1', 'rush2', 'rush3', 'rush4', 'rush5'];
    this.attackIndex = Math.min(this.attackIndex + 1, next.length - 1);
    this.beginAttack(next[this.attackIndex]);
  }

  beginAttack(clip) {
    this.setState(S.ATTACK);
    this.attackClip = clip;
    this.anim.play(clip, { fade: 0.07, restart: true, speed: this.sparking ? 1.18 : 1 });
    this.chainWindow = 0;
    this.hitLanded = false;
    this.world.audio.swish(this.spec.voice);
    this.startTrail();
  }

  startSmash(inp) {
    const up = inp?.held('up'), down = inp?.held('down');
    this.smashMode = up ? 'launch' : down ? 'slam' : 'blow';
    this.setState(S.ATTACK);
    this.attackClip = up ? 'launcher' : 'smash';
    this.anim.play(this.attackClip, { fade: 0.08, restart: true });
    this.hitLanded = false;
    this.world.audio.swish(this.spec.voice * 0.8);
    this.startTrail();
  }

  startKiBlast() {
    this.spendKi(COST.kiblast);
    this.setState(S.CAST);
    this.castKind = 'kiblast';
    this.anim.play('kiblast', { fade: 0.07, restart: true });
  }

  castBlast1() {
    const mv = this.spec.moves.blast1;
    this.spendKi(COST.blast1);
    this.setState(S.CAST);
    this.castKind = 'blast1';
    this.anim.play('super', { fade: 0.08, restart: true });
    this.world.ui?.announceMove(this.index, mv.name);
    this.world.audio.shout(this.spec.voice, 0.8, 0.4);
  }

  castBlast2() {
    const mv = this.spec.moves.blast2;
    this.spendKi(COST.blast2);
    this.setState(S.CAST);
    this.castKind = 'blast2';
    this.castType = mv.type;
    const clip = mv.type === 'beam' ? 'beam' : 'super';
    this.anim.play(clip, { fade: 0.1, restart: true });
    this.world.ui?.announceMove(this.index, mv.name);
    this.world.audio.shout(this.spec.voice, 1.0, 0.6);
    this.stats.blasts++;
  }

  castUltimate() {
    const mv = this.spec.moves.ult;
    this.ki = Math.max(0, this.ki - 55);
    this.setState(S.CAST);
    this.castKind = 'ultimate';
    this.castType = mv.type;
    this.anim.play('ultimate', { fade: 0.12, restart: true });
    this.world.ui?.announceMove(this.index, mv.name, true);
    this.world.onUltimate?.(this);
    this.stats.blasts++;
  }

  doVanish() {
    this.spendKi(COST.vanish);
    this.setState(S.VANISH, 0.26);
    this.invuln = 0.4;
    this.combo = 0;
    const fx = this.world.fx;
    fx.vanish(this.center(_v3), this.spec.palette.aura);
    this.world.audio.vanish();
    // reappear behind the opponent
    const foe = this.foe;
    const dir = _v.copy(this.pos).sub(foe.pos).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const behind = _v2.copy(foe.pos).sub(dir.multiplyScalar(2.6));
    this.pos.set(behind.x, Math.max(this.world.stage.groundY, foe.pos.y), behind.z);
    this.vel.set(0, 0, 0);
    this.targetYaw = Math.atan2(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z);
    this.yaw = this.targetYaw;
    this.after.spawn(0.45);
    fx.vanish(this.center(_v3), this.spec.palette.aura);
    this.anim.play('idle', { fade: 0.05 });
  }

  enterSparking() {
    if (this.sparking) return;
    this.ki = Math.max(0, this.ki - 90);
    this.sparking = true;
    this.sparkT = 16;
    this.setState(S.TRANSFORM, 1.0);
    this.anim.play('sparkBurst', { fade: 0.1, restart: true });
    this.invuln = 1.0;
    const t = this.spec.transform;
    if (!this.transformed) {
      this.transformed = true;
      retint(this.rig, t.palette, { hairStyle: t.hairStyle });
      if (t.palette.aura !== undefined) {
        this.energyColor.set(t.palette.aura);
        this.after.setColor(t.palette.aura);
      }
    }
    this.world.ui?.announceMove(this.index, t.name, true);
    this.world.audio.transform(this.spec.voice);
    this.world.fx.pillar(this.pos, this.energyColor.getHex(), 26, 1.1);
    this.world.fx.explosion(this.center(_v3), this.energyColor.getHex(), 4.5, { shake: 1.4 });
  }

  exitSparking() {
    this.sparking = false;
    this.sparkT = 0;
  }

  /* ---------------- animation events ---------------- */

  onAnimEvent(ev) {
    switch (ev) {
      case 'hit': this.resolveMelee(); break;
      case 'fire': this.fireCast(); break;
      case 'charge': this.castCharge(); break;
      case 'burst':
        this.world.fx.explosion(this.center(_v3), this.energyColor.getHex(), 5);
        break;
    }
  }

  castCharge() {
    const fx = this.world.fx;
    const p = this.center(_v3).clone();
    if (this.castKind === 'blast2' && this.castType === 'beam') {
      this.world.audio.startLoop(`chg${this.index}`, 'charge', this.spec.voice * 1.2);
      for (let i = 0; i < 3; i++) fx.chargePulse(p, this.energyColor.getHex(), 3 + i);
    } else if (this.castKind === 'ultimate') {
      this.world.audio.startLoop(`chg${this.index}`, 'charge', this.spec.voice);
      fx.pillar(this.pos, this.energyColor.getHex(), 30, 1.3);
      for (let i = 0; i < 5; i++) fx.chargePulse(p, this.energyColor.getHex(), 3 + i * 1.2);
      fx.shake(0.4, 1.2);
    } else {
      fx.chargePulse(p, this.energyColor.getHex(), 2.4);
    }
  }

  /** the actual damage window of a melee swing */
  resolveMelee() {
    const foe = this.foe;
    if (!foe || foe.dead) return;
    const reach = 3.1 * (this.spec.scale ?? 1);
    const d = this.distTo(foe);
    const toFoe = _v.copy(foe.pos).sub(this.pos).setY(0).normalize();
    const facing = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dy = Math.abs(foe.pos.y - this.pos.y);

    this.world.audio.swish(this.spec.voice * rand(0.9, 1.15));

    if (d < reach && dy < 2.4 && facing.dot(toFoe) > 0.2) {
      const isSmash = this.attackClip === 'smash' || this.attackClip === 'launcher';
      const chainLast = this.attackClip === 'rush5';
      let dmg, kind;
      if (isSmash) {
        dmg = (this.attackClip === 'launcher' ? DMG.launcher : DMG.smash);
        kind = this.smashMode === 'launch' ? 'launch' : this.smashMode === 'slam' ? 'slam' : 'blow';
      } else {
        dmg = DMG.rush[Math.min(this.attackIndex, DMG.rush.length - 1)];
        kind = chainLast ? 'blow' : 'light';
      }
      foe.takeHit({
        damage: dmg * this.atkMul, kind, from: this,
        point: _v3.copy(foe.pos).setY(foe.pos.y + 1.0 + rand(-0.2, 0.35)),
      });
      this.hitLanded = true;
      this.chainWindow = 0.34;
      this.addKi(3.2);
    } else {
      this.chainWindow = 0.22;
    }
  }

  fireCast() {
    const w = this.world;
    const foe = this.foe;
    const origin = _v.copy(this.pos).setY(this.pos.y + 1.15 * (this.spec.scale ?? 1))
      .add(_v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(0.7));
    const dir = _v2.copy(foe.center(_v3)).sub(origin).normalize();

    switch (this.castKind) {
      case 'kiblast':
        w.spawnProjectile({
          owner: this, origin, dir, speed: 46, radius: 0.34,
          damage: DMG.kiblast * this.atkMul, color: this.energyColor.getHex(), life: 2.2, homing: 0.9,
        });
        w.audio.kiShot(this.spec.voice);
        this.addKi(1);
        break;

      case 'blast1':
        this.applyBlast1();
        break;

      case 'blast2': {
        const type = this.castType;
        if (type === 'beam') {
          this.fireBeam(origin, dir, {
            radius: 0.45, damage: DMG.blast2 * this.atkMul, life: 1.5, color: this.energyColor.getHex(),
          });
        } else if (type === 'ball') {
          w.spawnProjectile({
            owner: this, origin, dir, speed: 30, radius: 1.15,
            damage: DMG.blast2 * this.atkMul, color: this.energyColor.getHex(),
            life: 3, homing: 1.6, big: true, explode: 8,
          });
          w.audio.kiShot(this.spec.voice * 0.6);
          w.audio.explosion(0.4);
        } else if (type === 'rush') {
          this.startRushSuper();
        } else if (type === 'rain') {
          this.fireRain(6);
        }
        break;
      }

      case 'ultimate': {
        w.audio.stopLoop(`chg${this.index}`);
        const type = this.castType;
        if (type === 'beam') {
          this.fireBeam(origin, dir, {
            radius: 1.0, damage: DMG.ultimate * this.atkMul, life: 2.0,
            color: this.energyColor.getHex(), ultimate: true,
          });
        } else if (type === 'ball') {
          w.spawnProjectile({
            owner: this, origin, dir, speed: 26, radius: 2.6,
            damage: DMG.ultimate * this.atkMul, color: this.energyColor.getHex(),
            life: 4, homing: 2.2, big: true, explode: 18, ultimate: true,
          });
          w.audio.explosion(1.2);
        } else {
          this.fireRain(14, true);
        }
        w.fx.shake(1.6, 0.8);
        break;
      }
    }
  }

  applyBlast1() {
    const t = this.spec.moves.blast1.type;
    const w = this.world;
    const c = this.energyColor.getHex();
    switch (t) {
      case 'afterimage':
        this.buffT = 8; this.afterimageBuff = 8;
        w.fx.pillar(this.pos, c, 12, 0.7);
        for (let i = 0; i < 4; i++) this.after.spawn(0.6);
        break;
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.16);
        w.fx.pillar(this.pos, 0x7dff9b, 16, 1.0);
        break;
      case 'speedboost':
        this.speedBuff = 1.45; this.buffT = 9;
        w.fx.pillar(this.pos, c, 14, 0.8);
        break;
      case 'guardboost':
      case 'armor':
        this.armor = 9;
        w.fx.pillar(this.pos, c, 14, 0.8);
        break;
      case 'drain': {
        const foe = this.foe;
        if (this.distTo(foe) < 18) {
          const steal = Math.min(30, foe.ki);
          foe.ki -= steal; this.addKi(steal);
          foe.hp = Math.max(1, foe.hp - 30);
          w.fx.shockRing(foe.center(_v3), c, 8, 0.5);
        }
        break;
      }
    }
    w.fx.explosion(this.center(_v3), c, 4, { shake: 0.6 });
    w.audio.transform(this.spec.voice * 1.1);
  }

  startRushSuper() {
    this.rushSuper = { hits: 8, t: 0 };
    this.world.audio.shout(this.spec.voice, 1.2, 0.7);
  }

  fireRain(count, ult = false) {
    const w = this.world;
    const foe = this.foe;
    for (let i = 0; i < count; i++) {
      const off = _v.set(rand(-6, 6), rand(5, 12), rand(-6, 6));
      const origin = _v2.copy(this.center(_v3)).add(off);
      const dir = _v3.copy(foe.center(new THREE.Vector3())).sub(origin).normalize();
      setTimeout(() => {
        if (this.dead || w.over) return;
        w.spawnProjectile({
          owner: this, origin: origin.clone(), dir: dir.clone(), speed: 34,
          radius: ult ? 0.9 : 0.55, damage: DMG.rain * this.atkMul * (ult ? 1.8 : 1),
          color: this.energyColor.getHex(), life: 2.4, homing: 2.4, explode: ult ? 6 : 3,
        });
        w.audio.kiShot(this.spec.voice * rand(0.9, 1.2));
      }, i * 90);
    }
  }

  fireBeam(origin, dir, opts) {
    const w = this.world;
    w.audio.stopLoop(`chg${this.index}`);
    w.audio.startLoop(`beam${this.index}`, 'beam', this.spec.voice);
    w.audio.shout(this.spec.voice, 1.3, 0.9);
    const beam = new Beam(w.fx, {
      origin: origin.clone(), dir: dir.clone(),
      color: opts.color, core: this.spec.palette.auraCore ?? 0xffffff,
      radius: opts.radius, life: opts.life + 0.6, speed: 95, maxLength: 130, owner: this,
    });
    w.fx.beams.push(beam);
    this.beam = beam;
    this.beamData = {
      damage: opts.damage, life: opts.life, t: 0, ultimate: !!opts.ultimate,
      tickDmg: opts.damage / (opts.life / 0.1) * 0.1,
    };
    w.fx.shake(opts.ultimate ? 1.2 : 0.6, opts.life);
    w.registerBeam(this, beam, opts);
  }

  /* ---------------- taking damage ---------------- */

  takeHit(h) {
    if (this.dead || this.invuln > 0) return false;
    const w = this.world;
    const fromDir = _v.copy(this.pos).sub(h.from ? h.from.pos : this.pos).setY(0);
    if (fromDir.lengthSq() < 1e-4) fromDir.set(0, 0, 1);
    fromDir.normalize();

    const facing = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const blocking = this.state === S.GUARD && facing.dot(fromDir) < -0.1;

    let dmg = h.damage * this.defMul * (h.from?.dmgScale ?? 1);
    const point = h.point ? _v3.copy(h.point) : this.center(_v3);

    if (blocking) {
      dmg *= 0.16;
      this.hp -= dmg;
      this.addKi(4);
      this.anim.play('guardHit', { fade: 0.05, restart: true });
      w.fx.hitSpark(point, 0xbfe9ff, 0.8);
      w.fx.shockRing(point, 0x9fd8ff, 2.6, 0.28);
      w.audio.guardHit();
      this.vel.add(fromDir.multiplyScalar(4));
      w.hitstop(0.035);
      h.from?.onHitConfirm?.(false);
      return true;
    }

    if (this.armor > 0 && h.kind !== 'blast') dmg *= 0.6;

    this.hp -= dmg;
    this.stats.taken += dmg;
    if (h.from) { h.from.stats.dealt += dmg; }
    this.addKi(2.2);
    if (h.from) h.from.addKi(1.6);

    // combo bookkeeping lives on the attacker
    if (h.from) {
      h.from.combo++;
      h.from.comboTimer = 1.4;
      h.from.stats.maxCombo = Math.max(h.from.stats.maxCombo, h.from.combo);
      w.ui?.showCombo(h.from.index, h.from.combo);
    }

    const heavy = h.kind !== 'light';
    const color = h.color ?? (heavy ? 0xffd08a : 0xffe9a0);
    w.fx.hitSpark(point, color, heavy ? 1.5 : 1.0, heavy);
    w.audio[heavy ? 'heavyHit' : 'punch'](heavy ? 1.4 : 1, this.spec.voice);
    if (Math.random() < 0.35 || heavy) w.audio.shout(this.spec.voice, heavy ? 0.9 : 0.5, heavy ? 0.4 : 0.25);
    this.faceFlash = 1;
    w.hitstop(heavy ? 0.1 : 0.05);
    this.invuln = 0.04;
    this.vanishWindow = 0.42;

    if (this.hp <= 0) { this.hp = 0; this.die(fromDir, h); return true; }

    switch (h.kind) {
      case 'launch':
        this.vel.copy(fromDir).multiplyScalar(5).setY(19);
        this.setState(S.BLOWN, 1.1);
        this.anim.play('blowAway', { fade: 0.06, restart: true });
        this.flying = false;
        break;
      case 'slam':
        this.vel.copy(fromDir).multiplyScalar(4).setY(-26);
        this.setState(S.BLOWN, 1.0);
        this.anim.play('blowAway', { fade: 0.06, restart: true });
        this.flying = false;
        break;
      case 'blow':
      case 'blast':
        this.vel.copy(fromDir).multiplyScalar(h.knock ?? 26).setY((h.knock ?? 26) * 0.24);
        this.setState(S.BLOWN, 0.9);
        this.anim.play('blowAway', { fade: 0.06, restart: true });
        this.flying = false;
        break;
      default:
        this.vel.copy(fromDir).multiplyScalar(6.5);
        this.setState(S.HIT, 0.26);
        this.anim.play(Math.random() < 0.5 ? 'hitLight' : 'hitBody', { fade: 0.05, restart: true });
        break;
    }
    return true;
  }

  die(fromDir, h) {
    this.dead = true;
    this.combo = 0;
    const w = this.world;
    this.vel.copy(fromDir).multiplyScalar(20).setY(9);
    this.setState(S.BLOWN, 1.4);
    this.anim.play('blowAway', { fade: 0.06, restart: true });
    this.flying = false;
    w.fx.explosion(this.center(_v3), 0xffd08a, 7, { shake: 1.6 });
    w.audio.shout(this.spec.voice, 1.4, 1.0);
    w.hitstop(0.24);
    w.onKO?.(this, h?.from);
  }

  /* ---------------- per-frame ---------------- */

  update(dt, input) {
    if (dt <= 0) return;
    const w = this.world;
    const stage = w.stage;
    this.stateT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.vanishWindow = Math.max(0, this.vanishWindow - dt);
    this.chainWindow = Math.max(0, this.chainWindow - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.faceFlash = Math.max(0, this.faceFlash - dt * 5);
    if (this.comboTimer <= 0 && this.combo > 0) { this.combo = 0; w.ui?.hideCombo(this.index); }
    if (this.buffT > 0) { this.buffT -= dt; if (this.buffT <= 0) { this.speedBuff = 1; this.afterimageBuff = 0; } }
    if (this.armor > 0) this.armor -= dt;
    if (this.sparking) {
      this.sparkT -= dt;
      this.ki = Math.max(0, this.ki - 3.2 * dt);
      if (this.sparkT <= 0 || this.ki <= 0) this.exitSparking();
    }

    if (input && !this.dead) this.handleInput(input, dt);

    // passive ki regen
    if (this.state !== S.CHARGE && !this.dead) this.addKi(this.tune.kiRegen * 0.16 * dt);

    this.updateState(dt);
    this.updatePhysics(dt, stage);
    this.updateVisual(dt);
  }

  updateState(dt) {
    const w = this.world;
    switch (this.state) {
      case S.ATTACK: {
        if (this.anim.finished) {
          this.stopTrail();
          this.setState(S.IDLE);
        }
        break;
      }
      case S.RUSHIN: {
        const foe = this.foe;
        const d = this.distTo(foe);
        const dir = _v.copy(foe.center(_v3)).sub(this.center(_v2)).normalize();
        const sp = this.tune.boostSpeed * 1.5 * this.speedMul;
        this.vel.copy(dir).multiplyScalar(sp);
        this.after.spawn(0.24);
        w.fx.boostTrail(this.center(_v3), this.energyColor.getHex(), 2);
        if (d < 3.0 || this.stateT > this.stateDur) {
          this.vel.multiplyScalar(0.1);
          this.attackIndex = 0;
          if (d < 4.2) this.beginAttack('rush1');
          else this.setState(S.IDLE);
        }
        break;
      }
      case S.CAST: {
        if (this.rushSuper) this.updateRushSuper(dt);
        if (this.anim.finished) {
          this.rushSuper = null;
          this.castKind = null;
          w.audio.stopLoop(`chg${this.index}`);
          w.audio.stopLoop(`beam${this.index}`);
          this.setState(S.IDLE);
        }
        break;
      }
      case S.HIT:
      case S.BLOWN: {
        if (this.state === S.BLOWN) {
          this.after.spawn(0.2);
        }
        if (this.stateT >= this.stateDur) {
          if (this.pos.y > 0.4 && !this.dead) {
            this.setState(S.IDLE);
            this.flying = true;
          } else if (!this.dead) {
            this.setState(S.IDLE);
          }
        }
        break;
      }
      case S.DOWN: {
        if (this.stateT > this.stateDur && !this.dead) {
          this.setState(S.GETUP, 0.7);
          this.anim.play('getUp', { fade: 0.08, restart: true });
        }
        break;
      }
      case S.GETUP: {
        if (this.anim.finished) this.setState(S.IDLE);
        break;
      }
      case S.VANISH: {
        if (this.stateT >= this.stateDur) this.setState(S.IDLE);
        break;
      }
      case S.TRANSFORM: {
        if (this.anim.finished) this.setState(S.IDLE);
        break;
      }
    }

    // chain input is consumed by the controller through wantsChain()
    if (this.state === S.ATTACK && this.chainQueued && this.chainWindow > 0) {
      this.chainQueued = false;
      this.continueRush();
    }
  }

  updateRushSuper(dt) {
    const rs = this.rushSuper;
    rs.t += dt;
    const foe = this.foe;
    if (rs.hits > 0 && rs.t > 0.09) {
      rs.t = 0; rs.hits--;
      const dir = _v.copy(foe.pos).sub(this.pos).setY(0).normalize();
      this.pos.copy(foe.pos).sub(dir.multiplyScalar(2.0));
      this.pos.y = foe.pos.y;
      this.targetYaw = Math.atan2(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z);
      this.yaw = this.targetYaw;
      this.after.spawn(0.2);
      const pt = foe.center(_v2).clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.4, 0.6), rand(-0.4, 0.4)));
      foe.takeHit({ damage: 14 * this.atkMul, kind: rs.hits === 0 ? 'blow' : 'light', from: this, point: pt });
      this.world.fx.hitSpark(pt, this.energyColor.getHex(), 1.1, rs.hits === 0);
    }
  }

  queueChain() { this.chainQueued = true; }

  updatePhysics(dt, stage) {
    const G = -26;
    const mv = this.moveInput || { x: 0, y: 0, mag: 0 };
    const foe = this.foe;

    // face the opponent
    if (foe && this.state !== S.BLOWN && this.state !== S.DOWN) {
      this.targetYaw = Math.atan2(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z);
    }
    const turnRate = this.state === S.ATTACK ? 4 : 12;
    this.yaw = dampAngle(this.yaw, this.targetYaw, turnRate, dt);

    const movable = this.state === S.IDLE || this.state === S.MOVE || this.state === S.BOOST || this.state === S.GUARD;

    if (movable && mv.mag > 0.05) {
      const fwd = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const right = _v2.set(fwd.z, 0, -fwd.x);
      const base = this.flying ? this.tune.flySpeed : this.tune.speed;
      const sp = (this.state === S.BOOST ? this.tune.boostSpeed : base) *
                 this.speedMul * (this.state === S.GUARD ? 0.45 : 1);
      const dirv = _v3.copy(fwd).multiplyScalar(mv.y).add(right.multiplyScalar(-mv.x));
      if (dirv.lengthSq() > 1e-5) dirv.normalize();
      this.vel.x = damp(this.vel.x, dirv.x * sp, 12, dt);
      this.vel.z = damp(this.vel.z, dirv.z * sp, 12, dt);
    } else if (this.state !== S.BLOWN && this.state !== S.RUSHIN) {
      this.vel.x = damp(this.vel.x, 0, 9, dt);
      this.vel.z = damp(this.vel.z, 0, 9, dt);
    }

    // vertical
    if (this.flying && movable) {
      const vy = (this.verticalInput || 0) * (this.state === S.BOOST ? this.tune.boostSpeed * 0.6 : this.tune.flySpeed * 0.7);
      this.vel.y = damp(this.vel.y, vy, 9, dt);
    } else if (!this.flying) {
      this.vel.y += G * dt;
    } else if (this.state === S.BLOWN) {
      this.vel.y += G * 0.55 * dt;
    }

    if (this.state === S.BLOWN) {
      this.vel.multiplyScalar(Math.exp(-1.6 * dt));
      this.vel.y += G * 0.7 * dt;
    }

    this.pos.addScaledVector(this.vel, dt);

    // stage bounds
    const gy = stage.groundY;
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > stage.radius) {
      const k = stage.radius / r;
      const hardHit = this.state === S.BLOWN && this.vel.length() > 12;
      this.pos.x *= k; this.pos.z *= k;
      this.vel.x *= -0.25; this.vel.z *= -0.25;
      if (hardHit) {
        this.world.fx.explosion(this.center(_v3), 0xffc98a, 4, { shake: 0.8 });
        this.world.audio.explosion(0.5);
        this.takeHit({ damage: 24, kind: 'light', from: this.foe, point: this.center(_v3) });
      }
    }
    if (this.pos.y > stage.ceiling) { this.pos.y = stage.ceiling; this.vel.y = Math.min(0, this.vel.y); }

    if (this.pos.y <= gy) {
      const impactSpeed = -this.vel.y;
      this.pos.y = gy;
      this.grounded = true;
      if (this.state === S.BLOWN && impactSpeed > 9) {
        this.world.fx.groundImpact(this.pos, clamp(impactSpeed / 16, 0.6, 2.2));
        this.world.audio.explosion(0.45);
        this.setState(S.DOWN, 0.85);
        this.anim.play('knockdown', { fade: 0.06, restart: true });
        this.vel.set(0, 0, 0);
        this.flying = false;
        if (this.dead) { this.anim.play('defeat', { fade: 0.1, restart: true }); }
      } else if (this.state === S.BLOWN) {
        this.vel.y = 0;
        if (!this.dead) this.setState(S.IDLE);
      } else {
        this.vel.y = Math.max(0, this.vel.y);
      }
      if (this.flying && (this.verticalInput || 0) <= 0) this.flying = false;
    } else {
      this.grounded = false;
    }

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  updateVisual(dt) {
    const w = this.world;
    // pick locomotion clips
    if (!this.busy && this.state !== S.CHARGE) {
      if (this.state === S.GUARD) this.anim.play('guard');
      else if (this.state === S.BOOST) this.anim.play('flyFast');
      else if (this.state === S.MOVE) {
        if (this.flying || !this.grounded) this.anim.play('fly');
        else this.anim.play('walk', { speed: clamp(this.vel.length() / 5, 0.7, 2.2) });
      } else if (this.flying || !this.grounded) this.anim.play('idleAir');
      else this.anim.play('idle');
    } else if (this.state === S.CHARGE) {
      this.anim.play('charge');
    }

    this.anim.update(dt);
    const extra = {};
    // subtle look-at on the head
    const off = this.anim.apply(extra);
    this.rig.inner.position.set(off.x, off.y, off.z);

    // aura
    const chargeAura = this.state === S.CHARGE ? 1 : 0;
    const target = this.sparking ? 1.35
      : chargeAura ? 1.0
      : this.state === S.BOOST || this.state === S.RUSHIN ? 0.65
      : this.ki > 92 ? 0.4 : 0;
    this.auraPower = damp(this.auraPower, target, 8, dt);
    const showAura = this.auraPower > 0.04;
    this.rig.aura.visible = showAura;
    if (showAura) {
      const u = this.rig.auraMat.uniforms;
      u.uTime.value += dt;
      u.uPower.value = this.auraPower;
      u.uOpacity.value = clamp(this.auraPower, 0, 1);
      this.rig.aura.scale.setScalar(0.9 + this.auraPower * 0.35);
      if (Math.random() < this.auraPower * 0.7) {
        w.fx.boostTrail(this.pos, this.energyColor.getHex(), 1);
      }
    }

    // material energy glow
    const energy = clamp(this.auraPower * 0.5 + (this.sparking ? 0.35 : 0), 0, 1);
    for (const k in this.rig.materials) {
      const m = this.rig.materials[k];
      if (!m.uniforms) continue;
      if (m.uniforms.uEnergy) m.uniforms.uEnergy.value = energy;
      if (m.uniforms.uFlash) m.uniforms.uFlash.value = this.faceFlash * 0.85;
    }

    // charge / sparking particles
    if (this.state === S.CHARGE) {
      const p = this.center(_v);
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU), r = rand(1.2, 3.4);
        w.fx.fx.ember.emit({
          x: this.pos.x + Math.cos(a) * r, y: this.pos.y + rand(-0.2, 0.6), z: this.pos.z + Math.sin(a) * r,
          vx: -Math.cos(a) * r * 2.2, vy: rand(1, 4), vz: -Math.sin(a) * r * 2.2,
          size: rand(0.15, 0.4), growth: -0.4, life: rand(0.25, 0.5),
          color: this.energyColor, alpha: 1,
        });
      }
      if (Math.random() < 0.06) w.fx.chargePulse(p.clone(), this.energyColor.getHex(), 2.6);
    }
    if (this.sparking && Math.random() < 0.25) {
      const p = this.center(_v);
      w.fx.hitSpark(p.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1.2), rand(-1, 1))),
        this.energyColor.getHex(), 0.35);
    }

    // afterimages while boosting
    if ((this.state === S.BOOST && this.vel.length() > 12) || this.afterimageBuff > 0) {
      if (Math.random() < 0.6) this.after.spawn(0.25);
    }
    this.after.update(dt);

    // trail follow
    if (this.trail) {
      this.root.updateMatrixWorld(true);
      const hand = this.trailBone;
      if (hand) {
        hand.getWorldPosition(_v);
        _v2.set(0, 1, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
        this.trail.push(_v, _v2);
      }
    }

    // cape + tail secondary motion
    this.updateSecondary(dt);

    // blob shadow
    const gy = w.stage.groundY;
    const h = clamp(1 - (this.pos.y - gy) / 14, 0.06, 1);
    this.shadow.position.set(this.pos.x, gy + 0.04, this.pos.z);
    const s = (1.9 + (this.pos.y - gy) * 0.16) * (this.spec.scale ?? 1);
    this.shadow.scale.set(s, 1, s);
    this.shadow.material.uniforms.uOpacity.value = 0.55 * h;
    this.shadow.visible = this.pos.y - gy < 16;
  }

  updateSecondary(dt) {
    const t = this.world.fx.time;
    const speed = clamp(this.vel.length() / 20, 0, 1.4);
    if (this.rig.cape) {
      const g = this.rig.cape.geometry;
      const pos = g.attributes.position;
      const base = this.rig.cape.userData.basePos;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const k = clamp(-y / 0.72, 0, 1);
        pos.setZ(i, Math.sin(t * 5 + x * 4 + y * 3) * 0.05 * k - k * k * (0.12 + speed * 0.5));
        pos.setY(i, y + k * speed * 0.22);
      }
      pos.needsUpdate = true;
    }
    if (this.rig.tail) {
      const bones = this.rig.tail.userData.bones;
      for (let i = 0; i < bones.length; i++) {
        bones[i].rotation.x = 0.25 + Math.sin(t * 3.2 - i * 0.5) * 0.16;
        bones[i].rotation.z = Math.sin(t * 2.4 - i * 0.4) * 0.12;
      }
    }
    if (this.rig.hairGroup) {
      this.rig.hairGroup.rotation.x = -clamp(speed * 0.28, 0, 0.4);
    }
  }

  startTrail() {
    this.stopTrail();
    const clip = this.attackClip;
    const kick = clip === 'rush4' || clip === 'rush5';
    this.trailBone = kick
      ? (clip === 'rush4' ? this.rig.legs.L.ft : this.rig.legs.R.ft)
      : (clip === 'rush2' || clip === 'rush3' ? this.rig.arms.L.hd : this.rig.arms.R.hd);
    this.trail = this.world.fx.swingTrail(this.energyColor.getHex(), kick ? 0.5 : 0.36, 12);
  }

  stopTrail() {
    if (this.trail) { this.trail.stop(); this.trail = null; this.trailBone = null; }
  }

  distTo(f) {
    if (!f) return 999;
    return this.pos.distanceTo(f.pos);
  }

  reset(x, z, yaw) {
    this.hp = this.maxHp;
    this.ki = 45;
    this.dead = false;
    this.sparking = false;
    this.combo = 0;
    this.vel.set(0, 0, 0);
    this.flying = false;
    this.invuln = 0;
    this.armor = 0;
    this.speedBuff = 1;
    this.rushSuper = null;
    this.stopTrail();
    this.setState(S.IDLE);
    this.anim.play('idle', { fade: 0 });
    this.place(x, this.world.stage.groundY, z, yaw);
    this.world.audio.stopLoop(`chg${this.index}`);
    this.world.audio.stopLoop(`beam${this.index}`);
  }

  dispose() {
    this.world.scene.remove(this.root, this.shadow);
    this.after.dispose();
  }
}
