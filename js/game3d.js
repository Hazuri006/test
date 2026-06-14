/* ============================================================
 * GAME 3D — Scène Three.js, rendu, éclairage, boucle, combat
 * ============================================================ */

const Game = {
  renderer: null, scene: null, camera: null,
  player: null,
  monsters: [], projectiles: [], blood: [], decals: [], items: [], notes: [],
  torchLights: [], doorMeshes: [],
  wallMesh: null, occluders: [],
  state: "start", modalOpen: false,
  score: 0, kills: 0, shake: 0,
  startTime: 0, elapsed: 0, last: 0,
  currentRoom: null, tmp: new THREE.Vector3(),

  init() {
    const canvas = document.getElementById("game");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 400);

    addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    Input.init(canvas);
    UI.cache();
    this.bindUI();
    UI.showScreen("screen-start");
    UI.setHudVisible(false);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  bindUI() {
    UI.el["start-btn"].addEventListener("click", () => this.start());
    UI.el["restart-btn"].addEventListener("click", () => this.start());
    UI.el["restart-btn2"].addEventListener("click", () => this.start());
    UI.el["note-close"].addEventListener("click", () => this.closeModals());
    UI.el["inv-close"].addEventListener("click", () => this.closeModals());
    // Reprendre le verrouillage souris au clic
    this.renderer.domElement.addEventListener("mousedown", () => {
      if ((this.state === "playing" || this.state === "paused") && !Input.locked && !this.modalOpen)
        Input.requestLock();
    });
    UI.el["lock-overlay"].addEventListener("click", () => Input.requestLock());
  },

  onLockChange(locked) {
    if (locked) {
      UI.showLockOverlay(false);
      Input.consumeLook();
      if (this.state === "paused" && !this.modalOpen) this.state = "playing";
    } else {
      if (this.state === "playing") {
        this.state = "paused";
        if (!this.modalOpen) UI.showLockOverlay(true);
      }
    }
  },

  // ----------------- Démarrage -----------------
  start() {
    Sfx.init(); Sfx.resume(); Sfx.startAmbient();
    this.clearScene();
    World.build();
    Quests.reset();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060a, CONFIG.FOG_DENSITY);
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.add(new THREE.AmbientLight(0x404858, CONFIG.AMBIENT));
    const moon = new THREE.DirectionalLight(0x3a4a66, 0.25);
    moon.position.set(20, 60, 10);
    this.scene.add(moon);

    this.buildGeometry();

    const s = World.playerStart;
    this.player = new Player(this.camera, this.scene, s.x, s.z);
    this.scene.add(this.camera);

    this.monsters = World.monstersSpawn.map(m => {
      const c = World.tileCenter(m.x, m.y);
      return new Monster(this.scene, c.x, c.z, m.type);
    });
    this.items = World.itemsSpawn.map(it => this.makeItem(it));
    this.notes = World.notesSpawn.map(n => this.makeNote(n));

    this.projectiles = []; this.blood = []; this.decals = [];
    this.score = 0; this.kills = 0; this.shake = 0;
    this.currentRoom = null; this.modalOpen = false;
    this.startTime = performance.now();
    this.state = "playing";

    UI.showScreen(null);
    UI.setHudVisible(true);
    UI.toast("Vous vous réveillez dans le Hall d'Entrée...");
    UI.updateHUD(this);
    Input.requestLock();
  },

  clearScene() {
    if (this.scene) {
      while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    }
    this.torchLights = []; this.doorMeshes = []; this.occluders = [];
    if (this.camera) { this.camera.clear && this.camera.clear(); }
  },

  // ----------------- Construction de la géométrie -----------------
  buildGeometry() {
    const T = CONFIG.TILE, H = CONFIG.WALL_H;
    const st = Textures.stone(), fl = Textures.floor(), ce = Textures.ceiling();

    // Sol
    const floorMat = new THREE.MeshStandardMaterial({
      map: fl.map, normalMap: fl.normalMap, roughnessMap: fl.roughnessMap, roughness: 1,
    });
    [fl.map, fl.normalMap, fl.roughnessMap].forEach(t => { if (t) t.repeat.set(World.W, World.H); });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(World.W * T, World.H * T), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(World.W * T / 2, 0, World.H * T / 2);
    floor.receiveShadow = true;
    this.scene.add(floor); this.occluders.push(floor);

    // Plafond
    const ceilMat = new THREE.MeshStandardMaterial({ map: ce.map, normalMap: ce.normalMap, roughness: 1 });
    [ce.map, ce.normalMap].forEach(t => { if (t) t.repeat.set(World.W, World.H); });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(World.W * T, World.H * T), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(World.W * T / 2, H, World.H * T / 2);
    this.scene.add(ceil); this.occluders.push(ceil);

    // Murs (InstancedMesh)
    const wallTiles = [];
    for (let y = 0; y < World.H; y++)
      for (let x = 0; x < World.W; x++)
        if (World.grid[y][x] === CONFIG.T_WALL) wallTiles.push([x, y]);
    const wallMat = new THREE.MeshStandardMaterial({
      map: st.map, normalMap: st.normalMap, roughnessMap: st.roughnessMap, roughness: 1,
    });
    const wallGeo = new THREE.BoxGeometry(T, H, T);
    this.wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, wallTiles.length);
    this.wallMesh.castShadow = true; this.wallMesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    wallTiles.forEach(([x, y], i) => {
      dummy.position.set(x * T + T / 2, H / 2, y * T + T / 2);
      dummy.updateMatrix();
      this.wallMesh.setMatrixAt(i, dummy.matrix);
    });
    this.wallMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.wallMesh); this.occluders.push(this.wallMesh);

    // Portes
    for (const d of World.doors) this.makeDoor(d);

    // Torches
    for (const t of World.torches) this.makeTorch(t);
  },

  makeDoor(d) {
    const T = CONFIG.TILE, H = CONFIG.WALL_H;
    const c = World.tileCenter(d.x, d.y);
    const wd = Textures.wood();
    const mat = new THREE.MeshStandardMaterial({ map: wd.map, normalMap: wd.normalMap, roughness: 0.85 });
    // sens du passage
    const floorEW = World.tileAt(d.x - 1, d.y) === CONFIG.T_FLOOR && World.tileAt(d.x + 1, d.y) === CONFIG.T_FLOOR;
    const grp = new THREE.Group();
    let panel;
    if (floorEW) { // passage est-ouest -> charnière sur axe Z
      grp.position.set(c.x, 0, c.z - T / 2);
      panel = new THREE.Mesh(new THREE.BoxGeometry(0.28, H * 0.94, T * 0.96), mat);
      panel.position.set(0, H / 2, T / 2);
      d.swing = Math.PI / 2;
    } else { // passage nord-sud -> charnière sur axe X
      grp.position.set(c.x - T / 2, 0, c.z);
      panel = new THREE.Mesh(new THREE.BoxGeometry(T * 0.96, H * 0.94, 0.28), mat);
      panel.position.set(T / 2, H / 2, 0);
      d.swing = -Math.PI / 2;
    }
    panel.castShadow = true; panel.receiveShadow = true;
    grp.add(panel);

    if (d.locked) {
      const col = { rustyKey: 0xd08030, labKey: 0x36c6d6, cure: 0x5ad65a }[d.key] || 0xcccccc;
      const lock = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.8, metalness: 0.6 }));
      lock.position.copy(panel.position);
      lock.position.y = H / 2; lock.position.z += floorEW ? 0.2 : 0; lock.position.x += floorEW ? 0 : 0.2;
      grp.add(lock); d.lockMesh = lock;
    }
    this.scene.add(grp);
    d.mesh = grp; d.openAmount = 0; d.panel = panel;
    this.doorMeshes.push(panel);
    this.occluders.push(panel);
  },

  makeTorch(t) {
    const grp = new THREE.Group();
    grp.position.set(t.x, 2.6, t.z);
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
    grp.add(bracket);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: Textures.flame(), color: 0xffaa44, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flame.scale.set(0.7, 0.9, 1); flame.position.y = 0.35;
    grp.add(flame);
    const light = new THREE.PointLight(0xff7a2a, 11, 22, 1.6);
    light.position.y = 0.4;
    grp.add(light);
    this.scene.add(grp);
    this.torchLights.push({ grp, light, flame, x: t.x, z: t.z, baseY: flame.position.y });
  },

  makeItem(it) {
    const c = World.tileCenter(it.x, it.y);
    const grp = new THREE.Group();
    grp.position.set(c.x, 0.7, c.z);
    let mesh;
    if (it.type === "ammo") {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xb8902f, metalness: 0.6, roughness: 0.4 }));
    } else if (it.type === "herb") {
      const m = new THREE.MeshStandardMaterial({ color: 0x37c24a, emissive: 0x0d5016, emissiveIntensity: 0.5, roughness: 0.7 });
      mesh = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), m);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.12), m);
      mesh.add(a, b);
    } else if (it.type === "cure") {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x5ad65a, emissive: 0x2a8a2a, emissiveIntensity: 1.1, transparent: true, opacity: 0.9 }));
    } else { // clés
      const col = it.type === "rustyKey" ? 0xd08030 : 0x36c6d6;
      mesh = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 14),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.4 }));
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34),
        new THREE.MeshStandardMaterial({ color: col, metalness: 0.7, roughness: 0.4 }));
      stem.position.z = 0.22; mesh.add(ring, stem);
    }
    grp.add(mesh);
    // halo
    const glowCol = { ammo: 0xffcf6a, herb: 0x5aff5a, rustyKey: 0xff9a3a, labKey: 0x4ad6ff, cure: 0x7aff7a }[it.type] || 0xffffff;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: Textures.flame(), color: glowCol, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
    }));
    glow.scale.set(1.2, 1.2, 1);
    grp.add(glow);
    this.scene.add(grp);
    return { x: c.x, z: c.z, type: it.type, qty: it.qty, taken: false, mesh: grp, spin: Math.random() * 6 };
  },

  makeNote(n) {
    const c = World.tileCenter(n.x, n.y);
    const grp = new THREE.Group();
    grp.position.set(c.x, 0.55, c.z);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.44),
      new THREE.MeshStandardMaterial({ color: 0xd8cba0, emissive: 0x55502f, emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.9 }));
    paper.rotation.x = -0.6;
    grp.add(paper);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: Textures.flame(), color: 0xfff0b0, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4,
    }));
    glow.scale.set(1, 1, 1); grp.add(glow);
    this.scene.add(grp);
    return { x: c.x, z: c.z, title: n.title, body: n.body, taken: false, mesh: grp };
  },

  // ----------------- Boucle -----------------
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    let dt = (t - this.last) / 1000; this.last = t;
    if (dt > 0.05) dt = 0.05;
    if (this.state === "playing") this.update(dt);
    else if (this.state === "paused" && this.modalOpen) {
      if (Input.pressed("escape") || Input.pressed("tab") || Input.pressed("i") ||
          Input.pressed("e") || Input.pressed("enter") || Input.pressed(" ")) this.closeModals();
    }
    if (this.scene && this.player) {
      if (this.shake > 0.001) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake;
        this.shake *= 0.86;
      }
      this.renderer.render(this.scene, this.camera);
    }
    Input.endFrame();
  },

  update(dt) {
    // Pause / inventaire
    if (Input.pressed("i") || Input.pressed("tab")) { this.openModal(() => UI.openInventory(this)); return; }
    if (Input.pressed("escape")) { Input.exitLock(); return; }

    this.player.update(dt, this);
    this.monsters.forEach(m => m.update(dt, this));
    this.monsters = this.monsters.filter(m => !m.removed);
    this.updateProjectiles(dt);
    this.updateBlood(dt);
    this.updateDoors(dt);
    this.updateTorches(dt);
    this.updateItems(dt);
    this.handleInteractions();

    UI.updateHUD(this);
    UI.updateBoss(this);

    const room = World.roomAtWorld(this.player.x, this.player.z);
    if (room && room !== this.currentRoom) { this.currentRoom = room; UI.toast("— " + room.name + " —"); }
  },

  openModal(fn) {
    this.modalOpen = true; this.state = "paused"; fn();
  },
  closeModals() {
    UI.hideNote();
    UI.el["inv-modal"].classList.add("hidden");
    UI.el["pause-modal"].classList.add("hidden");
    this.modalOpen = false;
    if (Input.locked) this.state = "playing";
    else { this.state = "paused"; UI.showLockOverlay(true); }
  },

  // ----------------- Combat -----------------
  fireHitscan(player) {
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const ray = new THREE.Raycaster(origin, dir, 0, CONFIG.GUN_RANGE);

    const mMeshes = [];
    this.monsters.forEach(m => { if (!m.dead) m.hitMeshes.forEach(me => mMeshes.push(me)); });
    const hitsM = ray.intersectObjects(mMeshes, false);
    const hitsW = ray.intersectObjects(this.occluders, false);
    const nm = hitsM[0], nw = hitsW[0];

    if (nm && (!nw || nm.distance < nw.distance)) {
      const mon = nm.object.userData.monster;
      if (mon) mon.hurt(CONFIG.GUN_DMG, this, nm.point);
    } else if (nw) {
      this.spawnBlood(nw.point.x, nw.point.y, nw.point.z, 4, 0x888888);
    }
  },

  knifeAttack(player) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    fwd.y = 0; fwd.normalize();
    for (const m of this.monsters) {
      if (m.dead) continue;
      const dx = m.x - player.x, dz = m.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > CONFIG.KNIFE_RANGE + m.radius) continue;
      const dot = (dx / d) * fwd.x + (dz / d) * fwd.z;
      if (dot > 0.55) m.hurt(CONFIG.KNIFE_DMG, this, { x: m.x, y: 1.2, z: m.z });
    }
  },

  spawnEnemyProjectile(monster, player) {
    const geo = new THREE.SphereGeometry(0.18, 8, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb14cff, emissive: 0x8a2cff, emissiveIntensity: 2 });
    const mesh = new THREE.Mesh(geo, mat);
    const y = 1.4;
    mesh.position.set(monster.x, y, monster.z);
    this.scene.add(mesh);
    const dx = player.x - monster.x, dy = (player.y) - y, dz = player.z - monster.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const sp = 11;
    this.projectiles.push({ mesh, x: monster.x, y, z: monster.z,
      vx: dx / d * sp, vy: dy / d * sp, vz: dz / d * sp, life: 4, dmg: monster.def.dmg });
    Sfx.play("growl");
  },

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
      p.mesh.position.set(p.x, p.y, p.z);
      if (World.isSolidWorld(p.x, p.z) || p.y < 0.2 || p.life <= 0) { p.dead = true; }
      else if (Math.hypot(p.x - this.player.x, p.z - this.player.z) < this.player.radius + 0.3) {
        this.player.takeDamage(p.dmg, this); p.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter(p => { if (p.dead) this.scene.remove(p.mesh); return !p.dead; });
  },

  // ----------------- Sang / particules / décals -----------------
  spawnBlood(x, y, z, n, color) {
    n = n || 8;
    const col = color || 0x7a0f0f;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 5, 5),
        new THREE.MeshStandardMaterial({ color: col, roughness: 1 })
      );
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.blood.push({
        mesh, x, y, z,
        vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 4,
        life: 0.5 + Math.random() * 0.4,
      });
    }
    if (this.blood.length > 160) {
      const extra = this.blood.splice(0, this.blood.length - 160);
      extra.forEach(b => this.scene.remove(b.mesh));
    }
  },

  updateBlood(dt) {
    for (const b of this.blood) {
      b.vy -= 9 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < 0.05) { b.y = 0.05; b.vy = 0; b.vx *= 0.5; b.vz *= 0.5; }
      b.life -= dt; b.mesh.position.set(b.x, b.y, b.z);
      if (b.life <= 0) b.dead = true;
    }
    this.blood = this.blood.filter(b => { if (b.dead) this.scene.remove(b.mesh); return !b.dead; });
  },

  addBloodDecal(x, z, size) {
    const mat = new THREE.MeshStandardMaterial({
      map: Textures.blood(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, roughness: 1,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6;
    m.position.set(x, 0.04, z);
    this.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > 50) this.scene.remove(this.decals.shift());
  },

  // ----------------- Portes / torches / objets -----------------
  updateDoors(dt) {
    for (const d of World.doors) {
      if (!d.mesh) continue;
      const target = d.open ? 1 : 0;
      if (Math.abs(d.openAmount - target) > 0.001) {
        d.openAmount += (target - d.openAmount) * Math.min(1, dt * 5);
        d.mesh.rotation.y = d.swing * d.openAmount;
      }
    }
  },

  updateTorches(dt) {
    // n'active que les torches les plus proches (perf)
    const px = this.player.x, pz = this.player.z;
    this.torchLights.forEach(t => { t.d = (t.x - px) ** 2 + (t.z - pz) ** 2; });
    const sorted = [...this.torchLights].sort((a, b) => a.d - b.d);
    sorted.forEach((t, i) => {
      const active = i < CONFIG.MAX_ACTIVE_TORCHES;
      t.light.visible = active;
      if (active) t.light.intensity = 11 + Math.sin(performance.now() * 0.02 + t.x) * 2 + Math.random() * 1.5;
      const f = 0.85 + Math.random() * 0.3;
      t.flame.scale.set(0.6 * f, 0.9 * f, 1);
      t.flame.position.y = t.baseY + Math.sin(performance.now() * 0.01 + t.z) * 0.03;
    });
  },

  updateItems(dt) {
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y += dt * 1.5;
      it.mesh.position.y = 0.7 + Math.sin(performance.now() * 0.003 + it.spin) * 0.08;
    }
    for (const n of this.notes) {
      if (!n.taken) n.mesh.rotation.y += dt * 0.8;
    }
  },

  // ----------------- Interactions -----------------
  handleInteractions() {
    const p = this.player;
    // ramassage auto
    for (const it of this.items) {
      if (it.taken) continue;
      if (Math.hypot(p.x - it.x, p.z - it.z) < p.radius + 1.1) this.pickup(it);
    }
    // cible d'interaction
    let best = null, bd = Infinity;
    for (const d of World.doors) {
      if (d.open) continue;
      const c = World.tileCenter(d.x, d.y);
      const dd = Math.hypot(p.x - c.x, p.z - c.z);
      if (dd < CONFIG.TILE * 1.7 && dd < bd) { bd = dd; best = { kind: "door", door: d }; }
    }
    for (const n of this.notes) {
      if (n.taken) continue;
      const dd = Math.hypot(p.x - n.x, p.z - n.z);
      if (dd < CONFIG.TILE * 1.3 && dd < bd) { bd = dd; best = { kind: "note", note: n }; }
    }

    if (!best) { UI.setInteract(null); return; }
    if (best.kind === "door") {
      const d = best.door;
      if (d.locked && !p.hasKey(d.key)) UI.setInteract("🔒 " + ITEM_TYPES[d.key].name + " requise");
      else UI.setInteract("[E] Ouvrir " + (d.name || "la porte"));
      if (Input.pressed("e")) this.openDoor(d);
    } else {
      UI.setInteract("[E] Lire le document");
      if (Input.pressed("e")) this.readNote(best.note);
    }
  },

  pickup(it) {
    it.taken = true; this.scene.remove(it.mesh);
    const p = this.player;
    Sfx.play("pickup");
    if (it.type === "ammo") { p.ammo += CONFIG.AMMO_PICKUP * it.qty; this.toast("+ " + (CONFIG.AMMO_PICKUP * it.qty) + " munitions"); }
    else if (it.type === "herb") { p.inv.herb += it.qty; this.toast("Herbe verte récupérée (H pour soigner)"); }
    else { p.keys.add(it.type); this.toast("Obtenu : " + ITEM_TYPES[it.type].name); Quests.onItemPicked(it.type, this); }
  },

  readNote(n) {
    n.taken = true; this.scene.remove(n.mesh);
    this.player.inv.note++;
    Sfx.play("pickup");
    this.openModal(() => UI.showNote(n));
    if (this.player.inv.note >= Quests.sideNotesTotal) { this.toast("📜 Tous les documents trouvés ! (+500)"); this.score += 500; }
  },

  openDoor(d) {
    if (d.open) return;
    if (d.locked) {
      if (this.player.hasKey(d.key)) {
        d.locked = false; d.open = true;
        if (d.lockMesh) d.mesh.remove(d.lockMesh);
        Sfx.play("door"); this.toast("Déverrouillé : " + d.name);
        Quests.onDoorOpened(d, this);
      } else { Sfx.play("locked"); this.toast("Verrouillé. Nécessite : " + ITEM_TYPES[d.key].name); }
    } else {
      d.open = true; Sfx.play("door"); Quests.onDoorOpened(d, this);
    }
  },

  // ----------------- Événements -----------------
  toast(m) { UI.toast(m); },
  onMonsterKilled(m) { this.kills++; Quests.onMonsterKilled(m, this); },

  onPlayerDead() {
    this.state = "gameover"; Sfx.play("gameover"); Sfx.stopAmbient();
    Input.exitLock(); UI.setHudVisible(false); UI.showLockOverlay(false); UI.showGameOver(this);
  },

  onVictory() {
    this.elapsed = (performance.now() - this.startTime) / 1000;
    this.score += Math.max(0, 2000 - Math.floor(this.elapsed) * 2);
    this.state = "victory"; Sfx.play("victory"); Sfx.stopAmbient();
    Input.exitLock(); UI.setHudVisible(false); UI.showLockOverlay(false); UI.showVictory(this);
  },

  formatTime() {
    const s = Math.floor(this.elapsed);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  },
};

addEventListener("load", () => Game.init());
