/* ============================================================
 * AUDIO — Sons synthétisés via Web Audio API (aucun fichier)
 * ============================================================ */

const Sfx = {
  ctx: null,
  master: null,
  enabled: true,
  ambient: null,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

  _env(node, t, dur, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(this.master);
    return g;
  },

  _noise(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  },

  play(name) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case "shot": {
        const n = this._noise(0.18);
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass"; lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(220, t + 0.15);
        n.connect(lp); this._env(lp, t, 0.16, 0.7); n.start(t); n.stop(t + 0.18);
        const o = this.ctx.createOscillator();
        o.type = "square"; o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
        this._env(o, t, 0.12, 0.35); o.start(t); o.stop(t + 0.12);
        break;
      }
      case "empty": {
        const o = this.ctx.createOscillator();
        o.type = "square"; o.frequency.value = 900;
        this._env(o, t, 0.05, 0.15); o.start(t); o.stop(t + 0.05);
        break;
      }
      case "knife": {
        const n = this._noise(0.12);
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 1200;
        n.connect(hp); this._env(hp, t, 0.1, 0.4); n.start(t); n.stop(t + 0.12);
        break;
      }
      case "hit": {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth"; o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.12);
        this._env(o, t, 0.14, 0.4); o.start(t); o.stop(t + 0.14);
        break;
      }
      case "hurt": {
        const o = this.ctx.createOscillator();
        o.type = "triangle"; o.frequency.setValueAtTime(420, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.25);
        this._env(o, t, 0.28, 0.5); o.start(t); o.stop(t + 0.28);
        break;
      }
      case "pickup": {
        const o = this.ctx.createOscillator();
        o.type = "sine"; o.frequency.setValueAtTime(520, t);
        o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
        this._env(o, t, 0.16, 0.35); o.start(t); o.stop(t + 0.16);
        break;
      }
      case "heal": {
        [440, 660, 880].forEach((f, i) => {
          const o = this.ctx.createOscillator();
          o.type = "sine"; o.frequency.value = f;
          this._env(o, t + i * 0.07, 0.18, 0.25); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.18);
        });
        break;
      }
      case "door": {
        const n = this._noise(0.5);
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.setValueAtTime(300, t);
        bp.frequency.linearRampToValueAtTime(140, t + 0.45); bp.Q.value = 6;
        n.connect(bp); this._env(bp, t, 0.45, 0.3); n.start(t); n.stop(t + 0.5);
        break;
      }
      case "locked": {
        const o = this.ctx.createOscillator();
        o.type = "square"; o.frequency.value = 160;
        this._env(o, t, 0.12, 0.2); o.start(t); o.stop(t + 0.12);
        break;
      }
      case "growl": {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth"; o.frequency.setValueAtTime(70, t);
        o.frequency.linearRampToValueAtTime(45, t + 0.5);
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass"; lp.frequency.value = 400;
        o.connect(lp); this._env(lp, t, 0.55, 0.3); o.start(t); o.stop(t + 0.6);
        break;
      }
      case "death": {
        const n = this._noise(0.4);
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass"; lp.frequency.setValueAtTime(800, t);
        lp.frequency.exponentialRampToValueAtTime(120, t + 0.35);
        n.connect(lp); this._env(lp, t, 0.4, 0.4); n.start(t); n.stop(t + 0.4);
        break;
      }
      case "victory": {
        [523, 659, 784, 1046].forEach((f, i) => {
          const o = this.ctx.createOscillator();
          o.type = "triangle"; o.frequency.value = f;
          this._env(o, t + i * 0.14, 0.3, 0.3); o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.3);
        });
        break;
      }
      case "gameover": {
        [392, 311, 233, 175].forEach((f, i) => {
          const o = this.ctx.createOscillator();
          o.type = "sawtooth"; o.frequency.value = f;
          this._env(o, t + i * 0.2, 0.4, 0.3); o.start(t + i * 0.2); o.stop(t + i * 0.2 + 0.4);
        });
        break;
      }
    }
  },

  // Drone d'ambiance grave et inquiétant
  startAmbient() {
    if (!this.enabled || !this.ctx || this.ambient) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = "sine"; o1.frequency.value = 55;
    o2.type = "sine"; o2.frequency.value = 58.7; // léger battement
    const g = this.ctx.createGain(); g.gain.value = 0.08;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 200;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    this.ambient = { o1, o2, g };
  },

  stopAmbient() {
    if (this.ambient) {
      try { this.ambient.o1.stop(); this.ambient.o2.stop(); } catch (e) {}
      this.ambient = null;
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
    return this.enabled;
  },
};
