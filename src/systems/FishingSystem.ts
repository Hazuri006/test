import * as THREE from 'three';
import type { InputManager } from '../core/InputManager';
import type { AudioManager } from '../core/AudioManager';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { Inventory } from '../inventory/Inventory';
import type { OceanManager } from '../world/ocean/OceanManager';
import { RNG } from '../core/RNG';
import { Materials } from '../rendering/Materials';

type FishState = 'idle' | 'waiting' | 'bite';

/**
 * Simple but real fishing: cast over water, wait for a bite, then click within
 * the bite window to land a catch. Shows a bobber + line and drives durability.
 */
export class FishingSystem {
  state: FishState = 'idle';
  private timer = 0;
  private biteWindow = 0;
  private readonly bobber: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly bobPos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private rng = new RNG((Date.now() & 0xffff) ^ 0x1234);

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly inventory: Inventory,
    private readonly ocean: OceanManager,
    private readonly bus: EventBus<GameEvents>,
    private readonly audio: AudioManager,
  ) {
    this.bobber = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), Materials.plastic(0xff4444));
    this.bobber.visible = false;
    scene.add(this.bobber);
    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xeeeeee }),
    );
    this.line.visible = false;
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  isBusy(): boolean {
    return this.state !== 'idle';
  }

  update(dt: number, active: boolean): void {
    if (!active) {
      if (this.state === 'idle') {
        this.bobber.visible = false;
        this.line.visible = false;
      }
      return;
    }

    if (this.state === 'idle') {
      if (this.input.leftPressed) this.cast();
      return;
    }

    // Bobber floats on the surface.
    this.bobPos.y = this.ocean.getHeight(this.bobPos.x, this.bobPos.z) + 0.1;
    this.bobber.position.copy(this.bobPos);
    this.updateLine();

    if (this.state === 'waiting') {
      this.timer -= dt;
      this.bobber.position.y += Math.sin(performance.now() * 0.005) * 0.03;
      if (this.input.leftPressed) {
        this.reset();
        this.bus.emit('notify', { message: 'Ligne ramenée (rien)', kind: 'info' });
      } else if (this.timer <= 0) {
        this.state = 'bite';
        this.biteWindow = 1.6;
        this.audio.play('splash', 0.4);
        this.bus.emit('notify', { message: 'Ça mord ! Cliquez !', kind: 'warn' });
      }
    } else if (this.state === 'bite') {
      this.biteWindow -= dt;
      this.bobber.position.y -= 0.12; // dipped under
      if (this.input.leftPressed) {
        this.catchFish();
      } else if (this.biteWindow <= 0) {
        this.reset();
        this.bus.emit('notify', { message: 'Le poisson s’est échappé', kind: 'bad' });
      }
    }
  }

  private cast(): void {
    this.camera.getWorldDirection(this.dir);
    const dist = 7;
    this.bobPos.set(
      this.camera.position.x + this.dir.x * dist,
      0,
      this.camera.position.z + this.dir.z * dist,
    );
    this.bobPos.y = this.ocean.getHeight(this.bobPos.x, this.bobPos.z) + 0.1;
    this.bobber.position.copy(this.bobPos);
    this.bobber.visible = true;
    this.line.visible = true;
    this.state = 'waiting';
    this.timer = this.rng.range(2.5, 6);
    this.audio.play('hookThrow', 0.4);
    // Rod durability per cast.
    const sel = this.inventory.selectedStack();
    if (sel?.itemId === 'fishing_rod' && this.inventory.damageSelected(1)) {
      this.bus.emit('notify', { message: 'La canne s’est cassée !', kind: 'bad' });
      this.reset();
    }
  }

  private catchFish(): void {
    const rare = this.rng.chance(0.15);
    const amount = rare ? 2 : 1;
    this.inventory.add('raw_fish', amount);
    this.audio.play('pickup', 0.7);
    this.bus.emit('item:collected', { itemId: 'raw_fish', amount });
    this.bus.emit('notify', {
      message: rare ? 'Belle prise ! ×2 poisson' : 'Poisson attrapé !',
      kind: 'good',
    });
    this.reset();
  }

  private updateLine(): void {
    const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const origin = this.camera.position;
    pos.setXYZ(0, origin.x, origin.y - 0.3, origin.z);
    pos.setXYZ(1, this.bobPos.x, this.bobPos.y, this.bobPos.z);
    pos.needsUpdate = true;
  }

  reset(): void {
    this.state = 'idle';
    this.bobber.visible = false;
    this.line.visible = false;
  }

  dispose(): void {
    this.bobber.geometry.dispose();
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.bobber.parent?.remove(this.bobber);
    this.line.parent?.remove(this.line);
  }
}
