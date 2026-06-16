import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { Inventory } from '../inventory/Inventory';
import type { RaftManager } from '../raft/RaftManager';
import type { IslandManager } from '../world/IslandManager';
import type { FloatingDebrisManager } from '../world/FloatingDebrisManager';
import type { ProcessingSystem } from './ProcessingSystem';
import { ItemDatabase } from '../inventory/ItemDatabase';

interface Target {
  label: string;
  run: () => void;
}

/**
 * Resolves the best "press E" interaction near the player each frame
 * (stations, island chest, hand-picking debris) and exposes a prompt for the
 * HUD. Tool use (left-click) is handled separately by Combat/Hook/Fishing.
 */
export class InteractionSystem {
  private target: Target | null = null;

  constructor(
    private readonly raft: RaftManager,
    private readonly islands: IslandManager,
    private readonly debris: FloatingDebrisManager,
    private readonly processing: ProcessingSystem,
    private readonly inventory: Inventory,
    private readonly bus: EventBus<GameEvents>,
    private readonly onOpenResearch: () => void,
  ) {}

  /** Recompute the current interaction target; returns the HUD prompt or null. */
  update(playerPos: THREE.Vector3): string | null {
    this.target = null;

    // Stations on the raft.
    const grill = this.raft.deckNear(playerPos.x, playerPos.z, 'grill', 3.5);
    if (grill) {
      const label = this.processing.statusText(grill);
      this.target = { label, run: () => this.processing.interact(grill) };
      return label;
    }
    const purifier = this.raft.deckNear(playerPos.x, playerPos.z, 'purifier', 3.5);
    if (purifier) {
      const label = this.processing.statusText(purifier);
      this.target = { label, run: () => this.processing.interact(purifier) };
      return label;
    }
    const table = this.raft.deckNear(playerPos.x, playerPos.z, 'research_table', 3.5);
    if (table) {
      this.target = { label: '<b>E</b> Table de recherche', run: () => this.onOpenResearch() };
      return this.target.label;
    }

    // Island loot chest.
    const chestIsland = this.islands.chestNear(playerPos, 3.2);
    if (chestIsland) {
      this.target = {
        label: '<b>E</b> Ouvrir le coffre',
        run: () => {
          const loot = this.islands.claimChest(chestIsland);
          for (const l of loot) this.inventory.add(l.itemId, l.amount);
          this.bus.emit('notify', {
            message: `Butin : ${loot.map((l) => `${l.amount} ${ItemDatabase.get(l.itemId).name}`).join(', ')}`,
            kind: 'good',
          });
        },
      };
      return this.target.label;
    }

    // Hand-pick nearby floating debris.
    const reach = new THREE.Vector3(playerPos.x, playerPos.y + 1, playerPos.z);
    const d = this.debris.nearestWithin(reach, 3);
    if (d) {
      const name = ItemDatabase.get(d.itemId).name;
      this.target = {
        label: `<b>E</b> Ramasser ${name}`,
        run: () => {
          const y = this.debris.collect(d);
          if (y) {
            const leftover = this.inventory.add(y.itemId, y.amount);
            if (leftover > 0) this.bus.emit('inventory:full', { itemId: y.itemId });
          }
        },
      };
      return this.target.label;
    }

    return null;
  }

  execute(): void {
    this.target?.run();
  }
}
