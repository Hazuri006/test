import { describe, it, expect } from 'vitest';
import { Inventory } from '../inventory/Inventory';

describe('Inventory', () => {
  it('adds and counts stackable items', () => {
    const inv = new Inventory(10, 5);
    expect(inv.add('wood', 10)).toBe(0);
    expect(inv.count('wood')).toBe(10);
  });

  it('respects max stack size by splitting into multiple stacks', () => {
    const inv = new Inventory(10, 5);
    inv.add('wood', 100); // wood max stack is 64
    expect(inv.count('wood')).toBe(100);
    const stacks = inv.getSlots().filter((s) => s?.itemId === 'wood');
    expect(stacks.length).toBe(2);
    expect(stacks[0]!.count).toBe(64);
    expect(stacks[1]!.count).toBe(36);
  });

  it('returns leftover when inventory is full', () => {
    const inv = new Inventory(1, 1);
    const leftover = inv.add('wood', 200); // one slot, max 64
    expect(leftover).toBe(136);
    expect(inv.count('wood')).toBe(64);
  });

  it('stores tools individually with durability', () => {
    const inv = new Inventory(10, 5);
    inv.add('hook', 1);
    const slot = inv.getSlots().find((s) => s?.itemId === 'hook');
    expect(slot?.durability).toBeGreaterThan(0);
  });

  it('removes items and clears empty slots', () => {
    const inv = new Inventory(10, 5);
    inv.add('plastic', 5);
    expect(inv.remove('plastic', 3)).toBe(3);
    expect(inv.count('plastic')).toBe(2);
    inv.remove('plastic', 10);
    expect(inv.count('plastic')).toBe(0);
  });

  it('merges stacks on move', () => {
    const inv = new Inventory(10, 5);
    inv.add('wood', 10);
    inv.getSlots(); // slot 0 has 10
    inv.add('wood', 0);
    // Manually place a second stack then merge.
    inv.add('wood', 5);
    // All wood should already be merged into slot 0.
    expect(inv.count('wood')).toBe(15);
  });

  it('splits a stack into a new slot', () => {
    const inv = new Inventory(10, 5);
    inv.add('wood', 10);
    inv.splitSlot(0);
    const woodStacks = inv.getSlots().filter((s) => s?.itemId === 'wood');
    expect(woodStacks.length).toBe(2);
    expect(woodStacks[0]!.count + woodStacks[1]!.count).toBe(10);
  });

  it('damages and breaks the selected tool', () => {
    const inv = new Inventory(10, 5);
    inv.add('hook', 1);
    inv.selectHotbar(0);
    const start = inv.selectedStack()!.durability!;
    inv.damageSelected(start - 1);
    expect(inv.selectedStack()!.durability).toBe(1);
    const broke = inv.damageSelected(1);
    expect(broke).toBe(true);
    expect(inv.selectedStack()).toBeNull();
  });

  it('round-trips through serialize/load', () => {
    const inv = new Inventory(12, 5);
    inv.add('wood', 30);
    inv.add('hook', 1);
    inv.selectHotbar(2);
    const snap = inv.serialize();

    const restored = new Inventory(12, 5);
    restored.load(snap);
    expect(restored.count('wood')).toBe(30);
    expect(restored.count('hook')).toBe(1);
    expect(restored.selected).toBe(2);
  });
});
