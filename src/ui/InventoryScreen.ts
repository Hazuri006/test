import { el, clear } from './dom';
import { IconFactory } from './IconFactory';
import { Inventory } from '../inventory/Inventory';
import { ItemDatabase } from '../inventory/ItemDatabase';
import { CraftingSystem } from '../crafting/CraftingSystem';
import { RecipeDatabase, type Recipe } from '../crafting/RecipeDatabase';

export interface InventoryCallbacks {
  onUseItem(index: number): void;
  onEnterBuild(buildingId: string): void;
  onDropItem(index: number): void;
}

type Tab = 'inv' | 'craft' | 'build' | 'research';

/**
 * Combined inventory / crafting / construction / research screen with
 * drag-and-drop, right-click split, tooltips and live affordability.
 */
export class InventoryScreen {
  readonly root: HTMLElement;
  private gridEl: HTMLElement;
  private rightTitle: HTMLElement;
  private rightBody: HTMLElement;
  private tooltip: HTMLElement;
  private tabsEl: HTMLElement;
  private tab: Tab = 'inv';
  open = false;

  private dragFrom = -1;
  private ghost: HTMLElement | null = null;
  private craftCategory = 'tools';

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly crafting: CraftingSystem,
    private readonly cb: InventoryCallbacks,
  ) {
    this.root = el('div', { class: 'screen overlay hidden' });

    // Left: inventory grid.
    const left = el('div', { class: 'panel window' });
    left.append(el('h2', { text: 'Inventaire' }));
    this.gridEl = el('div', { class: 'grid' });
    left.append(this.gridEl);
    left.append(
      el('div', {
        class: 'hint',
        text: 'Glisser-déposer pour ranger · Clic droit pour diviser · Clic pour utiliser/équiper · Tab pour fermer',
      }),
    );

    // Right: tabs (craft/build/research).
    const right = el('div', { class: 'panel window' });
    this.tabsEl = el('div', { class: 'tabs' });
    right.append(this.tabsEl);
    this.rightTitle = el('h2', { text: 'Fabrication' });
    right.append(this.rightTitle);
    this.rightBody = el('div', {});
    right.append(this.rightBody);

    this.root.append(left, right);
    this.tooltip = el('div', { class: 'tooltip' });
    document.body.append(this.tooltip);
    parent.append(this.root);

    this.buildTabs();
    this.inventory.onChange(() => {
      if (this.open) this.refresh();
    });

    document.addEventListener('mousemove', (e) => this.onDragMove(e));
    document.addEventListener('mouseup', (e) => this.onGlobalMouseUp(e));
  }

  private buildTabs(): void {
    clear(this.tabsEl);
    const tabs: [Tab, string][] = [
      ['craft', 'Fabrication'],
      ['build', 'Construction'],
      ['research', 'Recherche'],
    ];
    for (const [id, label] of tabs) {
      const t = el('button', { class: `tab ${this.tab === id ? 'active' : ''}`, text: label });
      t.addEventListener('click', () => {
        this.tab = id;
        this.buildTabs();
        this.refresh();
      });
      this.tabsEl.append(t);
    }
  }

  toggle(): void {
    if (this.open) this.close();
    else this.openScreen();
  }

  openScreen(): void {
    this.open = true;
    this.root.classList.remove('hidden');
    if (this.tab === 'inv') this.tab = 'craft';
    this.buildTabs();
    this.refresh();
  }

  close(): void {
    this.open = false;
    this.root.classList.add('hidden');
    this.tooltip.style.display = 'none';
    this.cancelDrag();
  }

  refresh(): void {
    this.renderGrid();
    if (this.tab === 'craft') this.renderCraft();
    else if (this.tab === 'build') this.renderBuild();
    else if (this.tab === 'research') this.renderResearch();
  }

  // ---------------- Inventory grid ----------------
  private renderGrid(): void {
    clear(this.gridEl);
    for (let i = 0; i < this.inventory.size; i++) {
      const stack = this.inventory.getSlot(i);
      const slot = el('div', { class: 'slot' });
      slot.dataset.index = String(i);
      if (stack) {
        const icon = el('div', { class: 'icon' });
        icon.style.backgroundImage = IconFactory.css(stack.itemId);
        slot.append(icon);
        if (stack.count > 1) slot.append(el('span', { class: 'count', text: String(stack.count) }));
        const def = ItemDatabase.get(stack.itemId);
        if (stack.durability !== undefined && def.tool) {
          const dura = el('div', { class: 'dura' });
          dura.style.width = `${(stack.durability / def.tool.durability) * 100}%`;
          slot.append(dura);
        }
        slot.addEventListener('mouseenter', (e) => this.showTooltip(stack.itemId, e));
        slot.addEventListener('mousemove', (e) => this.moveTooltip(e));
        slot.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
      }
      slot.addEventListener('mousedown', (e) => this.onSlotMouseDown(e, i));
      slot.addEventListener('mouseup', (e) => this.onSlotMouseUp(e, i));
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.inventory.splitSlot(i);
      });
      this.gridEl.append(slot);
    }
  }

  private onSlotMouseDown(e: MouseEvent, index: number): void {
    if (e.button !== 0) return;
    if (!this.inventory.getSlot(index)) return;
    this.dragFrom = index;
    const stack = this.inventory.getSlot(index)!;
    this.ghost = el('div', { class: 'icon' });
    Object.assign(this.ghost.style, {
      position: 'fixed',
      width: '40px',
      height: '40px',
      pointerEvents: 'none',
      zIndex: '60',
      backgroundImage: IconFactory.css(stack.itemId),
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      left: `${e.clientX - 20}px`,
      top: `${e.clientY - 20}px`,
    });
    document.body.append(this.ghost);
  }

  private onDragMove(e: MouseEvent): void {
    if (this.ghost) {
      this.ghost.style.left = `${e.clientX - 20}px`;
      this.ghost.style.top = `${e.clientY - 20}px`;
    }
  }

  private onSlotMouseUp(e: MouseEvent, index: number): void {
    if (e.button !== 0 || this.dragFrom < 0) return;
    if (index === this.dragFrom) {
      // Treat as a click: use/equip the item.
      this.cb.onUseItem(index);
    } else {
      this.inventory.moveSlot(this.dragFrom, index);
    }
    this.cancelDrag();
  }

  private onGlobalMouseUp(e: MouseEvent): void {
    if (this.dragFrom < 0) return;
    const overSlot = (e.target as HTMLElement)?.closest('.slot');
    const overWindow = (e.target as HTMLElement)?.closest('.window');
    if (!overSlot && !overWindow && this.open) {
      // Dropped outside the inventory → drop into the world.
      this.cb.onDropItem(this.dragFrom);
    }
    this.cancelDrag();
  }

  private cancelDrag(): void {
    this.dragFrom = -1;
    this.ghost?.remove();
    this.ghost = null;
  }

  // ---------------- Tooltips ----------------
  private showTooltip(itemId: string, e: MouseEvent): void {
    const def = ItemDatabase.get(itemId);
    const parts = [
      `<div class="tname">${def.name}</div>`,
      `<div class="tcat">${def.category}</div>`,
    ];
    if (def.food) {
      const f = def.food;
      const bits: string[] = [];
      if (f.hunger) bits.push(`Faim ${f.hunger > 0 ? '+' : ''}${f.hunger}`);
      if (f.thirst) bits.push(`Soif ${f.thirst > 0 ? '+' : ''}${f.thirst}`);
      if (f.health) bits.push(`PV ${f.health > 0 ? '+' : ''}${f.health}`);
      parts.push(`<div class="tdesc">${bits.join(' · ')}</div>`);
    }
    if (def.tool)
      parts.push(
        `<div class="tdesc">Puissance ${def.tool.power} · Portée ${def.tool.reach}m</div>`,
      );
    parts.push(`<div class="tdesc">${def.description}</div>`);
    this.tooltip.innerHTML = parts.join('');
    this.tooltip.style.display = 'block';
    this.moveTooltip(e);
  }

  private moveTooltip(e: MouseEvent): void {
    this.tooltip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 240)}px`;
    this.tooltip.style.top = `${e.clientY + 14}px`;
  }

  // ---------------- Crafting ----------------
  private renderCraft(): void {
    this.rightTitle.textContent = 'Fabrication';
    clear(this.rightBody);
    const cats: [string, string][] = [
      ['tools', 'Outils'],
      ['weapons', 'Armes'],
      ['building', 'Matériaux'],
      ['food', 'Cuisine'],
      ['farming', 'Agriculture'],
      ['equipment', 'Équipement'],
    ];
    const subTabs = el('div', { class: 'tabs' });
    for (const [id, label] of cats) {
      const t = el('button', {
        class: `tab ${this.craftCategory === id ? 'active' : ''}`,
        text: label,
      });
      t.addEventListener('click', () => {
        this.craftCategory = id;
        this.renderCraft();
      });
      subTabs.append(t);
    }
    this.rightBody.append(subTabs);

    const recipes = RecipeDatabase.all().filter(
      (r) =>
        r.category === this.craftCategory &&
        ItemDatabase.get(r.output).category !== 'placeable' &&
        this.crafting.isUnlocked(r.id),
    );
    if (recipes.length === 0) {
      this.rightBody.append(
        el('div', { class: 'hint', text: 'Aucune recette dans cette catégorie.' }),
      );
    }
    for (const r of recipes)
      this.rightBody.append(this.recipeRow(r, () => this.crafting.craft(r.id)));
  }

  private renderBuild(): void {
    this.rightTitle.textContent = 'Construction';
    clear(this.rightBody);
    this.rightBody.append(
      el('div', {
        class: 'hint',
        text: 'Choisissez une pièce, puis cliquez dans le monde pour la poser (R pour pivoter).',
      }),
    );
    const recipes = RecipeDatabase.all().filter(
      (r) => ItemDatabase.get(r.output).category === 'placeable' && this.crafting.isUnlocked(r.id),
    );
    for (const r of recipes) {
      this.rightBody.append(
        this.recipeRow(r, () => {
          this.cb.onEnterBuild(r.output);
          this.close();
        }),
      );
    }
  }

  private renderResearch(): void {
    this.rightTitle.textContent = 'Table de recherche';
    clear(this.rightBody);
    const list = this.crafting.researchable();
    if (list.length === 0) {
      this.rightBody.append(
        el('div', { class: 'hint', text: 'Toutes les recettes sont débloquées.' }),
      );
    }
    this.rightBody.append(
      el('div', {
        class: 'hint',
        text: 'Sacrifiez un exemplaire de chaque ingrédient pour débloquer la recette.',
      }),
    );
    for (const r of list) {
      this.rightBody.append(this.recipeRow(r, () => this.crafting.research(r.id), true));
    }
  }

  private recipeRow(r: Recipe, onClick: () => void, research = false): HTMLElement {
    const def = ItemDatabase.get(r.output);
    const icon = el('div', { class: 'ricon' });
    icon.style.backgroundImage = IconFactory.css(r.output);
    const costBits = r.ingredients.map((ing) => {
      const have = this.inventory.count(ing.itemId);
      const need = research ? 1 : ing.count;
      const cls = have >= need ? 'ok' : 'miss';
      return `<span class="${cls}">${ItemDatabase.get(ing.itemId).name} ${have}/${need}</span>`;
    });
    const info = el('div', { class: 'rinfo' }, [
      el('div', {
        class: 'rname',
        text: `${def.name}${r.outputCount > 1 ? ` ×${r.outputCount}` : ''}`,
      }),
      el('div', { class: 'rcost', html: costBits.join(' · ') }),
    ]);
    const affordable = research
      ? r.ingredients.every((i) => this.inventory.has(i.itemId, 1))
      : this.crafting.canCraft(r.id);
    const row = el('div', { class: `recipe ${affordable ? '' : 'locked'}` }, [icon, info]);
    row.addEventListener('click', () => {
      onClick();
      this.refresh();
    });
    row.addEventListener('mouseenter', (e) => this.showTooltip(r.output, e));
    row.addEventListener('mousemove', (e) => this.moveTooltip(e));
    row.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
    return row;
  }
}
