import type { EventBus, GameEvents } from '../core/EventBus';
import type { Inventory } from '../inventory/Inventory';
import type { AudioManager } from '../core/AudioManager';
import type { RaftPiece } from '../raft/RaftManager';

interface Job {
  type: 'grill' | 'purifier';
  progress: number;
  /** Seconds until the primary product is ready. */
  readyAt: number;
  /** Seconds after which a grill product chars. */
  charAt: number;
}

/**
 * Drives crafting stations that transform items over time:
 * the grill (raw_fish → cooked_fish → charred_fish) and the water purifier
 * (saltwater → freshwater, daytime only). Jobs are keyed by station uid and
 * persist through saves.
 */
export class ProcessingSystem {
  private jobs = new Map<number, Job>();

  constructor(
    private readonly inventory: Inventory,
    private readonly audio: AudioManager,
    private readonly bus: EventBus<GameEvents>,
    private readonly isDaytime: () => boolean,
  ) {}

  update(dt: number): void {
    for (const job of this.jobs.values()) {
      if (job.type === 'purifier' && !this.isDaytime()) continue;
      job.progress += dt;
    }
  }

  /** Human-readable status for the HUD prompt when near a station. */
  statusText(piece: RaftPiece): string {
    const job = this.jobs.get(piece.uid);
    if (piece.buildingId === 'grill') {
      if (!job)
        return this.inventory.has('raw_fish', 1)
          ? '<b>E</b> Cuire le poisson'
          : 'Grill (poisson cru requis)';
      if (job.progress < job.readyAt)
        return `Cuisson ${Math.floor((job.progress / job.readyAt) * 100)}%`;
      if (job.progress < job.charAt) return '<b>E</b> Récupérer le poisson grillé';
      return '<b>E</b> Récupérer (brûlé !)';
    }
    if (piece.buildingId === 'purifier') {
      if (!job)
        return this.inventory.has('saltwater', 1)
          ? '<b>E</b> Purifier l’eau'
          : 'Purificateur (eau salée requise)';
      if (job.progress < job.readyAt) {
        return this.isDaytime()
          ? `Purification ${Math.floor((job.progress / job.readyAt) * 100)}%`
          : 'Purification en pause (nuit)';
      }
      return '<b>E</b> Récupérer l’eau potable';
    }
    return '';
  }

  /** Player interacts with a station: start a job or collect the result. */
  interact(piece: RaftPiece): void {
    const job = this.jobs.get(piece.uid);
    if (piece.buildingId === 'grill') {
      if (!job) {
        if (this.inventory.remove('raw_fish', 1) > 0) {
          this.jobs.set(piece.uid, { type: 'grill', progress: 0, readyAt: 14, charAt: 26 });
          this.bus.emit('notify', { message: 'Cuisson en cours…', kind: 'info' });
        } else {
          this.bus.emit('notify', { message: 'Aucun poisson cru', kind: 'warn' });
        }
      } else if (job.progress >= job.readyAt) {
        const out = job.progress >= job.charAt ? 'charred_fish' : 'cooked_fish';
        this.inventory.add(out, 1);
        this.jobs.delete(piece.uid);
        this.audio.play('craft', 0.6);
        this.bus.emit('notify', {
          message: out === 'cooked_fish' ? 'Poisson grillé prêt !' : 'Poisson brûlé…',
          kind: out === 'cooked_fish' ? 'good' : 'warn',
        });
      } else {
        this.bus.emit('notify', { message: 'Encore en cuisson', kind: 'info' });
      }
    } else if (piece.buildingId === 'purifier') {
      if (!job) {
        if (this.inventory.remove('saltwater', 1) > 0) {
          this.jobs.set(piece.uid, { type: 'purifier', progress: 0, readyAt: 8, charAt: Infinity });
          this.bus.emit('notify', { message: 'Purification en cours…', kind: 'info' });
        } else {
          this.bus.emit('notify', { message: 'Aucune eau salée', kind: 'warn' });
        }
      } else if (job.progress >= job.readyAt) {
        this.inventory.add('freshwater', 1);
        this.jobs.delete(piece.uid);
        this.audio.play('drink', 0.5);
        this.bus.emit('notify', { message: 'Eau potable prête !', kind: 'good' });
      } else {
        this.bus.emit('notify', { message: 'Purification en cours', kind: 'info' });
      }
    }
  }

  serialize(): Array<{ uid: number } & Job> {
    return [...this.jobs.entries()].map(([uid, job]) => ({ uid, ...job }));
  }

  load(data: Array<{ uid: number } & Job>): void {
    this.jobs.clear();
    for (const j of data) {
      const { uid, ...job } = j;
      this.jobs.set(uid, job);
    }
  }
}
