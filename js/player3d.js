/* ============================================================
 * JOUEUR 3D — Contrôleur FPS, lampe torche, arme, combat
 * ============================================================ */

class Player {
  constructor(camera, scene, startX, startZ) {
    this.cam = camera;
    this.scene = scene;
    this.x = startX; this.z = startZ; this.y = CONFIG.EYE;
    this.yaw = Math.PI;     // regarde vers -Z initial
    this.pitch = 0;
    this.radius = CONFIG.PLAYER_RADIUS;

    this.hp = CONFIG.PLAYER_MAX_HP; this.maxHp = CONFIG.PLAYER_MAX_HP;
    this.stamina = CONFIG.STAMINA_MAX;
    this.ammo = CONFIG.START_AMMO;
    this.inv = { herb: 0, note: 0 };
    this.keys = new Set();

    this.fireCd = 0; this.knifeCd = 0; this.invuln = 0;
    this.bob = 0; this.recoil = 0; this.knifeAnim = 0;
    this.moving = false;

    this._buildViewmodel();
    this._buildFlashlight();
    this.cam.rotation.order = "YXZ";
  }

  hasKey(k) { return this.keys.has(k); }

  _buildViewmodel() {
    const g = new THREE.Group();
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.8 });
    const matGrip = new THREE.MeshStandardMaterial({ color: 0x18120c, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.42), matMetal);
    body.position.set(0, 0, -0.1);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), matMetal);
    barrel.position.set(0, 0.02, -0.34);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.12), matGrip);
    grip.position.set(0, -0.16, 0.02); grip.rotation.x = 0.25;
    g.add(body, barrel, grip);
    g.position.set(0.22, -0.2, -0.45);
    this.gunGroup = g;
    this.gunBase = g.position.clone();
    this.cam.add(g);

    // flash de bouche
    this.muzzle = new THREE.PointLight(0xffcc66, 0, 6, 2);
    this.muzzle.position.set(0, 0.05, -0.7);
    g.add(this.muzzle);
    this.muzzleMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0 })
    );
    this.muzzleMesh.position.set(0, 0.02, -0.55);
    g.add(this.muzzleMesh);
  }

  _buildFlashlight() {
    const sl = new THREE.SpotLight(0xfff2d8, CONFIG.FLASH_INTENSITY,
      CONFIG.FLASH_DIST, CONFIG.FLASH_ANGLE, CONFIG.FLASH_PENUMBRA, 1.4);
    sl.position.set(0, 0, 0);
    sl.castShadow = true;
    sl.shadow.mapSize.set(1024, 1024);
    sl.shadow.camera.near = 0.3;
    sl.shadow.camera.far = CONFIG.FLASH_DIST;
    sl.shadow.bias = -0.0008;
    const target = new THREE.Object3D();
    target.position.set(0, 0, -1);
    this.cam.add(sl); this.cam.add(target);
    sl.target = target;
    this.flashlight = sl;
    this.flashlightOn = true;
  }

  forwardVec() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  rightVec() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  _blocked(x, z) {
    const r = this.radius;
    return World.isSolidWorld(x - r, z - r) || World.isSolidWorld(x + r, z - r) ||
           World.isSolidWorld(x - r, z + r) || World.isSolidWorld(x + r, z + r) ||
           World.isSolidWorld(x - r, z) || World.isSolidWorld(x + r, z) ||
           World.isSolidWorld(x, z - r) || World.isSolidWorld(x, z + r);
  }

  update(dt, game) {
    // --- Visée souris ---
    if (Input.locked) {
      const look = Input.consumeLook();
      this.yaw -= look.dx * CONFIG.MOUSE_SENS;
      this.pitch -= look.dy * CONFIG.MOUSE_SENS;
      const lim = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }

    // --- Déplacement ---
    const ax = Input.moveAxis();
    const len = Math.hypot(ax.f, ax.s) || 1;
    const sprinting = Input.down("shift") && this.stamina > 1 && (ax.f || ax.s);
    const speed = (sprinting ? CONFIG.SPRINT : CONFIG.WALK) * dt;
    const fwd = this.forwardVec(), right = this.rightVec();
    let dx = (fwd.x * ax.f + right.x * ax.s) / len * speed;
    let dz = (fwd.z * ax.f + right.z * ax.s) / len * speed;

    if (dx !== 0 && !this._blocked(this.x + dx, this.z)) this.x += dx;
    if (dz !== 0 && !this._blocked(this.x, this.z + dz)) this.z += dz;

    this.moving = !!(ax.f || ax.s);
    if (this.moving) this.bob += dt * (sprinting ? 16 : 11);

    if (sprinting) this.stamina = Math.max(0, this.stamina - CONFIG.STAMINA_DRAIN * dt);
    else this.stamina = Math.min(CONFIG.STAMINA_MAX, this.stamina + CONFIG.STAMINA_REGEN * dt);

    // --- Caméra (position + orientation + head-bob) ---
    const bobY = this.moving ? Math.sin(this.bob) * CONFIG.HEADBOB : 0;
    const bobR = this.moving ? Math.cos(this.bob * 0.5) * 0.006 : 0;
    this.cam.position.set(this.x, this.y + bobY, this.z);
    this.cam.rotation.set(this.pitch, this.yaw, bobR);

    // --- Cooldowns ---
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.knifeCd > 0) this.knifeCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.knifeAnim > 0) this.knifeAnim -= dt;

    // --- Actions ---
    if (Input.mouseDown && this.fireCd <= 0) this.shoot(game);
    if ((Input.rightDown || Input.pressed("f")) && this.knifeCd <= 0) this.knife(game);
    if (Input.pressed("h")) this.useHerb(game);
    if (Input.pressed("l")) this.toggleFlashlight();

    // --- Recul de l'arme & flash ---
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const swayX = this.moving ? Math.sin(this.bob) * 0.01 : 0;
    const swayY = this.moving ? Math.abs(Math.cos(this.bob)) * 0.01 : 0;
    let kAnim = 0;
    if (this.knifeAnim > 0) kAnim = Math.sin((1 - this.knifeAnim / CONFIG.KNIFE_CD) * Math.PI) * 0.3;
    this.gunGroup.position.set(
      this.gunBase.x + swayX - kAnim * 0.5,
      this.gunBase.y + swayY,
      this.gunBase.z + this.recoil * 0.12
    );
    this.gunGroup.rotation.x = this.recoil * 0.5 + kAnim;
    this.muzzle.intensity *= 0.6;
    this.muzzleMesh.material.opacity *= 0.55;

    // léger vacillement de la torche
    if (this.flashlightOn)
      this.flashlight.intensity = CONFIG.FLASH_INTENSITY * (0.92 + Math.random() * 0.12);
  }

  shoot(game) {
    if (this.ammo <= 0) { Sfx.play("empty"); this.fireCd = 0.25; return; }
    this.ammo--;
    this.fireCd = CONFIG.FIRE_CD;
    this.recoil = 1;
    this.muzzle.intensity = 4;
    this.muzzleMesh.material.opacity = 1;
    Sfx.play("shot");
    game.shake = Math.min(game.shake + 0.12, 0.35);
    game.fireHitscan(this);
  }

  knife(game) {
    this.knifeCd = CONFIG.KNIFE_CD;
    this.knifeAnim = CONFIG.KNIFE_CD;
    Sfx.play("knife");
    game.knifeAttack(this);
  }

  useHerb(game) {
    if (this.inv.herb > 0 && this.hp < this.maxHp) {
      this.inv.herb--;
      this.hp = Math.min(this.maxHp, this.hp + CONFIG.HEAL_AMOUNT);
      Sfx.play("heal");
      game.toast("Herbe verte utilisée (+" + CONFIG.HEAL_AMOUNT + " PV)");
    } else if (this.inv.herb === 0) game.toast("Aucune herbe verte.");
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.visible = this.flashlightOn;
    Sfx.play("locked");
  }

  takeDamage(dmg, game) {
    if (this.invuln > 0) return;
    this.hp -= dmg;
    this.invuln = CONFIG.INVULN;
    Sfx.play("hurt");
    UI.damagePulse();
    game.shake = Math.min(game.shake + 0.4, 0.8);
    if (this.hp <= 0) { this.hp = 0; game.onPlayerDead(); }
  }
}
