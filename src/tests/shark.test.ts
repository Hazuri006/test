import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EventBus, type GameEvents } from '../core/EventBus';
import { Shark, type SharkPerception } from '../entities/Shark';
import type { OceanManager } from '../world/ocean/OceanManager';

// Minimal ocean stub: flat sea, upward normal. Avoids WebGL/canvas in tests.
const oceanStub = {
  getHeight: () => 0,
  getNormal: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
  get currentTime() {
    return 0;
  },
} as unknown as OceanManager;

function makeShark() {
  const scene = new THREE.Scene();
  const bus = new EventBus<GameEvents>();
  const shark = new Shark(scene, bus, oceanStub);
  shark.spawn(new THREE.Vector3(0, -3, 0));
  return { shark, bus };
}

const farRaft = (): SharkPerception => ({
  playerPos: new THREE.Vector3(0, 0, 0),
  playerInWater: false,
  raftCenter: new THREE.Vector3(0, 0, 200),
  raftRadius: 6,
  islands: [],
});

describe('Shark AI', () => {
  it('starts in Patrol', () => {
    const { shark } = makeShark();
    expect(shark.state).toBe('Patrol');
  });

  it('chases the player when they enter the water within detection range', () => {
    const { shark } = makeShark();
    const p = farRaft();
    p.playerInWater = true;
    p.playerPos.set(5, -2, 0);
    shark.update(0.1, p);
    expect(shark.state).toBe('ChasePlayer');
  });

  it('stays on patrol when the player is safe on the raft', () => {
    const { shark } = makeShark();
    shark.update(0.1, farRaft());
    expect(shark.state).toBe('Patrol');
  });

  it('becomes stunned when hurt and dies when health is depleted', () => {
    const { shark } = makeShark();
    shark.takeDamage(10);
    expect(shark.state).toBe('Stunned');
    expect(shark.alive).toBe(true);

    shark.takeDamage(1000);
    expect(shark.state).toBe('Dead');
    expect(shark.alive).toBe(false);
  });

  it('emits state-change events', () => {
    const { shark, bus } = makeShark();
    const seen: string[] = [];
    bus.on('shark:state', ({ state }) => seen.push(state));
    const p = farRaft();
    p.playerInWater = true;
    p.playerPos.set(4, -2, 0);
    shark.update(0.1, p);
    expect(seen).toContain('ChasePlayer');
  });
});
