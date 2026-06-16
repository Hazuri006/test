export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

/** Concrete, applied rendering parameters derived from a preset. */
export interface GraphicsConfig {
  /** Internal render scale (devicePixelRatio multiplier cap). */
  renderScale: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  /** Far clip / fog distance in world units. */
  viewDistance: number;
  /** Ocean grid subdivisions per side. */
  oceanSegments: number;
  /** Floating debris budget around the player. */
  debrisBudget: number;
  /** Particle density multiplier (rain, foam, etc.). */
  particleScale: number;
  postProcessing: boolean;
  bloom: boolean;
  antialias: boolean;
  /** Foliage/instancing density multiplier on islands. */
  foliageScale: number;
}

export const GRAPHICS_PRESETS: Record<QualityPreset, GraphicsConfig> = {
  low: {
    renderScale: 0.75,
    shadowsEnabled: false,
    shadowMapSize: 512,
    viewDistance: 600,
    oceanSegments: 96,
    debrisBudget: 28,
    particleScale: 0.4,
    postProcessing: false,
    bloom: false,
    antialias: false,
    foliageScale: 0.4,
  },
  medium: {
    renderScale: 1.0,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    viewDistance: 900,
    oceanSegments: 144,
    debrisBudget: 48,
    particleScale: 0.7,
    postProcessing: true,
    bloom: false,
    antialias: true,
    foliageScale: 0.7,
  },
  high: {
    renderScale: 1.0,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    viewDistance: 1300,
    oceanSegments: 200,
    debrisBudget: 64,
    particleScale: 1.0,
    postProcessing: true,
    bloom: true,
    antialias: true,
    foliageScale: 1.0,
  },
  ultra: {
    renderScale: 1.0,
    shadowsEnabled: true,
    shadowMapSize: 4096,
    viewDistance: 1800,
    oceanSegments: 256,
    debrisBudget: 90,
    particleScale: 1.4,
    postProcessing: true,
    bloom: true,
    antialias: true,
    foliageScale: 1.3,
  },
};

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
}

export interface Settings {
  quality: QualityPreset;
  audio: AudioSettings;
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  keybinds: Record<string, string>;
}

export const DEFAULT_KEYBINDS: Record<string, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  interact: 'KeyE',
  inventory: 'Tab',
  build: 'KeyB',
  rotate: 'KeyR',
  menu: 'Escape',
  hotbar1: 'Digit1',
  hotbar2: 'Digit2',
  hotbar3: 'Digit3',
  hotbar4: 'Digit4',
  hotbar5: 'Digit5',
};

const STORAGE_KEY = 'driftwake.settings.v1';

const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  audio: { master: 0.9, music: 0.5, sfx: 0.9, ambient: 0.7 },
  mouseSensitivity: 1.0,
  invertY: false,
  fov: 75,
  keybinds: { ...DEFAULT_KEYBINDS },
};

/** Persists and exposes user settings. Graphics presets are applied elsewhere. */
export class SettingsManager {
  private settings: Settings;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor() {
    this.settings = this.load();
  }

  get(): Readonly<Settings> {
    return this.settings;
  }

  graphics(): GraphicsConfig {
    return GRAPHICS_PRESETS[this.settings.quality];
  }

  update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.save();
    this.emit();
  }

  setQuality(quality: QualityPreset): void {
    this.update({ quality });
  }

  setAudio(patch: Partial<AudioSettings>): void {
    this.update({ audio: { ...this.settings.audio, ...patch } });
  }

  setKeybind(action: string, code: string): void {
    this.update({ keybinds: { ...this.settings.keybinds, [action]: code } });
  }

  onChange(listener: (s: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.settings);
  }

  private load(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        audio: { ...DEFAULT_SETTINGS.audio, ...(parsed.audio ?? {}) },
        keybinds: { ...DEFAULT_KEYBINDS, ...(parsed.keybinds ?? {}) },
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage may be unavailable; settings stay in-memory */
    }
  }
}
