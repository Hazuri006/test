import * as THREE from 'three';
import { Materials } from '../../rendering/Materials';
import { RNG } from '../../core/RNG';

/** Spawnable debris types and the item they yield. */
export interface DebrisType {
  itemId: string;
  amountMin: number;
  amountMax: number;
  weight: number;
}

export const DEBRIS_TYPES: DebrisType[] = [
  { itemId: 'wood', amountMin: 1, amountMax: 2, weight: 34 },
  { itemId: 'plastic', amountMin: 1, amountMax: 2, weight: 26 },
  { itemId: 'fiber', amountMin: 1, amountMax: 3, weight: 18 },
  { itemId: 'scrap', amountMin: 1, amountMax: 1, weight: 9 },
  { itemId: 'coconut', amountMin: 1, amountMax: 1, weight: 8 },
  { itemId: 'clay', amountMin: 1, amountMax: 1, weight: 5 },
];

/**
 * Builds procedural meshes for floating debris. A few visual variants per
 * type avoid obvious repetition. Geometry is created once and shared via the
 * pool in FloatingDebrisManager.
 */
export const DebrisFactory = {
  create(itemId: string, variant: number): THREE.Object3D {
    switch (itemId) {
      case 'wood':
        return this.plank(variant);
      case 'plastic':
        return variant % 2 === 0 ? this.bottle() : this.plasticChunk();
      case 'fiber':
        return this.leaf(variant);
      case 'scrap':
        return this.scrap(variant);
      case 'coconut':
        return this.coconut();
      case 'clay':
        return this.clayLump();
      default:
        return this.plank(0);
    }
  },

  plank(variant: number): THREE.Object3D {
    const len = 1.4 + (variant % 3) * 0.5;
    const g = new THREE.Group();
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.16, 0.34),
      Materials.wood(1 + (variant % 3)),
    );
    plank.castShadow = true;
    g.add(plank);
    if (variant % 2 === 0) {
      const second = new THREE.Mesh(new THREE.BoxGeometry(len * 0.8, 0.14, 0.3), Materials.wood(2));
      second.position.set(0.1, 0.16, 0.1);
      second.rotation.y = 0.3;
      g.add(second);
    }
    return g;
  },

  bottle(): THREE.Object3D {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.6, 10),
      Materials.plastic(0x6fc7d6),
    );
    body.castShadow = true;
    body.rotation.z = Math.PI / 2;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8),
      Materials.plastic(0xe8e8e8),
    );
    cap.rotation.z = Math.PI / 2;
    cap.position.x = 0.36;
    g.add(body, cap);
    return g;
  },

  plasticChunk(): THREE.Object3D {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), Materials.plastic(0x4fb0c4));
    m.castShadow = true;
    m.rotation.set(0.3, 0.5, 0.2);
    return m;
  },

  leaf(variant: number): THREE.Object3D {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.0, 4, 1),
      Materials.foliage(variant % 2 === 0 ? 0x4f8a3a : 0x6fa83f),
    );
    m.rotation.x = Math.PI / 2;
    m.scale.set(1, 1, 0.25);
    return m;
  },

  scrap(variant: number): THREE.Object3D {
    const g = new THREE.Group();
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.1, 0.5),
      Materials.metal(1 + (variant % 3)),
    );
    m.castShadow = true;
    m.rotation.set(0.4, 0.2, 0.6);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.2), Materials.metal(2));
    m2.position.set(0.1, 0.05, 0.1);
    m2.rotation.set(0.2, 1.0, 0.3);
    g.add(m, m2);
    return g;
  },

  coconut(): THREE.Object3D {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), Materials.bark());
    m.castShadow = true;
    m.scale.set(1, 0.9, 1);
    return m;
  },

  clayLump(): THREE.Object3D {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), Materials.rock());
    (m.material as THREE.MeshStandardMaterial).color?.setHex(0xb5734a);
    m.castShadow = true;
    return m;
  },

  pickWeighted(rng: RNG): DebrisType {
    const total = DEBRIS_TYPES.reduce((s, d) => s + d.weight, 0);
    let r = rng.range(0, total);
    for (const d of DEBRIS_TYPES) {
      r -= d.weight;
      if (r <= 0) return d;
    }
    return DEBRIS_TYPES[0]!;
  },
};
