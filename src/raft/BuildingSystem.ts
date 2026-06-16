import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { Inventory } from '../inventory/Inventory';
import { RecipeDatabase } from '../crafting/RecipeDatabase';
import { CELL_SIZE, RaftMeshes, makeHologram } from './RaftMeshes';
import type { RaftManager } from './RaftManager';

type PlaceKind = 'foundation' | 'deck' | 'wall';

function placeKind(buildingId: string): PlaceKind {
  if (buildingId === 'foundation') return 'foundation';
  if (buildingId === 'wall') return 'wall';
  return 'deck';
}

interface Target {
  cx: number;
  cz: number;
  edge: number;
  valid: boolean;
}

/**
 * Build-mode controller: shows a green/red holographic preview, validates
 * placement against the grid and inventory, and commits pieces to the raft.
 * Also drives hammer demolition and repair.
 */
export class BuildingSystem {
  active = false;
  private buildingId: string | null = null;
  private ghost: THREE.Object3D | null = null;
  private ghostFor: string | null = null;
  private rotation = 0;
  private target: Target = { cx: 0, cz: 0, edge: 0, valid: false };
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly raft: RaftManager,
    private readonly inventory: Inventory,
    private readonly bus: EventBus<GameEvents>,
  ) {}

  /** Enable build mode for a placeable item id, or null to exit. */
  setActive(buildingId: string | null): void {
    this.buildingId = buildingId;
    this.active = buildingId !== null;
    if (!this.active) this.removeGhost();
  }

  isActive(): boolean {
    return this.active;
  }

  activeBuilding(): string | null {
    return this.buildingId;
  }

  rotate(): void {
    this.rotation = (this.rotation + Math.PI / 2) % (Math.PI * 2);
  }

  private removeGhost(): void {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
      });
      this.ghost = null;
      this.ghostFor = null;
    }
  }

  /** Raycast the deck plane from the camera centre. Returns target world point. */
  private castToDeckPlane(camera: THREE.Camera): boolean {
    camera.getWorldDirection(this.dir);
    this.ray.origin.copy(camera.position);
    this.ray.direction.copy(this.dir);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.raft.root.position.y);
    return this.ray.intersectPlane(plane, this.hit) !== null;
  }

  update(camera: THREE.Camera): void {
    if (!this.active || !this.buildingId) {
      this.removeGhost();
      return;
    }
    if (!this.castToDeckPlane(camera)) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    const kind = placeKind(this.buildingId);
    const { cx, cz } = this.raft.worldToCell(this.hit.x, this.hit.z);
    let valid = false;
    let edge = 0;

    if (kind === 'foundation') {
      valid =
        !this.raft.hasFoundation(cx, cz) &&
        (this.raft.foundationCount() === 0 || this.raft.isAdjacentToFoundation(cx, cz));
    } else if (kind === 'deck') {
      valid = this.raft.hasFoundation(cx, cz) && !this.raft.hasDeck(cx, cz);
    } else {
      edge = this.raft.edgeFor(this.hit.x, this.hit.z, cx, cz);
      valid = this.raft.hasFoundation(cx, cz) && !this.raft.hasWall(cx, cz, edge);
    }

    // Also require affordability for visual feedback.
    const affordable = this.canAfford(this.buildingId);
    valid = valid && affordable;

    this.target = { cx, cz, edge, valid };
    this.updateGhost(this.buildingId, kind, cx, cz, edge, valid);
  }

  private updateGhost(
    buildingId: string,
    kind: PlaceKind,
    cx: number,
    cz: number,
    edge: number,
    valid: boolean,
  ): void {
    if (this.ghostFor !== buildingId) {
      this.removeGhost();
      this.ghost = RaftMeshes.build(buildingId);
      this.scene.add(this.ghost);
      this.ghostFor = buildingId;
    }
    const ghost = this.ghost;
    if (!ghost) return;
    ghost.visible = true;
    makeHologram(ghost, valid);

    const baseX = this.raft.root.position.x + cx * CELL_SIZE;
    const baseZ = this.raft.root.position.z + cz * CELL_SIZE;
    const baseY = this.raft.root.position.y;
    if (kind === 'wall') {
      const h = CELL_SIZE / 2;
      if (edge === 0) ghost.position.set(baseX, baseY, baseZ - h);
      else if (edge === 2) ghost.position.set(baseX, baseY, baseZ + h);
      else if (edge === 1) ghost.position.set(baseX + h, baseY, baseZ);
      else ghost.position.set(baseX - h, baseY, baseZ);
      ghost.rotation.y = edge === 1 || edge === 3 ? Math.PI / 2 : 0;
    } else {
      ghost.position.set(baseX, baseY, baseZ);
      ghost.rotation.y = this.rotation;
    }
  }

  private recipeFor(buildingId: string) {
    // Building items share their id with their recipe id.
    return RecipeDatabase.get(buildingId);
  }

  private canAfford(buildingId: string): boolean {
    // If the player holds the placeable item directly, that's enough.
    if (this.inventory.has(buildingId, 1)) return true;
    const recipe = this.recipeFor(buildingId);
    if (!recipe) return false;
    return recipe.ingredients.every((i) => this.inventory.has(i.itemId, i.count));
  }

  private payFor(buildingId: string): boolean {
    if (this.inventory.has(buildingId, 1)) {
      this.inventory.remove(buildingId, 1);
      return true;
    }
    const recipe = this.recipeFor(buildingId);
    if (!recipe || !recipe.ingredients.every((i) => this.inventory.has(i.itemId, i.count)))
      return false;
    for (const i of recipe.ingredients) this.inventory.remove(i.itemId, i.count);
    return true;
  }

  /** Commit the current preview. Returns true on success. */
  tryPlace(): boolean {
    if (!this.active || !this.buildingId || !this.target.valid) {
      this.bus.emit('notify', { message: 'Placement impossible', kind: 'bad' });
      return false;
    }
    const kind = placeKind(this.buildingId);
    const { cx, cz, edge } = this.target;
    if (!this.payFor(this.buildingId)) {
      this.bus.emit('notify', { message: 'Ressources insuffisantes', kind: 'bad' });
      return false;
    }
    let ok: unknown = null;
    if (kind === 'foundation') ok = this.raft.placeFoundation(cx, cz);
    else if (kind === 'deck') ok = this.raft.placeDeck(this.buildingId, cx, cz, this.rotation);
    else ok = this.raft.placeWall(cx, cz, edge);
    return ok !== null;
  }

  /** Hammer demolition: remove the piece under the crosshair, refund half. */
  tryDemolish(camera: THREE.Camera): boolean {
    if (!this.castToDeckPlane(camera)) return false;
    const removed = this.raft.removeAt(this.hit.x, this.hit.z);
    if (!removed) return false;
    const recipe = RecipeDatabase.get(removed.buildingId);
    if (recipe) {
      for (const i of recipe.ingredients) {
        const refund = Math.max(1, Math.floor(i.count / 2));
        this.inventory.add(i.itemId, refund);
      }
    }
    this.bus.emit('notify', {
      message: 'Pièce démolie (matériaux partiellement récupérés)',
      kind: 'info',
    });
    return true;
  }

  /** Hammer repair: restore health to the piece under the crosshair. */
  tryRepair(camera: THREE.Camera): boolean {
    if (!this.castToDeckPlane(camera)) return false;
    if (!this.inventory.has('wood', 1)) {
      this.bus.emit('notify', { message: 'Il faut du bois pour réparer', kind: 'warn' });
      return false;
    }
    const repaired = this.raft.repairAt(this.hit.x, this.hit.z);
    if (repaired) {
      this.inventory.remove('wood', 1);
      this.bus.emit('notify', { message: 'Réparation effectuée', kind: 'good' });
      return true;
    }
    return false;
  }

  dispose(): void {
    this.removeGhost();
  }
}
