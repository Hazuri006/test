import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/EventBus';
import { RNG } from '../core/RNG';
import { DebrisFactory } from '../entities/resources/DebrisFactory';
import type { OceanManager } from './ocean/OceanManager';

export interface Debris {
  itemId: string;
  amount: number;
  obj: THREE.Object3D;
  vx: number;
  vz: number;
  spin: number;
  bobPhase: number;
  active: boolean;
}

const SPAWN_INNER = 18;
const SPAWN_OUTER = 70;
const DESPAWN = 95;

/**
 * Spawns, animates and recycles floating resources around the player using an
 * object pool keyed by debris type — no per-frame allocation, bounded count.
 */
export class FloatingDebrisManager {
  readonly group = new THREE.Group();
  private active: Debris[] = [];
  private freeByType = new Map<string, THREE.Object3D[]>();
  private rng = new RNG((Date.now() & 0xffff) ^ 0x51ed);
  private variantCounter = 0;
  private spawnTimer = 0;
  private readonly maxActive: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly ocean: OceanManager,
    private readonly bus: EventBus<GameEvents>,
    budget: number,
  ) {
    this.maxActive = budget;
    this.group.name = 'debris';
    scene.add(this.group);
  }

  /** Seed the area around the player on spawn/load. */
  prime(playerPos: THREE.Vector3): void {
    const n = Math.floor(this.maxActive * 0.6);
    for (let i = 0; i < n; i++) this.spawnOne(playerPos, true);
  }

  private obtainMesh(itemId: string): THREE.Object3D {
    const pool = this.freeByType.get(itemId);
    if (pool && pool.length > 0) {
      const obj = pool.pop()!;
      obj.visible = true;
      return obj;
    }
    return DebrisFactory.create(itemId, this.variantCounter++);
  }

  private releaseMesh(itemId: string, obj: THREE.Object3D): void {
    obj.visible = false;
    let pool = this.freeByType.get(itemId);
    if (!pool) {
      pool = [];
      this.freeByType.set(itemId, pool);
    }
    pool.push(obj);
  }

  private spawnOne(playerPos: THREE.Vector3, anywhere: boolean): void {
    if (this.active.length >= this.maxActive) return;
    const type = DebrisFactory.pickWeighted(this.rng);
    const angle = this.rng.range(0, Math.PI * 2);
    const radius = anywhere
      ? this.rng.range(6, SPAWN_OUTER)
      : this.rng.range(SPAWN_INNER, SPAWN_OUTER);
    const x = playerPos.x + Math.cos(angle) * radius;
    const z = playerPos.z + Math.sin(angle) * radius;
    const obj = this.obtainMesh(type.itemId);
    obj.position.set(x, this.ocean.getHeight(x, z), z);
    obj.rotation.y = this.rng.range(0, Math.PI * 2);
    if (!obj.parent) this.group.add(obj);
    this.active.push({
      itemId: type.itemId,
      amount: this.rng.int(type.amountMin, type.amountMax),
      obj,
      vx: this.rng.range(-0.15, 0.15),
      vz: this.rng.range(-0.15, 0.15),
      spin: this.rng.range(-0.4, 0.4),
      bobPhase: this.rng.range(0, Math.PI * 2),
      active: true,
    });
  }

  private recycle(index: number): void {
    const d = this.active[index];
    if (!d) return;
    this.releaseMesh(d.itemId, d.obj);
    // Swap-remove for O(1).
    const last = this.active.pop()!;
    if (index < this.active.length) this.active[index] = last;
  }

  update(dt: number, playerPos: THREE.Vector3, current: THREE.Vector2): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.5;
      if (this.active.length < this.maxActive) this.spawnOne(playerPos, false);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i]!;
      const p = d.obj.position;
      p.x += (d.vx + current.x * 0.4) * dt;
      p.z += (d.vz + current.y * 0.4) * dt;
      // Float on the wave surface.
      const surf = this.ocean.getHeight(p.x, p.z);
      p.y += (surf + 0.12 - p.y) * Math.min(1, dt * 4);
      d.obj.rotation.y += d.spin * dt;
      d.obj.rotation.z = Math.sin(this.ocean.currentTime * 1.5 + d.bobPhase) * 0.08;

      const dx = p.x - playerPos.x;
      const dz = p.z - playerPos.z;
      if (dx * dx + dz * dz > DESPAWN * DESPAWN) this.recycle(i);
    }
  }

  /** Nearest active debris within radius of a world point. */
  nearestWithin(point: THREE.Vector3, radius: number): Debris | null {
    let best: Debris | null = null;
    let bestD = radius * radius;
    for (const d of this.active) {
      const dx = d.obj.position.x - point.x;
      const dy = d.obj.position.y - point.y;
      const dz = d.obj.position.z - point.z;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  /** Collect a specific debris; returns its yield and recycles it. */
  collect(d: Debris): { itemId: string; amount: number } | null {
    const idx = this.active.indexOf(d);
    if (idx < 0) return null;
    const yield_ = { itemId: d.itemId, amount: d.amount };
    this.recycle(idx);
    this.bus.emit('item:collected', yield_);
    return yield_;
  }

  activeCount(): number {
    return this.active.length;
  }

  dispose(): void {
    for (const d of this.active) {
      d.obj.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
      });
    }
    for (const pool of this.freeByType.values()) {
      for (const obj of pool) {
        obj.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
        });
      }
    }
    this.active = [];
    this.freeByType.clear();
    this.scene.remove(this.group);
  }
}
