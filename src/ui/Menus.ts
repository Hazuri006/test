import { el, clear } from './dom';
import type { SaveMeta } from '../core/SaveManager';
import type { SettingsManager, QualityPreset } from '../core/SettingsManager';

const VERSION = '0.1.0';

/** Title screen with new game / continue / load / settings. */
export class MainMenu {
  readonly root: HTMLElement;
  private slotList: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly cb: {
      onNew: (slot: string) => void;
      onContinue: (slot: string) => void;
      onLoad: (slot: string) => void;
      onDelete: (slot: string) => Promise<void>;
      getSaves: () => Promise<SaveMeta[]>;
      onSettings: () => void;
    },
  ) {
    this.root = el('div', { class: 'screen' });
    const center = el('div', { class: 'menu-center' });
    center.append(
      el('div', { class: 'title', text: 'DRIFTWAKE' }),
      el('div', { class: 'subtitle', text: 'Survie maritime à la dérive' }),
    );

    const buttons = el('div', { class: 'menu-buttons' });
    const newBtn = el('button', { class: 'btn', text: '🌊 Nouvelle partie' });
    newBtn.addEventListener('click', () => this.promptNew());
    const continueBtn = el('button', { class: 'btn', text: '⛵ Continuer' });
    continueBtn.addEventListener('click', () => void this.continueLatest());
    const loadBtn = el('button', { class: 'btn secondary', text: '📁 Charger' });
    loadBtn.addEventListener('click', () => this.toggleSaves());
    const settingsBtn = el('button', { class: 'btn secondary', text: '⚙ Paramètres' });
    settingsBtn.addEventListener('click', () => this.cb.onSettings());
    buttons.append(newBtn, continueBtn, loadBtn, settingsBtn);
    center.append(buttons);

    this.slotList = el('div', {
      class: 'panel window hidden',
      style: { marginTop: '10px', width: '320px' },
    });
    center.append(this.slotList);

    center.append(
      el('div', {
        class: 'credits',
        html: 'Œuvre originale · assets procéduraux<br/>Three.js · TypeScript · WebGL',
      }),
    );
    center.append(el('div', { class: 'version-tag', text: `v${VERSION}` }));
    this.root.append(center);
    parent.append(this.root);
  }

  private promptNew(): void {
    const name = prompt('Nom de la sauvegarde :', `Naufragé ${new Date().toLocaleDateString()}`);
    if (name && name.trim()) this.cb.onNew(name.trim());
  }

  private async continueLatest(): Promise<void> {
    const saves = await this.cb.getSaves();
    if (saves.length === 0) {
      this.promptNew();
      return;
    }
    this.cb.onContinue(saves[0]!.slot);
  }

  private async toggleSaves(): Promise<void> {
    if (!this.slotList.classList.contains('hidden')) {
      this.slotList.classList.add('hidden');
      return;
    }
    clear(this.slotList);
    this.slotList.classList.remove('hidden');
    this.slotList.append(el('h2', { text: 'Sauvegardes' }));
    const saves = await this.cb.getSaves();
    if (saves.length === 0) {
      this.slotList.append(el('div', { class: 'hint', text: 'Aucune sauvegarde.' }));
      return;
    }
    for (const s of saves) {
      const row = el('div', { class: 'setting-row' });
      row.append(
        el('label', {
          text: `${s.slot} — ${new Date(s.timestamp).toLocaleString()}`,
        }),
      );
      const load = el('button', { class: 'btn', text: 'Charger', style: { padding: '6px 12px' } });
      load.addEventListener('click', () => this.cb.onLoad(s.slot));
      const del = el('button', { class: 'btn danger', text: '🗑', style: { padding: '6px 10px' } });
      del.addEventListener('click', async () => {
        await this.cb.onDelete(s.slot);
        void this.toggleSaves();
        void this.toggleSaves();
      });
      row.append(load, del);
      this.slotList.append(row);
    }
  }

  show(): void {
    this.root.classList.remove('hidden');
  }
  hide(): void {
    this.root.classList.add('hidden');
  }
}

/** Settings: quality, audio, look, keybinds. */
export class SettingsMenu {
  readonly root: HTMLElement;
  private rebinding: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly settings: SettingsManager,
    private readonly cb: { onClose: () => void; onApplyLive: () => void },
  ) {
    this.root = el('div', { class: 'screen overlay hidden' });
    const win = el('div', { class: 'panel window', style: { width: 'min(520px, 60vw)' } });
    win.append(el('h2', { text: 'Paramètres' }));
    win.append(this.qualityRow());
    win.append(this.sliderRow('Volume principal', 'master'));
    win.append(this.sliderRow('Musique', 'music'));
    win.append(this.sliderRow('Effets', 'sfx'));
    win.append(this.sliderRow('Ambiance', 'ambient'));
    win.append(this.sensitivityRow());
    win.append(this.fovRow());
    win.append(this.invertRow());
    win.append(el('h2', { text: 'Touches', style: { marginTop: '14px', fontSize: '16px' } }));
    win.append(this.keybindList());

    const close = el('button', { class: 'btn', text: 'Fermer', style: { marginTop: '14px' } });
    close.addEventListener('click', () => this.cb.onClose());
    win.append(close);
    this.root.append(win);
    parent.append(this.root);

    window.addEventListener('keydown', (e) => this.onRebindKey(e));
  }

  private qualityRow(): HTMLElement {
    const row = el('div', { class: 'setting-row' });
    row.append(el('label', { text: 'Qualité graphique' }));
    const sel = el('select');
    for (const q of ['low', 'medium', 'high', 'ultra'] as QualityPreset[]) {
      const o = el('option', { text: q.charAt(0).toUpperCase() + q.slice(1), attrs: { value: q } });
      if (this.settings.get().quality === q) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => {
      this.settings.setQuality(sel.value as QualityPreset);
      this.cb.onApplyLive();
    });
    const note = el('span', { class: 'hint', text: '(appliqué au lancement de la partie)' });
    const wrap = el('div', {}, [sel, note]);
    row.append(wrap);
    return row;
  }

  private sliderRow(label: string, key: 'master' | 'music' | 'sfx' | 'ambient'): HTMLElement {
    const row = el('div', { class: 'setting-row' });
    row.append(el('label', { text: label }));
    const input = el('input', { attrs: { type: 'range', min: '0', max: '1', step: '0.05' } });
    input.value = String(this.settings.get().audio[key]);
    input.addEventListener('input', () => {
      this.settings.setAudio({ [key]: parseFloat(input.value) });
    });
    row.append(input);
    return row;
  }

  private sensitivityRow(): HTMLElement {
    const row = el('div', { class: 'setting-row' });
    row.append(el('label', { text: 'Sensibilité souris' }));
    const input = el('input', { attrs: { type: 'range', min: '0.2', max: '3', step: '0.1' } });
    input.value = String(this.settings.get().mouseSensitivity);
    input.addEventListener('input', () =>
      this.settings.update({ mouseSensitivity: parseFloat(input.value) }),
    );
    row.append(input);
    return row;
  }

  private fovRow(): HTMLElement {
    const row = el('div', { class: 'setting-row' });
    row.append(el('label', { text: 'Champ de vision' }));
    const input = el('input', { attrs: { type: 'range', min: '60', max: '100', step: '1' } });
    input.value = String(this.settings.get().fov);
    input.addEventListener('input', () => {
      this.settings.update({ fov: parseFloat(input.value) });
      this.cb.onApplyLive();
    });
    row.append(input);
    return row;
  }

  private invertRow(): HTMLElement {
    const row = el('div', { class: 'setting-row' });
    row.append(el('label', { text: 'Inverser l’axe Y' }));
    const input = el('input', { attrs: { type: 'checkbox' } });
    input.checked = this.settings.get().invertY;
    input.addEventListener('change', () => this.settings.update({ invertY: input.checked }));
    row.append(input);
    return row;
  }

  private keybindList(): HTMLElement {
    const list = el('div', { class: 'keybind-list' });
    const labels: Record<string, string> = {
      forward: 'Avancer',
      back: 'Reculer',
      left: 'Gauche',
      right: 'Droite',
      jump: 'Sauter',
      sprint: 'Sprint',
      crouch: 'S’accroupir',
      interact: 'Interagir',
      inventory: 'Inventaire',
      build: 'Construction',
      rotate: 'Pivoter',
      menu: 'Menu',
    };
    for (const action of Object.keys(labels)) {
      const row = el('div', { class: 'setting-row' });
      row.append(el('label', { text: labels[action]! }));
      const btn = el('button', {
        class: 'keybind-btn',
        text: this.settings.get().keybinds[action] ?? '—',
      });
      btn.dataset.action = action;
      btn.addEventListener('click', () => {
        this.rebinding = action;
        btn.textContent = '… appuyez sur une touche';
      });
      row.append(btn);
      list.append(row);
    }
    return list;
  }

  private onRebindKey(e: KeyboardEvent): void {
    if (!this.rebinding || this.root.classList.contains('hidden')) return;
    e.preventDefault();
    this.settings.setKeybind(this.rebinding, e.code);
    const btn = this.root.querySelector<HTMLElement>(
      `.keybind-btn[data-action="${this.rebinding}"]`,
    );
    if (btn) btn.textContent = e.code;
    this.rebinding = null;
  }

  show(): void {
    this.root.classList.remove('hidden');
  }
  hide(): void {
    this.root.classList.add('hidden');
  }
}

/** In-game pause menu. */
export class PauseMenu {
  readonly root: HTMLElement;
  constructor(
    parent: HTMLElement,
    cb: { onResume: () => void; onSave: () => void; onSettings: () => void; onQuit: () => void },
  ) {
    this.root = el('div', { class: 'screen overlay hidden' });
    const win = el('div', {
      class: 'panel window',
      style: { width: '300px', textAlign: 'center' },
    });
    win.append(el('h2', { text: 'Pause' }));
    const mk = (label: string, cls: string, fn: () => void) => {
      const b = el('button', {
        class: `btn ${cls}`,
        text: label,
        style: { width: '100%', marginBottom: '8px' },
      });
      b.addEventListener('click', fn);
      return b;
    };
    win.append(
      mk('Reprendre', '', cb.onResume),
      mk('Sauvegarder', 'secondary', cb.onSave),
      mk('Paramètres', 'secondary', cb.onSettings),
      mk('Quitter au menu', 'danger', cb.onQuit),
    );
    this.root.append(win);
    parent.append(this.root);
  }
  show(): void {
    this.root.classList.remove('hidden');
  }
  hide(): void {
    this.root.classList.add('hidden');
  }
}

/** Death / respawn screen. */
export class DeathScreen {
  readonly root: HTMLElement;
  private cause: HTMLElement;
  constructor(parent: HTMLElement, cb: { onRespawn: () => void; onQuit: () => void }) {
    this.root = el('div', { class: 'screen hidden' });
    const d = el('div', { class: 'death' });
    d.append(el('h1', { text: 'NAUFRAGÉ' }));
    this.cause = el('div', { class: 'subtitle', text: '' });
    d.append(this.cause);
    const respawn = el('button', { class: 'btn', text: 'Réapparaître' });
    respawn.addEventListener('click', () => cb.onRespawn());
    const quit = el('button', { class: 'btn danger', text: 'Quitter au menu' });
    quit.addEventListener('click', () => cb.onQuit());
    d.append(respawn, quit);
    this.root.append(d);
    parent.append(this.root);
  }
  show(cause: string): void {
    this.cause.textContent = `Cause : ${cause}`;
    this.root.classList.remove('hidden');
  }
  hide(): void {
    this.root.classList.add('hidden');
  }
}

/** Loading overlay. */
export class LoadingScreen {
  readonly root: HTMLElement;
  private label: HTMLElement;
  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'loading' });
    this.root.append(el('div', { class: 'spinner' }));
    this.label = el('div', { class: 'subtitle', text: 'Chargement…' });
    this.root.append(this.label);
    parent.append(this.root);
  }
  set(text: string): void {
    this.label.textContent = text;
  }
  show(): void {
    this.root.classList.remove('hidden');
  }
  hide(): void {
    this.root.classList.add('hidden');
  }
}
