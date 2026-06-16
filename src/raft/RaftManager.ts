import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { OceanManager } from '../world/ocean/OceanManager';
import { CELL_SIZE, RaftMeshes, WALL_HEIGHT } from './RaftMeshes';
import { BuildingGrid } from './BuildingGrid';

export type PieceKind = 'foundation' | 'deck' | 'wall';

export interface RaftPiece {
  uid: number;
  buildingId: string;
  kind: PieceKind;
  cx: number;
  cz: number;
  edge?: number; // walls only: 0=N,1=E,2=S,3=W
  rotationY: number;
  health: number;
  maxHealth: number;
  obj: THREE.Object3D;
}

export interface RaftSnapshot {
  originX: number;
  originZ: number;
  pieces: Array<{
    buildingId: string;
    kind: PieceKind;
    cx: number;
    cz: number;
    edge?: number;
    rotationY: number;
    health: number;
  }>;
}

const PIECE_HEALTH: Record<string, number> = {
  foundation: 120,
  floor: 80,
  wall: 90,
  pillar: 60,
  default: 70,
};

/**
 * The player's raft: a grid of foundations with decks (stations) and walls,
 * floating on the ocean with simplified buoyancy. Pure raft logic lives here;
 * placement validation/preview is handled by BuildingSystem.
 */
export class RaftManager {
  readonly root = new THREE.Group();
  private readonly grid = new BuildingGrid();
  private foundations = new Map<string, RaftPiece>();
  private decks = new Map<string, RaftPiece>();
  private walls = new Map<string, RaftPiece>();
  private nextUid = 1;
  private readonly tmpNormal = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.root.name = 'raft';
    scene.add(this.root);
  }

  /** Build the initial 2x2 starter raft around the origin. */
  initStarterRaft(): void {
    this.clear();
    for (const [cx, cz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      this.placeFoundation(cx, cz, true);
    }
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }
  private wallKey(cx: number, cz: number, edge: number): string {
    return `${cx},${cz},${edge}`;
  }

  hasFoundation(cx: number, cz: number): boolean {
    return this.grid.hasFoundation(cx, cz);
  }
  hasDeck(cx: number, cz: number): boolean {
    return this.grid.hasDeck(cx, cz);
  }
  hasWall(cx: number, cz: number, edge: number): boolean {
    return this.grid.hasWall(cx, cz, edge);
  }

  /** True if a new foundation here would touch the existing structure. */
  isAdjacentToFoundation(cx: number, cz: number): boolean {
    return this.grid.isAdjacent(cx, cz);
  }

  foundationCount(): number {
    return this.grid.foundationCount;
  }

  placeFoundation(cx: number, cz: number, force = false): RaftPiece | null {
    if (!this.grid.canPlaceFoundation(cx, cz, force)) return null;
    this.grid.addFoundation(cx, cz);
    const obj = RaftMeshes.foundation(cx * 3 + cz);
    obj.position.set(cx * CELL_SIZE, 0, cz * CELL_SIZE);
    this.root.add(obj);
    const piece: RaftPiece = {
      uid: this.nextUid++,
      buildingId: 'foundation',
      kind: 'foundation',
      cx,
      cz,
      rotationY: 0,
      health: PIECE_HEALTH.foundation,
      maxHealth: PIECE_HEALTH.foundation,
      obj,
    };
    this.foundations.set(this.key(cx, cz), piece);
    this.bus.emit('build:placed', { buildingId: 'foundation' });
    return piece;
  }

  placeDeck(buildingId: string, cx: number, cz: number, rotationY: number): RaftPiece | null {
    if (!this.grid.canPlaceDeck(cx, cz)) return null;
    this.grid.addDeck(cx, cz);
    const obj = RaftMeshes.build(buildingId);
    obj.position.set(cx * CELL_SIZE, 0, cz * CELL_SIZE);
    obj.rotation.y = rotationY;
    this.root.add(obj);
    const hp = PIECE_HEALTH[buildingId] ?? PIECE_HEALTH.default;
    const piece: RaftPiece = {
      uid: this.nextUid++,
      buildingId,
      kind: 'deck',
      cx,
      cz,
      rotationY,
      health: hp,
      maxHealth: hp,
      obj,
    };
    this.decks.set(this.key(cx, cz), piece);
    this.bus.emit('build:placed', { buildingId });
    return piece;
  }

  placeWall(cx: number, cz: number, edge: number): RaftPiece | null {
    if (!this.grid.canPlaceWall(cx, cz, edge)) return null;
    this.grid.addWall(cx, cz, edge);
    const obj = RaftMeshes.wall();
    this.applyWallTransform(obj, cx, cz, edge);
    this.root.add(obj);
    const piece: RaftPiece = {
      uid: this.nextUid++,
      buildingId: 'wall',
      kind: 'wall',
      cx,
      cz,
      edge,
      rotationY: edge === 1 || edge === 3 ? Math.PI / 2 : 0,
      health: PIECE_HEALTH.wall,
      maxHealth: PIECE_HEALTH.wall,
      obj,
    };
    this.walls.set(this.wallKey(cx, cz, edge), piece);
    this.bus.emit('build:placed', { buildingId: 'wall' });
    return piece;
  }

  private applyWallTransform(obj: THREE.Object3D, cx: number, cz: number, edge: number): void {
    const baseX = cx * CELL_SIZE;
    const baseZ = cz * CELL_SIZE;
    const h = CELL_SIZE / 2;
    switch (edge) {
      case 0:
        obj.position.set(baseX, 0, baseZ - h);
        break;
      case 2:
        obj.position.set(baseX, 0, baseZ + h);
        break;
      case 1:
        obj.position.set(baseX + h, 0, baseZ);
        obj.rotation.y = Math.PI / 2;
        break;
      case 3:
        obj.position.set(baseX - h, 0, baseZ);
        obj.rotation.y = Math.PI / 2;
        break;
    }
  }

  /** Cell coordinate from a local-to-raft position. */
  worldToCell(worldX: number, worldZ: number): { cx: number; cz: number } {
    const lx = worldX - this.root.position.x;
    const lz = worldZ - this.root.position.z;
    return { cx: Math.round(lx / CELL_SIZE), cz: Math.round(lz / CELL_SIZE) };
  }

  /** Nearest wall edge (0..3) for a local-to-raft hit position within a cell. */
  edgeFor(worldX: number, worldZ: number, cx: number, cz: number): number {
    const lx = worldX - this.root.position.x - cx * CELL_SIZE;
    const lz = worldZ - this.root.position.z - cz * CELL_SIZE;
    if (Math.abs(lx) > Math.abs(lz)) return lx > 0 ? 1 : 3;
    return lz > 0 ? 2 : 0;
  }

  /** Deck-top world Y at (x,z) if standing over a foundation, else null. */
  deckHeightAt(worldX: number, worldZ: number): number | null {
    const { cx, cz } = this.worldToCell(worldX, worldZ);
    if (!this.hasFoundation(cx, cz)) return null;
    const lx = worldX - this.root.position.x - cx * CELL_SIZE;
    const lz = worldZ - this.root.position.z - cz * CELL_SIZE;
    if (Math.abs(lx) > CELL_SIZE / 2 || Math.abs(lz) > CELL_SIZE / 2) return null;
    return this.root.position.y;
  }

  isOverRaft(worldX: number, worldZ: number): boolean {
    return this.deckHeightAt(worldX, worldZ) !== null;
  }

  /** Centre of the raft in world space. */
  center(out: THREE.Vector3): THREE.Vector3 {
    let sx = 0;
    let sz = 0;
    for (const f of this.foundations.values()) {
      sx += f.cx;
      sz += f.cz;
    }
    const n = Math.max(1, this.foundations.size);
    return out.set(
      this.root.position.x + (sx / n) * CELL_SIZE,
      this.root.position.y,
      this.root.position.z + (sz / n) * CELL_SIZE,
    );
  }

  /** Foundation nearest a world position (for shark targeting). */
  nearestFoundation(pos: THREE.Vector3): RaftPiece | null {
    let best: RaftPiece | null = null;
    let bestD = Infinity;
    for (const f of this.foundations.values()) {
      const wx = this.root.position.x + f.cx * CELL_SIZE;
      const wz = this.root.position.z + f.cz * CELL_SIZE;
      const d = (wx - pos.x) ** 2 + (wz - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  worldPosOfPiece(p: RaftPiece, out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.root.position.x + p.cx * CELL_SIZE,
      this.root.position.y + 0.2,
      this.root.position.z + p.cz * CELL_SIZE,
    );
  }

  /** Damage a specific foundation (shark bite). Removes it if destroyed. */
  damagePiece(p: RaftPiece, amount: number): void {
    p.health -= amount;
    // Flash the piece red briefly via emissive on first mesh.
    if (p.health <= 0) {
      this.removePieceInternal(p);
      this.bus.emit('notify', { message: 'Une fondation a cédé !', kind: 'bad' });
    }
  }

  /** Repair the piece under a world position with a hammer. Returns wood cost or 0. */
  repairAt(worldX: number, worldZ: number): RaftPiece | null {
    const { cx, cz } = this.worldToCell(worldX, worldZ);
    const piece = this.decks.get(this.key(cx, cz)) ?? this.foundations.get(this.key(cx, cz));
    if (piece && piece.health < piece.maxHealth) {
      piece.health = Math.min(piece.maxHealth, piece.health + 25);
      return piece;
    }
    return null;
  }

  /** Remove the topmost piece at a world position (demolition). */
  removeAt(worldX: number, worldZ: number): { buildingId: string } | null {
    const { cx, cz } = this.worldToCell(worldX, worldZ);
    const deck = this.decks.get(this.key(cx, cz));
    if (deck) {
      this.removePieceInternal(deck);
      return { buildingId: deck.buildingId };
    }
    // Don't remove a foundation that still carries decks/walls.
    const f = this.foundations.get(this.key(cx, cz));
    if (f) {
      if (!this.grid.carries(cx, cz) && this.foundations.size > 1) {
        this.removePieceInternal(f);
        return { buildingId: 'foundation' };
      }
    }
    return null;
  }

  private removePieceInternal(p: RaftPiece): void {
    this.root.remove(p.obj);
    disposeObject(p.obj);
    if (p.kind === 'foundation') {
      this.foundations.delete(this.key(p.cx, p.cz));
      this.grid.removeFoundation(p.cx, p.cz);
    } else if (p.kind === 'deck') {
      this.decks.delete(this.key(p.cx, p.cz));
      this.grid.removeDeck(p.cx, p.cz);
    } else if (p.kind === 'wall' && p.edge !== undefined) {
      this.walls.delete(this.wallKey(p.cx, p.cz, p.edge));
      this.grid.removeWall(p.cx, p.cz, p.edge);
    }
    this.bus.emit('build:removed', { buildingId: p.buildingId });
  }

  /** Find a deck station of a given type within reach of a world position. */
  deckNear(worldX: number, worldZ: number, buildingId: string, radius = 3.5): RaftPiece | null {
    let best: RaftPiece | null = null;
    let bestD = radius * radius;
    for (const d of this.decks.values()) {
      if (d.buildingId !== buildingId) continue;
      const wx = this.root.position.x + d.cx * CELL_SIZE;
      const wz = this.root.position.z + d.cz * CELL_SIZE;
      const dist = (wx - worldX) ** 2 + (wz - worldZ) ** 2;
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  allDecks(): RaftPiece[] {
    return [...this.decks.values()];
  }

  update(dt: number, ocean: OceanManager): void {
    const cx = this.root.position.x;
    const cz = this.root.position.z;
    const targetY = ocean.getHeight(cx, cz) + 0.45;
    this.root.position.y += (targetY - this.root.position.y) * Math.min(1, dt * 2.2);

    // Subtle tilt toward the wave normal (clamped) for life without sliding.
    ocean.getNormal(cx, cz, this.tmpNormal);
    this.tmpNormal.lerp(this.up, 0.82).normalize();
    this.tmpQuat.setFromUnitVectors(this.up, this.tmpNormal);
    this.root.quaternion.slerp(this.tmpQuat, Math.min(1, dt * 1.5));
  }

  serialize(): RaftSnapshot {
    const pieces: RaftSnapshot['pieces'] = [];
    for (const map of [this.foundations, this.decks, this.walls]) {
      for (const p of map.values()) {
        pieces.push({
          buildingId: p.buildingId,
          kind: p.kind,
          cx: p.cx,
          cz: p.cz,
          edge: p.edge,
          rotationY: p.rotationY,
          health: p.health,
        });
      }
    }
    return { originX: this.root.position.x, originZ: this.root.position.z, pieces };
  }

  load(snap: RaftSnapshot): void {
    this.clear();
    this.root.position.x = snap.originX;
    this.root.position.z = snap.originZ;
    // Foundations first so decks/walls can attach.
    for (const p of snap.pieces.filter((x) => x.kind === 'foundation')) {
      const piece = this.placeFoundation(p.cx, p.cz, true);
      if (piece) piece.health = p.health;
    }
    for (const p of snap.pieces.filter((x) => x.kind === 'deck')) {
      const piece = this.placeDeck(p.buildingId, p.cx, p.cz, p.rotationY);
      if (piece) piece.health = p.health;
    }
    for (const p of snap.pieces.filter((x) => x.kind === 'wall')) {
      const piece = this.placeWall(p.cx, p.cz, p.edge ?? 0);
      if (piece) piece.health = p.health;
    }
  }

  clear(): void {
    for (const map of [this.foundations, this.decks, this.walls]) {
      for (const p of map.values()) {
        this.root.remove(p.obj);
        disposeObject(p.obj);
      }
      map.clear();
    }
    this.grid.clear();
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.root);
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      // Materials are shared from the cache; do not dispose here.
    }
  });
}

export { WALL_HEIGHT };
