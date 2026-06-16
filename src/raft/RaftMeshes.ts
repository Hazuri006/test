import * as THREE from 'three';
import { Materials } from '../rendering/Materials';

export const CELL_SIZE = 4;
export const DECK_THICKNESS = 0.3;
export const WALL_HEIGHT = 2.4;

/**
 * Procedural geometry for every buildable piece. Each builder returns an
 * Object3D positioned so its logical origin is the centre of its grid cell at
 * deck level (y = 0 is the top of the foundation deck).
 */
export const RaftMeshes = {
  foundation(seed = 1): THREE.Object3D {
    const group = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, DECK_THICKNESS, CELL_SIZE),
      Materials.wood(1 + (seed % 3)),
    );
    deck.position.y = -DECK_THICKNESS / 2;
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    // Cross beams under the deck for a crafted look.
    const beamMat = Materials.wood(2);
    for (const off of [-CELL_SIZE / 2 + 0.4, CELL_SIZE / 2 - 0.4]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, 0.25, 0.4), beamMat);
      beam.position.set(0, -DECK_THICKNESS - 0.12, off);
      beam.castShadow = true;
      group.add(beam);
    }
    // Rope lashings at the corners.
    const ropeMat = Materials.rope();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const knot = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 6, 10), ropeMat);
        knot.position.set(sx * (CELL_SIZE / 2 - 0.3), 0.02, sz * (CELL_SIZE / 2 - 0.3));
        knot.rotation.x = Math.PI / 2;
        group.add(knot);
      }
    }
    return group;
  },

  floor(): THREE.Object3D {
    const m = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, 0.2, CELL_SIZE), Materials.wood(2));
    m.castShadow = true;
    m.receiveShadow = true;
    m.position.y = WALL_HEIGHT - 0.1;
    return m;
  },

  wall(): THREE.Object3D {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, 0.18),
      Materials.wood(1),
    );
    m.castShadow = true;
    m.receiveShadow = true;
    m.position.y = WALL_HEIGHT / 2;
    return m;
  },

  pillar(): THREE.Object3D {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, WALL_HEIGHT, 0.28), Materials.wood(3));
    m.castShadow = true;
    m.position.y = WALL_HEIGHT / 2;
    return m;
  },

  chest(): THREE.Object3D {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), Materials.wood(1));
    body.position.y = 0.4;
    body.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.22, 0.95), Materials.wood(2));
    lid.position.y = 0.9;
    lid.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.1), Materials.metal(2));
    band.position.set(0, 0.55, 0.46);
    g.add(body, lid, band);
    return g;
  },

  grill(): THREE.Object3D {
    const g = new THREE.Group();
    const legsMat = Materials.metal(1);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9), legsMat);
        leg.position.set(sx * 0.5, 0.45, sz * 0.4);
        g.add(leg);
      }
    }
    const pan = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 1.0), legsMat);
    pan.position.y = 0.9;
    pan.castShadow = true;
    g.add(pan);
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.9), Materials.metal(3));
    grate.position.y = 1.02;
    g.add(grate);
    // Ember glow.
    const ember = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.7), Materials.glow(0xff5a1e));
    ember.position.y = 0.86;
    g.add(ember);
    return g;
  },

  purifier(): THREE.Object3D {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.55, 1.1, 14),
      Materials.plastic(0x4f93b0),
    );
    tank.position.y = 0.55;
    tank.castShadow = true;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      Materials.plastic(0x9fd6e6),
    );
    dome.position.y = 1.1;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4), Materials.metal(1));
    spout.position.set(0.45, 0.4, 0);
    spout.rotation.z = Math.PI / 2.4;
    g.add(tank, dome, spout);
    return g;
  },

  planter(): THREE.Object3D {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.0), Materials.wood(2));
    box.position.y = 0.25;
    box.castShadow = true;
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 0.85), Materials.bark());
    soil.position.y = 0.46;
    g.add(box, soil);
    return g;
  },

  collector(): THREE.Object3D {
    const g = new THREE.Group();
    const frameMat = Materials.wood(3);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), frameMat);
      post.position.set(sx * 0.9, 0.7, 0);
      g.add(post);
    }
    const net = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.1), Materials.fabric(0xb9b58a));
    net.position.set(0, 0.75, 0);
    net.material.side = THREE.DoubleSide;
    (net.material as THREE.MeshStandardMaterial).transparent = true;
    (net.material as THREE.MeshStandardMaterial).opacity = 0.55;
    g.add(net);
    return g;
  },

  researchTable(): THREE.Object3D {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.0), Materials.wood(1));
    top.position.y = 0.9;
    top.castShadow = true;
    g.add(top);
    const legMat = Materials.wood(2);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), legMat);
        leg.position.set(sx * 0.65, 0.45, sz * 0.4);
        g.add(leg);
      }
    }
    const scroll = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.04, 0.5),
      Materials.fabric(0xe8dcc0),
    );
    scroll.position.y = 0.98;
    g.add(scroll);
    return g;
  },

  build(buildingId: string): THREE.Object3D {
    switch (buildingId) {
      case 'foundation':
        return this.foundation(Math.floor(Math.random() * 3));
      case 'floor':
        return this.floor();
      case 'wall':
        return this.wall();
      case 'pillar':
        return this.pillar();
      case 'chest':
        return this.chest();
      case 'grill':
        return this.grill();
      case 'purifier':
        return this.purifier();
      case 'planter':
        return this.planter();
      case 'collector':
        return this.collector();
      case 'research_table':
        return this.researchTable();
      default:
        return this.foundation();
    }
  },
};

/** Recursively replaces all materials with a hologram material for previews. */
export function makeHologram(obj: THREE.Object3D, valid: boolean): void {
  const mat = Materials.hologram(valid);
  obj.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      (c as THREE.Mesh).material = mat;
      (c as THREE.Mesh).castShadow = false;
      (c as THREE.Mesh).receiveShadow = false;
    }
  });
}
