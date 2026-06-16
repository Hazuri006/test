import { el, clear } from './dom';
import { IconFactory } from './IconFactory';
import type { Inventory } from '../inventory/Inventory';
import { ItemDatabase } from '../inventory/ItemDatabase';
import type { StatsSnapshot } from '../player/PlayerStats';

/** In-world heads-up display: stats, hotbar, prompts, notifications, overlays. */
export class HUD {
  readonly root: HTMLElement;
  private bars: Record<string, HTMLElement> = {};
  private hotbar: HTMLElement;
  private prompt: HTMLElement;
  private charge: HTMLElement;
  private chargeFill: HTMLElement;
  private notifs: HTMLElement;
  private vignette: HTMLElement;
  private underwater: HTMLElement;
  private clock: HTMLElement;
  private oxygenBar: HTMLElement;
  onHotbarClick?: (index: number) => void;

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'screen' });

    this.root.append(el('div', { class: 'crosshair' }));

    // Stat bars.
    const stats = el('div', { class: 'stats' });
    const defs: [string, string, string][] = [
      ['health', '♥', 'PV'],
      ['hunger', '🍖', 'Faim'],
      ['thirst', '💧', 'Soif'],
      ['stamina', '⚡', 'Endurance'],
      ['oxygen', '🫧', 'Oxygène'],
    ];
    for (const [key, glyph] of defs) {
      const fill = el('span');
      const bar = el('div', { class: `bar ${key}` }, [fill]);
      this.bars[key] = fill;
      if (key === 'oxygen') this.oxygenBar = bar;
      stats.append(
        el('div', { class: 'stat' }, [el('span', { class: 'label', text: glyph }), bar]),
      );
    }
    this.oxygenBar ??= stats;
    this.root.append(stats);

    // Topbar clock/weather.
    this.clock = el('div', { class: 'topbar', text: 'Jour 1 · 08:00 · Clair' });
    this.root.append(this.clock);

    // Hotbar.
    this.hotbar = el('div', { class: 'hotbar' });
    this.root.append(this.hotbar);

    // Interaction prompt.
    this.prompt = el('div', { class: 'prompt' });
    this.root.append(this.prompt);

    // Charge bar.
    this.chargeFill = el('span');
    this.charge = el('div', { class: 'charge' }, [this.chargeFill]);
    this.root.append(this.charge);

    // Notifications.
    this.notifs = el('div', { class: 'notifications' });
    this.root.append(this.notifs);

    // Overlays.
    this.vignette = el('div', { class: 'vignette-dmg' });
    this.underwater = el('div', { class: 'underwater-tint' });
    this.root.append(this.vignette, this.underwater);

    parent.append(this.root);
  }

  setStats(s: StatsSnapshot): void {
    this.bars.health!.style.width = `${clampPct(s.health)}%`;
    this.bars.hunger!.style.width = `${clampPct(s.hunger)}%`;
    this.bars.thirst!.style.width = `${clampPct(s.thirst)}%`;
    this.bars.stamina!.style.width = `${clampPct(s.stamina)}%`;
    this.bars.oxygen!.style.width = `${clampPct(s.oxygen)}%`;
    this.oxygenBar.classList.toggle('show', s.oxygen < 99.5);
  }

  buildHotbar(inv: Inventory): void {
    clear(this.hotbar);
    for (let i = 0; i < inv.hotbarSize; i++) {
      const slot = el('div', { class: 'slot' });
      slot.dataset.index = String(i);
      slot.append(el('span', { class: 'key', text: String(i + 1) }));
      slot.addEventListener('click', () => this.onHotbarClick?.(i));
      this.hotbar.append(slot);
    }
    this.refreshHotbar(inv);
  }

  refreshHotbar(inv: Inventory): void {
    const slots = this.hotbar.children;
    for (let i = 0; i < inv.hotbarSize; i++) {
      const node = slots[i] as HTMLElement;
      if (!node) continue;
      node.classList.toggle('selected', i === inv.selected);
      const existingIcon = node.querySelector('.icon');
      existingIcon?.remove();
      node.querySelector('.count')?.remove();
      node.querySelector('.dura')?.remove();
      const stack = inv.getSlot(i);
      if (!stack) continue;
      const icon = el('div', { class: 'icon' });
      icon.style.backgroundImage = IconFactory.css(stack.itemId);
      node.append(icon);
      if (stack.count > 1) node.append(el('span', { class: 'count', text: String(stack.count) }));
      const def = ItemDatabase.get(stack.itemId);
      if (stack.durability !== undefined && def.tool) {
        const dura = el('div', { class: 'dura' });
        dura.style.width = `${(stack.durability / def.tool.durability) * 100}%`;
        node.append(dura);
      }
    }
  }

  showPrompt(text: string | null): void {
    if (text) {
      this.prompt.innerHTML = text;
      this.prompt.classList.add('show');
    } else {
      this.prompt.classList.remove('show');
    }
  }

  setCharge(value: number | null): void {
    if (value === null || value <= 0) {
      this.charge.classList.remove('show');
    } else {
      this.charge.classList.add('show');
      this.chargeFill.style.width = `${clampPct(value * 100)}%`;
    }
  }

  notify(message: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info'): void {
    const n = el('div', { class: `notif ${kind}`, text: message });
    this.notifs.append(n);
    setTimeout(() => {
      n.style.transition = 'opacity 0.4s';
      n.style.opacity = '0';
      setTimeout(() => n.remove(), 400);
    }, 3200);
    while (this.notifs.children.length > 6) this.notifs.firstChild?.remove();
  }

  flashDamage(intensity = 1): void {
    this.vignette.style.boxShadow = `inset 0 0 160px rgba(180,20,20,${0.5 * intensity})`;
    setTimeout(() => {
      this.vignette.style.boxShadow = 'inset 0 0 160px rgba(180,20,20,0)';
    }, 150);
  }

  setUnderwater(on: boolean): void {
    this.underwater.classList.toggle('on', on);
  }

  setTopbar(info: { day: number; hour: number; weather: string; foundations: number }): void {
    const hh = String(Math.floor(info.hour)).padStart(2, '0');
    const mm = String(Math.floor((info.hour % 1) * 60)).padStart(2, '0');
    this.clock.textContent = `Jour ${info.day} · ${hh}:${mm} · ${info.weather} · Radeau ${info.foundations}`;
  }

  show(): void {
    this.root.classList.remove('hidden');
  }
  hide(): void {
    this.root.classList.add('hidden');
  }
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}
