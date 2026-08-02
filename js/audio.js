'use strict';
/* ============================================================================
   audio.js — everything is synthesised at runtime; there are no audio assets.

   Three continuous voices (engine, wind, ambient pad) are cross-faded by the
   flight state, plus one-shots for UI, landing and footsteps.
   ============================================================================ */

class GameAudio {
  constructor() {
    this.ready = false;
    this.enabled = true;
    this.master = 0.7;
  }

  start() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.out = ctx.createGain();
    this.out.gain.value = this.master;
    this.out.connect(ctx.destination);

    /* A little compression keeps the pulse-drive roar from clipping. */
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    comp.connect(this.out);
    this.bus = comp;

    /* ---- shared noise source ---- */
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;      // slight brown tilt
      d[i] = last * 3.2 + w * 0.35;
    }
    this.noiseBuf = buf;

    /* ---- engine: two detuned saws through a moving lowpass ---- */
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 3.5;
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.bus);

    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 58;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'sawtooth'; this.osc2.frequency.value = 58 * 1.006;
    this.osc3 = ctx.createOscillator(); this.osc3.type = 'square'; this.osc3.frequency.value = 29;
    const og = ctx.createGain(); og.gain.value = 0.30;
    const og3 = ctx.createGain(); og3.gain.value = 0.16;
    this.osc1.connect(og); this.osc2.connect(og); this.osc3.connect(og3);
    og.connect(this.engFilter); og3.connect(this.engFilter);
    this.osc1.start(); this.osc2.start(); this.osc3.start();

    /* engine rumble layer */
    this.engNoise = ctx.createBufferSource();
    this.engNoise.buffer = buf; this.engNoise.loop = true;
    this.engNoiseFilter = ctx.createBiquadFilter();
    this.engNoiseFilter.type = 'bandpass';
    this.engNoiseFilter.frequency.value = 120;
    this.engNoiseFilter.Q.value = 0.7;
    this.engNoiseGain = ctx.createGain(); this.engNoiseGain.gain.value = 0;
    this.engNoise.connect(this.engNoiseFilter);
    this.engNoiseFilter.connect(this.engNoiseGain);
    this.engNoiseGain.connect(this.bus);
    this.engNoise.start();

    /* ---- wind / atmospheric buffeting ---- */
    this.wind = ctx.createBufferSource();
    this.wind.buffer = buf; this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.5;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.bus);
    this.wind.start();

    /* ---- ambient pad ---- */
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0;
    this.padGain.connect(this.bus);
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 900; padFilter.Q.value = 1.0;
    padFilter.connect(this.padGain);
    this.padFilter = padFilter;
    this.pads = [];
    const roots = [110, 164.81, 220, 277.18];
    for (let i = 0; i < roots.length; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = roots[i];
      const g = ctx.createGain(); g.gain.value = 0.16 / (i + 1);
      const lfo = ctx.createOscillator(); lfo.type = 'sine';
      lfo.frequency.value = 0.045 + i * 0.021;
      const lg = ctx.createGain(); lg.gain.value = roots[i] * 0.0025;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); g.connect(padFilter);
      o.start(); lfo.start();
      this.pads.push(o);
    }

    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.master = v; if (this.out) this.out.gain.value = v; }

  /* ------------------------------------------------------------ one-shots -- */
  blip(freq, dur, type, vol) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol === undefined ? 0.12 : vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, freq, q, vol, sweepTo) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus);
    s.start(t); s.stop(t + dur + 0.05);
  }

  ui() { this.blip(880, 0.07, 'sine', 0.06); }
  uiBack() { this.blip(420, 0.09, 'sine', 0.06); }
  notify() { this.blip(660, 0.10, 'triangle', 0.07); setTimeout(() => this.blip(990, 0.12, 'triangle', 0.05), 70); }
  discovery() {
    if (!this.ready) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      setTimeout(() => this.blip(f, 0.5, 'triangle', 0.09), i * 110));
  }
  scan() {
    this.noiseBurst(0.5, 400, 6, 0.09, 4200);
    this.blip(1200, 0.35, 'sine', 0.05);
  }
  landingStart() { this.blip(320, 0.25, 'sawtooth', 0.05); }
  landingThud() { this.noiseBurst(0.55, 90, 1.2, 0.30); this.blip(56, 0.42, 'sine', 0.22); }
  takeoff() { this.noiseBurst(1.1, 180, 0.8, 0.20, 900); }
  jump() { this.noiseBurst(0.18, 500, 2, 0.06); }
  land() { this.noiseBurst(0.12, 220, 2, 0.07); }
  step(wet) { this.noiseBurst(0.09, wet ? 900 : 400, wet ? 1.5 : 3, 0.045); }
  impact(strength) {
    this.noiseBurst(0.7, 70 + strength * 60, 0.8, 0.22 + strength * 0.3);
    this.blip(48, 0.6, 'sine', 0.18 * (0.4 + strength));
  }
  /* Entering air: a rising, opening roar of wind over the hull. */
  atmosphereEntry() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.65;
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 1.5);
    bp.frequency.exponentialRampToValueAtTime(900, t + 3.4);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 1.1);
    g.gain.setValueAtTime(0.26, t + 1.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);

    /* A low body under the hiss so it lands as impact, not just noise. */
    const rum = ctx.createBufferSource();
    rum.buffer = this.noiseBuf; rum.loop = true; rum.playbackRate.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 140; lp.Q.value = 2.0;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.20, t + 0.7);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);

    src.connect(bp); bp.connect(g); g.connect(this.bus);
    rum.connect(lp); lp.connect(rg); rg.connect(this.bus);
    src.start(t); src.stop(t + 3.8);
    rum.start(t); rum.stop(t + 3.4);
  }

  /* Leaving air: the same shape in reverse, thinning into silence. */
  atmosphereExit() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(1600, t);
    bp.frequency.exponentialRampToValueAtTime(220, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    src.connect(bp); bp.connect(g); g.connect(this.bus);
    src.start(t); src.stop(t + 2.6);
  }

  ultraEngage() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'square' : 'sawtooth';
      o.frequency.setValueAtTime(50 + i * 18, t);
      o.frequency.exponentialRampToValueAtTime(1500 + i * 500, t + 0.75);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.09 / (i + 1), t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 3000; f.Q.value = 6;
      o.connect(f); f.connect(g); g.connect(this.bus);
      o.start(t); o.stop(t + 1.6);
    }
    this.noiseBurst(1.4, 300, 0.5, 0.20, 5200);
  }

  pulseEngage() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.10, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    o.connect(f); f.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + 1.4);
  }

  /* ------------------------------------------------------------ per-frame -- */
  update(dt, state) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const set = (param, v, tc) => param.setTargetAtTime(v, t, tc || 0.08);

    const {
      throttle = 0, thrust = 0, speed = 0, density = 0, pulse = 0, ultra = 0,
      onFoot = false, landed = false, jetting = false, inMenu = false
    } = state;
    const drive = Math.max(pulse, ultra);

    const master = inMenu ? 0.35 : 1.0;

    /* engine */
    let engLevel = onFoot ? (jetting ? 0.11 : 0.0) : (0.035 + thrust * 0.16 + drive * 0.22 + ultra * 0.10);
    if (landed) engLevel = 0.02;
    set(this.engGain.gain, engLevel * master, 0.12);
    const pitch = 46 + thrust * 46 + drive * 120 + ultra * 90 + Math.min(speed, 900) * 0.05;
    set(this.osc1.frequency, pitch, 0.15);
    set(this.osc2.frequency, pitch * 1.006, 0.15);
    set(this.osc3.frequency, pitch * 0.5, 0.15);
    set(this.engFilter.frequency, 260 + thrust * 900 + drive * 2600 + ultra * 1800, 0.15);
    set(this.engNoiseGain.gain, (onFoot ? (jetting ? 0.09 : 0) : 0.02 + thrust * 0.07 + drive * 0.13 + ultra * 0.08) * master, 0.12);
    set(this.engNoiseFilter.frequency, 110 + drive * 700 + thrust * 180, 0.2);

    /* wind — rises with dynamic pressure */
    const q = Math.min(density * speed * speed * 4e-5, 1.6);
    const windLevel = onFoot ? density * 0.06 : q * 0.30;
    set(this.windGain.gain, windLevel * master, 0.15);
    set(this.windFilter.frequency, 300 + Math.min(speed, 700) * 2.6, 0.2);
    set(this.windFilter.Q, 0.4 + q * 1.4, 0.2);

    /* ambient pad — loudest in the quiet of deep space */
    const padLevel = (0.5 - Math.min(density, 0.5)) * 0.16 + (onFoot ? 0.04 : 0);
    set(this.padGain.gain, Math.max(padLevel, 0.02) * master, 0.6);
    set(this.padFilter.frequency, 500 + (1 - Math.min(density, 1)) * 1400, 0.8);
  }
}
