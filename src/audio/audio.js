/* ============================================================
   Audio — 100% synthesized. Impact SFX, ki/beam layers, battle
   cries (formant synthesis) and a procedural score that changes
   per stage.
   ============================================================ */
import { clamp, rand, pick } from '../core/utils.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ok = false;
    this.muted = false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.ok = true;
    } catch (e) { return; }

    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.85;

    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 7;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9;
    this.musBus = c.createGain(); this.musBus.gain.value = 0.42;

    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 2.6);
    this.revSend = c.createGain(); this.revSend.gain.value = 0.24;

    this.sfxBus.connect(this.comp);
    this.sfxBus.connect(this.revSend);
    this.musBus.connect(this.comp);
    this.revSend.connect(this.reverb);
    this.reverb.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(c.destination);

    this.noiseBuf = this._noise(2.0);
    this.loops = new Map();
    this.music = new Music(this);
  }

  resume() {
    if (this.ok && this.ctx.state === 'suspended') this.ctx.resume();
  }
  get t() { return this.ctx.currentTime; }

  setVolume(v) { if (this.ok) this.master.gain.value = v; }
  toggleMute() {
    this.muted = !this.muted;
    if (this.ok) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.t, 0.05);
    return this.muted;
  }

  _impulse(dur, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * dur);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return b;
  }

  _noise(dur) {
    const c = this.ctx, len = Math.floor(c.sampleRate * dur);
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* ---------------- primitives ---------------- */

  noise({ dur = 0.2, gain = 0.5, type = 'bandpass', freq = 1200, q = 1, sweep = null, dest = null, delay = 0 }) {
    if (!this.ok) return null;
    const c = this.ctx, t = this.t + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = rand(0.85, 1.2);
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) {
      f.frequency.setValueAtTime(sweep[0], t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, sweep[1]), t + dur);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.008, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
    return { src, g, f };
  }

  tone({ freq = 200, to = null, dur = 0.3, gain = 0.4, type = 'sine', dest = null, delay = 0, attack = 0.005, curve = 'exp' }) {
    if (!this.ok) return null;
    const c = this.ctx, t = this.t + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to !== null) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
      else o.frequency.linearRampToValueAtTime(to, t + dur);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    return { o, g };
  }

  /* ---------------- combat SFX ---------------- */

  /**
   * Impacts are built as transient + body + tail, the way a real hit reads:
   *   transient — 20 ms bright click, tells the ear exactly when it landed
   *   body      — pitch-swept sine thump, gives the weight
   *   tail      — mid noise burst through the reverb, gives the room
   * Everything is randomised a little so a 5-hit combo doesn't machine-gun
   * the same sample.
   */
  punch(power = 1, pitch = 1) {
    const r = rand(0.94, 1.07);
    this.noise({
      dur: 0.03, gain: 0.3 * power, type: 'highpass',
      freq: 4200 * pitch, sweep: [6000 * pitch * r, 1800],
    });
    this.tone({
      freq: 235 * pitch * r, to: 46, dur: 0.13 * power,
      gain: 0.52 * power, type: 'sine', attack: 0.002,
    });
    this.noise({
      dur: 0.085 * power, gain: 0.2 * power, type: 'bandpass',
      freq: 950 * pitch, q: 1.6, sweep: [1500 * pitch * r, 380],
    });
    this.tone({ freq: 88, to: 38, dur: 0.2 * power, gain: 0.3 * power, type: 'triangle' });
  }

  heavyHit(pitch = 1) {
    this.punch(1.45, pitch * 0.82);
    // sub drop: what separates a smash from a jab
    this.tone({ freq: 78, to: 26, dur: 0.55, gain: 0.55, type: 'sine', attack: 0.004 });
    this.noise({ dur: 0.5, gain: 0.26, type: 'lowpass', freq: 700, sweep: [1600, 110] });
    this.noise({ dur: 0.05, gain: 0.3, type: 'bandpass', freq: 2600, q: 2, delay: 0.012 });
  }

  /** limb travelling through air — fast doppler sweep */
  swish(pitch = 1) {
    const c = this.ctx; if (!this.ok) return;
    const t = this.t;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 3.2;
    const peak = 2400 * pitch * rand(0.9, 1.15);
    f.frequency.setValueAtTime(peak * 0.35, t);
    f.frequency.exponentialRampToValueAtTime(peak, t + 0.07);
    f.frequency.exponentialRampToValueAtTime(peak * 0.3, t + 0.19);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.19, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + 0.25);
  }

  guardHit() {
    // metallic: a couple of detuned partials over the noise crack
    this.noise({ dur: 0.12, gain: 0.2, type: 'bandpass', freq: 3400, q: 3.5, sweep: [4600, 1000] });
    for (const f of [1180, 1790, 2630]) {
      this.tone({ freq: f * rand(0.99, 1.01), to: f * 0.985, dur: 0.22, gain: 0.07, type: 'sine' });
    }
    this.tone({ freq: 150, to: 70, dur: 0.13, gain: 0.22, type: 'triangle' });
  }

  /** small ki bolt: resonant descending zap with a metallic ring */
  kiShot(pitch = 1) {
    if (!this.ok) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1750 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(210 * pitch, t + 0.22);
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 11;
    f.frequency.setValueAtTime(4200 * pitch, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.22);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
    o.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.3);
    this.tone({ freq: 2900 * pitch, to: 1500 * pitch, dur: 0.1, gain: 0.05, type: 'sine' });
    this.noise({ dur: 0.16, gain: 0.1, type: 'highpass', freq: 1600, sweep: [4200, 1100] });
  }

  explosion(size = 1) {
    // crack, then the roll-off, then the sub
    this.noise({ dur: 0.05, gain: 0.42, type: 'highpass', freq: 2800 });
    this.noise({ dur: 1.2 * size, gain: 0.48, type: 'lowpass', freq: 900, sweep: [3000, 55] });
    this.tone({ freq: 135, to: 20, dur: 0.95 * size, gain: 0.6, type: 'sine', attack: 0.003 });
    this.tone({ freq: 58, to: 17, dur: 1.5 * size, gain: 0.44, type: 'triangle', delay: 0.025 });
    // debris rattle
    for (let i = 0; i < 3; i++) {
      this.noise({
        dur: 0.22, gain: 0.07 * size, type: 'bandpass',
        freq: rand(900, 2600), q: 2, delay: 0.1 + i * rand(0.06, 0.16),
      });
    }
  }

  vanish() {
    this.noise({ dur: 0.18, gain: 0.2, type: 'bandpass', freq: 2600, q: 5, sweep: [700, 6000] });
    this.tone({ freq: 1800, to: 6200, dur: 0.12, gain: 0.09, type: 'sine' });
    this.tone({ freq: 300, to: 90, dur: 0.1, gain: 0.14, type: 'triangle', delay: 0.02 });
  }

  /** high metallic ring for beam clashes */
  clash() {
    for (const f of [1560, 2340, 3120, 4700]) {
      this.tone({ freq: f * rand(0.99, 1.02), to: f * 0.97, dur: rand(0.5, 0.9), gain: 0.07, type: 'sine' });
    }
    this.noise({ dur: 0.4, gain: 0.22, type: 'bandpass', freq: 2200, q: 1.4, sweep: [5200, 900] });
    this.tone({ freq: 95, to: 34, dur: 0.7, gain: 0.4, type: 'sine' });
  }

  /** rising rumble under a power-up */
  powerUp(dur = 1.2, pitch = 1) {
    if (!this.ok) return;
    this.noise({ dur, gain: 0.3, type: 'lowpass', freq: 300, sweep: [140, 3200] });
    this.tone({ freq: 42 * pitch, to: 150 * pitch, dur, gain: 0.4, type: 'triangle', curve: 'exp' });
    for (let i = 0; i < 7; i++) {
      this.noise({
        dur: 0.05, gain: 0.1, type: 'bandpass', freq: rand(2200, 6000), q: 4,
        delay: rand(0.05, dur * 0.9),
      });
    }
  }

  /** looping charge / beam layer */
  startLoop(id, kind, pitch = 1) {
    if (!this.ok || this.loops.has(id)) return;
    const c = this.ctx, t = this.t;
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(kind === 'beam' ? 0.32 : 0.2, t + 0.12);
    out.connect(this.sfxBus);

    const nodes = [];
    if (kind === 'charge') {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(110 * pitch, t);
      o.frequency.linearRampToValueAtTime(430 * pitch, t + 4.5);
      const f = c.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(400, t);
      f.frequency.linearRampToValueAtTime(2600, t + 4.5);
      f.Q.value = 6;
      const lfo = c.createOscillator(); lfo.frequency.value = 17;
      const lg = c.createGain(); lg.gain.value = 30;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(f); f.connect(out);
      o.start(t); lfo.start(t);
      nodes.push(o, lfo);
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 1.4;
      const ng = c.createGain(); ng.gain.value = 0.35;
      n.connect(nf); nf.connect(ng); ng.connect(out);
      n.start(t); nodes.push(n);
    } else {
      // sustained beam roar: filtered noise bed + a resonant band that
      // drifts, so it breathes instead of sitting as static hiss
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 2;
      const g2 = c.createGain(); g2.gain.value = 0.7;
      n.connect(f); f.connect(g2); g2.connect(out);
      n.start(t); nodes.push(n);

      const res = c.createBiquadFilter();
      res.type = 'bandpass'; res.Q.value = 7;
      res.frequency.setValueAtTime(520 * pitch, t);
      res.frequency.linearRampToValueAtTime(320 * pitch, t + 2.2);
      const rg = c.createGain(); rg.gain.value = 0.5;
      f.connect(res); res.connect(rg); rg.connect(out);

      // slow amplitude wobble = the roar
      const wob = c.createOscillator(); wob.frequency.value = 7.5;
      const wg = c.createGain(); wg.gain.value = 0.13;
      wob.connect(wg); wg.connect(g2.gain);
      wob.start(t); nodes.push(wob);
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(70 * pitch, t);
      const og = c.createGain(); og.gain.value = 0.4;
      o.connect(og); og.connect(out);
      o.start(t); nodes.push(o);
      const o2 = c.createOscillator(); o2.type = 'sine';
      o2.frequency.setValueAtTime(46, t);
      const o2g = c.createGain(); o2g.gain.value = 0.5;
      o2.connect(o2g); o2g.connect(out);
      o2.start(t); nodes.push(o2);
    }
    this.loops.set(id, { out, nodes });
  }

  stopLoop(id) {
    const l = this.loops.get(id);
    if (!l) return;
    const t = this.t;
    l.out.gain.cancelScheduledValues(t);
    l.out.gain.setValueAtTime(l.out.gain.value, t);
    l.out.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
    for (const n of l.nodes) { try { n.stop(t + 0.3); } catch (e) { /* already stopped */ } }
    this.loops.delete(id);
  }

  /** stylised battle cry via formant filtering */
  shout(pitch = 1, intensity = 1, dur = 0.55) {
    if (!this.ok) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = 175 * pitch;
    o.frequency.setValueAtTime(base * 0.85, t);
    o.frequency.linearRampToValueAtTime(base * 1.35, t + dur * 0.28);
    o.frequency.linearRampToValueAtTime(base * 1.05, t + dur);

    const vib = c.createOscillator(); vib.frequency.value = 6.5;
    const vg = c.createGain(); vg.gain.value = base * 0.045;
    vib.connect(vg); vg.connect(o.frequency);

    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.3 * intensity, t + 0.06);
    out.gain.setValueAtTime(0.28 * intensity, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);

    // "AH" formants
    const fs = [[730, 9], [1090, 11], [2440, 13]];
    for (const [freq, q] of fs) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq * pitch; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0.6;
      o.connect(f); f.connect(g); g.connect(out);
    }
    const dry = c.createGain(); dry.gain.value = 0.12;
    o.connect(dry); dry.connect(out);

    out.connect(this.sfxBus);
    o.start(t); vib.start(t);
    o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  transform(pitch = 1) {
    if (!this.ok) return;
    this.powerUp(1.1, pitch);
    this.tone({ freq: 60, to: 900, dur: 1.1, gain: 0.26, type: 'sawtooth', curve: 'exp' });
    this.noise({ dur: 1.2, gain: 0.26, type: 'highpass', freq: 400, sweep: [200, 6000] });
    this.tone({ freq: 90, to: 30, dur: 1.6, gain: 0.5, type: 'sine', delay: 0.85 });
    this.explosion(0.7);
    this.shout(pitch, 1.2, 1.1);
  }

  /* ---------------- UI ---------------- */
  uiMove() { this.tone({ freq: 620, to: 880, dur: 0.07, gain: 0.12, type: 'square' }); }
  uiConfirm() {
    this.tone({ freq: 520, to: 1040, dur: 0.12, gain: 0.16, type: 'square' });
    this.tone({ freq: 1040, to: 1560, dur: 0.16, gain: 0.1, type: 'square', delay: 0.06 });
  }
  uiCancel() { this.tone({ freq: 400, to: 180, dur: 0.14, gain: 0.14, type: 'square' }); }
  bell() {
    for (const f of [880, 1320, 1760]) {
      this.tone({ freq: f, to: f * 0.98, dur: 1.4, gain: 0.12, type: 'sine' });
    }
  }
  countdown(final = false) {
    this.tone({ freq: final ? 900 : 600, to: final ? 1200 : 600, dur: final ? 0.5 : 0.18, gain: 0.22, type: 'square' });
  }
}

/* ============================================================
   Music — 16th-note step sequencer, one arrangement per mood
   ============================================================ */

const SCALES = {
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pent: [0, 3, 5, 7, 10],
};

const MOODS = {
  title:     { bpm: 96,  root: 45, scale: 'minor',    drums: 0.3, lead: 0.55, pad: 0.9, bassOct: 0 },
  select:    { bpm: 124, root: 47, scale: 'dorian',   drums: 0.7, lead: 0.6,  pad: 0.6, bassOct: 0 },
  wasteland: { bpm: 152, root: 45, scale: 'phrygian', drums: 1.0, lead: 0.8,  pad: 0.4, bassOct: 0 },
  city:      { bpm: 160, root: 43, scale: 'minor',    drums: 1.0, lead: 0.85, pad: 0.35, bassOct: 0 },
  sanctuary: { bpm: 138, root: 50, scale: 'lydian',   drums: 0.75, lead: 0.7, pad: 0.8, bassOct: 0 },
  arena:     { bpm: 156, root: 47, scale: 'dorian',   drums: 1.0, lead: 0.8,  pad: 0.5, bassOct: 0 },
  volcano:   { bpm: 168, root: 41, scale: 'phrygian', drums: 1.1, lead: 0.9,  pad: 0.3, bassOct: 0 },
  void:      { bpm: 144, root: 44, scale: 'minor',    drums: 0.85, lead: 0.75, pad: 0.9, bassOct: -12 },
  victory:   { bpm: 128, root: 52, scale: 'lydian',   drums: 0.6, lead: 0.8,  pad: 0.9, bassOct: 0 },
};

class Music {
  constructor(engine) {
    this.e = engine;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.mood = null;
    this.intensity = 1;
    this.melody = [];
  }

  play(moodName) {
    if (!this.e.ok) return;
    const mood = MOODS[moodName] || MOODS.wasteland;
    if (this.mood === mood && this.playing) return;
    this.stop();
    this.mood = mood;
    this.moodName = moodName;
    this.step = 0;
    this.playing = true;
    this.nextTime = this.e.t + 0.08;
    this._makeMelody();
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  setIntensity(v) { this.intensity = clamp(v, 0, 1.5); }

  _makeMelody() {
    const sc = SCALES[this.mood.scale];
    this.melody = [];
    for (let bar = 0; bar < 4; bar++) {
      const phrase = [];
      let deg = randInt2(0, sc.length - 1);
      for (let i = 0; i < 16; i++) {
        if (Math.random() < 0.42) { phrase.push(null); continue; }
        deg = clamp(deg + randInt2(-2, 2), 0, sc.length + 4);
        const oct = Math.floor(deg / sc.length);
        phrase.push(sc[deg % sc.length] + oct * 12);
      }
      this.melody.push(phrase);
    }
    this.chords = [0, 5, 3, 6].map((d) => d);
  }

  _schedule() {
    if (!this.playing) return;
    const e = this.e;
    const spb = 60 / this.mood.bpm / 4;   // 16th
    while (this.nextTime < e.t + 0.12) {
      this._tick(this.step, this.nextTime);
      this.step++;
      this.nextTime += spb;
    }
  }

  _tick(step, t) {
    const e = this.e, m = this.mood;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const dest = e.musBus;
    const inten = this.intensity;
    const sc = SCALES[m.scale];
    const chordRoot = m.root + (this.chords ? sc[this.chords[bar] % sc.length] : 0);

    const dly = t - e.t;

    /* drums */
    if (m.drums > 0) {
      if (s === 0 || s === 6 || s === 10) {
        e.tone({ freq: 150, to: 44, dur: 0.16, gain: 0.55 * m.drums * inten, type: 'sine', dest, delay: dly });
      }
      if (s === 4 || s === 12) {
        e.noise({ dur: 0.14, gain: 0.24 * m.drums * inten, type: 'bandpass', freq: 2000, q: 0.8, dest, delay: dly });
        e.tone({ freq: 220, to: 120, dur: 0.09, gain: 0.14 * m.drums, type: 'triangle', dest, delay: dly });
      }
      if (s % 2 === 0 && inten > 0.4) {
        e.noise({ dur: 0.035, gain: 0.055 * m.drums * inten, type: 'highpass', freq: 8000, dest, delay: dly });
      }
      if (s === 14 && bar === 3) {
        e.noise({ dur: 0.6, gain: 0.2 * m.drums, type: 'highpass', freq: 5000, sweep: [4000, 12000], dest, delay: dly });
      }
    }

    /* bass */
    if (s % 2 === 0) {
      const oct = m.bassOct ?? 0;
      const f = NOTE(chordRoot - 12 + oct);
      const g = 0.3 * inten * (s === 0 ? 1.2 : 0.8);
      e.tone({ freq: f, to: f * 0.995, dur: 0.16, gain: g, type: 'square', dest, delay: dly });
      e.tone({ freq: f / 2, dur: 0.2, gain: g * 0.7, type: 'sine', dest, delay: dly });
    }

    /* pad */
    if (s === 0 && m.pad > 0) {
      for (const iv of [0, 3, 7, 10]) {
        e.tone({
          freq: NOTE(chordRoot + iv + 12), dur: 60 / m.bpm * 4 * 0.95,
          gain: 0.06 * m.pad, type: 'triangle', dest, delay: dly, attack: 0.25,
        });
      }
    }

    /* lead */
    if (m.lead > 0 && inten > 0.25) {
      const n = this.melody[bar]?.[s];
      if (n !== null && n !== undefined) {
        const f = NOTE(m.root + 12 + n);
        e.tone({ freq: f, dur: 0.13, gain: 0.12 * m.lead * inten, type: 'sawtooth', dest, delay: dly });
        e.tone({ freq: f * 2, dur: 0.09, gain: 0.05 * m.lead * inten, type: 'square', dest, delay: dly });
      }
    }
  }
}

function randInt2(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
