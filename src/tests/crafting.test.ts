import { describe, it, expect } from 'vitest';
import { EventBus, type GameEvents } from '../core/EventBus';
import { Inventory } from '../inventory/Inventory';
import { CraftingSystem } from '../crafting/CraftingSystem';

function setup() {
  const bus = new EventBus<GameEvents>();
  const inv = new Inventory(20, 5);
  const crafting = new CraftingSystem(inv, bus);
  return { bus, inv, crafting };
}

describe('CraftingSystem', () => {
  it('crafts a hammer, consuming ingredients and producing output', () => {
    const { inv, crafting } = setup();
    inv.add('wood', 3);
    inv.add('plastic', 2);
    expect(crafting.canCraft('hammer')).toBe(true);
    expect(crafting.craft('hammer')).toBe(true);
    expect(inv.count('hammer')).toBe(1);
    expect(inv.count('wood')).toBe(0);
    expect(inv.count('plastic')).toBe(0);
  });

  it('refuses to craft without enough resources', () => {
    const { inv, crafting } = setup();
    inv.add('wood', 1);
    expect(crafting.canCraft('hammer')).toBe(false);
    expect(crafting.craft('hammer')).toBe(false);
    expect(inv.count('hammer')).toBe(0);
  });

  it('produces the correct output count (nails)', () => {
    const { inv, crafting } = setup();
    inv.add('scrap', 1);
    expect(crafting.craft('nail')).toBe(true);
    expect(inv.count('nail')).toBe(2);
  });

  it('locks research recipes until unlocked', () => {
    const { inv, crafting } = setup();
    inv.add('wood', 2);
    inv.add('scrap', 3);
    inv.add('rope', 1);
    // spear_metal needs research first.
    expect(crafting.isUnlocked('spear_metal')).toBe(false);
    expect(crafting.canCraft('spear_metal')).toBe(false);
    expect(crafting.research('spear_metal')).toBe(true);
    expect(crafting.isUnlocked('spear_metal')).toBe(true);
  });

  it('persists unlocked recipes through serialize/load', () => {
    const { inv, crafting } = setup();
    inv.add('wood', 2);
    inv.add('scrap', 3);
    inv.add('rope', 1);
    crafting.research('spear_metal');
    const snap = crafting.serialize();

    const bus2 = new EventBus<GameEvents>();
    const inv2 = new Inventory(20, 5);
    const crafting2 = new CraftingSystem(inv2, bus2);
    crafting2.load(snap);
    expect(crafting2.isUnlocked('spear_metal')).toBe(true);
  });
});
