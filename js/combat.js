'use strict';
/* ============================================================================
   combat.js — the arena.

   Step onto the transit pad in the hangar and you are put down in the arena at
   the other end of the station, with three waves of security drones between you
   and the payout.  Clear all three and you are paid; die and you wake up in the
   hangar with nothing.

   The shooting is hitscan.  At arena ranges a projectile fast enough to feel
   like a weapon is a projectile you never see, and one slow enough to see is
   one that misses a moving target — so the player's fire is instantaneous and
   the *drones* shoot slow visible bolts you can side-step.  That asymmetry is
   what makes the fight readable: everything coming at you is dodgeable and
   everything you send is not.

   Drones and bolts are one instanced draw each.  Impact sparks are the same
   mesh as the bolts, which is why a hit reads as the bolt stopping.
   ============================================================================ */

const ARENA = {
  waves: [
    { n: 4, hp: 60, speed: 9, fire: 2.4, dmg: 9, reward: 1400 },
    { n: 6, hp: 90, speed: 11, fire: 1.9, dmg: 12, reward: 3200 },
    { n: 8, hp: 130, speed: 13, fire: 1.5, dmg: 15, reward: 7500 }
  ],
  clearBonus: 5000,
  playerHp: 100,
  boltSpeed: 44,
  hover: 14            // metres above the deck the drones sit at
};

const Combat = {
  state: 'off',        // off | brief | fight | won | lost
  wave: 0,
  timer: 0,
  hp: 0,
  enemies: null,
  bolts: null,
  sparks: null,
  cool: 0,
  hitFlash: 0,
  hurtFlash: 0,
  earned: 0,
  droneMesh: null,
  boltMesh: null,
  droneInst: null,
  boltInst: null,
  droneCount: 0,
  boltCount: 0,

  build(gl) {
    if (this.droneMesh) return;
    /* Drone: a dark angular shell with a lit eye, so it reads against the deck
       at any range and you can tell which way it is looking. */
    const B = new MeshBuilder();
    const shell = [0.20, 0.22, 0.27], trim = [0.11, 0.12, 0.15];
    B.box(-1.1, -0.7, -1.5, 1.1, 0.7, 1.2, shell, 0, 0, 0.45, true);
    B.box(-1.5, -0.25, -0.4, -1.1, 0.25, 0.9, trim, 0, 0);
    B.box(1.1, -0.25, -0.4, 1.5, 0.25, 0.9, trim, 0, 0);
    B.box(-0.45, -0.30, -1.72, 0.45, 0.30, -1.42, [1.0, 0.25, 0.18], 0, 1);
    B.box(-0.8, 0.7, -0.5, 0.8, 0.95, 0.6, trim, 0, 0);
    B.box(-0.30, -0.16, 1.16, 0.30, 0.16, 1.34, [1.0, 0.45, 0.20], 0, 1);
    this.droneMesh = B.buildInstanced(gl, new Float32Array(0));

    const S = new MeshBuilder();
    S.sphere(0, 0, 0, 1, 1, [1.0, 0.55, 0.25], 8);
    this.boltMesh = S.buildInstanced(gl, new Float32Array(0));

    this.droneInst = new Float32Array(16 * 11);
    this.boltInst = new Float32Array(220 * 11);
    this.enemies = [];
    this.bolts = [];
    this.sparks = [];
  },

  /* ------------------------------------------------------------- flow -- */
  enter(game) {
    this.build(game.gl);
    const r = STATION.rooms.arena;
    V3.set(_cbL, 0, r.floor + FOOT.eyeHeight, r.back - 90);
    Station.toWorld(game.player.pos, _cbL);
    V3.zero(game.player.vel);
    game.player.room = 'arena';
    V3.set(_cbL, 0, 0, -1);
    Station.axis(_cbF, _cbL);
    game.player.setHeading(_cbF);
    game.player.grounded = true;

    this.state = 'brief';
    this.wave = 0;
    this.timer = 4;
    this.hp = ARENA.playerHp;
    this.earned = 0;
    this.enemies.length = 0;
    this.bolts.length = 0;
    this.sparks.length = 0;
    game.notify('ARENA — THREE WAVES. GOOD LUCK.', 'warn');
  },

  leave(game, won) {
    this.state = 'off';
    this.enemies.length = 0;
    this.bolts.length = 0;
    const r = STATION.rooms.bay;
    V3.set(_cbL, STATION_KIOSKS[1].x, r.floor + FOOT.eyeHeight, STATION_KIOSKS[1].z - 16);
    Station.toWorld(game.player.pos, _cbL);
    V3.zero(game.player.vel);
    game.player.room = 'bay';
    game.player.grounded = true;
    if (won) {
      game.credits += this.earned;
      game.notify('ARENA CLEARED — ' + this.earned.toLocaleString() + ' CR', 'ok');
    } else if (this.earned > 0 || this.state === 'lost') {
      game.notify('ARENA FAILED — NO PAYOUT', 'warn');
    }
    this.earned = 0;
  },

  spawnWave(game) {
    const w = ARENA.waves[this.wave];
    const r = STATION.rooms.arena;
    const rng = Math.random;
    for (let i = 0; i < w.n; i++) {
      const x = lerp(-r.x + 40, r.x - 40, rng());
      const z = lerp(r.front + 80, r.back - 150, rng());
      this.enemies.push({
        local: V3.new(x, r.floor + ARENA.hover + rng() * 10, z),
        pos: V3.new(),
        vel: V3.new(),
        hp: w.hp, maxHp: w.hp,
        cool: 1 + rng() * w.fire,
        flash: 0,
        phase: rng() * TAU,
        rot: Q4.new()
      });
    }
    game.notify('WAVE ' + (this.wave + 1) + ' OF ' + ARENA.waves.length, 'warn');
  },

  /* ----------------------------------------------------------- update -- */
  update(dt, game) {
    if (this.state === 'off') return;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    this.cool = Math.max(0, this.cool - dt);

    if (this.state === 'brief') {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'fight'; this.spawnWave(game); }
      return;
    }
    if (this.state !== 'fight') return;

    const w = ARENA.waves[this.wave];
    const r = STATION.rooms.arena;
    Station.toLocal(_cbPL, game.player.pos);

    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt * 5);
      e.phase += dt * 1.7;

      /* Close to a stand-off distance, then circle.  A drone that flies
         straight at you is a drone you shoot without moving. */
      V3.sub(_cbTo, _cbPL, e.local);
      const d = V3.len(_cbTo) || 1;
      V3.scale(_cbTo, _cbTo, 1 / d);
      const want = d > 34 ? 1 : (d < 20 ? -1 : 0);
      V3.scale(_cbW, _cbTo, want * w.speed);
      /* strafe: perpendicular in the deck plane */
      _cbW[0] += -_cbTo[2] * Math.sin(e.phase) * w.speed * 0.8;
      _cbW[2] += _cbTo[0] * Math.sin(e.phase) * w.speed * 0.8;
      _cbW[1] += Math.sin(e.phase * 0.7) * 3.0;
      V3.lerp(e.vel, e.vel, _cbW, 1 - Math.exp(-dt * 2.2));
      V3.addScaled(e.local, e.local, e.vel, dt);
      e.local[0] = clamp(e.local[0], -r.x + 14, r.x - 14);
      e.local[2] = clamp(e.local[2], r.front + 20, r.back - 20);
      e.local[1] = clamp(e.local[1], r.floor + 6, r.roof - 10);
      Station.toWorld(e.pos, e.local);

      /* face the player */
      V3.sub(_cbF, game.player.pos, e.pos);
      if (V3.lenSq(_cbF) > 1e-6) {
        V3.normalize(_cbF, _cbF);
        V3.set(_cbL, 0, 1, 0); Station.axis(_cbU, _cbL);
        V3.normalize(_cbR, V3.cross(_cbR, _cbF, _cbU));
        V3.normalize(_cbU2, V3.cross(_cbU2, _cbR, _cbF));
        Q4.fromBasis(e.rot, _cbR, _cbU2, _cbF);
      }

      e.cool -= dt;
      if (e.cool <= 0 && d < 90) {
        e.cool = w.fire * (0.7 + Math.random() * 0.6);
        const b = {
          pos: V3.new(), vel: V3.new(), life: 3.5, dmg: w.dmg, hostile: true
        };
        V3.copy(b.pos, e.pos);
        V3.sub(_cbF, game.player.pos, e.pos);
        V3.normalize(_cbF, _cbF);
        /* Lead the shot a little, but badly, so strafing works. */
        V3.addScaled(_cbF, _cbF, game.player.vel, 0.010);
        V3.normalize(_cbF, _cbF);
        V3.scale(b.vel, _cbF, ARENA.boltSpeed);
        this.bolts.push(b);
        game.audio.ui();
      }
    }

    /* bolts */
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      V3.addScaled(b.pos, b.pos, b.vel, dt);
      b.life -= dt;
      if (V3.distSq(b.pos, game.player.pos) < 2.6 * 2.6) {
        this.damage(b.dmg, game);
        this.spark(b.pos);
        this.bolts.splice(i, 1);
        continue;
      }
      if (b.life <= 0) { this.bolts.splice(i, 1); }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      this.sparks[i].life -= dt * 3.2;
      if (this.sparks[i].life <= 0) this.sparks.splice(i, 1);
    }

    if (!this.enemies.length) {
      this.earned += w.reward;
      game.notify('WAVE CLEAR — ' + w.reward.toLocaleString() + ' CR BANKED', 'ok');
      this.wave++;
      this.hp = Math.min(ARENA.playerHp, this.hp + 25);
      if (this.wave >= ARENA.waves.length) {
        this.earned += ARENA.clearBonus;
        this.state = 'won';
        this.timer = 3;
        game.notify('ALL WAVES CLEAR', 'ok');
      } else {
        this.state = 'brief';
        this.timer = 5;
      }
    }
  },

  damage(n, game) {
    this.hp -= n;
    this.hurtFlash = 1;
    game.impact(0.35);
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'lost';
      this.earned = 0;
      game.notify('DOWN — MEDICAL RECALL', 'warn');
      this.leave(game, false);
    }
  },

  spark(pos) {
    if (this.sparks.length > 40) return;
    const s = { pos: V3.new(), life: 1 };
    V3.copy(s.pos, pos);
    this.sparks.push(s);
  },

  /* ------------------------------------------------------------- fire -- */
  fire(game) {
    if (this.state !== 'fight' || this.cool > 0) return;
    const wp = Ships.weaponSpec();
    this.cool = wp.rate;
    game.audio.ui();
    let hitAny = false;
    for (let p = 0; p < wp.pellets; p++) {
      V3.copy(_cbF, game.camFwd);
      if (wp.spread > 0) {
        /* Spread is in radians of half-cone.  Scaling it up "to feel like a
           weapon" turns a 0.3-degree blaster into a 4-degree one, which at
           arena range is a fourteen-metre miss. */
        V3.addScaled(_cbF, _cbF, game.camRight, (Math.random() * 2 - 1) * wp.spread * 2);
        V3.addScaled(_cbF, _cbF, game.camUp, (Math.random() * 2 - 1) * wp.spread * 2);
        V3.normalize(_cbF, _cbF);
      }
      /* Nearest sphere along the ray.  Drones are two metres across, so a
         fixed radius is close enough and much cheaper than triangle work. */
      let best = null, bt = wp.range;
      for (const e of this.enemies) {
        V3.sub(_cbTo, e.pos, game.camPos);
        const t = V3.dot(_cbTo, _cbF);
        if (t < 0 || t > bt) continue;
        V3.addScaled(_cbW, _cbTo, _cbF, -t);
        if (V3.lenSq(_cbW) < 2.2 * 2.2) { bt = t; best = e; }
      }
      if (best) {
        best.hp -= wp.dmg;
        best.flash = 1;
        V3.addScaled(_cbW, game.camPos, _cbF, bt);
        this.spark(_cbW);
        hitAny = true;
        if (best.hp <= 0) {
          this.spark(best.pos);
          this.enemies.splice(this.enemies.indexOf(best), 1);
        }
      }
    }
    if (hitAny) this.hitFlash = 1;
  },

  /* ------------------------------------------------------------- draw -- */
  fillInstances(camPos) {
    this.droneCount = 0;
    this.boltCount = 0;
    if (!this.enemies) return;
    for (const e of this.enemies) {
      if (this.droneCount >= 16) break;
      const o = this.droneCount * 11;
      this.droneInst[o] = e.pos[0] - camPos[0];
      this.droneInst[o + 1] = e.pos[1] - camPos[1];
      this.droneInst[o + 2] = e.pos[2] - camPos[2];
      this.droneInst[o + 3] = e.rot[0]; this.droneInst[o + 4] = e.rot[1];
      this.droneInst[o + 5] = e.rot[2]; this.droneInst[o + 6] = e.rot[3];
      const f = 1 + e.flash * 2.5;
      this.droneInst[o + 7] = f; this.droneInst[o + 8] = f * (1 - e.flash * 0.5);
      this.droneInst[o + 9] = f * (1 - e.flash * 0.5);
      this.droneInst[o + 10] = 1;
      this.droneCount++;
    }
    const push = (pos, scale, tint) => {
      if (this.boltCount >= 220) return;
      const o = this.boltCount * 11;
      this.boltInst[o] = pos[0] - camPos[0];
      this.boltInst[o + 1] = pos[1] - camPos[1];
      this.boltInst[o + 2] = pos[2] - camPos[2];
      this.boltInst[o + 3] = 0; this.boltInst[o + 4] = 0;
      this.boltInst[o + 5] = 0; this.boltInst[o + 6] = 1;
      this.boltInst[o + 7] = tint[0]; this.boltInst[o + 8] = tint[1]; this.boltInst[o + 9] = tint[2];
      this.boltInst[o + 10] = scale;
      this.boltCount++;
    };
    for (const b of this.bolts) push(b.pos, 0.42, _CB_HOSTILE);
    for (const s of this.sparks) push(s.pos, 0.3 + (1 - s.life) * 2.4, _CB_SPARK);
  }
};

const _CB_HOSTILE = [1.0, 0.4, 0.2];
const _CB_SPARK = [1.0, 0.85, 0.5];
const _cbL = V3.new(), _cbF = V3.new(), _cbU = V3.new(), _cbU2 = V3.new(), _cbR = V3.new();
const _cbTo = V3.new(), _cbW = V3.new(), _cbPL = V3.new();
