import * as THREE from 'three';
import { Materials } from '../rendering/Materials';

/**
 * Procedural shark model with animatable parts. The body is a chain of tapered
 * segments so it can flex like a swimming fish; the tail, pectoral fins, dorsal
 * fin and lower jaw are separate so the AI can drive a believable swim + bite.
 *
 * This is an original low-poly model generated at runtime. To replace it with a
 * rigged glTF later, keep the same root scale (~5 m long) and the public part
 * references (tailPivot, jaw, body group) so the animation code keeps working.
 */
export class SharkModel {
  readonly root = new THREE.Group();
  readonly tailPivot = new THREE.Group();
  readonly jaw = new THREE.Group();
  private readonly segments: THREE.Mesh[] = [];
  private readonly segPivots: THREE.Group[] = [];

  constructor() {
    const skin = Materials.sharkSkin();
    const belly = Materials.sharkBelly();

    // Body: a chain of flattened ellipsoids tapering toward the tail.
    const segCount = 6;
    let parent: THREE.Object3D = this.root;
    const bodyLen = 4.2;
    const segLen = bodyLen / segCount;
    for (let i = 0; i < segCount; i++) {
      const t = i / (segCount - 1);
      const radius = 0.7 * Math.sin((1 - t * 0.85) * Math.PI * 0.55) + 0.18;
      const pivot = new THREE.Group();
      pivot.position.z = i === 0 ? 0 : -segLen;
      parent.add(pivot);
      const seg = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 10), skin);
      seg.scale.set(1, 0.78, segLen / radius + 0.6);
      seg.castShadow = true;
      pivot.add(seg);
      // Pale belly underlay.
      const under = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.92, 10, 8), belly);
      under.scale.set(0.96, 0.5, segLen / radius + 0.5);
      under.position.y = -radius * 0.35;
      pivot.add(under);
      this.segments.push(seg);
      this.segPivots.push(pivot);
      parent = pivot;
    }

    // Tail attached to the last segment pivot.
    this.tailPivot.position.z = -segLen;
    parent.add(this.tailPivot);
    const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.3, 4), skin);
    tailFin.scale.set(0.25, 1, 1);
    const upper = tailFin.clone();
    upper.rotation.x = -0.5;
    upper.position.set(0, 0.5, -0.4);
    const lower = tailFin.clone();
    lower.rotation.x = Math.PI + 0.7;
    lower.position.set(0, -0.35, -0.35);
    this.tailPivot.add(upper, lower);

    // Dorsal fin on the second segment.
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 4), skin);
    dorsal.scale.set(0.25, 1, 0.7);
    dorsal.position.set(0, 0.7, 0.2);
    dorsal.rotation.x = -0.2;
    this.segPivots[1]?.add(dorsal);

    // Pectoral fins on the head segment.
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 4), skin);
      fin.scale.set(0.18, 1, 0.5);
      fin.position.set(side * 0.6, -0.25, 0.5);
      fin.rotation.set(Math.PI / 2, 0, side * 0.7);
      this.segPivots[1]?.add(fin);
    }

    // Head + jaw on the front segment.
    const headSeg = this.segPivots[0]!;
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 12), skin);
    snout.rotation.x = -Math.PI / 2;
    snout.position.set(0, 0.05, 0.9);
    snout.scale.set(1, 0.7, 1);
    headSeg.add(snout);

    this.jaw.position.set(0, -0.25, 0.7);
    headSeg.add(this.jaw);
    const lowerJaw = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 10), Materials.sharkBelly());
    lowerJaw.rotation.x = -Math.PI / 2;
    lowerJaw.position.z = 0.35;
    lowerJaw.scale.set(1, 0.4, 1);
    this.jaw.add(lowerJaw);

    // Eyes.
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 }),
      );
      eye.position.set(side * 0.42, 0.18, 0.95);
      headSeg.add(eye);
    }
    // Forward axis is +Z (snout). The AI sets yaw/pitch directly.
  }

  /**
   * Animate swim flex and jaw.
   * @param time seconds
   * @param speed 0..1 normalised swim speed (drives tail beat)
   * @param jawOpen 0..1
   */
  animate(time: number, speed: number, jawOpen: number): void {
    const beat = 6 + speed * 6;
    const amp = 0.06 + speed * 0.12;
    for (let i = 0; i < this.segPivots.length; i++) {
      const phase = time * beat - i * 0.6;
      this.segPivots[i]!.rotation.y = Math.sin(phase) * amp * (i / this.segPivots.length + 0.3);
    }
    this.tailPivot.rotation.y =
      Math.sin(time * beat - this.segPivots.length * 0.6) * (0.3 + speed * 0.4);
    this.jaw.rotation.x = jawOpen * 0.6;
  }

  dispose(): void {
    this.root.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
    });
  }
}
