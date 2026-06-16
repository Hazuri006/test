import * as THREE from 'three';
import type { InputManager } from '../core/InputManager';
import type { SettingsManager } from '../core/SettingsManager';
import type { AudioManager } from '../core/AudioManager';
import type { PlayerStats } from './PlayerStats';

export interface PlayerEnv {
  /** Highest walkable surface at (x,z), or null if none (open water). */
  groundHeightAt(x: number, z: number): number | null;
  oceanHeightAt(x: number, z: number): number;
}

export interface PlayerFrameState {
  moving: boolean;
  sprinting: boolean;
  swimming: boolean;
  underwater: boolean;
  onGround: boolean;
}

const GRAVITY = 22;
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 7.6;
const CROUCH_SPEED = 2.4;
const SWIM_SPEED = 3.6;
const JUMP_VELOCITY = 7.0;
const EYE_HEIGHT = 1.65;
const CROUCH_EYE = 1.05;
const CLIMB_REACH = 1.8;

/**
 * First-person controller handling walking on the raft/islands, swimming and
 * diving, climbing back aboard, jumping, sprinting, crouching, head-bob and
 * camera sway. Logic is decoupled from world queries via PlayerEnv.
 */
export class PlayerController {
  readonly position = new THREE.Vector3(0, 2, 0); // feet
  yaw = 0;
  pitch = 0;
  private vy = 0;
  private bobTime = 0;
  private footstepTimer = 0;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly settings: SettingsManager,
    private readonly audio: AudioManager,
    private readonly stats: PlayerStats,
  ) {}

  spawn(pos: THREE.Vector3, yaw = 0): void {
    this.position.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.vy = 0;
  }

  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    const eye = this.input.action('crouch') ? CROUCH_EYE : EYE_HEIGHT;
    return out.set(this.position.x, this.position.y + eye, this.position.z);
  }

  lookDirection(out: THREE.Vector3): THREE.Vector3 {
    this.euler.set(this.pitch, this.yaw, 0);
    return out.set(0, 0, -1).applyEuler(this.euler);
  }

  update(dt: number, env: PlayerEnv): PlayerFrameState {
    this.applyLook();

    // Build movement basis from current orientation.
    this.euler.set(this.pitch, this.yaw, 0);
    this.forward.set(0, 0, -1).applyEuler(this.euler);
    this.right.set(1, 0, 0).applyEuler(this.euler);

    const move = this.input.moveVector();
    const moving = move.x !== 0 || move.y !== 0;
    const oceanH = env.oceanHeightAt(this.position.x, this.position.z);
    const groundH = env.groundHeightAt(this.position.x, this.position.z);

    const inWater =
      this.position.y < oceanH - 0.1 && (groundH === null || this.position.y < groundH);
    const sprinting = this.input.action('sprint') && moving && !inWater && this.stats.canSprint();

    let swimming = false;
    let onGround = false;

    if (inWater && (groundH === null || this.position.y < groundH - 0.2)) {
      swimming = true;
      this.swim(dt, move, oceanH);
    } else {
      onGround = this.walk(dt, move, sprinting, groundH);
    }

    // Sprinting drains stamina via stats.update (Game passes context).
    this.updateCamera(dt, moving && (onGround || swimming), sprinting);

    // Footsteps.
    if (onGround && moving) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = sprinting ? 0.32 : 0.5;
        this.audio.play('step', 0.5);
      }
    }

    const eyeY = this.eyePosition(_tmpEye).y;
    const underwater = eyeY < oceanH;

    return { moving, sprinting, swimming, underwater, onGround };
  }

  private applyLook(): void {
    if (!this.input.pointerLocked) return;
    const s = this.settings.get();
    const sens = 0.0022 * s.mouseSensitivity;
    this.yaw -= this.input.mouseDX * sens;
    this.pitch -= this.input.mouseDY * sens * (s.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
  }

  private walk(
    dt: number,
    move: { x: number; y: number },
    sprinting: boolean,
    groundH: number | null,
  ): boolean {
    const crouch = this.input.action('crouch');
    const speed = sprinting ? SPRINT_SPEED : crouch ? CROUCH_SPEED : WALK_SPEED;

    // Horizontal movement on the XZ plane.
    const fx = this.forward.x;
    const fz = this.forward.z;
    const flen = Math.hypot(fx, fz) || 1;
    const dirX = (fx / flen) * move.y + this.right.x * move.x;
    const dirZ = (fz / flen) * move.y + this.right.z * move.x;
    const dlen = Math.hypot(dirX, dirZ) || 1;
    this.position.x += (dirX / dlen) * speed * dt * (move.x || move.y ? 1 : 0);
    this.position.z += (dirZ / dlen) * speed * dt * (move.x || move.y ? 1 : 0);

    // Re-query ground after moving handled by caller next frame; use provided.
    let onGround = false;
    if (groundH !== null && this.position.y <= groundH + 0.15 + CLIMB_REACH) {
      if (this.position.y < groundH) {
        // Climb / step up onto the surface.
        this.position.y = Math.min(groundH, this.position.y + 6 * dt);
      } else {
        this.position.y = groundH;
      }
      this.vy = 0;
      onGround = Math.abs(this.position.y - groundH) < 0.05;
      if (onGround && this.input.actionPressed('jump') && this.stats.spendStamina(6)) {
        this.vy = JUMP_VELOCITY;
        onGround = false;
      }
    } else {
      this.vy -= GRAVITY * dt;
      this.position.y += this.vy * dt;
    }
    return onGround;
  }

  private swim(dt: number, move: { x: number; y: number }, oceanH: number): void {
    // Full 3D swimming using the look direction so the player can dive.
    const dir = _tmpDir
      .copy(this.forward)
      .multiplyScalar(move.y)
      .addScaledVector(this.right, move.x);
    if (dir.lengthSq() > 1e-4) {
      dir.normalize().multiplyScalar(SWIM_SPEED * dt);
      this.position.addScaledVector(dir, 1);
    }

    // Buoyancy toward the surface; crouch to dive, jump to surface faster.
    const submerge = oceanH - this.position.y;
    if (this.input.action('crouch')) {
      this.vy -= 6 * dt; // dive
    } else if (this.input.action('jump')) {
      this.vy += 8 * dt;
    } else {
      this.vy += THREE.MathUtils.clamp(submerge, -1, 2) * 4 * dt;
    }
    this.vy *= 0.86; // water drag
    this.vy = THREE.MathUtils.clamp(this.vy, -5, 5);
    this.position.y += this.vy * dt;

    // Don't pop above the surface while swimming.
    if (this.position.y > oceanH + 0.2) {
      this.position.y = oceanH + 0.2;
      this.vy = Math.min(this.vy, 0);
    }
  }

  private updateCamera(dt: number, bobbing: boolean, sprinting: boolean): void {
    this.eyePosition(this.camera.position);

    // Head bob + subtle sway.
    if (bobbing) {
      this.bobTime += dt * (sprinting ? 13 : 9);
      const bob = Math.sin(this.bobTime) * (sprinting ? 0.07 : 0.045);
      const sway = Math.cos(this.bobTime * 0.5) * 0.03;
      this.camera.position.y += bob;
      this.camera.position.x += this.right.x * sway;
      this.camera.position.z += this.right.z * sway;
    } else {
      this.bobTime = 0;
    }

    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  serialize(): { x: number; y: number; z: number; yaw: number; pitch: number } {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  load(s: { x: number; y: number; z: number; yaw: number; pitch: number }): void {
    this.position.set(s.x, s.y, s.z);
    this.yaw = s.yaw;
    this.pitch = s.pitch;
    this.vy = 0;
  }
}

const _tmpEye = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
