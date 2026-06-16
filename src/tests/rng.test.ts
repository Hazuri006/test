import { describe, it, expect } from 'vitest';
import { RNG } from '../core/RNG';

describe('RNG determinism', () => {
  it('produces identical sequences for the same seed', () => {
    const a = new RNG(42);
    const b = new RNG(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new RNG(1);
    const b = new RNG(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('keeps values within range', () => {
    const r = new RNG(7);
    for (let i = 0; i < 100; i++) {
      const v = r.range(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
      const n = r.int(0, 3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('hashSeed is deterministic and order-sensitive', () => {
    expect(RNG.hashSeed('a', 1)).toBe(RNG.hashSeed('a', 1));
    expect(RNG.hashSeed('a', 1)).not.toBe(RNG.hashSeed('a', 2));
    expect(RNG.hashSeed('a', 'b')).not.toBe(RNG.hashSeed('b', 'a'));
  });

  it('island positions are reproducible from a world seed', () => {
    // Mirrors IslandManager position derivation to lock determinism.
    const positions = (seed: number) =>
      [0, 1, 2].map((i) => {
        const r = new RNG(RNG.hashSeed(seed, 'island', i));
        const dist = i === 0 ? r.range(95, 130) : r.range(220, 520);
        const angle = r.range(0, Math.PI * 2);
        return [Math.cos(angle) * dist, Math.sin(angle) * dist];
      });
    expect(positions(999)).toEqual(positions(999));
    expect(positions(999)).not.toEqual(positions(1000));
  });
});
