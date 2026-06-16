import * as THREE from 'three';
import type { InputManager } from '../core/InputManager';
import type { AudioManager } from '../core/AudioManager';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { Inventory } from '../inventory/Inventory';
import type { FloatingDebrisManager, Debris } from '../world/FloatingDebrisManager';
import type { OceanManager } from '../world/ocean/OceanManager';
import { Materials } from '../rendering/Materials';

type HookState = 'idle' | 'flying' | 'reeling' | 'returning';

const CHARGE_TIME = 0.8;
const GRAVITY = 12;
const GRAB_RADIUS = 2.2;
const PICKUP_RADIUS = 2.5;

/**
 * The salvage hook: hold to charge, release to throw on a ballistic arc with a
 * visible rope. On contact with floating debris it reels the item back to the
 * player. Drives durability, sounds and the charge indicator (read by the HUD).
 */
export class HookSystem {
  state: HookState = 'idle';
  charge = 0;
  private charging = false;
  private readonly hookMesh: THREE.Group;
  private readonly rope: THREE.Line;
  private readonly hookPos = new THREE.Vector3();
  private readonly hookVel = new THREE.Vector3();
  private attached: Debris | null = null;
  private travel = 0;
  private maxRange = 40;
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly inventory: Inventory,
    private readonly debris: FloatingDebrisManager,
    private readonly ocean: OceanManager,
    private readonly bus: EventBus<GameEvents>,
    private readonly audio: AudioManager,
  ) {
    this.hookMesh = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4), Materials.metal(1));
    this.hookMesh.add(shaft);
    for (const a of [0, 2.1, 4.2]) {
      const prong = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.03, 6, 8, Math.PI),
        Materials.metal(2),
      );
      prong.position.y = -0.2;
      prong.rotation.y = a;
      prong.rotation.x = Math.PI / 2;
      this.hookMesh.add(prong);
    }
    this.hookMesh.visible = false;
    scene.add(this.hookMesh);

    const ropeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x9a8456 }));
    this.rope.visible = false;
    this.rope.frustumCulled = false;
    scene.add(this.rope);
  }

  isBusy(): boolean {
    return this.state !== 'idle';
  }

  /** @param active true when the hook tool is selected and usable this frame. */
  update(dt: number, active: boolean): void {
    if (!active) {
      this.charging = false;
      this.charge = 0;
      if (this.state === 'idle') {
        this.hookMesh.visible = false;
        this.rope.visible = false;
      }
    }

    this.camera.getWorldDirection(this.dir);
    this.origin.copy(this.camera.position).addScaledVector(this.dir, 0.4);
    this.origin.y -= 0.25;

    switch (this.state) {
      case 'idle':
        if (active) this.updateCharge(dt);
        break;
      case 'flying':
        this.updateFlying(dt);
        break;
      case 'reeling':
        this.updateReeling(dt);
        break;
      case 'returning':
        this.updateReturning(dt);
        break;
    }

    this.updateRope();
  }

  private updateCharge(dt: number): void {
    if (this.input.leftDown) {
      this.charging = true;
      this.charge = Math.min(1, this.charge + dt / CHARGE_TIME);
    } else if (this.charging) {
      this.throw();
      this.charging = false;
    }
  }

  private throw(): void {
    const sel = this.inventory.selectedStack();
    this.maxRange = 22 + this.charge * 28;
    this.hookPos.copy(this.origin);
    this.hookVel.copy(this.dir).multiplyScalar(20 + this.charge * 28);
    this.hookVel.y += 4 + this.charge * 4;
    this.travel = 0;
    this.state = 'flying';
    this.hookMesh.visible = true;
    this.rope.visible = true;
    this.audio.play('hookThrow', 0.6 + this.charge * 0.4);
    this.charge = 0;
    // Hook durability per throw.
    if (sel?.itemId === 'hook') {
      if (this.inventory.damageSelected(1)) {
        this.bus.emit('notify', { message: 'Le crochet s’est cassé !', kind: 'bad' });
      }
    }
    this.bus.emit('hook:thrown', undefined);
  }

  private updateFlying(dt: number): void {
    this.hookVel.y -= GRAVITY * dt;
    this.hookPos.addScaledVector(this.hookVel, dt);
    this.travel += this.hookVel.length() * dt;
    this.hookMesh.position.copy(this.hookPos);
    this.hookMesh.lookAt(this.hookPos.clone().add(this.hookVel));

    // Hit floating debris?
    const d = this.debris.nearestWithin(this.hookPos, GRAB_RADIUS);
    if (d) {
      this.attached = d;
      this.state = 'reeling';
      this.audio.play('hookReel', 0.7);
      return;
    }
    // Hit water?
    if (this.hookPos.y <= this.ocean.getHeight(this.hookPos.x, this.hookPos.z)) {
      this.audio.play('splash', 0.5);
      this.state = 'returning';
      return;
    }
    if (this.travel > this.maxRange) this.state = 'returning';
  }

  private updateReeling(dt: number): void {
    const d = this.attached;
    if (!d) {
      this.state = 'returning';
      return;
    }
    // Pull the debris toward the player.
    const target = this.origin;
    d.obj.position.lerp(target, Math.min(1, dt * 3.5));
    this.hookPos.copy(d.obj.position);
    this.hookMesh.position.copy(this.hookPos);

    if (d.obj.position.distanceTo(target) < PICKUP_RADIUS) {
      const yield_ = this.debris.collect(d);
      if (yield_) {
        const leftover = this.inventory.add(yield_.itemId, yield_.amount);
        if (leftover > 0) this.bus.emit('inventory:full', { itemId: yield_.itemId });
        this.bus.emit('hook:caught', { itemId: yield_.itemId, amount: yield_.amount - leftover });
        this.audio.play('pickup', 0.7);
      }
      this.attached = null;
      this.state = 'returning';
    }
  }

  private updateReturning(dt: number): void {
    this.hookPos.lerp(this.origin, Math.min(1, dt * 6));
    this.hookMesh.position.copy(this.hookPos);
    if (this.hookPos.distanceTo(this.origin) < 0.6) {
      this.state = 'idle';
      this.hookMesh.visible = false;
      this.rope.visible = false;
    }
  }

  private updateRope(): void {
    if (!this.rope.visible) return;
    const pos = this.rope.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, this.origin.x, this.origin.y, this.origin.z);
    pos.setXYZ(1, this.hookPos.x, this.hookPos.y, this.hookPos.z);
    pos.needsUpdate = true;
  }

  /** Cancel any in-flight hook (e.g. when switching tools or dying). */
  reset(): void {
    this.state = 'idle';
    this.attached = null;
    this.charge = 0;
    this.charging = false;
    this.hookMesh.visible = false;
    this.rope.visible = false;
  }

  dispose(): void {
    this.hookMesh.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
    });
    this.rope.geometry.dispose();
    (this.rope.material as THREE.Material).dispose();
    this.hookMesh.parent?.remove(this.hookMesh);
    this.rope.parent?.remove(this.rope);
  }
}
