/* ============================================================
   SPARKING ARENA — entry point.
   Screen flow, render loop, split-screen, post pipeline.
   ============================================================ */
import * as THREE from 'three';
import { Input } from './core/input.js';
import { PostFX } from './graphics/postfx.js';
import { Effects } from './vfx/effects.js';
import { syncToonEnv } from './graphics/materials.js';
import { buildStage, STAGES } from './stages/stages.js';
import { buildFighter } from './characters/rig.js';
import { Animator } from './characters/animator.js';
import { ROSTER } from './characters/roster.js';
import { AudioEngine } from './audio/audio.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { Match } from './game/match.js';
import { clamp, damp, lerp, TAU, disposeObject } from './core/utils.js';

const _v = new THREE.Vector3();

/* ============================================================
   Character preview used on the menus
   ============================================================ */
class Preview {
  constructor(scene) {
    this.scene = scene;
    this.holder = new THREE.Group();
    scene.add(this.holder);
    this.rig = null;
    this.spin = 0;
    this.visible = true;
  }
  set(spec) {
    if (this.spec === spec) return;
    this.spec = spec;
    if (this.rig) { this.holder.remove(this.rig.root); disposeObject(this.rig.root); }
    this.rig = buildFighter(spec);
    this.anim = new Animator(this.rig);
    this.anim.play('pose', { fade: 0 });
    this.holder.add(this.rig.root);
    syncToonEnv(this.scene);
  }
  update(dt) {
    if (!this.rig) return;
    this.spin += dt * 0.34;
    this.holder.rotation.y = Math.sin(this.spin) * 0.85 + 0.25;
    this.anim.update(dt);
    const off = this.anim.apply();
    this.rig.inner.position.set(off.x, off.y, off.z);
    const u = this.rig.auraMat.uniforms;
    u.uTime.value += dt;
    u.uPower.value = 0.42;
    u.uOpacity.value = 0.6;
    this.rig.aura.visible = true;
    for (const k in this.rig.materials) {
      const m = this.rig.materials[k];
      if (m.uniforms?.uEnergy) m.uniforms.uEnergy.value = 0.14;
    }
  }
  show(v) { this.holder.visible = v; }
}

/* ============================================================
   App
   ============================================================ */
class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.uiRoot = document.getElementById('ui');

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: false, alpha: false,
      powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x05070f, 1);

    this.post = new PostFX(this.renderer);

    this.audio = new AudioEngine();
    this.input = new Input();
    this.hud = new HUD(this.uiRoot);
    this.menus = new Menus(this.uiRoot, this.audio);
    this.menus.onAction = (a, v) => this.onMenuAction(a, v);

    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    this.uiRoot.appendChild(this.fpsEl);

    /* --- menu world --- */
    this.menuScene = new THREE.Scene();
    this.menuFx = new Effects(this.menuScene);
    this.menuStage = buildStage('sanctuary', this.menuScene);
    this.preview = new Preview(this.menuScene);
    this.menuCam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 900);
    this.menuCamAngle = 0;
    syncToonEnv(this.menuScene);

    /* --- battle world --- */
    this.battleScene = new THREE.Scene();
    this.fx = new Effects(this.battleScene);
    this.match = null;

    this.flashAmt = 0;
    this.flashColor = new THREE.Color(0xffffff);
    this.wave = null;

    const bindHooks = (fx) => fx.bind({
      flash: (amt, color) => {
        this.flashAmt = Math.max(this.flashAmt, amt);
        if (color !== undefined) this.flashColor.set(color);
      },
      wave: (p, radius) => { this.wave = { p: p.clone(), t: 0, dur: 0.55, max: radius }; },
    });
    bindHooks(this.fx); bindHooks(this.menuFx);

    /* --- state --- */
    this.state = 'boot';
    this.selPhase = 0;
    this.selIndex = 0;
    this.picks = [0, 1];
    this.stageIndex = 0;
    this.difficulty = 1;
    this.mode = 'vs-cpu';
    this.transitionT = 0;

    this.clock = new THREE.Clock();
    this.frames = 0; this.fpsT = 0;

    addEventListener('resize', () => this.resize());
    this.resize();

    const kick = () => {
      this.audio.resume();
      if (!this.musicStarted) {
        this.musicStarted = true;
        this.audio.music.play(this.state === 'battle' ? 'wasteland' : 'title');
      }
    };
    addEventListener('pointerdown', kick);
    addEventListener('keydown', kick);

    this.boot();
  }

  boot() {
    const boot = document.createElement('div');
    boot.id = 'boot';
    boot.innerHTML = `
      <div class="logo"><div class="l1" style="font-size:clamp(30px,7vh,90px)">SPARKING</div>
      <div class="l2" style="font-size:clamp(11px,2vh,26px)">ARENA</div></div>
      <div class="bar"><i></i></div><div class="msg">PRÉPARATION DU CHAMP DE BATAILLE…</div>`;
    this.uiRoot.appendChild(boot);
    const bar = boot.querySelector('i');
    let p = 0;
    const step = () => {
      p += 12 + Math.random() * 22;
      bar.style.width = Math.min(100, p) + '%';
      if (p < 100) return setTimeout(step, 90);
      setTimeout(() => {
        boot.style.opacity = '0';
        setTimeout(() => boot.remove(), 700);
        this.preview.set(ROSTER[0]);
        this.setState('title');
      }, 320);
    };
    // warm the pipeline while the bar fills
    this.preview.set(ROSTER[0]);
    this.renderMenu(0.016);
    setTimeout(step, 120);
    this.loop();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    this.post.setSize(w * dpr, h * dpr);
    this.menuCam.aspect = w / h;
    this.menuCam.updateProjectionMatrix();
    if (this.match) {
      const split = this.match.split;
      this.match.cameras.forEach((c) => c.setAspect(split ? (w / 2) / h : w / h));
    }
  }

  /* ---------------- state machine ---------------- */

  setState(s) {
    this.state = s;
    switch (s) {
      case 'title':
        this.menus.show('title-screen');
        this.hud.show(false);
        this.preview.show(true);
        this.audio.music.play('title');
        break;
      case 'mode':
        this.menus.show('mode-screen');
        this.menus.syncMode();
        this.audio.music.play('select');
        break;
      case 'select':
        this.selPhase = 0;
        this.selIndex = this.picks[0];
        this.menus.show('select-screen');
        this.refreshSelect();
        this.audio.music.play('select');
        break;
      case 'stage':
        this.menus.show('stage-screen');
        this.menus.updateStage(this.stageIndex, this.difficulty, this.mode !== 'vs-local');
        break;
      case 'controls':
        this.menus.show('controls-screen');
        break;
      case 'battle':
        this.menus.hideAll();
        this.preview.show(false);
        break;
      case 'pause':
        this.menus.show('pause-screen');
        this.menus.pauseIndex = 0; this.menus.syncPause();
        break;
      case 'result':
        break;
    }
  }

  refreshSelect() {
    const spec = ROSTER[this.selIndex];
    this.preview.set(spec);
    this.menus.updateSelect(this.selIndex, this.selPhase, this.picks[0]);
  }

  onMenuAction(action, value) {
    const a = this.audio;
    switch (action) {
      case 'title-confirm':
        if (this.state === 'title') { a.uiConfirm(); this.setState('mode'); }
        break;
      case 'mode-confirm': {
        a.uiConfirm();
        const id = this.menus.modeItems[this.menus.modeIndex].id;
        if (id === 'controls') { this.setState('controls'); break; }
        this.mode = id;
        this.setState('select');
        break;
      }
      case 'select-hover':
        if (this.selIndex !== value) { a.uiMove(); this.selIndex = value; this.refreshSelect(); }
        break;
      case 'select-pick':
        this.selIndex = value;
        this.confirmSelect();
        break;
      case 'stage-hover':
        if (this.stageIndex !== value) {
          a.uiMove(); this.stageIndex = value;
          this.menus.updateStage(this.stageIndex, this.difficulty, this.mode !== 'vs-local');
        }
        break;
      case 'stage-pick':
        this.stageIndex = value;
        a.uiConfirm();
        this.startBattle();
        break;
      case 'diff-cycle':
        this.difficulty = (this.difficulty + 1) % 4;
        a.uiMove();
        this.menus.updateStage(this.stageIndex, this.difficulty, this.mode !== 'vs-local');
        break;
      case 'pause-confirm': {
        a.uiConfirm();
        const id = this.menus.pauseItems[this.menus.pauseIndex].id;
        if (id === 'resume') this.resume();
        else if (id === 'rematch') { this.endBattle(); this.startBattle(); }
        else { this.endBattle(); this.setState('title'); }
        break;
      }
      case 'result-confirm': {
        a.uiConfirm();
        const id = this.menus.resultItems[this.menus.resultIndex].id;
        this.endBattle();
        if (id === 'rematch') this.startBattle();
        else if (id === 'chars') this.setState('select');
        else this.setState('title');
        break;
      }
    }
  }

  confirmSelect() {
    this.audio.uiConfirm();
    if (this.selPhase === 0) {
      this.picks[0] = this.selIndex;
      if (this.mode === 'vs-local') {
        this.selPhase = 1;
        this.selIndex = (this.selIndex + 1) % ROSTER.length;
        this.refreshSelect();
      } else {
        this.selPhase = 2;
        this.selIndex = (this.selIndex + 1) % ROSTER.length;
        this.refreshSelect();
      }
    } else {
      this.picks[1] = this.selIndex;
      this.setState('stage');
    }
  }

  startBattle() {
    if (this.match) this.endBattle();
    this.fx.clear();
    const config = {
      p1: ROSTER[this.picks[0]].id,
      p2: ROSTER[this.picks[1]].id,
      stage: STAGES[this.stageIndex].id,
      mode: this.mode === 'vs-local' ? 'local' : this.mode === 'survival' ? 'survival' : 'cpu',
      difficulty: this.difficulty,
    };
    this.match = new Match({
      scene: this.battleScene, fx: this.fx, audio: this.audio,
      hud: this.hud, input: this.input, post: this.post,
    }, config);
    this.match.onMatchOver = (winner, stats) => {
      this.state = 'result';
      const won = this.mode === 'vs-local' ? true : winner === 0;
      const name = this.match.fighters[winner].spec.name;
      setTimeout(() => {
        if (!this.match) return;
        this.menus.showResult(won, name, stats);
      }, 2400);
    };
    this.resize();
    this.setState('battle');
  }

  endBattle() {
    if (!this.match) return;
    this.match.dispose();
    this.match = null;
    this.fx.clear();
    this.hud.show(false);
    this.menus.hideAll();
    this.preview.show(true);
  }

  pause() {
    if (this.state !== 'battle') return;
    this.state = 'pause';
    this.setState('pause');
    this.audio.music.setIntensity(0.25);
  }
  resume() {
    if (this.state !== 'pause') return;
    this.menus.hideAll();
    this.state = 'battle';
    this.audio.music.setIntensity(1);
  }

  /* ---------------- menu navigation ---------------- */

  handleMenuInput() {
    const m = this.input.menu();
    const a = this.audio;

    if (this.state === 'title') {
      if (m.any || m.confirm) this.onMenuAction('title-confirm');
      return;
    }
    if (this.state === 'mode') {
      const n = this.menus.modeItems.length;
      if (m.up) { this.menus.modeIndex = (this.menus.modeIndex - 1 + n) % n; this.menus.syncMode(); a.uiMove(); }
      if (m.down) { this.menus.modeIndex = (this.menus.modeIndex + 1) % n; this.menus.syncMode(); a.uiMove(); }
      if (m.confirm) this.onMenuAction('mode-confirm');
      if (m.cancel) { a.uiCancel(); this.setState('title'); }
      return;
    }
    if (this.state === 'select') {
      const n = ROSTER.length, cols = 5;
      let i = this.selIndex;
      if (m.left) i = (i - 1 + n) % n;
      if (m.right) i = (i + 1) % n;
      if (m.up) i = (i - cols + n) % n;
      if (m.down) i = (i + cols) % n;
      if (i !== this.selIndex) { this.selIndex = i; a.uiMove(); this.refreshSelect(); }
      if (m.confirm) this.confirmSelect();
      if (m.cancel) {
        a.uiCancel();
        if (this.selPhase > 0) { this.selPhase = 0; this.selIndex = this.picks[0]; this.refreshSelect(); }
        else this.setState('mode');
      }
      return;
    }
    if (this.state === 'stage') {
      const n = STAGES.length, cols = 3;
      let i = this.stageIndex;
      if (m.up) i = (i - cols + n) % n;
      if (m.down) i = (i + cols) % n;
      if (m.left) { this.difficulty = (this.difficulty + 3) % 4; a.uiMove(); }
      if (m.right) { this.difficulty = (this.difficulty + 1) % 4; a.uiMove(); }
      if (i !== this.stageIndex) { this.stageIndex = i; a.uiMove(); }
      this.menus.updateStage(this.stageIndex, this.difficulty, this.mode !== 'vs-local');
      if (m.confirm) { a.uiConfirm(); this.startBattle(); }
      if (m.cancel) { a.uiCancel(); this.setState('select'); }
      return;
    }
    if (this.state === 'controls') {
      if (m.confirm || m.cancel) { a.uiCancel(); this.setState('mode'); }
      return;
    }
    if (this.state === 'pause') {
      const n = this.menus.pauseItems.length;
      if (m.up) { this.menus.pauseIndex = (this.menus.pauseIndex - 1 + n) % n; this.menus.syncPause(); a.uiMove(); }
      if (m.down) { this.menus.pauseIndex = (this.menus.pauseIndex + 1) % n; this.menus.syncPause(); a.uiMove(); }
      if (m.confirm) this.onMenuAction('pause-confirm');
      if (this.input.players[0].pressed('back') || this.input.players[1].pressed('back')) this.resume();
      return;
    }
    if (this.state === 'result') {
      const n = this.menus.resultItems.length;
      if (m.up) { this.menus.resultIndex = (this.menus.resultIndex - 1 + n) % n; this.menus.syncResult(); a.uiMove(); }
      if (m.down) { this.menus.resultIndex = (this.menus.resultIndex + 1) % n; this.menus.syncResult(); a.uiMove(); }
      if (m.confirm) this.onMenuAction('result-confirm');
      return;
    }
    if (this.state === 'battle') {
      if (this.input.players[0].pressed('back') || this.input.players[1].pressed('back')) this.pause();
    }
  }

  /* ---------------- render ---------------- */

  renderScene(scene, cameras, split) {
    const r = this.renderer;
    const rt = this.post.sceneRT;
    r.setRenderTarget(rt);
    r.setScissorTest(false);
    r.setViewport(0, 0, rt.width, rt.height);
    r.clear(true, true, true);
    if (!split) {
      r.render(scene, cameras[0]);
    } else {
      const w = rt.width, h = rt.height;
      r.setScissorTest(true);
      for (let i = 0; i < 2; i++) {
        const x = i * w / 2;
        r.setViewport(x, 0, w / 2, h);
        r.setScissor(x, 0, w / 2, h);
        r.render(scene, cameras[i]);
      }
      r.setScissorTest(false);
      r.setViewport(0, 0, w, h);
    }
    r.setRenderTarget(null);
  }

  renderMenu(dt) {
    this.menuCamAngle += dt * 0.05;
    // frame the fighter to one side so the UI panels get clean space
    const bias = this.state === 'select' ? 1 : this.state === 'title' ? 0.35 : 0.6;
    this.camBias = damp(this.camBias ?? bias, bias, 4, dt);
    const r = lerp(4.6, 3.9, this.camBias);
    const a = this.menuCamAngle * 0.4;
    this.menuCam.position.set(
      Math.sin(a) * 1.1 + 0.4,
      1.62 + Math.sin(this.menuCamAngle * 0.8) * 0.14,
      r
    );
    this.menuCam.lookAt(-this.camBias * 0.92, 1.02, 0);
    this.renderScene(this.menuScene, [this.menuCam], false);
  }

  updatePost(dt, camera) {
    const u = this.post.u;
    this.flashAmt = damp(this.flashAmt, 0, 12, dt);
    u.uFlash.value = clamp(this.flashAmt, 0, 0.5);
    u.uFlashColor.value.copy(this.flashColor);

    if (this.wave) {
      this.wave.t += dt;
      const k = this.wave.t / this.wave.dur;
      if (k >= 1) this.wave = null;
      else if (camera) {
        _v.copy(this.wave.p).project(camera);
        u.uWaveCenter.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
        u.uWaveR.value = k * 0.55;
        u.uWaveAmp.value = (1 - k) * 0.022 * clamp(this.wave.max / 8, 0.4, 2);
      }
    } else {
      u.uWaveAmp.value = 0;
    }
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());

    this.input.update();
    this.handleMenuInput();

    if (this.state === 'battle' && this.match) {
      this.match.update(dt);
      this.fx.update(dt, this.match.cameras[0].camera);
      this.updatePost(dt, this.match.cameras[0].camera);
      this.renderScene(this.battleScene,
        this.match.cameras.map((c) => c.camera), this.match.split);
    } else if ((this.state === 'pause' || this.state === 'result') && this.match) {
      this.fx.update(this.state === 'result' ? dt : 0, this.match.cameras[0].camera);
      if (this.state === 'result') {
        this.match.cameras[0].update(dt, this.match.fighters[0], this.match.fighters[1], this.fx);
        for (const f of this.match.fighters) f.updateVisual(dt);
        this.match.stage.update(dt);
      }
      this.updatePost(dt, this.match.cameras[0].camera);
      this.renderScene(this.battleScene,
        this.match.cameras.map((c) => c.camera), this.match.split);
    } else {
      this.preview.update(dt);
      this.menuStage.update(dt);
      this.menuFx.update(dt, this.menuCam);
      this.updatePost(dt, this.menuCam);
      this.renderMenu(dt);
    }

    this.post.render(dt);

    this.frames++; this.fpsT += dt;
    if (this.fpsT > 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.fpsT)} FPS`;
      this.frames = 0; this.fpsT = 0;
    }
  };
}

const app = new App();
// exposed for automated smoke tests / debugging
window.__app = app;
