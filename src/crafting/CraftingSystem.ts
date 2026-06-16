import type { EventBus, GameEvents } from '../core/EventBus';
import type { Inventory } from '../inventory/Inventory';
import { RecipeDatabase, type Recipe } from './RecipeDatabase';

/**
 * Crafting + research. Tracks which recipes are unlocked, validates
 * ingredients against the inventory and performs the item transformation.
 */
export class CraftingSystem {
  private unlocked = new Set<string>(RecipeDatabase.defaultUnlocked());

  constructor(
    private readonly inventory: Inventory,
    private readonly bus: EventBus<GameEvents>,
  ) {}

  isUnlocked(recipeId: string): boolean {
    return this.unlocked.has(recipeId);
  }

  unlockedRecipes(): Recipe[] {
    return RecipeDatabase.all().filter((r) => this.unlocked.has(r.id));
  }

  canCraft(recipeId: string): boolean {
    const recipe = RecipeDatabase.get(recipeId);
    if (!recipe || !this.unlocked.has(recipeId)) return false;
    return recipe.ingredients.every((ing) => this.inventory.has(ing.itemId, ing.count));
  }

  /** Consumes ingredients and grants the output. Returns success. */
  craft(recipeId: string): boolean {
    const recipe = RecipeDatabase.get(recipeId);
    if (!recipe || !this.canCraft(recipeId)) {
      this.bus.emit('notify', { message: 'Ressources insuffisantes', kind: 'bad' });
      return false;
    }
    for (const ing of recipe.ingredients) this.inventory.remove(ing.itemId, ing.count);
    const leftover = this.inventory.add(recipe.output, recipe.outputCount);
    if (leftover > 0) {
      // Inventory full: refund to avoid losing items.
      for (const ing of recipe.ingredients) this.inventory.add(ing.itemId, ing.count);
      this.inventory.remove(recipe.output, recipe.outputCount - leftover);
      this.bus.emit('notify', { message: 'Inventaire plein', kind: 'warn' });
      return false;
    }
    this.bus.emit('craft:completed', { recipeId });
    return true;
  }

  /** Research: sacrifice items to unlock recipes that require research. */
  research(recipeId: string): boolean {
    const recipe = RecipeDatabase.get(recipeId);
    if (!recipe || this.unlocked.has(recipeId)) return false;
    // Cost: one of each base ingredient type.
    const cost = recipe.ingredients;
    const affordable = cost.every((ing) => this.inventory.has(ing.itemId, 1));
    if (!affordable) {
      this.bus.emit('notify', { message: 'Matériaux manquants pour la recherche', kind: 'bad' });
      return false;
    }
    for (const ing of cost) this.inventory.remove(ing.itemId, 1);
    this.unlocked.add(recipeId);
    this.bus.emit('research:unlocked', { recipeId });
    this.bus.emit('notify', { message: `Recette débloquée : ${recipeId}`, kind: 'good' });
    return true;
  }

  /** Items that can still be researched. */
  researchable(): Recipe[] {
    return RecipeDatabase.all().filter((r) => r.needsResearch && !this.unlocked.has(r.id));
  }

  serialize(): { unlocked: string[] } {
    return { unlocked: [...this.unlocked] };
  }

  load(data: { unlocked: string[] }): void {
    this.unlocked = new Set([...RecipeDatabase.defaultUnlocked(), ...data.unlocked]);
  }
}
