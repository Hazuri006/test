import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { AudioManager } from '../core/AudioManager';
import type { Inventory, ItemStack } from '../inventory/Inventory';
import { ItemDatabase } from '../inventory/ItemDatabase';
import type { IslandManager } from '../world/IslandManager';
import type { Shark } from '../entities/Shark';

/**
 * Melee tool use: weapons damage the shark, the axe fells trees and breaks
 * rocks, and bare hands can chip 'any' nodes slowly. Handles reach, a "must be
 * in front" check, durability and feedback.
 */
export class CombatSystem {
  private readonly toTarget = new THREE.Vector3();

  constructor(
    private readonly islands: IslandManager,
    private readonly getShark: () => Shark | null,
    private readonly inventory: Inventory,
    private readonly audio: AudioManager,
    private readonly bus: EventBus<GameEvents>,
  ) {}

  /** Perform a swing with the currently selected item. */
  swing(origin: THREE.Vector3, dir: THREE.Vector3, selected: ItemStack | null): void {
    const def = selected ? ItemDatabase.get(selected.itemId) : null;
    const tool = def?.tool;
    const power = tool?.power ?? 2;
    const reach = tool?.reach ?? 2.5;
    const isWeapon = def?.category === 'weapon';

    // 1) Weapons strike the shark if it's in front and in range.
    if (isWeapon) {
      const shark = this.getShark();
      if (shark?.alive) {
        this.toTarget.copy(shark.position).sub(origin);
        const dist = this.toTarget.length();
        if (dist <= reach + 2 && this.toTarget.normalize().dot(dir) > 0.45) {
          shark.takeDamage(power);
          this.audio.play('hit', 0.9);
          this.bus.emit('notify', { message: `Requin touché (-${power})`, kind: 'good' });
          this.damageTool();
          return;
        }
      }
      this.audio.play('hit', 0.3);
      return;
    }

    // 2) Otherwise try to harvest a resource node in front.
    const nodes = this.islands.harvestablesNear(origin, reach + 1.5);
    let best: ReturnType<IslandManager['harvestablesNear']>[number] | null = null;
    let bestDot = 0.4;
    const wp = new THREE.Vector3();
    for (const h of nodes) {
      h.obj.getWorldPosition(wp);
      this.toTarget.copy(wp).sub(origin);
      if (this.toTarget.length() > reach + 1.5) continue;
      const d = this.toTarget.normalize().dot(dir);
      if (d > bestDot) {
        bestDot = d;
        best = h;
      }
    }
    if (!best) {
      this.audio.play('chop', 0.25);
      return;
    }
    if (best.toolRequired === 'axe' && selected?.itemId !== 'axe') {
      this.bus.emit('notify', { message: 'Une hache est nécessaire', kind: 'warn' });
      return;
    }
    this.audio.play('chop', 0.9);
    const drops = this.islands.harvest(best, selected?.itemId === 'axe' ? power : 1);
    if (drops) {
      for (const d of drops) {
        this.inventory.add(d.itemId, d.amount);
        this.bus.emit('item:collected', { itemId: d.itemId, amount: d.amount });
      }
      this.bus.emit('notify', {
        message: `Récolté : ${drops.map((d) => `${d.amount} ${ItemDatabase.get(d.itemId).name}`).join(', ')}`,
        kind: 'good',
      });
      this.damageTool();
    }
  }

  private damageTool(): void {
    const sel = this.inventory.selectedStack();
    if (sel?.durability !== undefined && this.inventory.damageSelected(1)) {
      this.bus.emit('notify', { message: 'Outil cassé !', kind: 'bad' });
    }
  }
}
