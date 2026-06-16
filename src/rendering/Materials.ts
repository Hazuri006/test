import * as THREE from 'three';
import { TextureFactory } from './TextureFactory';

/**
 * Shared PBR material library. Materials are cached and reused across all
 * instances to keep draw-call state changes and memory low.
 */
export class Materials {
  private static cache = new Map<string, THREE.Material>();

  private static get(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.cache.get(key);
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  static wood(seed = 1): THREE.MeshStandardMaterial {
    return this.get(`wood-${seed}`, () => {
      const map = TextureFactory.woodAlbedo(seed);
      map.repeat.set(1, 1);
      return new THREE.MeshStandardMaterial({
        map,
        normalMap: TextureFactory.noiseNormal(seed + 10, 256, 1.4),
        roughness: 0.82,
        metalness: 0.0,
        normalScale: new THREE.Vector2(0.5, 0.5),
      });
    }) as THREE.MeshStandardMaterial;
  }

  static plastic(color: number): THREE.MeshStandardMaterial {
    return this.get(
      `plastic-${color}`,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.35,
          metalness: 0.0,
          normalMap: TextureFactory.noiseNormal(3, 128, 0.4),
          normalScale: new THREE.Vector2(0.15, 0.15),
        }),
    ) as THREE.MeshStandardMaterial;
  }

  static metal(seed = 1): THREE.MeshStandardMaterial {
    return this.get(`metal-${seed}`, () => {
      const map = TextureFactory.metalAlbedo(seed);
      return new THREE.MeshStandardMaterial({
        map,
        normalMap: TextureFactory.noiseNormal(seed + 5, 256, 0.8),
        roughness: 0.5,
        metalness: 0.85,
      });
    }) as THREE.MeshStandardMaterial;
  }

  static sand(seed = 1): THREE.MeshStandardMaterial {
    return this.get(`sand-${seed}`, () => {
      const map = TextureFactory.sandAlbedo(seed);
      map.repeat.set(8, 8);
      return new THREE.MeshStandardMaterial({
        map,
        normalMap: TextureFactory.noiseNormal(seed + 2, 256, 1.0),
        roughness: 0.95,
        metalness: 0.0,
        normalScale: new THREE.Vector2(0.4, 0.4),
      });
    }) as THREE.MeshStandardMaterial;
  }

  static rock(): THREE.MeshStandardMaterial {
    return this.get(
      'rock',
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x6b6b70,
          roughness: 0.95,
          metalness: 0.0,
          normalMap: TextureFactory.noiseNormal(21, 256, 2.0),
          normalScale: new THREE.Vector2(0.8, 0.8),
          flatShading: true,
        }),
    ) as THREE.MeshStandardMaterial;
  }

  static foliage(color = 0x3f7d35): THREE.MeshStandardMaterial {
    return this.get(
      `foliage-${color}`,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.8,
          metalness: 0.0,
          side: THREE.DoubleSide,
          flatShading: true,
        }),
    ) as THREE.MeshStandardMaterial;
  }

  static bark(): THREE.MeshStandardMaterial {
    return this.get('bark', () => {
      const map = TextureFactory.woodAlbedo(33);
      return new THREE.MeshStandardMaterial({
        map,
        color: 0x6b4a2a,
        roughness: 0.95,
        metalness: 0.0,
      });
    }) as THREE.MeshStandardMaterial;
  }

  static sharkSkin(): THREE.MeshStandardMaterial {
    return this.get(
      'shark',
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x4a5a66,
          roughness: 0.6,
          metalness: 0.05,
          flatShading: false,
        }),
    ) as THREE.MeshStandardMaterial;
  }

  static sharkBelly(): THREE.MeshStandardMaterial {
    return this.get(
      'shark-belly',
      () => new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.7, metalness: 0.0 }),
    ) as THREE.MeshStandardMaterial;
  }

  static fabric(color: number): THREE.MeshStandardMaterial {
    return this.get(
      `fabric-${color}`,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.9,
          metalness: 0.0,
          side: THREE.DoubleSide,
        }),
    ) as THREE.MeshStandardMaterial;
  }

  static rope(): THREE.MeshStandardMaterial {
    return this.get(
      'rope',
      () => new THREE.MeshStandardMaterial({ color: 0xb89a5e, roughness: 1.0, metalness: 0.0 }),
    ) as THREE.MeshStandardMaterial;
  }

  static glow(color: number): THREE.MeshStandardMaterial {
    return this.get(
      `glow-${color}`,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.4,
          roughness: 0.4,
        }),
    ) as THREE.MeshStandardMaterial;
  }

  static hologram(valid: boolean): THREE.MeshBasicMaterial {
    return this.get(
      `holo-${valid}`,
      () =>
        new THREE.MeshBasicMaterial({
          color: valid ? 0x3effa0 : 0xff4d4d,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
    ) as THREE.MeshBasicMaterial;
  }

  static disposeAll(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}
