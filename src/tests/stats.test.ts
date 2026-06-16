import { describe, it, expect, vi } from 'vitest';
import { EventBus, type GameEvents } from '../core/EventBus';
import { PlayerStats } from '../player/PlayerStats';

const ctx = { sprinting: false, underwater: false, moving: false, cold: 0 };

describe('PlayerStats', () => {
  it('drains hunger and thirst over time', () => {
    const stats = new PlayerStats(new EventBus<GameEvents>());
    stats.update(10, ctx);
    expect(stats.hunger).toBeLessThan(100);
    expect(stats.thirst).toBeLessThan(100);
  });

  it('damages health when starving', () => {
    const stats = new PlayerStats(new EventBus<GameEvents>());
    stats.hunger = 0;
    stats.thirst = 50;
    const before = stats.health;
    stats.update(2, ctx);
    expect(stats.health).toBeLessThan(before);
  });

  it('drains oxygen underwater and damages when empty', () => {
    const stats = new PlayerStats(new EventBus<GameEvents>());
    stats.oxygen = 0;
    const before = stats.health;
    stats.update(1, { ...ctx, underwater: true });
    expect(stats.health).toBeLessThan(before);
  });

  it('applies food effects (clamped)', () => {
    const stats = new PlayerStats(new EventBus<GameEvents>());
    stats.hunger = 50;
    stats.applyFood({ hunger: 30, thirst: 10 });
    expect(stats.hunger).toBe(80);
    stats.applyFood({ hunger: 100 });
    expect(stats.hunger).toBe(100);
  });

  it('emits death once when health hits zero', () => {
    const bus = new EventBus<GameEvents>();
    const onDeath = vi.fn();
    bus.on('player:death', onDeath);
    const stats = new PlayerStats(bus);
    stats.damage(200, 'test');
    stats.damage(50, 'test');
    expect(stats.dead).toBe(true);
    expect(onDeath).toHaveBeenCalledTimes(1);
  });

  it('round-trips through serialize/load', () => {
    const stats = new PlayerStats(new EventBus<GameEvents>());
    stats.health = 73;
    stats.hunger = 41;
    stats.thirst = 22;
    const snap = stats.serialize();
    const restored = new PlayerStats(new EventBus<GameEvents>());
    restored.load(snap);
    expect(restored.health).toBe(73);
    expect(restored.hunger).toBe(41);
    expect(restored.thirst).toBe(22);
  });
});
