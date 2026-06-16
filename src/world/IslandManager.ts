import * as THREE from 'three';
import { RNG } from '../core/RNG';
import { Materials } from '../rendering/Materials';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { GraphicsConfig } from '../core/SettingsManager';

export type HarvestKind = 'tree' | 'rock' | 'clay' | 'bush';

export interface Harvestable {
  id: string;
  kind: HarvestKind;
  islandId: string;
  obj: THREE.Object3D;
  health: number;
  maxHealth: number;
  drops: { itemId: string; amount: number }[];
  toolRequired: 'axe' | 'any';
  harvested: boolean;
}

export interface Island {
  id: string;
  center: THREE.Vector3;
  radius: number;
  peakHeight: number;
  group: THREE.Group;
  harvestables: Harvestable[];
  lootChest: THREE.Object3D | null;
  lootClaimed: boolean;
}

export interface IslandSnapshot {
  discovered: string[];
  harvested: string[];
}

const VIEW_FADE = 1.15; // multiplier of view distance for showing islands

/**
 * Deterministic procedural islands (sand beach, rocks, palms, bushes).
 * Trees and rocks are harvestable. Provides ground-height queries so the player
 * can walk ashore, and obstacle data for the shark.
 */
export class IslandManager {
  readonly group = new THREE.Group();
  private islands: Island[] = [];
  private discovered = new Set<string>();
  private harvested = new Set<string>();
  private uidCounter = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly bus: EventBus<GameEvents>,
    private readonly graphics: GraphicsConfig,
  ) {
    this.group.name = 'islands';
    scene.add(this.group);
  }

  /** Generate islands deterministically from the world seed. */
  generate(seed: number): void {
    this.clear();
    const count = 3;
    for (let i = 0; i < count; i++) {
      const islandSeed = RNG.hashSeed(seed, 'island', i);
      const irng = new RNG(islandSeed);
      // First island close to spawn so it's reachable early.
      const dist = i === 0 ? irng.range(95, 130) : irng.range(220, 520);
      const angle = irng.range(0, Math.PI * 2);
      const center = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      this.islands.push(this.buildIsland(`isl_${i}`, center, irng));
    }
  }

  private buildIsland(id: string, center: THREE.Vector3, rng: RNG): Island {
    const group = new THREE.Group();
    group.position.copy(center);
    const radius = rng.range(16, 30);
    const peak = rng.range(3.5, 6.5);
    const harvestables: Harvestable[] = [];

    group.add(this.buildBeach(radius, peak, rng));

    // Underwater rock shelf for realism.
    const shelf = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.5, radius * 1.9, 4, 16),
      Materials.rock(),
    );
    shelf.position.y = -3.5;
    group.add(shelf);

    // Palms (harvestable trees).
    const treeCount = Math.round(rng.int(4, 9) * this.graphics.foliageScale + 1);
    for (let i = 0; i < treeCount; i++) {
      const r = rng.range(2, radius * 0.8);
      const a = rng.range(0, Math.PI * 2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.localHeight(Math.hypot(x, z), radius, peak);
      if (y < 0.4) continue;
      const palm = this.buildPalm(rng);
      palm.position.set(x, y, z);
      palm.rotation.y = rng.range(0, Math.PI * 2);
      group.add(palm);
      harvestables.push({
        id: `${id}_tree_${this.uidCounter++}`,
        kind: 'tree',
        islandId: id,
        obj: palm,
        health: 3,
        maxHealth: 3,
        drops: [
          { itemId: 'wood', amount: rng.int(3, 5) },
          { itemId: 'fiber', amount: rng.int(1, 3) },
          { itemId: 'coconut', amount: rng.chance(0.5) ? 1 : 0 },
        ],
        toolRequired: 'axe',
        harvested: false,
      });
    }

    // Rocks (harvestable: stone/clay).
    const rockCount = rng.int(3, 6);
    for (let i = 0; i < rockCount; i++) {
      const r = rng.range(1, radius * 0.7);
      const a = rng.range(0, Math.PI * 2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.localHeight(Math.hypot(x, z), radius, peak);
      const isClay = rng.chance(0.4);
      const rock = this.buildRock(rng, isClay);
      rock.position.set(x, y, z);
      group.add(rock);
      harvestables.push({
        id: `${id}_rock_${this.uidCounter++}`,
        kind: isClay ? 'clay' : 'rock',
        islandId: id,
        obj: rock,
        health: 2,
        maxHealth: 2,
        drops: [{ itemId: isClay ? 'clay' : 'stone', amount: rng.int(2, 4) }],
        toolRequired: 'any',
        harvested: false,
      });
    }

    // Decorative bushes (instanced, non-harvestable).
    const bushCount = Math.round(rng.int(6, 14) * this.graphics.foliageScale);
    if (bushCount > 0) group.add(this.buildBushes(bushCount, radius, peak, rng));

    // A loot chest on the first island as a point of interest.
    let lootChest: THREE.Object3D | null = null;
    if (id === 'isl_0') {
      lootChest = this.buildLootChest();
      const y = this.localHeight(0, radius, peak);
      lootChest.position.set(0, y, 0);
      group.add(lootChest);
    }

    this.group.add(group);
    return {
      id,
      center,
      radius,
      peakHeight: peak,
      group,
      harvestables,
      lootChest,
      lootClaimed: false,
    };
  }

  /** Loot chest near a world position (for the interaction prompt). */
  chestNear(pos: THREE.Vector3, radius: number): Island | null {
    for (const isl of this.islands) {
      if (!isl.lootChest || isl.lootClaimed) continue;
      const wp = new THREE.Vector3();
      isl.lootChest.getWorldPosition(wp);
      if (wp.distanceTo(pos) <= radius) return isl;
    }
    return null;
  }

  /** Claim an island's loot chest once. Returns the rolled loot. */
  claimChest(isl: Island): { itemId: string; amount: number }[] {
    if (!isl.lootChest || isl.lootClaimed) return [];
    isl.lootClaimed = true;
    isl.lootChest.visible = false;
    this.harvested.add(`${isl.id}_chest`);
    const rng = new RNG(RNG.hashSeed(isl.id, 'loot'));
    return [
      { itemId: 'scrap', amount: rng.int(2, 5) },
      { itemId: 'rope', amount: rng.int(1, 3) },
      { itemId: rng.chance(0.5) ? 'plastic' : 'nail', amount: rng.int(2, 4) },
    ];
  }

  /** Beach height profile (also used for ground queries). */
  private localHeight(r: number, radius: number, peak: number): number {
    if (r >= radius) return Math.max(-3, peak * 0.0 - (r - radius) * 0.4);
    const t = r / radius;
    return peak * Math.pow(1 - t, 1.6);
  }

  private buildBeach(radius: number, peak: number, rng: RNG): THREE.Mesh {
    const rings = 14;
    const sectors = 24;
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const ringR = radius * 1.25;
    for (let i = 0; i <= rings; i++) {
      const r = (i / rings) * ringR;
      for (let j = 0; j <= sectors; j++) {
        const a = (j / sectors) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        let y = this.localHeight(r, radius, peak);
        if (i > 0 && i < rings) y += rng.range(-0.25, 0.25) * (1 - r / ringR);
        positions.push(x, y, z);
        uvs.push(j / sectors, i / rings);
      }
    }
    const stride = sectors + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < sectors; j++) {
        const a = i * stride + j;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, Materials.sand(1));
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  private buildPalm(rng: RNG): THREE.Group {
    const g = new THREE.Group();
    const height = rng.range(3.5, 5.5);
    const lean = rng.range(0, 0.25);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, height, 7),
      Materials.bark(),
    );
    trunk.position.y = height / 2;
    trunk.rotation.z = lean;
    trunk.castShadow = true;
    g.add(trunk);
    const crown = new THREE.Group();
    crown.position.set(Math.sin(lean) * height, height, 0);
    const frondCount = rng.int(5, 7);
    for (let i = 0; i < frondCount; i++) {
      const frond = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 2.4, 4),
        Materials.foliage(0x3f8a35),
      );
      const a = (i / frondCount) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9);
      frond.rotation.set(Math.PI / 2.4, a, 0);
      frond.scale.set(0.6, 1, 0.25);
      frond.castShadow = true;
      crown.add(frond);
    }
    // Coconuts.
    for (let i = 0; i < rng.int(0, 3); i++) {
      const coco = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), Materials.bark());
      coco.position.set(rng.range(-0.3, 0.3), -0.2, rng.range(-0.3, 0.3));
      crown.add(coco);
    }
    g.add(crown);
    return g;
  }

  private buildRock(rng: RNG, isClay: boolean): THREE.Mesh {
    const geo = new THREE.DodecahedronGeometry(rng.range(0.6, 1.4), 0);
    const mesh = new THREE.Mesh(geo, isClay ? Materials.bark() : Materials.rock());
    if (isClay) (mesh.material as THREE.MeshStandardMaterial).color.setHex(0xb5734a);
    mesh.scale.set(1, rng.range(0.6, 1), 1);
    mesh.rotation.set(rng.range(0, 1), rng.range(0, 6), rng.range(0, 1));
    mesh.castShadow = true;
    return mesh;
  }

  private buildBushes(count: number, radius: number, peak: number, rng: RNG): THREE.InstancedMesh {
    const geo = new THREE.IcosahedronGeometry(0.6, 0);
    const inst = new THREE.InstancedMesh(geo, Materials.foliage(0x4f7d3a), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const r = rng.range(1, radius * 0.9);
      const a = rng.range(0, Math.PI * 2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.localHeight(Math.hypot(x, z), radius, peak);
      p.set(x, y + 0.2, z);
      s.set(rng.range(0.6, 1.3), rng.range(0.5, 1.1), rng.range(0.6, 1.3));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }

  private buildLootChest(): THREE.Object3D {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), Materials.wood(2));
    body.position.y = 0.35;
    body.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.2, 0.85), Materials.metal(2));
    lid.position.y = 0.8;
    g.add(body, lid);
    g.userData.loot = true;
    return g;
  }

  /** Walkable ground height at a world position, or null if not over land. */
  groundHeightAt(worldX: number, worldZ: number): number | null {
    for (const isl of this.islands) {
      const dx = worldX - isl.center.x;
      const dz = worldZ - isl.center.z;
      const r = Math.hypot(dx, dz);
      if (r < isl.radius) {
        return isl.center.y + this.localHeight(r, isl.radius, isl.peakHeight);
      }
    }
    return null;
  }

  obstacles(): { x: number; z: number; r: number }[] {
    return this.islands.map((i) => ({ x: i.center.x, z: i.center.z, r: i.radius }));
  }

  harvestablesNear(pos: THREE.Vector3, radius: number): Harvestable[] {
    const out: Harvestable[] = [];
    for (const isl of this.islands) {
      if (isl.center.distanceTo(pos) > isl.radius + radius + 5) continue;
      for (const h of isl.harvestables) {
        if (h.harvested) continue;
        const wp = new THREE.Vector3();
        h.obj.getWorldPosition(wp);
        if (wp.distanceTo(pos) <= radius) out.push(h);
      }
    }
    return out;
  }

  /** Apply harvest damage. Returns drops when the node is depleted. */
  harvest(h: Harvestable, power: number): { itemId: string; amount: number }[] | null {
    if (h.harvested) return null;
    h.health -= power;
    // Little shake feedback.
    h.obj.rotation.z += 0.04;
    if (h.health <= 0) {
      h.harvested = true;
      h.obj.visible = false;
      this.harvested.add(h.id);
      if (h.kind === 'tree') this.bus.emit('tree:chopped', { islandId: h.islandId });
      return h.drops.filter((d) => d.amount > 0);
    }
    return null;
  }

  /** Distance culling + discovery tracking. */
  update(playerPos: THREE.Vector3): void {
    const maxD = this.graphics.viewDistance * VIEW_FADE;
    for (const isl of this.islands) {
      const d = isl.center.distanceTo(playerPos);
      isl.group.visible = d < maxD;
      if (d < isl.radius + 40 && !this.discovered.has(isl.id)) {
        this.discovered.add(isl.id);
        this.bus.emit('notify', { message: 'Île découverte !', kind: 'good' });
      }
    }
  }

  nearestIsland(pos: THREE.Vector3): Island | null {
    let best: Island | null = null;
    let bestD = Infinity;
    for (const isl of this.islands) {
      const d = isl.center.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = isl;
      }
    }
    return best;
  }

  serialize(): IslandSnapshot {
    return { discovered: [...this.discovered], harvested: [...this.harvested] };
  }

  load(snap: IslandSnapshot): void {
    this.discovered = new Set(snap.discovered);
    this.harvested = new Set(snap.harvested);
    // Re-apply harvested state to nodes and claimed chests.
    for (const isl of this.islands) {
      for (const h of isl.harvestables) {
        if (this.harvested.has(h.id)) {
          h.harvested = true;
          h.obj.visible = false;
        }
      }
      if (this.harvested.has(`${isl.id}_chest`) && isl.lootChest) {
        isl.lootClaimed = true;
        isl.lootChest.visible = false;
      }
    }
  }

  clear(): void {
    for (const isl of this.islands) {
      isl.group.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
      });
      this.group.remove(isl.group);
    }
    this.islands = [];
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
  }
}
