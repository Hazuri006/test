export type RecipeCategory =
  | 'tools'
  | 'weapons'
  | 'building'
  | 'navigation'
  | 'food'
  | 'farming'
  | 'storage'
  | 'equipment'
  | 'machines';

export interface RecipeIngredient {
  itemId: string;
  count: number;
}

export interface Recipe {
  id: string;
  /** Item produced. */
  output: string;
  outputCount: number;
  category: RecipeCategory;
  ingredients: RecipeIngredient[];
  /** Seconds of crafting time (0 = instant). */
  time: number;
  description: string;
  /** If true, must be unlocked via the research table first. */
  needsResearch: boolean;
}

const RECIPES: Recipe[] = [
  // Refining
  r('rope', 'rope', 1, 'building', [['fiber', 2]], 0, 'Tresse deux fibres en cordage.', false),
  r(
    'nail',
    'nail',
    2,
    'building',
    [['scrap', 1]],
    0,
    'Forge des clous à partir de ferraille.',
    false,
  ),
  r('plank', 'plank', 1, 'building', [['wood', 2]], 1, 'Sèche et ponce le bois flotté.', false),

  // Tools
  r(
    'hammer',
    'hammer',
    1,
    'tools',
    [
      ['wood', 3],
      ['plastic', 2],
    ],
    1,
    'Outil de construction.',
    false,
  ),
  r(
    'axe',
    'axe',
    1,
    'tools',
    [
      ['wood', 3],
      ['scrap', 2],
      ['rope', 1],
    ],
    1,
    'Abat les arbres.',
    false,
  ),
  r(
    'fishing_rod',
    'fishing_rod',
    1,
    'tools',
    [
      ['wood', 4],
      ['rope', 2],
      ['plastic', 1],
    ],
    2,
    'Pêche en mer.',
    false,
  ),

  // Weapons
  r(
    'spear',
    'spear',
    1,
    'weapons',
    [
      ['wood', 3],
      ['rope', 1],
    ],
    1,
    'Repousse le requin.',
    false,
  ),
  r(
    'spear_metal',
    'spear_metal',
    1,
    'weapons',
    [
      ['wood', 2],
      ['scrap', 3],
      ['rope', 1],
    ],
    2,
    'Lance renforcée.',
    true,
  ),

  // Building
  r('foundation', 'foundation', 1, 'building', [['wood', 4]], 0, 'Étend le radeau.', false),
  r(
    'floor',
    'floor',
    1,
    'building',
    [
      ['wood', 3],
      ['rope', 1],
    ],
    0,
    'Étage supérieur.',
    false,
  ),
  r('wall', 'wall', 1, 'building', [['wood', 3]], 0, 'Paroi de protection.', false),
  r('pillar', 'pillar', 1, 'building', [['wood', 2]], 0, 'Support vertical.', false),

  // Storage / machines
  r(
    'chest',
    'chest',
    1,
    'storage',
    [
      ['wood', 6],
      ['rope', 2],
    ],
    1,
    'Coffre de stockage.',
    false,
  ),
  r(
    'grill',
    'grill',
    1,
    'machines',
    [
      ['wood', 4],
      ['scrap', 4],
      ['rope', 1],
    ],
    2,
    'Cuit la nourriture.',
    false,
  ),
  r(
    'purifier',
    'purifier',
    1,
    'machines',
    [
      ['plastic', 3],
      ['scrap', 2],
      ['wood', 1],
    ],
    2,
    'Purifie l’eau salée.',
    false,
  ),
  r(
    'collector',
    'collector',
    1,
    'machines',
    [
      ['wood', 4],
      ['rope', 3],
      ['plastic', 2],
    ],
    2,
    'Récupère les débris.',
    true,
  ),
  r(
    'research_table',
    'research_table',
    1,
    'machines',
    [
      ['wood', 6],
      ['plastic', 4],
      ['scrap', 2],
    ],
    2,
    'Débloque des recettes.',
    false,
  ),

  // Farming
  r(
    'planter',
    'planter',
    1,
    'farming',
    [
      ['wood', 4],
      ['fiber', 2],
      ['clay', 1],
    ],
    1,
    'Cultive des plantes.',
    false,
  ),
  r(
    'seed_potato',
    'seed_potato',
    2,
    'farming',
    [['crop_potato', 1]],
    0,
    'Récupère des graines.',
    false,
  ),

  // Equipment
  r(
    'saltwater',
    'saltwater',
    1,
    'equipment',
    [['plastic', 1]],
    0,
    'Puise de l’eau de mer dans un gobelet.',
    false,
  ),
];

function r(
  id: string,
  output: string,
  outputCount: number,
  category: RecipeCategory,
  ingredients: [string, number][],
  time: number,
  description: string,
  needsResearch: boolean,
): Recipe {
  return {
    id,
    output,
    outputCount,
    category,
    ingredients: ingredients.map(([itemId, count]) => ({ itemId, count })),
    time,
    description,
    needsResearch,
  };
}

const MAP = new Map(RECIPES.map((rec) => [rec.id, rec]));

export const RecipeDatabase = {
  get(id: string): Recipe | undefined {
    return MAP.get(id);
  },
  all(): Recipe[] {
    return [...MAP.values()];
  },
  byCategory(cat: RecipeCategory): Recipe[] {
    return RECIPES.filter((rec) => rec.category === cat);
  },
  /** Recipes unlocked from the start (no research required). */
  defaultUnlocked(): string[] {
    return RECIPES.filter((rec) => !rec.needsResearch).map((rec) => rec.id);
  },
};
