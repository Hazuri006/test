/* ============================================================
 * MONSTRES 3D — Modèles articulés, IA de poursuite, animations
 * ============================================================ */

class Monster {
  constructor(scene, x, z, type) {
    const def = MONSTER_TYPES[type];
    this.scene = scene; this.def = def; this.type = type;
    this.x = x; this.z = z;
    this.radius = def.radius;
    this.hp = def.hp; this.maxHp = def.hp;
    this.dead = false; this.removed = false; this.dying = false; this.deathT = 0;
    this.atkCd = 0; this.bossAtkCd = 3; this.growlCd = Math.random() * 4;
    this.hurtFlash = 0;
    this.phase = Math.random() * 6;
    this.wanderAng = Math.random() * Math.PI * 2; this.wanderCd = 0;
    this.enrage = false;
    this.angle = 0;
    this.hitMeshes = [];

    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    if (type === "hound") this._buildHound(); else this._buildHumanoid();
    this.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.monster = this; this.hitMeshes.push(o); } });
    scene.add(this.group);
  }

  _mat(color, rough) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough === undefined ? 0.95 : rough, metalness: 0 });
  }

  _buildHumanoid() {
    const def = this.def, scale = def.height / 1.85;
    const skin = this._mat(def.color);
    const cloth = this._mat(this.type === "boss" ? 0x3a0d0d : 0x2c2c30);

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32 * scale, 0.7 * scale, 4, 8), cloth);
    this.torso.position.y = 1.05 * scale;
    this.group.add(this.torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.26 * scale, 12, 12), skin);
    this.head.position.y = 1.62 * scale;
    this.group.add(this.head);

    // yeux brillants (face +Z)
    const eyeMat = new THREE.MeshStandardMaterial({
      color: this.type === "boss" ? 0xffd000 : 0xff2020,
      emissive: this.type === "boss" ? 0xffaa00 : 0xff0000, emissiveIntensity: 2,
    });
    const er = 0.05 * scale;
    [-1, 1].forEach(s => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(er, 6, 6), eyeMat);
      e.position.set(0.1 * scale * s, 1.64 * scale, 0.22 * scale);
      this.group.add(e);
    });

    const armGeo = new THREE.BoxGeometry(0.16 * scale, 0.7 * scale, 0.16 * scale);
    this.armL = new THREE.Mesh(armGeo, skin);
    this.armR = new THREE.Mesh(armGeo, skin);
    this.armL.position.set(-0.42 * scale, 1.15 * scale, 0.15 * scale);
    this.armR.position.set(0.42 * scale, 1.15 * scale, 0.15 * scale);
    this.armL.rotation.x = this.armR.rotation.x = -1.1; // bras tendus en avant
    this.group.add(this.armL, this.armR);

    const legGeo = new THREE.BoxGeometry(0.18 * scale, 0.8 * scale, 0.18 * scale);
    this.legL = new THREE.Mesh(legGeo, cloth);
    this.legR = new THREE.Mesh(legGeo, cloth);
    this.legL.position.set(-0.16 * scale, 0.4 * scale, 0);
    this.legR.position.set(0.16 * scale, 0.4 * scale, 0);
    this.group.add(this.legL, this.legR);

    if (this.type === "boss") {
      const hornMat = this._mat(0x111111, 0.6);
      [-1, 1].forEach(s => {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08 * scale, 0.4 * scale, 8), hornMat);
        horn.position.set(0.14 * scale * s, 1.9 * scale, 0);
        horn.rotation.z = s * -0.4;
        this.group.add(horn);
      });
    }
  }

  _buildHound() {
    const skin = this._mat(this.def.color, 0.85);
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), skin);
    this.torso.rotation.z = Math.PI / 2;
    this.torso.position.y = 0.6;
    this.group.add(this.torso);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.4), skin);
    this.head.position.set(0, 0.62, 0.55);
    this.group.add(this.head);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff0000, emissiveIntensity: 2 });
    [-1, 1].forEach(s => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
      e.position.set(0.1 * s, 0.68, 0.74); this.group.add(e);
    });
    const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    this.legs = [];
    [[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.35], [0.18, -0.35]].forEach(p => {
      const l = new THREE.Mesh(legGeo, skin);
      l.position.set(p[0], 0.25, p[1]); this.group.add(l); this.legs.push(l);
    });
  }

  _blocked(x, z) {
    const r = this.radius;
    return World.isSolidWorld(x - r, z) || World.isSolidWorld(x + r, z) ||
           World.isSolidWorld(x, z - r) || World.isSolidWorld(x, z + r);
  }

  _move(dx, dz) {
    if (dx !== 0 && !this._blocked(this.x + dx, this.z)) this.x += dx;
    if (dz !== 0 && !this._blocked(this.x, this.z + dz)) this.z += dz;
  }

  hurt(dmg, game, hitPoint) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtFlash = 0.12;
    Sfx.play("hit");
    if (hitPoint) game.spawnBlood(hitPoint.x, hitPoint.y, hitPoint.z);
    // recul
    const a = Math.atan2(this.x - game.player.x, this.z - game.player.z);
    const kb = this.type === "boss" ? 0.1 : 0.35;
    this._move(Math.sin(a) * kb, Math.cos(a) * kb);
    if (this.hp <= 0) this.die(game);
  }

  die(game) {
    this.dead = true; this.dying = true; this.deathT = 0.9;
    Sfx.play("death");
    game.spawnBlood(this.x, 0.1, this.z, 14);
    game.addBloodDecal(this.x, this.z, this.radius * 2.2);
    game.score += this.def.score;
    game.onMonsterKilled(this);
  }

  update(dt, game) {
    if (this.removed) return;
    this.phase += dt * 6;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;

    // teinte de douleur (sur le torse uniquement, pas les yeux)
    if (this.torso && this.torso.material) {
      this.torso.material.emissive.setHex(this.hurtFlash > 0 ? 0x661111 : 0x000000);
    }

    if (this.dying) {
      this.deathT -= dt;
      this.group.rotation.x = Math.min(Math.PI / 2, this.group.rotation.x + dt * 3);
      this.group.position.y -= dt * 0.5;
      this.group.scale.multiplyScalar(1 - dt * 0.4);
      if (this.deathT <= 0) { this.scene.remove(this.group); this.removed = true; }
      return;
    }

    const p = game.player;
    const ddx = p.x - this.x, ddz = p.z - this.z;
    const d = Math.hypot(ddx, ddz);

    if (this.type === "boss" && !this.enrage && this.hp < this.maxHp * 0.35) {
      this.enrage = true; game.toast("⚠ LE GARDIEN ENTRE EN FUREUR !"); Sfx.play("growl");
    }
    let speed = this.def.speed * (this.enrage ? 1.6 : 1) * dt;

    if (d < this.def.aggro) {
      this.angle = Math.atan2(ddx, ddz);
      this.group.rotation.y = this.angle;
      if (d > this.def.touch) this._move((ddx / d) * speed, (ddz / d) * speed);

      // animation de marche
      this._animate(true, dt);

      if (this.growlCd <= 0 && d < 22) { Sfx.play("growl"); this.growlCd = 3 + Math.random() * 4; }
      else this.growlCd -= dt;

      if (this.atkCd > 0) this.atkCd -= dt;
      if (d < this.def.touch + p.radius && this.atkCd <= 0) {
        p.takeDamage(this.def.dmg, game); this.atkCd = 0.9;
      }

      if (this.type === "boss") {
        this.bossAtkCd -= dt;
        if (this.bossAtkCd <= 0 && d < 45) {
          game.spawnEnemyProjectile(this, p);
          this.bossAtkCd = this.enrage ? 1.4 : 2.4;
        }
      }
    } else {
      // errance
      if (this.wanderCd <= 0) { this.wanderAng = Math.random() * Math.PI * 2; this.wanderCd = 1 + Math.random() * 2; }
      else this.wanderCd -= dt;
      this._move(Math.sin(this.wanderAng) * speed * 0.3, Math.cos(this.wanderAng) * speed * 0.3);
      this.group.rotation.y = this.wanderAng;
      this._animate(this.def.speed > 0, dt, 0.4);
      this.growlCd -= dt;
    }

    this.group.position.set(this.x, this.group.position.y, this.z);
  }

  _animate(moving, dt, amp) {
    amp = amp || 1;
    const s = Math.sin(this.phase) * 0.6 * amp;
    if (this.type === "hound") {
      if (this.legs) this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + i * 1.6) * 0.7 * amp; });
      this.group.position.y = Math.abs(Math.sin(this.phase)) * 0.06;
    } else {
      if (this.legL) { this.legL.rotation.x = s; this.legR.rotation.x = -s; }
      if (this.armL) { this.armL.rotation.x = -1.1 + Math.sin(this.phase) * 0.15; }
      if (this.torso) this.torso.rotation.z = Math.sin(this.phase * 0.5) * 0.05; // boitement
    }
  }
}
