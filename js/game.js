'use strict';
/* ============================================================================
   game.js — engine loop, renderer, camera, input, state machine.

   Render pipeline per frame:

     1. scene target   terrain + props + ship, logarithmic depth
     2. sky pass       stars, other worlds, ocean, clouds, atmosphere,
                       scan pulse — all reconstructed from the depth buffer
     3. bloom          3-level down/blur/up chain
     4. composite      tonemap, entry heat, pulse streaks, grain, vignette
   ============================================================================ */

const QUALITY = {
  low:    { scale: 0.62, maxLevel: 9,  splitFactor: 2.1, budgetMs: 4.0,  atmoSteps: 8,  cloudSteps: 0,  bloom: 1 },
  medium: { scale: 0.85, maxLevel: 10, splitFactor: 2.5, budgetMs: 6.0,  atmoSteps: 12, cloudSteps: 10, bloom: 1 },
  high:   { scale: 1.00, maxLevel: 11, splitFactor: 2.8, budgetMs: 8.0,  atmoSteps: 16, cloudSteps: 18, bloom: 1 },
  ultra:  { scale: 1.00, maxLevel: 12, splitFactor: 3.3, budgetMs: 11.0, atmoSteps: 22, cloudSteps: 30, bloom: 1 }
};

const FAR_PLANE = 1e8;

const Game = {
  /* ======================================================================== */
  async boot() {
    this.canvas = $('gl');
    const gl = GLU.init(this.canvas);
    if (!gl) { $('unsupported').classList.add('on'); $('loading').classList.add('hide'); return; }
    this.gl = gl;

    this.quality = QUALITY.medium;
    this.qualityName = 'medium';
    this.sensitivity = 1.0;
    this.invertY = false;
    this.fov = 68 * DEG;
    this.exposure = 1.0;

    this.width = 1; this.height = 1;
    this.camPos = V3.new();
    this.camRot = Q4.new();
    this.camFwd = V3.new(); this.camUp = V3.new(); this.camRight = V3.new();
    this.proj = M4.new();
    this.view = M4.new();
    this.viewProj = M4.new();
    this.modelRot = new Float32Array(9);
    this.planes = new Float32Array(16);

    this.mode = 'ship';           // 'ship' | 'foot'
    this.view3rd = true;
    this.paused = true;
    this.started = false;
    this.hudHidden = false;
    this.showStats = false;
    this.time = 0;
    this.flash = 0;

    this.scan = { active: false, t: 0, origin: V3.new() };

    HUD.init(this);
    this.audio = new GameAudio();
    this.ship = new Ship();
    this.player = new Player();

    this.setupInput();
    this.setupUI();
    window.addEventListener('resize', () => this.resize());

    await this.loadAssets();

    this.resize();
    $('loading').classList.add('hide');
    requestAnimationFrame((t) => this.frame(t));
  },

  /* ------------------------------------------------------------- assets -- */
  async loadAssets() {
    const setProgress = (p, msg) => {
      $('loadFill').style.right = (100 - p * 100).toFixed(1) + '%';
      if (msg) $('loadMsg').textContent = msg;
    };
    const tick = () => new Promise(r => setTimeout(r, 0));

    setProgress(0.02, 'compiling shaders');
    await tick();

    this.prog = {
      terrain: GLU.program(SH.terrainVS, SH.terrainFS, 'terrain'),
      object: GLU.program(SH.objectVS, SH.objectFS, 'object'),
      ship: GLU.program(SH.shipVS, SH.shipFS, 'ship'),
      thruster: GLU.program(SH.thrusterVS, SH.thrusterFS, 'thruster'),
      sky: GLU.program(SH.fullVS, SH.skyFS, 'sky'),
      bright: GLU.program(SH.fullVS, SH.brightFS, 'bright'),
      blur: GLU.program(SH.fullVS, SH.blurFS, 'blur'),
      composite: GLU.program(SH.fullVS, SH.compositeFS, 'composite')
    };
    this.emptyVAO = this.gl.createVertexArray();

    setProgress(0.20, 'generating noise volume');
    await tick();

    /* The 3D noise volume is the single most reused asset in the renderer:
       clouds, ocean, terrain detail and nebulae all read from it. */
    const SIZE = 64;
    const data = buildNoiseVolume(SIZE, null);
    this.noiseTex = GLU.texture3D(SIZE, data);

    setProgress(0.72, 'seeding star system');
    await tick();

    const seedInput = ($('optSeed').value || '').trim();
    let seed;
    if (seedInput) {
      seed = 0;
      for (let i = 0; i < seedInput.length; i++) seed = (Math.imul(seed, 131) + seedInput.charCodeAt(i)) | 0;
      seed = Math.abs(seed) || 1;
    } else {
      seed = (Math.random() * 0x7fffffff) | 0;
    }
    this.newSystem(seed);

    setProgress(0.88, 'assembling starship');
    await tick();

    this.shipParts = buildShipMesh(this.gl);
    this.shipAnim = new ShipAnimator();
    this.thrusterMesh = buildThrusterMesh(this.gl);
    this.shipTex = await this.loadTexture(SHIP_MODEL.tex);
    this.shipEmissive = await this.loadTexture(SHIP_MODEL.emissive);

    setProgress(1.0, 'ready');
    await tick();
  },

  /* The hull atlas travels as a data: URI inside shipmodel.js, so it decodes
     without a network request and the game still runs from file://. */
  loadTexture(src) {
    const gl = this.gl;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
        if (aniso) {
          const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
          gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, null);
        resolve(t);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  },

  newSystem(seed) {
    if (this.terrain) { this.terrain.dispose(); this.terrain = null; }
    this.system = generateSystem(seed);
    this.activePlanet = null;
    this.target = this.system.planets[0];
    this.ship.spawnInOrbit(this.system.planets[0]);
    this.mode = 'ship';
    this.player.active = false;
    V3.copy(this.camPos, this.ship.pos);
    Q4.copy(this.camRot, this.ship.rot);
    this._sysSeed = seed;
  },

  /* ------------------------------------------------------------- resize -- */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    this.canvas.width = w; this.canvas.height = h;
    this.width = window.innerWidth; this.height = window.innerHeight;

    const s = this.quality.scale;
    const rw = Math.max(2, Math.round(w * s));
    const rh = Math.max(2, Math.round(h * s));
    if (this.rt && this.rt.w === rw && this.rt.h === rh) return;

    GLU.deleteTarget(this.rt);
    GLU.deleteTarget(this.skyRT);
    if (this.bloomL) for (const t of this.bloomL) GLU.deleteTarget(t);
    if (this.bloomT) for (const t of this.bloomT) GLU.deleteTarget(t);

    this.rt = GLU.makeSceneTarget(rw, rh);
    this.skyRT = GLU.makeColorTarget(rw, rh);
    this.bloomL = []; this.bloomT = [];
    let bw = Math.max(2, rw >> 1), bh = Math.max(2, rh >> 1);
    for (let i = 0; i < 3; i++) {
      this.bloomL.push(GLU.makeColorTarget(bw, bh));
      this.bloomT.push(GLU.makeColorTarget(bw, bh));
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
    }
  },

  setQuality(name) {
    this.qualityName = name;
    this.quality = QUALITY[name] || QUALITY.medium;
    if (this.terrain) this.terrain.setQuality(this.quality);
    this.rt = null;
    this.resize();
  },

  /* ======================================================================== */
  /* INPUT                                                                    */
  /* ======================================================================== */
  setupInput() {
    this.keys = Object.create(null);
    this.stick = { x: 0, y: 0 };
    this.mouseDX = 0; this.mouseDY = 0;
    this.input = {
      look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
      throttle: 0, roll: 0, boost: false, brake: false, jump: false,
      landPressed: false
    };
    this.edge = Object.create(null);

    const code = (e) => e.code;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { e.preventDefault(); return; }
      const c = code(e);
      this.keys[c] = true;
      this.edge[c] = true;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
      this.onKey(c);
    });
    window.addEventListener('keyup', (e) => { this.keys[code(e)] = false; });
    window.addEventListener('blur', () => { for (const k in this.keys) this.keys[k] = false; });

    this.canvas.addEventListener('click', () => {
      if (this.started && !this.paused && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.started && !this.mapOpen) this.setPaused(true);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.locked || this.mode === 'foot') return;
      e.preventDefault();
      this.ship.throttle = clamp(this.ship.throttle - Math.sign(e.deltaY) * 0.08, 0, 1);
    }, { passive: false });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.started) this.setPaused(true);
    });
  },

  onKey(c) {
    if (!this.started) return;
    if (c === 'Escape') {
      if (this.mapOpen) this.toggleMap(false);
      else this.setPaused(!this.paused);
      return;
    }
    if (this.paused) return;

    switch (c) {
      case 'KeyM': this.toggleMap(!this.mapOpen); break;
      case 'KeyH': this.hudHidden = !this.hudHidden; HUD.setHidden(this.hudHidden); break;
      case 'KeyC': this.view3rd = !this.view3rd; this.audio.ui(); break;
      case 'KeyX': this.doScan(); break;
      case 'KeyF': this.input.landPressed = true; break;
      case 'KeyE': this.toggleFoot(); break;
      case 'F3': this.showStats = !this.showStats; HUD.el.fps.classList.toggle('on', this.showStats); break;
    }
  },

  gatherInput(dt) {
    const k = this.keys;
    const inp = this.input;

    const sens = this.sensitivity * 0.0022;
    let dx = this.mouseDX * sens;
    let dy = this.mouseDY * sens * (this.invertY ? -1 : 1);
    this.mouseDX = 0; this.mouseDY = 0;

    if (this.mode === 'foot') {
      /* On foot the mouse is a direct 1:1 look delta. */
      inp.look.x = dx;
      inp.look.y = dy;
      inp.move.x = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      inp.move.y = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
      inp.roll = 0;
      inp.throttle = 0;
      inp.jump = !!k.Space;
    } else {
      /* In the ship the mouse drives a self-centring virtual stick, which is
         what gives flight its weight instead of a twitchy 1:1 mapping. */
      this.stick.x = clamp(this.stick.x + dx * 1.6, -1, 1);
      this.stick.y = clamp(this.stick.y + dy * 1.6, -1, 1);
      const recentre = Math.exp(-dt * 3.4);
      this.stick.x *= recentre;
      this.stick.y *= recentre;

      // arrow keys work as a digital stick for players without a mouse
      const ax = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
      const ay = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
      inp.look.x = clamp(this.stick.x + ax * 0.8, -1.4, 1.4);
      inp.look.y = clamp(this.stick.y + ay * 0.8, -1.4, 1.4);

      inp.roll = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
      inp.throttle = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
      inp.move.x = 0; inp.move.y = 0;
      this.ship.pulseWanted = !!k.Space;
      this.ship.ultraWanted = !!k.KeyV;
      inp.jump = false;
    }
    if (this.mode === 'foot') { this.ship.pulseWanted = false; this.ship.ultraWanted = false; }

    inp.boost = !!(k.ShiftLeft || k.ShiftRight);
    inp.brake = !!(k.ControlLeft || k.ControlRight);
  },

  /* ======================================================================== */
  /* UI                                                                       */
  /* ======================================================================== */
  setupUI() {
    $('beginBtn').addEventListener('click', () => this.begin());
    $('resumeBtn').addEventListener('click', () => this.setPaused(false));
    $('quitBtn').addEventListener('click', () => {
      this.started = false;
      this.setPaused(true);
      $('pause').classList.add('hide');
      $('title').classList.remove('hide');
      HUD.show(false);
    });
    $('newSysBtn').addEventListener('click', () => {
      this.newSystem((Math.random() * 0x7fffffff) | 0);
      this.notify('WARPED TO ' + this.system.name, 'ok');
      this.setPaused(false);
    });
    $('perfBtn').addEventListener('click', () => {
      this.showStats = !this.showStats;
      HUD.el.fps.classList.toggle('on', this.showStats);
    });

    $('optQuality').addEventListener('change', (e) => this.setQuality(e.target.value));
    $('optSens').addEventListener('input', (e) => { this.sensitivity = e.target.value / 100; });
    $('optVol').addEventListener('input', (e) => this.audio.setVolume(e.target.value / 100));
    $('optInvert').addEventListener('change', (e) => { this.invertY = e.target.checked; });
  },

  begin() {
    const q = $('optQuality').value;
    if (q !== this.qualityName) this.setQuality(q);
    this.sensitivity = $('optSens').value / 100;
    this.invertY = $('optInvert').checked;

    const seedInput = ($('optSeed').value || '').trim();
    if (seedInput) {
      let seed = 0;
      for (let i = 0; i < seedInput.length; i++) seed = (Math.imul(seed, 131) + seedInput.charCodeAt(i)) | 0;
      seed = Math.abs(seed) || 1;
      if (seed !== this._sysSeed) this.newSystem(seed);
    }

    this.audio.start();
    this.audio.setVolume($('optVol').value / 100);
    this.audio.resume();

    $('title').classList.add('hide');
    this.started = true;
    this.setPaused(false);
    HUD.show(true);
    this.notify('ENTERING ' + this.system.name + ' SYSTEM', 'ok');
  },

  setPaused(p) {
    this.paused = p;
    $('pause').classList.toggle('hide', !p);
    if (p) {
      if (document.pointerLockElement) document.exitPointerLock();
      $('pauseSub').textContent = this.system.name + ' SYSTEM · ' +
        (this.activePlanet ? this.activePlanet.name.toUpperCase() : 'DEEP SPACE');
    } else {
      this.audio.resume();
      if (!this.mapOpen) this.canvas.requestPointerLock();
    }
  },

  toggleMap(on) {
    this.mapOpen = on;
    HUD.openMap(on);
    this.audio.ui();
    if (on) { if (document.pointerLockElement) document.exitPointerLock(); }
    else if (!this.paused) this.canvas.requestPointerLock();
  },

  setTarget(p) {
    this.target = p;
    this.audio.ui();
    this.notify('NAV TARGET: ' + (p.discovered ? p.name.toUpperCase() : 'UNCHARTED WORLD'));
  },

  notify(msg, kind) {
    const now = performance.now();
    if (!this._lastNotify) this._lastNotify = {};
    if (this._lastNotify[msg] && now - this._lastNotify[msg] < 4000) return;
    this._lastNotify[msg] = now;
    HUD.toast(msg, kind);
    this.audio.notify();
  },

  impact(strength) {
    HUD.flashDamage(0.25 + strength * 0.65);
    this.audio.impact(strength);
    this.flash = Math.min(0.35, strength * 0.4);
  },

  onLanded(planet) { this.discover(planet); },

  discover(planet) {
    if (planet.discovered) return;
    planet.discovered = true;
    HUD.discovery(planet);
    this.audio.discovery();
    HUD._statKey = null;
  },

  doScan() {
    if (this.scan.active) return;
    this.scan.active = true;
    this.scan.t = 0;
    V3.copy(this.scan.origin, this.camPos);
    this.audio.scan();
  },

  toggleFoot() {
    if (this.mode === 'ship') {
      if (!this.ship.landed || !this.activePlanet) {
        if (!this.ship.landed) this.notify('LAND BEFORE DISEMBARKING', 'warn');
        return;
      }
      this.player.disembark(this.ship, this.activePlanet);
      this.mode = 'foot';
      this.notify('ON FOOT — ' + this.activePlanet.name.toUpperCase(), 'ok');
      this.audio.ui();
    } else {
      if (!this.player.nearShip) { this.notify('MOVE CLOSER TO THE SHIP', 'warn'); return; }
      this.mode = 'ship';
      this.player.active = false;
      this.notify('BOARDED STARSHIP', 'ok');
      this.audio.ui();
    }
  },

  /* ======================================================================== */
  /* FRAME                                                                    */
  /* ======================================================================== */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const nowS = now * 0.001;
    let dt = this._last === undefined ? 1 / 60 : nowS - this._last;
    this._last = nowS;
    dt = Math.min(dt, 0.05);                 // never let a hitch teleport anything

    if (!this.started || this.paused) {
      this.renderIdle(dt);
      return;
    }

    this.time += dt;
    this.update(dt);
    this.render(dt);
    this.updateStats(dt);
  },

  renderIdle(dt) {
    /* Keep the world alive behind the menus — a slow orbital drift. */
    if (!this.system) return;
    this.time += dt * 0.25;
    if (!this.started) {
      /* Title-screen camera: a slow drift around the first world, held near
         the terminator on the lit side — the most photogenic angle a planet
         has, and it shows off the atmosphere limb. */
      const p = this.system.planets[0];
      const toSun = V3.sub(_gTmp, this.system.starPos, p.pos);
      V3.normalize(toSun, toSun);
      const side = V3.cross(_gAxis, toSun, _gWorldUp);
      if (V3.lenSq(side) < 1e-6) V3.set(side, 1, 0, 0);
      V3.normalize(side, side);
      const up = V3.cross(_gU, side, toSun);
      V3.normalize(up, up);

      const a = this.time * 0.05;
      const dir = _gDesired;
      V3.scale(dir, toSun, 0.62);
      V3.addScaled(dir, dir, side, Math.cos(a) * 0.78);
      V3.addScaled(dir, dir, up, Math.sin(a) * 0.30 + 0.18);
      V3.normalize(dir, dir);
      V3.addScaled(this.camPos, p.pos, dir, p.radius * 3.1);

      const fwd = V3.sub(_gF, p.pos, this.camPos);
      V3.normalize(fwd, fwd);
      const right = V3.cross(_gRel, fwd, up);
      if (V3.lenSq(right) < 1e-6) V3.set(right, 1, 0, 0);
      V3.normalize(right, right);
      const camUp = V3.cross(_gDir, right, fwd);
      V3.normalize(camUp, camUp);
      Q4.fromBasis(this.camRot, right, camUp, fwd);
      this.curFov = this.fov;
    }
    quatFwd(this.camFwd, this.camRot);
    quatUp(this.camUp, this.camRot);
    quatRight(this.camRight, this.camRot);
    this.buildMatrices();
    this.updateWorld(dt, true);
    this.render(dt);
  },

  /* -------------------------------------------------------------- update -- */
  update(dt) {
    this.gatherInput(dt);

    if (this.mode === 'foot') {
      this.player.update(dt, this.input, this.activePlanet, this);
    } else {
      this.ship.update(dt, this.input, this.activePlanet, this);
    }
    this.input.landPressed = false;

    /* When on foot, keep the ship parked exactly on the ground. */
    if (this.mode === 'foot' && this.activePlanet) {
      const p = this.activePlanet;
      V3.sub(_gRel, this.ship.pos, p.pos);
      V3.normalize(_gDir, _gRel);
      const gr = p.surfaceRadius(_gDir[0], _gDir[1], _gDir[2]);
      V3.addScaled(this.ship.pos, p.pos, _gDir, gr + SHIP_CFG.landHeight);
      this.ship.thrustVis = damp(this.ship.thrustVis, 0.08, 2, dt);
    }

    this.updateCamera(dt);
    /* Matrices must exist before the world update: terrain culling and the
       HUD markers both project through them. */
    this.buildMatrices();
    this.updateWorld(dt, false);

    /* scan pulse */
    if (this.scan.active) {
      this.scan.t += dt;
      if (this.scan.t > 2.1) this.scan.active = false;
    }
    this.flash = Math.max(0, this.flash - dt * 2.4);

    /* audio state */
    this.audio.update(dt, {
      throttle: this.ship.throttle,
      thrust: this.ship.thrustVis,
      speed: this.mode === 'foot' ? this.player.speed : this.ship.speed,
      density: this.activePlanet
        ? this.activePlanet.densityAt(Math.max(this.mode === 'foot' ? this.player.altitude : this.ship.altitude, 0))
        : 0,
      pulse: this.ship.pulse,
      ultra: this.ship.ultra,
      onFoot: this.mode === 'foot',
      landed: this.ship.landed,
      jetting: this.player.jetting,
      inMenu: this.mapOpen
    });

    if (!this.hudHidden) HUD.update(this);
    if (this.mapOpen && (this.frameCount & 7) === 0) HUD.drawMap(HUD._hoverIdx);
  },

  /* Choose the world we are "at", stream its terrain, handle discovery. */
  updateWorld(dt, idle) {
    let best = null, bestScore = Infinity;
    for (const p of this.system.planets) {
      const d = V3.dist(this.camPos, p.pos);
      const score = d / p.radius;
      if (score < bestScore) { bestScore = score; best = p; }
    }

    const ACTIVATE = 8.0, RELEASE = 11.0;
    let active = this.activePlanet;
    if (active && V3.dist(this.camPos, active.pos) / active.radius > RELEASE) active = null;
    if (!active && bestScore < ACTIVATE) active = best;

    if (active !== this.activePlanet) {
      if (this.terrain) { this.terrain.dispose(); this.terrain = null; }
      this.activePlanet = active;
      if (active) {
        this.terrain = new Terrain(this.gl, active, this.quality);
        if (!idle) this.notify('APPROACHING ' + (active.discovered ? active.name.toUpperCase() : 'UNCHARTED WORLD'));
      }
      HUD._statKey = null;
    }

    const p = this.activePlanet;
    if (p) {
      const d = V3.dist(this.camPos, p.pos);
      /* Cross-fade from the analytic orbital sphere to streamed terrain.
         Both are driven by the same noise, so the swap is invisible. */
      this.terrainFade = smoothstep(p.radius * 4.0, p.radius * 6.0, d);
      this.drawTerrain = d < p.radius * 6.4;

      if (!idle && !p.discovered && d < p.radius * 2.6) this.discover(p);

      if (this.drawTerrain && this.terrain) {
        V3.sub(_gCamLocal, this.camPos, p.pos);
        this.buildFrustum(p);
        this.terrain.update(_gCamLocal, this._frustumTest, dt);
      }
    } else {
      this.terrainFade = 0;
      this.drawTerrain = false;
    }
  },

  /* ------------------------------------------------------------- camera -- */
  updateCamera(dt) {
    if (this.mode === 'foot') {
      this.player.eyePos(this.camPos);
      Q4.copy(this.camRot, this.player.rot);
      if (this.view3rd) {
        const back = quatFwd(_gTmp, this.camRot);
        V3.addScaled(this.camPos, this.camPos, back, -4.2);
        V3.addScaled(this.camPos, this.camPos, this.player.up, 1.1);
      }
    } else {
      const s = this.ship;
      if (this.view3rd) {
        /* Chase camera.  Only the *orientation* is smoothed; the position is
           then rigidly offset from that smoothed frame.  Easing the world
           position instead makes the camera fall behind at speed — at 1 km/s
           the ship outruns the ease and shrinks to a dot. */
        Q4.slerp(this.camRot, this.camRot, s.rot, 1 - Math.exp(-dt * 9));

        /* Boost pulls the camera back and drops it slightly — the sense of
           speed comes from the framing opening up, not from the numbers. */
        const speedK = saturate(s.speed / 600);
        const drive = Math.max(s.pulse, s.ultra);
        this._camBoost = damp(this._camBoost || 0, s.boost, 5, dt);
        const dist = 15.5 + speedK * 3.5 + this._camBoost * 7.0 + drive * 12.0;
        const height = 3.2 + speedK * 0.7 - this._camBoost * 0.6;

        const back = quatFwd(_gF, this.camRot);
        const up = quatUp(_gU, this.camRot);
        V3.addScaled(this.camPos, s.pos, back, -dist);
        V3.addScaled(this.camPos, this.camPos, up, height);
        this._camInit = true;
      } else {
        /* Cockpit: sit inside the canopy.  The glass itself is clipped in the
           vertex shader, so the nose, wings and engine glow frame the view. */
        const fwd = quatFwd(_gF, s.rot);
        const up = quatUp(_gU, s.rot);
        V3.addScaled(this.camPos, s.pos, fwd, 3.20);
        V3.addScaled(this.camPos, this.camPos, up, SHIP_MODEL.bounds.hi[1] + 0.55);
        Q4.copy(this.camRot, s.rot);
        this._camInit = false;
      }

      /* Buffet / impact shake. */
      const sh = s.shake;
      if (sh > 0.002) {
        const amt = sh * 0.035;
        V3.set(_gAxis, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        V3.normalize(_gAxis, _gAxis);
        Q4.fromAxisAngle(_gQ, _gAxis, (Math.random() - 0.5) * amt);
        Q4.mul(this.camRot, this.camRot, _gQ);
      }
    }

    /* Speed widens the field of view — cheap, effective sense of velocity. */
    const sp = this.mode === 'foot' ? this.player.speed : this.ship.speed;
    const fovBoost = saturate(sp / 700) * 8 * DEG
      + (this._camBoost || 0) * 9 * DEG
      + this.ship.pulse * 12 * DEG
      + this.ship.ultra * 10 * DEG;
    this.curFov = damp(this.curFov || this.fov, this.fov + fovBoost, 4, dt);

    quatFwd(this.camFwd, this.camRot);
    quatUp(this.camUp, this.camRot);
    quatRight(this.camRight, this.camRot);
  },

  buildMatrices() {
    const aspect = this.rt.w / this.rt.h;
    M4.perspective(this.proj, this.curFov || this.fov, aspect, 0.05, FAR_PLANE);
    M4.viewFromQuat(this.view, this.camRot);
    M4.mul(this.viewProj, this.proj, this.view);
    this.fcoefHalf = 1.0 / Math.log2(FAR_PLANE + 1.0);
    this.tanFovY = Math.tan((this.curFov || this.fov) * 0.5);
    this.tanFovX = this.tanFovY * aspect;
  },

  /* Four side planes are enough — log depth removes any need for near/far. */
  buildFrustum(planet) {
    const m = this.viewProj, p = this.planes;
    const row = (i) => [m[i], m[i + 4], m[i + 8], m[i + 12]];
    const r0 = row(0), r1 = row(1), r3 = row(3);
    const set = (o, a, b, s) => {
      let x = a[0] + s * b[0], y = a[1] + s * b[1], z = a[2] + s * b[2], w = a[3] + s * b[3];
      const l = Math.hypot(x, y, z) || 1;
      p[o] = x / l; p[o + 1] = y / l; p[o + 2] = z / l; p[o + 3] = w / l;
    };
    set(0, r3, r0, 1); set(4, r3, r0, -1);
    set(8, r3, r1, 1); set(12, r3, r1, -1);

    /* Chunk centres arrive in planet-local space; shift them to camera space. */
    const ox = planet.pos[0] - this.camPos[0];
    const oy = planet.pos[1] - this.camPos[1];
    const oz = planet.pos[2] - this.camPos[2];
    this._frustumTest = (centerLocal, radius) => {
      const x = centerLocal[0] + ox, y = centerLocal[1] + oy, z = centerLocal[2] + oz;
      for (let i = 0; i < 16; i += 4) {
        if (p[i] * x + p[i + 1] * y + p[i + 2] * z + p[i + 3] < -radius) return false;
      }
      return true;
    };
  },

  projectToScreen(worldPos) {
    const m = this.viewProj;
    const x = worldPos[0] - this.camPos[0];
    const y = worldPos[1] - this.camPos[1];
    const z = worldPos[2] - this.camPos[2];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 1e-6) return { behind: true };
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    return {
      x: (cx / cw * 0.5 + 0.5) * this.width,
      y: (0.5 - cy / cw * 0.5) * this.height,
      behind: false
    };
  },

  /* ======================================================================== */
  /* RENDER                                                                   */
  /* ======================================================================== */
  render(dt) {
    const gl = this.gl;
    this.frameCount = (this.frameCount || 0) + 1;
    this.buildMatrices();

    /* ---------------------------------------------------- 1. scene pass -- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rt.fbo);
    gl.viewport(0, 0, this.rt.w, this.rt.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    const sun = this.sunDir(_gSun);
    const sunCol = this.sunColor();
    const p = this.activePlanet;
    this.updateLight(p);

    if (p && this.drawTerrain && this.terrain) this.drawTerrainPass(sun, sunCol, p);
    this.drawShipPass(sun, sunCol, p);

    /* ------------------------------------------------------ 2. sky pass -- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyRT.fbo);
    gl.viewport(0, 0, this.skyRT.w, this.skyRT.h);
    gl.disable(gl.DEPTH_TEST);
    this.drawSkyPass(sun, sunCol, p);

    /* --------------------------------------------------------- 3. bloom -- */
    this.drawBloom();

    /* ----------------------------------------------------- 4. composite -- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.drawComposite();
  },

  sunDir(out) {
    V3.sub(out, this.system.starPos, this.camPos);
    return V3.normalize(out, out);
  },

  sunColor() {
    const c = this.system.starColor;
    return [c[0] * 1.55, c[1] * 1.55, c[2] * 1.55];
  },

  drawTerrainPass(sun, sunCol, p) {
    const gl = this.gl, pr = this.prog.terrain;
    gl.useProgram(pr.prog);
    gl.uniformMatrix4fv(pr.u.uViewProj, false, this.viewProj);
    gl.uniform1f(pr.u.uFcoefHalf, this.fcoefHalf);
    gl.uniform1f(pr.u.uTime, this.time);

    _gF32a[0] = p.pos[0] - this.camPos[0];
    _gF32a[1] = p.pos[1] - this.camPos[1];
    _gF32a[2] = p.pos[2] - this.camPos[2];
    gl.uniform3fv(pr.u.uPlanetC, _gF32a);
    gl.uniform1f(pr.u.uR, p.radius);
    gl.uniform1f(pr.u.uSeaH, p.paletteBase);
    gl.uniform1f(pr.u.uWaterH, p.hasWater ? p.seaH : -1e9);
    gl.uniform1f(pr.u.uMaxE, p.maxElev);
    gl.uniform1f(pr.u.uHasWater, p.hasWater ? 1 : 0);
    gl.uniform3f(pr.u.uAxis, p.axis[0], p.axis[1], p.axis[2]);
    gl.uniform3f(pr.u.uSunDir, sun[0], sun[1], sun[2]);
    gl.uniform3fv(pr.u.uSunColor, sunCol);

    const amb = this.ambientColor(p);
    gl.uniform3fv(pr.u.uAmbient, amb);

    const c = p.biome.col;
    gl.uniform3fv(pr.u.uCSand, c.sand);
    gl.uniform3fv(pr.u.uCLow, c.low);
    gl.uniform3fv(pr.u.uCMid, c.mid);
    gl.uniform3fv(pr.u.uCHigh, c.high);
    gl.uniform3fv(pr.u.uCCliff, c.cliff);
    gl.uniform3fv(pr.u.uCPolar, c.polar);

    const lava = p.biome.lava;
    if (lava) gl.uniform4f(pr.u.uEmissive, lava.color[0], lava.color[1], lava.color[2], lava.depth * p.maxElev);
    else gl.uniform4f(pr.u.uEmissive, 0, 0, 0, -1e9);

    this.bindLight(pr);
    GLU.bindTex(pr, 'uNoise', 0, this.noiseTex, gl.TEXTURE_3D);

    const px = p.pos[0] - this.camPos[0];
    const py = p.pos[1] - this.camPos[1];
    const pz = p.pos[2] - this.camPos[2];
    for (const ch of this.terrain.visible) {
      gl.uniform3f(pr.u.uOffset, ch.center[0] + px, ch.center[1] + py, ch.center[2] + pz);
      ch.mesh.draw();
    }

    /* props share the object shader; they are already in chunk-local space */
    const op = this.prog.object;
    gl.useProgram(op.prog);
    gl.uniformMatrix4fv(op.u.uViewProj, false, this.viewProj);
    gl.uniform1f(op.u.uFcoefHalf, this.fcoefHalf);
    gl.uniform1f(op.u.uTime, this.time);
    gl.uniform1f(op.u.uThrust, 0.4);
    gl.uniform1f(op.u.uGear, 1);
    gl.uniform1f(op.u.uHideCanopy, 0);
    gl.uniform3f(op.u.uSunDir, sun[0], sun[1], sun[2]);
    gl.uniform3fv(op.u.uSunColor, sunCol);
    gl.uniform3fv(op.u.uAmbient, amb);
    gl.uniform3fv(op.u.uPlanetC, _gF32a);
    gl.uniform1f(op.u.uR, p.radius);
    this.bindLight(op);
    M4.identity(_gM4);
    _gMat3.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.uniformMatrix3fv(op.u.uModelRot, false, _gMat3);
    for (const ch of this.terrain.visible) {
      if (!ch.props) continue;
      gl.uniform3f(op.u.uOffset, ch.center[0] + px, ch.center[1] + py, ch.center[2] + pz);
      ch.props.draw();
    }
  },

  drawShipPass(sun, sunCol, p) {
    const gl = this.gl;
    const sh = this.ship;
    const cockpit = this.mode === 'ship' && !this.view3rd;
    /* From inside the cockpit the hull would fill the frame; the plumes are
       behind us either way. */
    if (cockpit) return;

    const pr = this.prog.ship;
    gl.useProgram(pr.prog);
    gl.uniformMatrix4fv(pr.u.uViewProj, false, this.viewProj);
    gl.uniform1f(pr.u.uFcoefHalf, this.fcoefHalf);
    gl.uniform3f(pr.u.uSunDir, sun[0], sun[1], sun[2]);
    gl.uniform3fv(pr.u.uSunColor, sunCol);
    gl.uniform3fv(pr.u.uAmbient, this.ambientColor(p));
    if (p) {
      gl.uniform3f(pr.u.uPlanetC, p.pos[0] - this.camPos[0], p.pos[1] - this.camPos[1], p.pos[2] - this.camPos[2]);
    } else {
      const v = this.sunDirScaled(_gTmp);
      gl.uniform3f(pr.u.uPlanetC, v[0], v[1], v[2]);
    }
    this.bindLight(pr);
    GLU.bindTex(pr, 'uTex', 0, this.shipTex, gl.TEXTURE_2D);

    /* Emissive spools up with the drive. */
    const driveNow = Math.max(sh.pulse, sh.ultra);
    const emis = SHIP_MODEL.emissiveStrength *
      (0.30 + sh.thrustVis * 0.55 + sh.boost * 0.5 + driveNow * 1.3);
    gl.uniform1f(pr.u.uEmissiveAmt, emis);
    GLU.bindTex(pr, 'uEmissive', 1, this.shipEmissive, gl.TEXTURE_2D);

    const ox = sh.pos[0] - this.camPos[0];
    const oy = sh.pos[1] - this.camPos[1];
    const oz = sh.pos[2] - this.camPos[2];

    /* Each part carries its own animated transform, composed with the hull's
       orientation.  Scales came out uniform in the bake, so a mat3 is enough
       and normals need no inverse-transpose. */
    this.shipAnim.sample(this.time);
    Q4.toMat3(_gMat3, sh.rot);
    for (let k = 0; k < this.shipParts.length; k++) {
      Q4.mul(_gPartQ, sh.rot, this.shipAnim.rot[k]);
      Q4.toMat3(_gPartM, _gPartQ);
      const sc = this.shipAnim.scale[k];
      for (let i = 0; i < 9; i++) _gPartM[i] *= sc;
      gl.uniformMatrix3fv(pr.u.uModelRot, false, _gPartM);

      V3.rotQuat(_gPartT, this.shipAnim.pos[k], sh.rot);
      gl.uniform3f(pr.u.uOffset, ox + _gPartT[0], oy + _gPartT[1], oz + _gPartT[2]);
      this.shipParts[k].draw();
    }

    this.drawThrusters(ox, oy, oz);
  },

  /* Exhaust plumes, drawn additively after the hull.  Depth test on so the
     terrain can occlude them, depth write off so they never occlude anything. */
  drawThrusters(ox, oy, oz) {
    const gl = this.gl, sh = this.ship;
    const drive = Math.max(sh.pulse, sh.ultra);
    const power = clamp(sh.thrustVis * 0.85 + sh.boost * 0.5 + drive * 1.4 + sh.ultra * 1.2, 0, 3.2);
    if (power < 0.04) return;

    const pr = this.prog.thruster;
    gl.useProgram(pr.prog);
    gl.uniformMatrix4fv(pr.u.uViewProj, false, this.viewProj);
    gl.uniform1f(pr.u.uFcoefHalf, this.fcoefHalf);
    gl.uniform1f(pr.u.uTime, this.time);
    Q4.toMat3(_gMat3, sh.rot);
    gl.uniformMatrix3fv(pr.u.uModelRot, false, _gMat3);
    gl.uniform3f(pr.u.uOffset, ox, oy, oz);

    /* Plume geometry: longer and thinner the harder the drive is pushing. */
    gl.uniform1f(pr.u.uLen, 1.6 + power * 5.4 + sh.ultra * 13.0);
    gl.uniform1f(pr.u.uRad, 0.95 + Math.min(power, 1.0) * 0.22);

    /* Colour shifts with the drive: orange idle, blue-white under pulse,
       violet at ultra. */
    const t1 = saturate(drive), t2 = saturate(sh.ultra);
    _gCore[0] = lerp(lerp(1.0, 0.62, t1), 0.85, t2);
    _gCore[1] = lerp(lerp(0.72, 0.88, t1), 0.62, t2);
    _gCore[2] = lerp(lerp(0.34, 1.00, t1), 1.00, t2);
    _gTip[0] = lerp(lerp(1.0, 0.20, t1), 0.65, t2);
    _gTip[1] = lerp(lerp(0.30, 0.45, t1), 0.18, t2);
    _gTip[2] = lerp(lerp(0.06, 1.00, t1), 1.00, t2);
    gl.uniform3fv(pr.u.uCore, _gCore);
    gl.uniform3fv(pr.u.uTip, _gTip);
    gl.uniform1f(pr.u.uIntensity, 0.40 + Math.min(power, 1.6) * 0.40);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    this.thrusterMesh.draw();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  },

  /* A stand-in "up" when there is no planet: point away from the star so the
     hemispheric ambient term still resolves to something sensible. */
  sunDirScaled(out) {
    V3.sub(out, this.camPos, this.system.starPos);
    V3.normalize(out, out);
    return V3.scale(out, out, -1e7);
  },

  /* Landing light: on foot it is a suit torch aimed where you look, in the
     ship it is a belly floodlight that comes on near the ground.  It brightens
     towards the night side, where it is the only light there is. */
  updateLight(p) {
    const L = this._light || (this._light = { pos: new Float32Array(4), col: new Float32Array(3), dir: new Float32Array(3) });
    L.pos[3] = 0;
    if (!p) return L;

    const onFoot = this.mode === 'foot';
    const alt = onFoot ? this.player.altitude : this.ship.altitude;
    const near = onFoot || this.ship.landed || this.ship.landing || alt < 600;
    if (!near) return L;

    const src = onFoot ? this.player.pos : this.ship.pos;
    V3.sub(_gRel, src, p.pos);
    V3.normalize(_gDir, _gRel);
    const sunUp = V3.dot(_gDir, _gSun);
    /* full brightness at night, a token fill in daylight */
    const night = 1 - smoothstep(-0.08, 0.30, sunUp);
    const strength = 0.22 + night * 1.5;

    const range = onFoot ? 150 : 340;
    L.pos[0] = src[0] - this.camPos[0];
    L.pos[1] = src[1] - this.camPos[1];
    L.pos[2] = src[2] - this.camPos[2];
    L.pos[3] = range;

    const dir = onFoot ? this.camFwd : quatFwd(_gTmp, this.ship.rot);
    if (onFoot) {
      L.dir[0] = dir[0]; L.dir[1] = dir[1]; L.dir[2] = dir[2];
    } else {
      /* angle the ship's lamp down and forward */
      const down = quatUp(_gU, this.ship.rot);
      L.dir[0] = dir[0] * 0.55 - down[0] * 0.83;
      L.dir[1] = dir[1] * 0.55 - down[1] * 0.83;
      L.dir[2] = dir[2] * 0.55 - down[2] * 0.83;
      const l = Math.hypot(L.dir[0], L.dir[1], L.dir[2]) || 1;
      L.dir[0] /= l; L.dir[1] /= l; L.dir[2] /= l;
    }
    L.col[0] = 0.95 * strength; L.col[1] = 0.97 * strength; L.col[2] = 1.0 * strength;
    return L;
  },

  bindLight(prog) {
    const gl = this.gl, L = this._light;
    if (!L || prog.u.uLightPos === undefined) return;
    gl.uniform4fv(prog.u.uLightPos, L.pos);
    gl.uniform3fv(prog.u.uLightCol, L.col);
    gl.uniform3fv(prog.u.uLightDir, L.dir);
  },

  ambientColor(p) {
    if (!p) { _gAmb[0] = 0.030; _gAmb[1] = 0.034; _gAmb[2] = 0.045; return _gAmb; }
    const sky = p.biome.sky;
    const k = 0.040 + p.atmoAmount * 0.115;
    const sc = this.system.starColor;
    _gAmb[0] = sky[0] * k * sc[0] + 0.016;
    _gAmb[1] = sky[1] * k * sc[1] + 0.018;
    _gAmb[2] = sky[2] * k * sc[2] + 0.024;
    return _gAmb;
  },

  drawSkyPass(sun, sunCol, p) {
    const gl = this.gl, pr = this.prog.sky;
    gl.useProgram(pr.prog);

    GLU.bindTex(pr, 'uScene', 0, this.rt.color, gl.TEXTURE_2D);
    GLU.bindTex(pr, 'uDepth', 1, this.rt.depth, gl.TEXTURE_2D);
    GLU.bindTex(pr, 'uNoise', 2, this.noiseTex, gl.TEXTURE_3D);

    gl.uniform3f(pr.u.uCamRight, this.camRight[0], this.camRight[1], this.camRight[2]);
    gl.uniform3f(pr.u.uCamUp, this.camUp[0], this.camUp[1], this.camUp[2]);
    gl.uniform3f(pr.u.uCamFwd, this.camFwd[0], this.camFwd[1], this.camFwd[2]);
    gl.uniform2f(pr.u.uTanFov, this.tanFovX, this.tanFovY);
    gl.uniform1f(pr.u.uInvLogK, 1.0 / this.fcoefHalf);
    gl.uniform1f(pr.u.uTime, this.time);

    gl.uniform3f(pr.u.uSunDir, sun[0], sun[1], sun[2]);
    gl.uniform3fv(pr.u.uSunColor, sunCol);
    const starDist = Math.max(V3.dist(this.camPos, this.system.starPos), this.system.starRadius * 1.02);
    gl.uniform1f(pr.u.uSunAng, Math.asin(clamp(this.system.starRadius / starDist, 0, 0.999)));
    gl.uniform3fv(pr.u.uNebulaTint, this.system.nebula);

    /* Stars are stylised bright points; a physically-scattered daytime sky is
       not bright enough to bury them through the tonemap.  So fade them by how
       much lit air is overhead — full in space and at night, gone at noon. */
    let starDim = 1;
    if (p && p.atmoAmount > 0.001) {
      V3.sub(_gRel, this.camPos, p.pos);
      const alt = V3.len(_gRel) - p.radius;
      const dens = saturate(p.densityAt(Math.max(alt, 0)) / p.atmoAmount);
      V3.normalize(_gDir, _gRel);
      const day = smoothstep(-0.12, 0.20, V3.dot(_gDir, sun));
      starDim = 1 - saturate(dens * 1.25) * day;
    }
    gl.uniform1f(pr.u.uStarDim, starDim);

    gl.uniform1i(pr.u.uSteps, this.quality.atmoSteps);
    gl.uniform1i(pr.u.uCloudSteps, this.quality.cloudSteps);

    /* ---- active world ---- */
    if (p) {
      gl.uniform3f(pr.u.uAPC, p.pos[0] - this.camPos[0], p.pos[1] - this.camPos[1], p.pos[2] - this.camPos[2]);
      gl.uniform1f(pr.u.uAPR, p.radius);
      gl.uniform1f(pr.u.uAPAtmoR, p.atmoRadius);
      gl.uniform1f(pr.u.uAPSeaR, p.hasWater ? p.seaRadius : -1);
      gl.uniform3fv(pr.u.uAPBetaR, p.betaR);
      gl.uniform1f(pr.u.uAPBetaM, p.betaM);
      gl.uniform1f(pr.u.uAPAtmoAmt, p.atmoAmount);
      const cl = p.biome.cloud;
      gl.uniform4f(pr.u.uAPCloud, cl.coverage, p.cloudLow, p.cloudHigh,
        this.quality.cloudSteps > 0 ? cl.density : 0);
      gl.uniform3fv(pr.u.uAPCloudTint, cl.tint);
      gl.uniform3fv(pr.u.uAPWaterDeep, p.biome.water.deep);
      gl.uniform3fv(pr.u.uAPWaterShallow, p.biome.water.shallow);
      gl.uniform1f(pr.u.uAPFade, this.terrainFade);
      gl.uniform4fv(pr.u.uAPHeightA, p.hA);
      gl.uniform4fv(pr.u.uAPHeightB, p.hB);
      const c = p.biome.col;
      gl.uniform3fv(pr.u.uAPc0, c.sand); gl.uniform3fv(pr.u.uAPc1, c.low);
      gl.uniform3fv(pr.u.uAPc2, c.mid); gl.uniform3fv(pr.u.uAPc3, c.high);
      gl.uniform3fv(pr.u.uAPc4, c.cliff); gl.uniform3fv(pr.u.uAPc5, c.polar);
      gl.uniform3f(pr.u.uAPAxis, p.axis[0], p.axis[1], p.axis[2]);
      gl.uniform1f(pr.u.uAPSeaH, p.paletteBase);
      gl.uniform1f(pr.u.uAPWaterH, p.hasWater ? p.seaH : -1e9);
      gl.uniform1f(pr.u.uAPMaxE, p.maxElev);
      gl.uniform1f(pr.u.uAPHasWater, p.hasWater ? 1 : 0);
    } else {
      gl.uniform3f(pr.u.uAPC, 0, 0, 1e12);
      gl.uniform1f(pr.u.uAPR, 1);
      gl.uniform1f(pr.u.uAPAtmoR, 1);
      gl.uniform1f(pr.u.uAPSeaR, -1);
      gl.uniform1f(pr.u.uAPAtmoAmt, 0);
      gl.uniform4f(pr.u.uAPCloud, 1, 1, 2, 0);
      gl.uniform1f(pr.u.uAPFade, 0);
      gl.uniform1f(pr.u.uAPHasWater, 0);
    }

    /* ---- other worlds, drawn analytically ---- */
    let n = 0;
    for (const q of this.system.planets) {
      if (q === p || n >= 8) continue;
      _gDP[n * 4] = q.pos[0] - this.camPos[0];
      _gDP[n * 4 + 1] = q.pos[1] - this.camPos[1];
      _gDP[n * 4 + 2] = q.pos[2] - this.camPos[2];
      _gDP[n * 4 + 3] = q.radius;
      const c = q.biome.col;
      _gDPA[n * 4] = c.low[0]; _gDPA[n * 4 + 1] = c.low[1]; _gDPA[n * 4 + 2] = c.low[2];
      _gDPA[n * 4 + 3] = q.hasWater ? 1 : 0.35;
      _gDPB[n * 4] = c.high[0]; _gDPB[n * 4 + 1] = c.high[1]; _gDPB[n * 4 + 2] = c.high[2];
      _gDPB[n * 4 + 3] = q.atmoAmount;
      n++;
    }
    gl.uniform1i(pr.u.uDPCount, n);
    if (n) {
      gl.uniform4fv(pr.u.uDP, _gDP.subarray(0, n * 4));
      gl.uniform4fv(pr.u.uDPColA, _gDPA.subarray(0, n * 4));
      gl.uniform4fv(pr.u.uDPColB, _gDPB.subarray(0, n * 4));
    }

    /* ---- scanner ---- */
    if (this.scan.active) {
      const r = this.scan.t * 240;
      gl.uniform4f(pr.u.uScan,
        this.scan.origin[0] - this.camPos[0],
        this.scan.origin[1] - this.camPos[1],
        this.scan.origin[2] - this.camPos[2], r);
    } else {
      gl.uniform4f(pr.u.uScan, 0, 0, 0, -1);
    }

    this.drawFullscreen();
  },

  drawBloom() {
    const gl = this.gl;
    const L = this.bloomL, T = this.bloomT;

    // bright pass into level 0
    gl.useProgram(this.prog.bright.prog);
    GLU.bindTex(this.prog.bright, 'uTex', 0, this.skyRT.color, gl.TEXTURE_2D);
    gl.uniform1f(this.prog.bright.u.uThreshold, 1.05);
    gl.bindFramebuffer(gl.FRAMEBUFFER, L[0].fbo);
    gl.viewport(0, 0, L[0].w, L[0].h);
    this.drawFullscreen();

    const blur = this.prog.blur;
    gl.useProgram(blur.prog);

    const pass = (src, dst, dx, dy) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      GLU.bindTex(blur, 'uTex', 0, src.color, gl.TEXTURE_2D);
      gl.uniform2f(blur.u.uDir, dx, dy);
      this.drawFullscreen();
    };

    // downsample chain (a zero-direction blur is a plain resampling copy)
    for (let i = 1; i < L.length; i++) pass(L[i - 1], L[i], 0, 0);
    // separable blur at every level
    for (let i = 0; i < L.length; i++) {
      pass(L[i], T[i], 1 / L[i].w, 0);
      pass(T[i], L[i], 0, 1 / L[i].h);
    }
    // upsample and accumulate downward
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = L.length - 1; i > 0; i--) pass(L[i], L[i - 1], 0, 0);
    gl.disable(gl.BLEND);
  },

  drawComposite() {
    const gl = this.gl, pr = this.prog.composite;
    gl.useProgram(pr.prog);
    GLU.bindTex(pr, 'uScene', 0, this.skyRT.color, gl.TEXTURE_2D);
    GLU.bindTex(pr, 'uBloom', 1, this.bloomL[0].color, gl.TEXTURE_2D);
    gl.uniform1f(pr.u.uBloomAmount, GLU.hdr ? 0.30 : 0.20);
    gl.uniform1f(pr.u.uExposure, this.exposure);
    gl.uniform1f(pr.u.uTime, this.time);
    gl.uniform1f(pr.u.uPulse, this.mode === 'foot' ? 0 : Math.max(this.ship.pulse, this.ship.ultra));
    gl.uniform1f(pr.u.uVignette, 0.38);
    gl.uniform1f(pr.u.uFlash, this.flash);
    gl.uniform2f(pr.u.uRes, this.canvas.width, this.canvas.height);
    this.drawFullscreen();
  },

  drawFullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  /* -------------------------------------------------------------- stats -- */
  updateStats(dt) {
    if (!this.showStats) return;
    this._fpsAcc = (this._fpsAcc || 0) + dt;
    this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsAcc < 0.4) return;
    const fps = this._fpsN / this._fpsAcc;
    this._fpsAcc = 0; this._fpsN = 0;
    const t = this.terrain ? this.terrain.stats() : { chunks: 0, tris: 0 };
    HUD.stats(
      fps.toFixed(0) + ' fps  ' + this.qualityName + '\n' +
      t.chunks + ' chunks  ' + (t.tris / 1000).toFixed(0) + 'k tris\n' +
      (this.terrain ? this.terrain.pendingChunks : 0) + ' pending\n' +
      (this.activePlanet ? this.activePlanet.name : 'deep space')
    );
  }
};

const _gRel = V3.new(), _gDir = V3.new(), _gTmp = V3.new(), _gSun = V3.new();
const _gF = V3.new(), _gU = V3.new(), _gDesired = V3.new(), _gAxis = V3.new();
const _gCamLocal = V3.new();
const _gWorldUp = V3.new(0, 1, 0);
const _gQ = Q4.new();
const _gM4 = M4.new();
const _gMat3 = new Float32Array(9);
const _gF32a = new Float32Array(3);
const _gAmb = new Float32Array(3);
const _gDP = new Float32Array(32);
const _gDPA = new Float32Array(32);
const _gDPB = new Float32Array(32);
const _gCore = new Float32Array(3);
const _gTip = new Float32Array(3);
const _gPartM = new Float32Array(9);
const _gPartQ = Q4.new();
const _gPartT = V3.new();

window.addEventListener('DOMContentLoaded', () => Game.boot());
