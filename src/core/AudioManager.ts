import type { SettingsManager } from './SettingsManager';

export type SfxName =
  | 'splash'
  | 'step'
  | 'pickup'
  | 'craft'
  | 'build'
  | 'chop'
  | 'hookThrow'
  | 'hookReel'
  | 'eat'
  | 'drink'
  | 'sharkGrowl'
  | 'hit'
  | 'damage'
  | 'ui'
  | 'error';

/**
 * Web Audio based audio engine. All sounds are synthesised at runtime
 * (no audio files shipped) so there are zero licensing concerns.
 * The architecture supports swapping in real buffers later via `playBuffer`.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambientBus!: GainNode;
  private musicBus!: GainNode;
  private started = false;
  private ambientNodes: AudioNode[] = [];
  private windGain: GainNode | null = null;
  private underwaterFilter: BiquadFilterNode | null = null;

  constructor(private readonly settings: SettingsManager) {
    this.settings.onChange(() => this.applyVolumes());
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  resume(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.ambientBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.underwaterFilter = this.ctx.createBiquadFilter();
    this.underwaterFilter.type = 'lowpass';
    this.underwaterFilter.frequency.value = 22000;
    this.sfxBus.connect(this.underwaterFilter);
    this.ambientBus.connect(this.underwaterFilter);
    this.musicBus.connect(this.master);
    this.underwaterFilter.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.started = true;
    this.applyVolumes();
    this.startAmbient();
  }

  /** Muffle/clarify everything for underwater transitions. */
  setUnderwater(under: boolean): void {
    if (!this.ctx || !this.underwaterFilter) return;
    const t = this.ctx.currentTime;
    this.underwaterFilter.frequency.cancelScheduledValues(t);
    this.underwaterFilter.frequency.linearRampToValueAtTime(under ? 700 : 22000, t + 0.4);
  }

  private applyVolumes(): void {
    if (!this.started) return;
    const a = this.settings.get().audio;
    this.master.gain.value = a.master;
    this.sfxBus.gain.value = a.sfx;
    this.ambientBus.gain.value = a.ambient;
    this.musicBus.gain.value = a.music;
  }

  /** Continuous wind + wave bed using filtered noise. */
  private startAmbient(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const waveFilter = ctx.createBiquadFilter();
    waveFilter.type = 'lowpass';
    waveFilter.frequency.value = 480;
    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.16;
    // Slow LFO to swell the waves.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(waveGain.gain);

    noise.connect(waveFilter).connect(waveGain).connect(this.ambientBus);

    // Wind layer.
    const windNoise = ctx.createBufferSource();
    windNoise.buffer = noiseBuffer;
    windNoise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 900;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.05;
    windNoise.connect(windFilter).connect(windGain).connect(this.ambientBus);

    noise.start();
    windNoise.start();
    lfo.start();
    this.windGain = windGain;
    this.ambientNodes.push(noise, windNoise, lfo);
  }

  /** Set wind intensity (e.g. during storms). */
  setWind(intensity: number): void {
    if (this.windGain && this.ctx) {
      this.windGain.gain.linearRampToValueAtTime(
        0.04 + intensity * 0.22,
        this.ctx.currentTime + 1.0,
      );
    }
  }

  play(name: SfxName, volume = 1): void {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    switch (name) {
      case 'splash':
        this.burstNoise(0.45, 1200, 200, volume * 0.6, 'lowpass');
        break;
      case 'step':
        this.thud(70, 0.07, volume * 0.25);
        break;
      case 'pickup':
        this.blip(660, 880, 0.12, volume * 0.5);
        break;
      case 'craft':
        this.blip(440, 660, 0.18, volume * 0.4, 'triangle');
        this.scheduleBlip(0.1, 660, 880, 0.14, volume * 0.4);
        break;
      case 'build':
        this.thud(120, 0.2, volume * 0.6);
        break;
      case 'chop':
        this.thud(90, 0.18, volume * 0.7);
        this.burstNoise(0.08, 3000, 800, volume * 0.3, 'bandpass');
        break;
      case 'hookThrow':
        this.sweep(300, 900, 0.25, volume * 0.4);
        break;
      case 'hookReel':
        this.burstNoise(0.3, 2400, 600, volume * 0.2, 'bandpass');
        break;
      case 'eat':
        this.thud(180, 0.12, volume * 0.4);
        break;
      case 'drink':
        this.sweep(500, 300, 0.3, volume * 0.3, 'sine');
        break;
      case 'sharkGrowl':
        this.thud(55, 0.9, volume * 0.9, 'sawtooth');
        this.burstNoise(0.6, 400, 80, volume * 0.4, 'lowpass');
        break;
      case 'hit':
        this.thud(140, 0.12, volume * 0.6);
        this.burstNoise(0.1, 2000, 400, volume * 0.4, 'bandpass');
        break;
      case 'damage':
        this.sweep(300, 90, 0.3, volume * 0.6, 'sawtooth');
        break;
      case 'ui':
        this.blip(520, 720, 0.07, volume * 0.3);
        break;
      case 'error':
        this.blip(220, 160, 0.18, volume * 0.4, 'square');
        break;
    }
    void t;
  }

  private blip(
    from: number,
    to: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private scheduleBlip(delay: number, from: number, to: number, dur: number, gain: number): void {
    setTimeout(() => this.blip(from, to, dur, gain), delay * 1000);
  }

  private sweep(
    from: number,
    to: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'triangle',
  ): void {
    this.blip(from, to, dur, gain, type);
  }

  private thud(freq: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.4), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burstNoise(
    dur: number,
    freqStart: number,
    freqEnd: number,
    gain: number,
    type: BiquadFilterType,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freqStart, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur);
  }

  dispose(): void {
    for (const n of this.ambientNodes) {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* already stopped */
      }
    }
    this.ambientNodes = [];
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
