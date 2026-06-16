/**
 * Pure grid-occupancy logic for the raft — no rendering, fully unit-testable.
 * Tracks which cells hold foundations, decks (stations) and walls (per edge),
 * and enforces placement rules (adjacency / no overlap). RaftManager delegates
 * all validity decisions here so the rules have a single source of truth.
 */
export class BuildingGrid {
  private foundations = new Set<string>();
  private decks = new Set<string>();
  private walls = new Set<string>();

  key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }
  wallKey(cx: number, cz: number, edge: number): string {
    return `${cx},${cz},${edge}`;
  }

  hasFoundation(cx: number, cz: number): boolean {
    return this.foundations.has(this.key(cx, cz));
  }
  hasDeck(cx: number, cz: number): boolean {
    return this.decks.has(this.key(cx, cz));
  }
  hasWall(cx: number, cz: number, edge: number): boolean {
    return this.walls.has(this.wallKey(cx, cz, edge));
  }

  get foundationCount(): number {
    return this.foundations.size;
  }

  /** A new foundation must touch the existing structure (unless detached/first). */
  isAdjacent(cx: number, cz: number): boolean {
    return (
      this.hasFoundation(cx + 1, cz) ||
      this.hasFoundation(cx - 1, cz) ||
      this.hasFoundation(cx, cz + 1) ||
      this.hasFoundation(cx, cz - 1)
    );
  }

  canPlaceFoundation(cx: number, cz: number, allowDetached = false): boolean {
    if (this.hasFoundation(cx, cz)) return false;
    return allowDetached || this.foundations.size === 0 || this.isAdjacent(cx, cz);
  }
  canPlaceDeck(cx: number, cz: number): boolean {
    return this.hasFoundation(cx, cz) && !this.hasDeck(cx, cz);
  }
  canPlaceWall(cx: number, cz: number, edge: number): boolean {
    return this.hasFoundation(cx, cz) && !this.hasWall(cx, cz, edge);
  }

  addFoundation(cx: number, cz: number): void {
    this.foundations.add(this.key(cx, cz));
  }
  addDeck(cx: number, cz: number): void {
    this.decks.add(this.key(cx, cz));
  }
  addWall(cx: number, cz: number, edge: number): void {
    this.walls.add(this.wallKey(cx, cz, edge));
  }

  removeFoundation(cx: number, cz: number): void {
    this.foundations.delete(this.key(cx, cz));
  }
  removeDeck(cx: number, cz: number): void {
    this.decks.delete(this.key(cx, cz));
  }
  removeWall(cx: number, cz: number, edge: number): void {
    this.walls.delete(this.wallKey(cx, cz, edge));
  }

  /** True if a foundation cell still carries a deck or any wall (blocks removal). */
  carries(cx: number, cz: number): boolean {
    return this.hasDeck(cx, cz) || [0, 1, 2, 3].some((e) => this.hasWall(cx, cz, e));
  }

  clear(): void {
    this.foundations.clear();
    this.decks.clear();
    this.walls.clear();
  }
}
