import { describe, it, expect } from 'vitest';
import { BuildingGrid } from '../raft/BuildingGrid';

describe('BuildingGrid placement', () => {
  it('allows the first foundation anywhere then enforces adjacency', () => {
    const g = new BuildingGrid();
    expect(g.canPlaceFoundation(0, 0)).toBe(true);
    g.addFoundation(0, 0);
    // Occupied cell is rejected.
    expect(g.canPlaceFoundation(0, 0)).toBe(false);
    // Detached cell is rejected.
    expect(g.canPlaceFoundation(5, 5)).toBe(false);
    // Adjacent cell is allowed.
    expect(g.canPlaceFoundation(1, 0)).toBe(true);
  });

  it('allows detached placement only when forced (load)', () => {
    const g = new BuildingGrid();
    g.addFoundation(0, 0);
    expect(g.canPlaceFoundation(9, 9)).toBe(false);
    expect(g.canPlaceFoundation(9, 9, true)).toBe(true);
  });

  it('places decks only on foundations and once per cell', () => {
    const g = new BuildingGrid();
    expect(g.canPlaceDeck(0, 0)).toBe(false); // no foundation
    g.addFoundation(0, 0);
    expect(g.canPlaceDeck(0, 0)).toBe(true);
    g.addDeck(0, 0);
    expect(g.canPlaceDeck(0, 0)).toBe(false);
  });

  it('places walls per edge on foundations', () => {
    const g = new BuildingGrid();
    g.addFoundation(0, 0);
    expect(g.canPlaceWall(0, 0, 0)).toBe(true);
    g.addWall(0, 0, 0);
    expect(g.canPlaceWall(0, 0, 0)).toBe(false);
    expect(g.canPlaceWall(0, 0, 1)).toBe(true); // different edge
  });

  it('reports whether a foundation carries decks/walls', () => {
    const g = new BuildingGrid();
    g.addFoundation(2, 2);
    expect(g.carries(2, 2)).toBe(false);
    g.addDeck(2, 2);
    expect(g.carries(2, 2)).toBe(true);
    g.removeDeck(2, 2);
    expect(g.carries(2, 2)).toBe(false);
    g.addWall(2, 2, 3);
    expect(g.carries(2, 2)).toBe(true);
  });

  it('tracks foundation count and clears', () => {
    const g = new BuildingGrid();
    g.addFoundation(0, 0);
    g.addFoundation(1, 0);
    expect(g.foundationCount).toBe(2);
    g.clear();
    expect(g.foundationCount).toBe(0);
  });
});
