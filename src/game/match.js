/* ============================================================
   Match — the world object every system talks to. Owns the
   stage, the two fighters, projectiles, beams, rounds and the
   cinematic flow.
   ============================================================ */
import * as THREE from 'three';
import { Fighter, S } from './fighter.js';
import { AIController, DIFFICULTIES } from './ai.js';
import { BattleCamera } from './camera.js';
import { Projectile } from './projectiles.js';
import { buildStage } from '../stages/stages.js';
import { BY_ID, ROSTER } from '../characters/roster.js';
import { syncToonEnv } from '../graphics/materials.js';
import { clamp, rand, pick, lerp } from '../core/utils.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

const ROUND_TIME = 90;
const WINS_NEEDED = 2;

export class Match {
  constructor(ctx, config) {
    this.scene = ctx.scene;
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.ui = ctx.hud;
    this.input = ctx.input;
    this.post = ctx.post;
    this.config = config;

    this.split = config.mode === 'local';
    this.projectiles = [];
    this.activeBeams = [];
    this.struggle = null;
    this.hitstopT = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.over = false;
    this.wave = 1;

    this.stage = buildStage(config.stage, this.scene);
    syncToonEnv(this.scene);

    const specA = BY_ID[config.p1];
    const specB = BY_ID[config.p2];
    this.fighters = [new Fighter(this, specA, 0), new Fighter(this, specB, 1)];
    this.fighters[0].foe = this.fighters[1];
    this.fighters[1].foe = this.fighters[0];
    for (const f of this.fighters) f.world = this;
    syncToonEnv(this.scene);

    this.ai = [];
    if (config.mode !== 'local') {
      this.ai[1] = new AIController(this.fighters[1], config.difficulty ?? 1);
    }
    if (config.mode === 'demo') {
      this.ai[0] = new AIController(this.fighters[0], 2);
    }

    this.cameras = [new BattleCamera(), new BattleCamera()];
    for (const f of this.fighters) f.world = this;

    this.wins = [0, 0];
    this.round = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.timer = ROUND_TIME;
    this.elapsed = 0;

    this.ui.setFighters(this.fighters[0], this.fighters[1]);
    this.ui.setRounds(this.wins, WINS_NEEDED);
    this.ui.show(true);

    this.startRound(true);
  }

  /* ---------------- rounds ---------------- */

  startRound(first = false) {
    this.round++;
    this.timer = ROUND_TIME;
    this.phase = 'intro';
    this.phaseT = 0;
    this.over = false;
    this.clearShots();
    const r = 4.8;   // fighting-game distance, not two dots on a plain
    this.fighters[0].reset(0, -r, 0);
    this.fighters[1].reset(0, r, Math.PI);
    this.fighters[0].anim.play('entrance', { fade: 0, restart: true });
    this.fighters[1].anim.play('entrance', { fade: 0, restart: true });
    for (const f of this.fighters) f.locked = true;
    for (let i = 0; i < 2; i++) {
      this.cameras[i].update(0.016, this.fighters[i], this.fighters[1 - i], this.fx, true);
    }
    this.ui.setRounds(this.wins, WINS_NEEDED);
    this.ui.announce(this.config.mode === 'survival' ? `VAGUE ${this.wave}` : `ROUND ${this.round}`);
    this.audio.bell();
    this.audio.music.play(this.stage.id);
    this.audio.music.setIntensity(0.7);
  }

  beginFight() {
    this.phase = 'fight';
    this.phaseT = 0;
    for (const f of this.fighters) f.locked = false;
    this.ui.announce('COMBATTEZ !');
    this.audio.countdown(true);
    this.audio.music.setIntensity(1);
  }

  endRound(winner, reason) {
    if (this.phase === 'roundend' || this.phase === 'matchover') return;
    this.phase = 'roundend';
    this.phaseT = 0;
    this.over = true;
    this.audio.stopLoop('beam0'); this.audio.stopLoop('beam1');
    this.audio.stopLoop('chg0'); this.audio.stopLoop('chg1');
    this.ui.showStruggle(false);
    this.struggle = null;

    if (winner >= 0) this.wins[winner]++;
    this.ui.setRounds(this.wins, WINS_NEEDED);
    this.ui.announce(reason === 'time' ? 'TEMPS ÉCOULÉ' : 'K.O. !');
    this.slowMotion(1.6, 0.32);
    this.audio.music.setIntensity(0.35);

    if (winner >= 0) {
      const w = this.fighters[winner];
      this.cameras.forEach((c) => c.playCinematic('beam', w, w.foe, 2.2));
    }

    const matchDone = this.wins[0] >= WINS_NEEDED || this.wins[1] >= WINS_NEEDED;
    setTimeout(() => {
      if (this.disposed) return;
      if (matchDone) this.finishMatch();
      else this.startRound();
    }, 3200);
  }

  finishMatch() {
    this.phase = 'matchover';
    const winner = this.wins[0] >= WINS_NEEDED ? 0 : 1;
    const w = this.fighters[winner], l = this.fighters[1 - winner];
    w.locked = true; l.locked = true;
    w.anim.play('victory', { fade: 0.2, restart: true });
    if (!l.dead) l.anim.play('taunt', { fade: 0.2, restart: true });
    this.audio.music.play('victory');

    if (this.config.mode === 'survival' && winner === 0) {
      this.wave++;
      setTimeout(() => {
        if (this.disposed) return;
        this.nextSurvivalFoe();
      }, 2600);
      return;
    }
    this.onMatchOver?.(winner, {
      dealt: this.fighters[0].stats.dealt,
      maxCombo: this.fighters[0].stats.maxCombo,
      blasts: this.fighters[0].stats.blasts,
      time: this.elapsed,
    });
  }

  nextSurvivalFoe() {
    const others = ROSTER.filter((r) => r.id !== this.fighters[0].spec.id);
    const spec = pick(others);
    const old = this.fighters[1];
    old.dispose();
    const f = new Fighter(this, spec, 1);
    this.fighters[1] = f;
    f.foe = this.fighters[0];
    this.fighters[0].foe = f;
    this.ai[1] = new AIController(f, clamp(1 + Math.floor(this.wave / 2), 0, 3));
    syncToonEnv(this.scene);
    this.ui.setFighters(this.fighters[0], f);
    this.wins = [0, 0];
    this.round = 0;
    this.fighters[0].hp = Math.min(this.fighters[0].maxHp, this.fighters[0].hp + this.fighters[0].maxHp * 0.35);
    const hp = this.fighters[0].hp;
    this.startRound();
    this.fighters[0].hp = hp;
    for (const f2 of this.fighters) f2.locked = true;
  }

  /* ---------------- world API used by fighters ---------------- */

  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }

  slowMotion(dur, scale = 0.3) { this.slowT = dur; this.slowScale = scale; }

  spawnProjectile(o) {
    this.projectiles.push(new Projectile(this, o));
  }

  registerBeam(owner, beam, opts) {
    this.activeBeams.push({ owner, beam, opts, t: 0, hitT: 0 });
    if (opts.ultimate) {
      const idx = owner.index;
      this.cameras.forEach((c, i) => {
        if (!this.split || i === idx) c.playCinematic('beam', owner, owner.foe, 2.2);
      });
      this.post.u.uChroma.value = 0.006;
    }
  }

  onUltimate(f) {
    const idx = f.index;
    this.cameras.forEach((c, i) => {
      if (!this.split || i === idx) c.playCinematic('charge', f, f.foe, 2.0);
    });
    this.fx.hooks.flash?.(0.18, f.energyColor.getHex());
    this.audio.music.setIntensity(0.5);
  }

  onKO(loser, killer) {
    const winner = killer ? killer.index : 1 - loser.index;
    this.audio.music.setIntensity(0.3);
    setTimeout(() => {
      if (this.disposed) return;
      this.endRound(winner, 'ko');
    }, 900);
  }

  clearShots() {
    for (const p of this.projectiles) p.dispose();
    this.projectiles.length = 0;
    this.activeBeams.length = 0;
    this.fx.clear();
  }

  /* ---------------- update ---------------- */

  update(dt) {
    this.phaseT += dt;

    // phase progression
    if (this.phase === 'intro' && this.phaseT > 1.9) this.beginFight();
    if (this.phase === 'fight') {
      this.elapsed += dt;
      this.timer -= dt;
      this.ui.setTimer(this.timer);
      if (this.timer <= 0) {
        const a = this.fighters[0].hp / this.fighters[0].maxHp;
        const b = this.fighters[1].hp / this.fighters[1].maxHp;
        this.endRound(a === b ? -1 : (a > b ? 0 : 1), 'time');
      }
      const hpLow = Math.min(this.fighters[0].hp / this.fighters[0].maxHp,
                             this.fighters[1].hp / this.fighters[1].maxHp);
      this.audio.music.setIntensity(hpLow < 0.3 ? 1.25 : 1);
    }

    // time modifiers
    let scale = 1;
    if (this.hitstopT > 0) { this.hitstopT -= dt; scale = 0.055; }
    if (this.slowT > 0) { this.slowT -= dt; scale = Math.min(scale, this.slowScale); }
    const gdt = dt * scale;

    // fighters
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      if (this.ai[i]) this.ai[i].update(gdt);
      else f.update(gdt, this.playerInput(i));
    }

    // keep fighters from overlapping
    this.separate();

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].update(gdt)) this.projectiles.splice(i, 1);
    }

    this.updateBeams(gdt);
    this.updateStruggle(dt);

    // mouse-look drives player 1's camera
    const look = this.input.mouseLook ? this.input.takeLook() : null;
    this.cameras[0].manual = !!this.input.mouseLook;
    if (look && (look.x || look.y)) this.cameras[0].addLook(look.x, look.y);

    // cameras
    for (let i = 0; i < (this.split ? 2 : 1); i++) {
      this.cameras[i].update(dt, this.fighters[i], this.fighters[1 - i], this.fx);
    }

    this.stage.update(dt);
    this.ui.update(dt);
    this.updatePost(dt);
  }

  playerInput(i) {
    if (this.config.mode === 'local') return this.input.players[i];
    return i === 0 ? this.input.players[0] : null;
  }

  separate() {
    const [a, b] = this.fighters;
    const d = _v.copy(b.pos).sub(a.pos);
    d.y *= 0.4;
    const dist = d.length();
    const minD = 1.5 * ((a.spec.scale ?? 1) + (b.spec.scale ?? 1)) * 0.5;
    if (dist > 1e-4 && dist < minD) {
      d.multiplyScalar((minD - dist) / dist * 0.5);
      if (a.state !== S.BLOWN) a.pos.sub(d);
      if (b.state !== S.BLOWN) b.pos.add(d);
      a.root.position.copy(a.pos);
      b.root.position.copy(b.pos);
    }
  }

  updateBeams(dt) {
    for (let i = this.activeBeams.length - 1; i >= 0; i--) {
      const ab = this.activeBeams[i];
      ab.t += dt;
      const beam = ab.beam;
      const owner = ab.owner;
      if (this.fx.beams.indexOf(beam) < 0 || ab.t > ab.opts.life) {
        this.activeBeams.splice(i, 1);
        this.audio.stopLoop(`beam${owner.index}`);
        continue;
      }
      // origin follows the caster's hands
      const origin = _v.copy(owner.pos)
        .setY(owner.pos.y + 1.15 * (owner.spec.scale ?? 1))
        .add(_v2.set(Math.sin(owner.yaw), 0, Math.cos(owner.yaw)).multiplyScalar(0.8));
      beam.setOrigin(origin);
      // gentle tracking
      const foe = owner.foe;
      if (foe && !this.struggle) {
        const want = _v2.copy(foe.center(_v3)).sub(origin).normalize();
        beam.dir.lerp(want, clamp(1.1 * dt, 0, 1)).normalize();
      }

      if (this.struggle) continue;

      // collision along the beam
      if (foe && !foe.dead) {
        const c = foe.center(_v3);
        const toC = _v2.copy(c).sub(origin);
        const along = clamp(toC.dot(beam.dir), 0, beam.length);
        const closest = _v2.copy(beam.dir).multiplyScalar(along).add(origin);
        const dist = closest.distanceTo(c);
        if (dist < beam.radius + 0.95 * (foe.spec.scale ?? 1) && along > 0.6) {
          ab.hitT += dt;
          if (ab.hitT > 0.09) {
            ab.hitT = 0;
            const tick = ab.opts.damage * 0.09 / ab.opts.life;
            foe.takeHit({
              damage: tick, kind: 'blast', from: owner, point: closest.clone(),
              color: ab.opts.color, knock: ab.opts.ultimate ? 30 : 14,
            });
            this.fx.hitSpark(closest, ab.opts.color, 1.2);
            beam.blocked = false;
          }
        }
      }

      // ground scorch
      if (beam.tipPos.y < this.stage.groundY + 1.2 && Math.random() < 0.3) {
        this.fx.groundImpact(_v2.set(beam.tipPos.x, this.stage.groundY, beam.tipPos.z), 0.7);
      }
    }

    // beam clash detection
    if (!this.struggle && this.activeBeams.length >= 2) {
      const [a, b] = this.activeBeams;
      if (a.owner !== b.owner) {
        const d = _v.copy(a.owner.pos).sub(b.owner.pos).setY(0).normalize();
        const da = _v2.copy(a.beam.dir).setY(0).normalize();
        if (da.dot(d) < -0.35) this.startStruggle(a, b);
      }
    }
  }

  startStruggle(a, b) {
    const mid = _v.copy(a.owner.pos).lerp(b.owner.pos, 0.5);
    mid.y += 1.2;
    this.struggle = {
      a, b, balance: 0, t: 0,
      pos: mid.clone(),
      sphere: this.fx.sphereMesh(0xffffff, 0xbfe9ff, { intensity: 1.6, wobble: 0.08 }),
      mash: [0, 0],
    };
    this.struggle.sphere.scale.setScalar(2.2);
    this.ui.showStruggle(true);
    this.fx.shake(0.8, 3);
    this.audio.clash();
    this.audio.explosion(0.9);
    this.cameras.forEach((c) => c.playCinematic('beam', a.owner, b.owner, 3.4));
  }

  updateStruggle(dt) {
    const st = this.struggle;
    if (!st) return;
    st.t += dt;

    const A = st.a.owner, B = st.b.owner;
    if (A.dead || B.dead || this.fx.beams.indexOf(st.a.beam) < 0 || this.fx.beams.indexOf(st.b.beam) < 0) {
      return this.endStruggle(null);
    }

    // input pressure
    const push = (f, idx) => {
      let p = 0;
      const inp = this.ai[idx] ? null : this.playerInput(idx);
      if (inp) {
        if (inp.pressed('rush') || inp.pressed('kiblast')) p += 0.075;
      } else {
        const d = DIFFICULTIES[this.config.difficulty ?? 1];
        p += (0.028 + d.aggro * 0.03) * dt * 12;
      }
      p += (f.atkMul - 1) * 0.015;
      if (f.sparking) p += 0.02;
      return p;
    };

    st.balance += push(A, A.index) - push(B, B.index);
    st.balance -= Math.sign(st.balance) * 0.12 * dt;    // decay to centre
    st.balance = clamp(st.balance, -1.4, 1.4);

    // clash point slides toward the loser
    const mid = _v.copy(A.pos).lerp(B.pos, 0.5);
    mid.y += 1.2;
    const dir = _v2.copy(B.pos).sub(A.pos).setY(0).multiplyScalar(0.5);
    st.pos.copy(mid).addScaledVector(dir, clamp(st.balance, -0.85, 0.85));

    st.sphere.position.copy(st.pos);
    const pulse = 2.4 + Math.sin(st.t * 26) * 0.28 + st.t * 0.16;
    st.sphere.scale.setScalar(pulse);
    st.sphere.material.uniforms.uTime.value = this.fx.time;

    // beams point at the clash
    st.a.beam.setDir(_v3.copy(st.pos).sub(st.a.beam.origin).normalize());
    st.b.beam.setDir(_v3.copy(st.pos).sub(st.b.beam.origin).normalize());
    st.a.beam.length = st.a.beam.origin.distanceTo(st.pos);
    st.b.beam.length = st.b.beam.origin.distanceTo(st.pos);
    st.a.beam.blocked = true; st.b.beam.blocked = true;

    this.ui.setStruggle(-st.balance);
    if (Math.random() < 0.6) {
      this.fx.hitSpark(st.pos.clone().add(_v3.set(rand(-1.6, 1.6), rand(-1.6, 1.6), rand(-1.6, 1.6))),
        0xdff4ff, 1.1);
    }
    this.fx.shake(0.35, 0.2);

    if (Math.abs(st.balance) > 1.15 || st.t > 6.5) {
      const winner = st.balance > 0 ? A : B;
      this.endStruggle(winner);
    }
  }

  endStruggle(winner) {
    const st = this.struggle;
    if (!st) return;
    this.ui.showStruggle(false);
    this.fx.recycle('sphere', st.sphere);
    this.struggle = null;
    if (winner) {
      const loser = winner === st.a.owner ? st.b.owner : st.a.owner;
      const opts = winner === st.a.owner ? st.a.opts : st.b.opts;
      this.fx.explosion(loser.center(_v), opts.color, 16, { shake: 2.6 });
      this.audio.explosion(1.6);
      loser.takeHit({
        damage: opts.damage * 0.75, kind: 'blast', from: winner,
        point: loser.center(_v).clone(), color: opts.color, knock: 46,
      });
      this.fx.hooks.flash?.(0.35, 0xffffff);
    }
    for (const ab of this.activeBeams) { ab.beam.blocked = false; ab.t = ab.opts.life + 1; }
  }

  updatePost(dt) {
    const u = this.post.u;
    const p = this.fighters[0];
    const speed = Math.max(...this.fighters.map((f) => f.vel.length()));
    const rushing = this.fighters.some((f) => f.state === S.BOOST || f.state === S.RUSHIN);
    const targetRadial = rushing ? clamp(speed * 0.0038, 0, 0.055) : 0;
    u.uRadial.value = lerp(u.uRadial.value, targetRadial, 1 - Math.exp(-8 * dt));
    u.uChroma.value = lerp(u.uChroma.value, 0.0014 + (this.struggle ? 0.005 : 0), 1 - Math.exp(-4 * dt));
    u.uSplit.value = this.split ? 1 : 0;

    const anySpark = this.fighters.some((f) => f.sparking);
    u.uSaturate.value = lerp(u.uSaturate.value, anySpark ? 1.25 : 1.12, 1 - Math.exp(-3 * dt));
    u.uExposure.value = lerp(u.uExposure.value, this.struggle ? 1.15 : 1.0, 1 - Math.exp(-3 * dt));
  }

  dispose() {
    this.disposed = true;
    this.clearShots();
    for (const f of this.fighters) f.dispose();
    this.scene.remove(this.stage.group);
    this.audio.stopLoop('beam0'); this.audio.stopLoop('beam1');
    this.audio.stopLoop('chg0'); this.audio.stopLoop('chg1');
    this.ui.show(false);
    this.ui.showStruggle(false);
  }
}
