import { ItemDatabase } from './ItemDatabase';

export interface ItemStack {
  itemId: string;
  count: number;
  /** Remaining durability for tools/weapons; undefined for stackables. */
  durability?: number;
}

export interface InventorySnapshot {
  size: number;
  hotbarSize: number;
  slots: (ItemStack | null)[];
  selected: number;
}

/**
 * Grid inventory with a hotbar at the front (slots [0, hotbarSize)).
 * Pure data + logic — no rendering. Fully serialisable for saves.
 */
export class Inventory {
  readonly size: number;
  readonly hotbarSize: number;
  private slots: (ItemStack | null)[];
  selected = 0;
  private listeners = new Set<() => void>();

  constructor(size = 24, hotbarSize = 5) {
    this.size = size;
    this.hotbarSize = hotbarSize;
    this.slots = new Array<ItemStack | null>(size).fill(null);
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }

  getSlots(): readonly (ItemStack | null)[] {
    return this.slots;
  }

  getSlot(i: number): ItemStack | null {
    return this.slots[i] ?? null;
  }

  selectedStack(): ItemStack | null {
    return this.slots[this.selected] ?? null;
  }

  selectHotbar(i: number): void {
    if (i >= 0 && i < this.hotbarSize) {
      this.selected = i;
      this.changed();
    }
  }

  /** Total count of an item across all slots. */
  count(itemId: string): number {
    let total = 0;
    for (const s of this.slots) if (s && s.itemId === itemId) total += s.count;
    return total;
  }

  has(itemId: string, amount = 1): boolean {
    return this.count(itemId) >= amount;
  }

  /**
   * Adds items, filling existing stacks first, then empty slots.
   * Returns the leftover amount that did not fit (0 if everything fit).
   */
  add(itemId: string, amount: number, durability?: number): number {
    if (amount <= 0) return 0;
    const max = ItemDatabase.maxStack(itemId);
    let remaining = amount;

    // Non-stackable (tools): one per slot, keep durability.
    if (max === 1) {
      for (let i = 0; i < this.size && remaining > 0; i++) {
        if (!this.slots[i]) {
          this.slots[i] = {
            itemId,
            count: 1,
            durability: durability ?? ItemDatabase.get(itemId).tool?.durability,
          };
          remaining--;
        }
      }
      if (remaining !== amount) this.changed();
      return remaining;
    }

    // Top up existing stacks.
    for (let i = 0; i < this.size && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.itemId === itemId && s.count < max) {
        const add = Math.min(max - s.count, remaining);
        s.count += add;
        remaining -= add;
      }
    }
    // New stacks.
    for (let i = 0; i < this.size && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(max, remaining);
        this.slots[i] = { itemId, count: add };
        remaining -= add;
      }
    }
    if (remaining !== amount) this.changed();
    return remaining;
  }

  /** Removes up to `amount`; returns how many were actually removed. */
  remove(itemId: string, amount: number): number {
    let toRemove = amount;
    let removed = 0;
    for (let i = 0; i < this.size && toRemove > 0; i++) {
      const s = this.slots[i];
      if (s && s.itemId === itemId) {
        const take = Math.min(s.count, toRemove);
        s.count -= take;
        toRemove -= take;
        removed += take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    if (removed > 0) this.changed();
    return removed;
  }

  removeFromSlot(i: number, amount: number): ItemStack | null {
    const s = this.slots[i];
    if (!s) return null;
    const take = Math.min(s.count, amount);
    const out: ItemStack = { itemId: s.itemId, count: take, durability: s.durability };
    s.count -= take;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
    return out;
  }

  /** Swap or merge two slots (drag & drop). */
  moveSlot(from: number, to: number): void {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return;
    if (b && b.itemId === a.itemId && ItemDatabase.maxStack(a.itemId) > 1) {
      const max = ItemDatabase.maxStack(a.itemId);
      const add = Math.min(max - b.count, a.count);
      b.count += add;
      a.count -= add;
      if (a.count <= 0) this.slots[from] = null;
    } else {
      this.slots[from] = b;
      this.slots[to] = a;
    }
    this.changed();
  }

  /** Split a stack: half moves to the first empty slot (right-click). */
  splitSlot(i: number): void {
    const s = this.slots[i];
    if (!s || s.count < 2) return;
    const half = Math.floor(s.count / 2);
    const empty = this.slots.findIndex((x) => x === null);
    if (empty < 0) return;
    s.count -= half;
    this.slots[empty] = { itemId: s.itemId, count: half };
    this.changed();
  }

  /** Reduce durability of the selected tool; remove if broken. Returns true if broken. */
  damageSelected(amount = 1): boolean {
    const s = this.slots[this.selected];
    if (!s || s.durability === undefined) return false;
    s.durability -= amount;
    if (s.durability <= 0) {
      this.slots[this.selected] = null;
      this.changed();
      return true;
    }
    this.changed();
    return false;
  }

  /** Remove a single item from a slot (e.g. eating, dropping one). */
  consumeSlot(i: number, amount = 1): boolean {
    const s = this.slots[i];
    if (!s) return false;
    s.count -= amount;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
    return true;
  }

  sort(): void {
    const stacks = this.slots.filter((s): s is ItemStack => s !== null);
    // Merge stackables.
    const merged = new Map<string, ItemStack>();
    const tools: ItemStack[] = [];
    for (const s of stacks) {
      if (ItemDatabase.maxStack(s.itemId) === 1) {
        tools.push(s);
        continue;
      }
      const ex = merged.get(s.itemId);
      if (ex) ex.count += s.count;
      else merged.set(s.itemId, { ...s });
    }
    // Re-split to respect max stack.
    const out: ItemStack[] = [...tools];
    for (const s of merged.values()) {
      const max = ItemDatabase.maxStack(s.itemId);
      let c = s.count;
      while (c > 0) {
        const take = Math.min(max, c);
        out.push({ itemId: s.itemId, count: take });
        c -= take;
      }
    }
    out.sort((a, b) => a.itemId.localeCompare(b.itemId));
    this.slots = new Array<ItemStack | null>(this.size).fill(null);
    for (let i = 0; i < out.length && i < this.size; i++) this.slots[i] = out[i] ?? null;
    this.changed();
  }

  serialize(): InventorySnapshot {
    return {
      size: this.size,
      hotbarSize: this.hotbarSize,
      slots: this.slots.map((s) => (s ? { ...s } : null)),
      selected: this.selected,
    };
  }

  load(snap: InventorySnapshot): void {
    this.slots = new Array<ItemStack | null>(this.size).fill(null);
    for (let i = 0; i < this.size; i++) {
      const s = snap.slots[i];
      this.slots[i] = s ? { ...s } : null;
    }
    this.selected = Math.min(snap.selected ?? 0, this.hotbarSize - 1);
    this.changed();
  }

  clear(): void {
    this.slots.fill(null);
    this.changed();
  }
}
