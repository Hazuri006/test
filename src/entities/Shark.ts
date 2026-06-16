import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { OceanManager } from '../world/ocean/OceanManager';
import { StateMachine, type State } from '../ai/StateMachine';
import { SharkModel } from './SharkModel';

export interface SharkPerception {
  playerPos: THREE.Vector3;
  playerInWater: boolean;
  raftCenter: THREE.Vector3;
  raftRadius: number;
  islands: { x: number; z: number; r: number }[];
}

export interface SharkActions {
  bitePlayer(): void;
  attackRaft(pos: THREE.Vector3): void;
  dropLoot(pos: THREE.Vector3): void;
}

export interface SharkSnapshot {
  x: number;
  y: number;
  z: number;
  health: number;
  state: string;
}

const DETECT_RADIUS = 46;
const LOSE_RADIUS = 78;
const MAX_HEALTH = 100;
const RESPAWN_DELAY = 35;

/**
 * Realistic-ish shark driven by a finite state machine
 * (Patrol → Investigate → CircleRaft → ChasePlayer → BitePlayer / AttackRaft →
 * Flee / Stunned / Dead). Steering is smooth (clamped turn rate, separate
 * vertical control) to avoid robotic motion, and it steers around the raft and
 * islands except when committing to an attack.
 */
export class Shark {
  readonly model = new SharkModel();
  private readonly fsm: StateMachine<Shark>;

  health = MAX_HEALTH;
  alive = true;

  // Kinematics.
  private readonly heading = new THREE.Vector3(0, 0, 1);
  private readonly desiredDir = new THREE.Vector3(0, 0, 1);
  private speed = 3;
  private targetSpeed = 3;
  private targetDepth = -2.5;
  private jawOpen = 0;
  private time = 0;

  // Behaviour bookkeeping.
  private stateTimer = 0;
  private biteCooldown = 0;
  private hasHitThisLunge = false;
  private circleSign = 1;
  private respawnTimer = 0;
  private roamCenter = new THREE.Vector3();
  private perception!: SharkPerception;
  private actions: SharkActions = {
    bitePlayer: () => {},
    attackRaft: () => {},
    dropLoot: () => {},
  };

  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly bus: EventBus<GameEvents>,
    private readonly ocean: OceanManager,
  ) {
    scene.add(this.model.root);
    this.fsm = new StateMachine<Shark>(this);
    this.fsm.onChange = (name) => this.bus.emit('shark:state', { state: name });
    this.registerStates();
    this.fsm.transition('Patrol');
  }

  setActions(actions: SharkActions): void {
    this.actions = actions;
  }

  get position(): THREE.Vector3 {
    return this.model.root.position;
  }
  get state(): string {
    return this.fsm.currentName;
  }

  spawn(pos: THREE.Vector3): void {
    this.model.root.position.copy(pos);
    this.roamCenter.copy(pos);
    this.health = MAX_HEALTH;
    this.alive = true;
    this.model.root.visible = true;
    this.fsm.transition('Patrol');
  }

  // --- distances -----------------------------------------------------------
  private distToPlayer(): number {
    return this.position.distanceTo(this.perception.playerPos);
  }
  private distToRaft(): number {
    return this.position.distanceTo(this.perception.raftCenter);
  }

  // --- damage --------------------------------------------------------------
  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.fsm.transition('Dead');
    } else {
      this.fsm.transition('Stunned');
    }
  }

  // --- main update ---------------------------------------------------------
  update(dt: number, perception: SharkPerception): void {
    this.perception = perception;
    this.time += dt;
    this.stateTimer += dt;
    if (this.biteCooldown > 0) this.biteCooldown -= dt;

    this.fsm.update(dt);
    if (this.alive) this.integrate(dt);
    this.animate();
  }

  /** Smooth steering + vertical control + obstacle avoidance. */
  private integrate(dt: number): void {
    const state = this.fsm.currentName;
    const attacking = state === 'BitePlayer' || state === 'AttackRaft' || state === 'ChasePlayer';

    // Obstacle avoidance (raft + islands) unless committing to an attack.
    if (!attacking) {
      this.avoid(
        this.perception.raftCenter.x,
        this.perception.raftCenter.z,
        this.perception.raftRadius + 5,
      );
    }
    for (const isl of this.perception.islands) {
      this.avoid(isl.x, isl.z, isl.r + 6);
    }

    // Flatten desired to horizontal for heading; keep magnitude.
    this.tmp.copy(this.desiredDir);
    this.tmp.y = 0;
    if (this.tmp.lengthSq() > 1e-4) {
      this.tmp.normalize();
      const turn = Math.min(1, dt * 2.2);
      this.heading.lerp(this.tmp, turn).normalize();
    }

    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 2);
    const p = this.position;
    p.x += this.heading.x * this.speed * dt;
    p.z += this.heading.z * this.speed * dt;

    // Vertical: ease toward target depth below the surface.
    const surf = this.ocean.getHeight(p.x, p.z);
    const targetY = surf + this.targetDepth;
    p.y += (targetY - p.y) * Math.min(1, dt * 2.5);

    // Orientation.
    const yaw = Math.atan2(this.heading.x, this.heading.z);
    const pitch = THREE.MathUtils.clamp((targetY - p.y) * -0.15, -0.4, 0.4);
    this.model.root.rotation.set(pitch, yaw, 0);
  }

  private avoid(cx: number, cz: number, radius: number): void {
    const dx = this.position.x - cx;
    const dz = this.position.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < radius && d > 1e-3) {
      const push = (radius - d) / radius;
      this.desiredDir.x += (dx / d) * push * 2;
      this.desiredDir.z += (dz / d) * push * 2;
    }
  }

  private animate(): void {
    const norm = THREE.MathUtils.clamp(this.speed / 9, 0, 1);
    this.model.animate(this.time, norm, this.jawOpen);
  }

  /** Steer toward a world point, optionally biased to circle it. */
  private steerToward(target: THREE.Vector3): void {
    this.desiredDir.set(target.x - this.position.x, 0, target.z - this.position.z);
    if (this.desiredDir.lengthSq() < 1e-4) this.desiredDir.copy(this.heading);
  }

  private registerStates(): void {
    const patrol: State<Shark> = {
      name: 'Patrol',
      enter: (s) => {
        s.stateTimer = 0;
        s.targetSpeed = 3;
        s.targetDepth = -2.8;
        s.jawOpen = 0;
      },
      update: (s, dt) => {
        // Lazy wandering arc around the roam centre near the raft.
        s.roamCenter.lerp(s.perception.raftCenter, Math.min(1, dt * 0.05));
        const wobble = Math.sin(s.time * 0.4) * 0.6;
        s.tmp2.set(Math.cos(s.time * 0.25 + wobble), 0, Math.sin(s.time * 0.25 + wobble));
        s.tmp.copy(s.roamCenter).addScaledVector(s.tmp2, 22);
        s.steerToward(s.tmp);
        if (s.perception.playerInWater && s.distToPlayer() < DETECT_RADIUS) {
          s.fsm.transition('ChasePlayer');
        } else if (s.stateTimer > 10) {
          s.fsm.transition('CircleRaft');
        }
      },
    };

    const investigate: State<Shark> = {
      name: 'Investigate',
      enter: (s) => {
        s.stateTimer = 0;
        s.targetSpeed = 5;
        s.targetDepth = -2;
      },
      update: (s) => {
        s.steerToward(s.perception.playerPos);
        if (s.perception.playerInWater && s.distToPlayer() < DETECT_RADIUS * 0.7) {
          s.fsm.transition('ChasePlayer');
        } else if (s.stateTimer > 6) {
          s.fsm.transition('CircleRaft');
        }
      },
    };

    const circleRaft: State<Shark> = {
      name: 'CircleRaft',
      enter: (s) => {
        s.stateTimer = 0;
        s.targetSpeed = 4;
        s.targetDepth = -2.2;
        s.circleSign = Math.random() < 0.5 ? 1 : -1;
      },
      update: (s) => {
        // Orbit the raft: tangential direction around the centre.
        const c = s.perception.raftCenter;
        const dx = s.position.x - c.x;
        const dz = s.position.z - c.z;
        const ang = Math.atan2(dz, dx) + s.circleSign * 0.5;
        const r = s.perception.raftRadius + 9;
        s.tmp.set(c.x + Math.cos(ang) * r, 0, c.z + Math.sin(ang) * r);
        s.steerToward(s.tmp);
        if (s.perception.playerInWater && s.distToPlayer() < DETECT_RADIUS) {
          s.fsm.transition('ChasePlayer');
        } else if (s.stateTimer > 7 && Math.random() < 0.5) {
          s.fsm.transition('AttackRaft');
        } else if (s.stateTimer > 12) {
          s.fsm.transition('Patrol');
        }
      },
    };

    const chase: State<Shark> = {
      name: 'ChasePlayer',
      enter: (s) => {
        s.targetSpeed = 8;
      },
      update: (s) => {
        if (!s.perception.playerInWater || s.distToPlayer() > LOSE_RADIUS) {
          s.fsm.transition('CircleRaft');
          return;
        }
        s.steerToward(s.perception.playerPos);
        // Track the player's depth.
        s.targetDepth = THREE.MathUtils.clamp(
          s.perception.playerPos.y - s.ocean.getHeight(s.position.x, s.position.z),
          -6,
          -0.5,
        );
        if (s.distToPlayer() < 3 && s.biteCooldown <= 0) {
          s.fsm.transition('BitePlayer');
        }
      },
    };

    const bite: State<Shark> = {
      name: 'BitePlayer',
      enter: (s) => {
        s.stateTimer = 0;
        s.hasHitThisLunge = false;
        s.targetSpeed = 1.5; // telegraph: rear back
        s.jawOpen = 0.4;
        s.bus.emit('shark:attack', { target: 'player' });
        s.bus.emit('notify', { message: 'Le requin charge !', kind: 'warn' });
      },
      update: (s) => {
        // 0.0–0.6s telegraph, then lunge.
        if (s.stateTimer < 0.6) {
          s.steerToward(s.perception.playerPos);
          s.targetSpeed = 1.5;
          s.jawOpen = 0.4 + s.stateTimer;
        } else {
          s.targetSpeed = 13;
          s.jawOpen = 1;
          s.steerToward(s.perception.playerPos);
          if (!s.hasHitThisLunge && s.distToPlayer() < 2.6) {
            s.hasHitThisLunge = true;
            s.actions.bitePlayer();
          }
          if (s.stateTimer > 1.3) {
            s.biteCooldown = 3;
            s.fsm.transition('Flee');
          }
        }
      },
      exit: (s) => {
        s.jawOpen = 0;
      },
    };

    const attackRaft: State<Shark> = {
      name: 'AttackRaft',
      enter: (s) => {
        s.stateTimer = 0;
        s.hasHitThisLunge = false;
        s.targetSpeed = 9;
        s.targetDepth = -1.2;
        s.jawOpen = 0.7;
        s.bus.emit('shark:attack', { target: 'raft' });
      },
      update: (s) => {
        s.steerToward(s.perception.raftCenter);
        if (!s.hasHitThisLunge && s.distToRaft() < s.perception.raftRadius + 2.5) {
          s.hasHitThisLunge = true;
          s.actions.attackRaft(s.position);
        }
        if (s.perception.playerInWater && s.distToPlayer() < DETECT_RADIUS * 0.6) {
          s.fsm.transition('ChasePlayer');
        } else if (s.stateTimer > 2.5) {
          s.fsm.transition('Flee');
        }
      },
      exit: (s) => {
        s.jawOpen = 0;
      },
    };

    const flee: State<Shark> = {
      name: 'Flee',
      enter: (s) => {
        s.stateTimer = 0;
        s.targetSpeed = 11;
        s.targetDepth = -4.5;
      },
      update: (s) => {
        // Swim directly away from the player/raft.
        s.tmp.copy(s.position).sub(s.perception.raftCenter);
        s.tmp.y = 0;
        s.tmp.normalize().multiplyScalar(40).add(s.position);
        s.steerToward(s.tmp);
        if (s.stateTimer > 4) s.fsm.transition('Patrol');
      },
    };

    const stunned: State<Shark> = {
      name: 'Stunned',
      enter: (s) => {
        s.stateTimer = 0;
        s.targetSpeed = 0.5;
        s.jawOpen = 0.2;
        s.bus.emit('notify', { message: 'Le requin est touché !', kind: 'good' });
      },
      update: (s) => {
        if (s.stateTimer > 0.8) s.fsm.transition('Flee');
      },
      exit: (s) => {
        s.jawOpen = 0;
      },
    };

    const dead: State<Shark> = {
      name: 'Dead',
      enter: (s) => {
        s.stateTimer = 0;
        s.alive = false;
        s.targetSpeed = 0;
        s.respawnTimer = RESPAWN_DELAY;
        s.actions.dropLoot(s.position.clone());
        s.bus.emit('notify', { message: 'Le requin a été vaincu !', kind: 'good' });
      },
      update: (s, dt) => {
        // Sink slowly, roll over.
        s.position.y -= dt * 1.2;
        s.model.root.rotation.z += dt * 0.5;
        s.respawnTimer -= dt;
        if (s.position.y < s.ocean.getHeight(s.position.x, s.position.z) - 12) {
          s.model.root.visible = false;
        }
        if (s.respawnTimer <= 0) {
          // Respawn far from the player.
          const a = Math.random() * Math.PI * 2;
          const r = 60;
          s.spawn(
            new THREE.Vector3(
              s.perception.playerPos.x + Math.cos(a) * r,
              s.ocean.getHeight(0, 0) - 3,
              s.perception.playerPos.z + Math.sin(a) * r,
            ),
          );
        }
      },
    };

    this.fsm
      .add(patrol)
      .add(investigate)
      .add(circleRaft)
      .add(chase)
      .add(bite)
      .add(attackRaft)
      .add(flee)
      .add(stunned)
      .add(dead);
  }

  serialize(): SharkSnapshot {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      health: this.health,
      state: this.fsm.currentName,
    };
  }

  load(s: SharkSnapshot): void {
    this.position.set(s.x, s.y, s.z);
    this.health = s.health;
    this.alive = s.health > 0;
    this.fsm.transition(s.health > 0 ? 'Patrol' : 'Patrol');
  }

  dispose(): void {
    this.model.dispose();
    this.model.root.parent?.remove(this.model.root);
  }
}
