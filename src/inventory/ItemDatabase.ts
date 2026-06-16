export type ItemCategory =
  | 'resource'
  | 'food'
  | 'drink'
  | 'tool'
  | 'weapon'
  | 'placeable'
  | 'seed'
  | 'misc';

export interface FoodEffect {
  hunger?: number;
  thirst?: number;
  health?: number;
  /** Temporary stamina-regen buff duration in seconds. */
  staminaBuff?: number;
}

export interface ToolStats {
  durability: number;
  /** Damage to entities / chopping power. */
  power: number;
  /** Interaction reach in metres. */
  reach: number;
  tier: number;
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  maxStack: number;
  description: string;
  /** Base icon colour (CSS). */
  color: string;
  /** Secondary icon colour for gradient. */
  color2?: string;
  /** Short label/glyph drawn on the procedural icon. */
  glyph: string;
  food?: FoodEffect;
  tool?: ToolStats;
  /** If set, using/placing this item spawns the given building. */
  placeableId?: string;
  /** Item this seed grows into. */
  growsInto?: string;
  /** Item this raw food becomes when cooked. */
  cookInto?: string;
  /** Seconds to cook on a grill. */
  cookTime?: number;
}

const DEFS: ItemDef[] = [
  // ---- Raw resources --------------------------------------------------------
  {
    id: 'wood',
    name: 'Bois flotté',
    category: 'resource',
    maxStack: 64,
    description: 'Planche imbibée d’eau de mer. Matériau de base de la construction.',
    color: '#8a5a2b',
    color2: '#5e3c18',
    glyph: 'Bo',
  },
  {
    id: 'plastic',
    name: 'Plastique',
    category: 'resource',
    maxStack: 64,
    description: 'Débris synthétiques. Léger, imputrescible, recyclable.',
    color: '#3aa6b9',
    color2: '#1f6b78',
    glyph: 'Pl',
  },
  {
    id: 'fiber',
    name: 'Fibre végétale',
    category: 'resource',
    maxStack: 64,
    description: 'Feuilles et algues séchées. Sert à tresser de la corde.',
    color: '#5fa83f',
    color2: '#356b22',
    glyph: 'Fi',
  },
  {
    id: 'scrap',
    name: 'Ferraille',
    category: 'resource',
    maxStack: 48,
    description: 'Métal rouillé récupéré sur des débris et des épaves.',
    color: '#9aa0a8',
    color2: '#5b6068',
    glyph: 'Fe',
  },
  {
    id: 'clay',
    name: 'Argile',
    category: 'resource',
    maxStack: 48,
    description: 'Argile humide extraite des îles. Utile pour les contenants.',
    color: '#b5734a',
    color2: '#7d4c2d',
    glyph: 'Ar',
  },
  {
    id: 'stone',
    name: 'Pierre',
    category: 'resource',
    maxStack: 48,
    description: 'Roche concassée trouvée sur les îles rocheuses.',
    color: '#8d8d92',
    color2: '#55555a',
    glyph: 'Pi',
  },

  // ---- Refined resources ----------------------------------------------------
  {
    id: 'rope',
    name: 'Corde',
    category: 'resource',
    maxStack: 32,
    description: 'Cordage tressé. Indispensable pour les structures et outils.',
    color: '#cBA967',
    color2: '#8a7536',
    glyph: 'Co',
  },
  {
    id: 'nail',
    name: 'Clou',
    category: 'resource',
    maxStack: 64,
    description: 'Pointe forgée à partir de ferraille.',
    color: '#c2c6cc',
    color2: '#7d8088',
    glyph: 'Cl',
  },
  {
    id: 'plank',
    name: 'Planche traitée',
    category: 'resource',
    maxStack: 64,
    description: 'Bois séché et poncé, plus résistant que le bois flotté.',
    color: '#b98a4f',
    color2: '#7c5828',
    glyph: 'Pk',
  },

  // ---- Food & drink ---------------------------------------------------------
  {
    id: 'coconut',
    name: 'Noix de coco',
    category: 'food',
    maxStack: 16,
    description: 'Restaure un peu de faim et de soif.',
    color: '#8d6240',
    color2: '#5a3c25',
    glyph: 'Nc',
    food: { hunger: 14, thirst: 12 },
  },
  {
    id: 'raw_fish',
    name: 'Poisson cru',
    category: 'food',
    maxStack: 16,
    description: 'Comestible, mais risqué. Cuisez-le sur un grill.',
    color: '#9fb6c2',
    color2: '#5f7681',
    glyph: 'Po',
    food: { hunger: 8, health: -4 },
    cookInto: 'cooked_fish',
    cookTime: 14,
  },
  {
    id: 'cooked_fish',
    name: 'Poisson grillé',
    category: 'food',
    maxStack: 16,
    description: 'Nourrissant et sûr. Restaure faim et un peu de santé.',
    color: '#d79a5b',
    color2: '#9c6831',
    glyph: 'Pg',
    food: { hunger: 30, health: 6, staminaBuff: 20 },
    cookInto: 'charred_fish',
    cookTime: 22,
  },
  {
    id: 'charred_fish',
    name: 'Poisson brûlé',
    category: 'food',
    maxStack: 16,
    description: 'Trop cuit. Comestible mais peu nourrissant.',
    color: '#3c3026',
    color2: '#21190f',
    glyph: 'Pb',
    food: { hunger: 6 },
  },
  {
    id: 'crop_potato',
    name: 'Tubercule',
    category: 'food',
    maxStack: 16,
    description: 'Légume-racine cultivé en jardinière.',
    color: '#c8a86a',
    color2: '#8a7038',
    glyph: 'Tu',
    food: { hunger: 18 },
  },
  {
    id: 'saltwater',
    name: 'Eau salée',
    category: 'drink',
    maxStack: 8,
    description: 'Eau de mer brute. La boire telle quelle aggrave la soif !',
    color: '#2e6e8e',
    color2: '#14384a',
    glyph: 'Es',
    food: { thirst: -10, health: -3 },
  },
  {
    id: 'freshwater',
    name: 'Eau potable',
    category: 'drink',
    maxStack: 8,
    description: 'Eau purifiée. Étanche efficacement la soif.',
    color: '#54b6e6',
    color2: '#2a7aa8',
    glyph: 'Ep',
    food: { thirst: 32 },
  },

  // ---- Seeds ----------------------------------------------------------------
  {
    id: 'seed_potato',
    name: 'Graine de tubercule',
    category: 'seed',
    maxStack: 16,
    description: 'À planter dans une jardinière.',
    color: '#7a8a3f',
    color2: '#4c5824',
    glyph: 'Gr',
    growsInto: 'crop_potato',
  },

  // ---- Tools ----------------------------------------------------------------
  {
    id: 'hook',
    name: 'Crochet de récupération',
    category: 'tool',
    maxStack: 1,
    description: 'Lancez-le pour ramener les débris flottants au loin.',
    color: '#b8b1a0',
    color2: '#7a7464',
    glyph: 'Hk',
    tool: { durability: 200, power: 1, reach: 40, tier: 1 },
  },
  {
    id: 'hammer',
    name: 'Marteau',
    category: 'tool',
    maxStack: 1,
    description: 'Construit, répare et démolit les pièces du radeau.',
    color: '#a9743d',
    color2: '#6e4a24',
    glyph: 'Ma',
    tool: { durability: 250, power: 1, reach: 6, tier: 1 },
  },
  {
    id: 'axe',
    name: 'Hache',
    category: 'tool',
    maxStack: 1,
    description: 'Abat les arbres et brise les caisses.',
    color: '#9a9aa0',
    color2: '#5d5d62',
    glyph: 'Ha',
    tool: { durability: 180, power: 18, reach: 4, tier: 1 },
  },
  {
    id: 'fishing_rod',
    name: 'Canne à pêche',
    category: 'tool',
    maxStack: 1,
    description: 'Lancez la ligne au-dessus de l’eau pour attraper du poisson.',
    color: '#7d5a32',
    color2: '#4e3a20',
    glyph: 'Ca',
    tool: { durability: 120, power: 1, reach: 30, tier: 1 },
  },

  // ---- Weapons --------------------------------------------------------------
  {
    id: 'spear',
    name: 'Lance en bois',
    category: 'weapon',
    maxStack: 1,
    description: 'Repousse le requin. Frappez quand il approche.',
    color: '#8a6a3a',
    color2: '#574023',
    glyph: 'La',
    tool: { durability: 90, power: 14, reach: 4.5, tier: 1 },
  },
  {
    id: 'spear_metal',
    name: 'Lance métallique',
    category: 'weapon',
    maxStack: 1,
    description: 'Lance renforcée, bien plus efficace contre le requin.',
    color: '#aab0ba',
    color2: '#646a74',
    glyph: 'Lm',
    tool: { durability: 200, power: 26, reach: 5, tier: 2 },
  },

  // ---- Placeables (buildings) ----------------------------------------------
  placeable('foundation', 'Fondation', 'Plateforme de base flottante.', '#7a5126', '#4c3216', 'Fd'),
  placeable(
    'floor',
    'Plancher',
    'Étage supérieur posé sur des piliers.',
    '#8a6030',
    '#56391b',
    'Fl',
  ),
  placeable('wall', 'Mur', 'Paroi pleine pour s’abriter du vent.', '#7c5429', '#4a3119', 'Mu'),
  placeable(
    'pillar',
    'Pilier',
    'Support vertical pour étages et toits.',
    '#6e4a24',
    '#3f2a14',
    'Pi',
  ),
  placeable('chest', 'Coffre', 'Stockage de 18 emplacements.', '#7b5a30', '#4a3414', 'Cf'),
  placeable('grill', 'Grill', 'Cuit le poisson et la nourriture.', '#55585e', '#2c2e32', 'Gr'),
  placeable(
    'purifier',
    'Purificateur d’eau',
    'Transforme l’eau salée en eau potable au soleil.',
    '#4f93b0',
    '#27566b',
    'Pu',
  ),
  placeable(
    'planter',
    'Jardinière',
    'Permet de planter et cultiver des graines.',
    '#6a4a2a',
    '#3f2c18',
    'Ja',
  ),
  placeable(
    'collector',
    'Filet de récupération',
    'Capture automatiquement les débris qui passent.',
    '#9c9a7a',
    '#605e44',
    'Nt',
  ),

  // ---- Misc -----------------------------------------------------------------
  {
    id: 'research_table',
    name: 'Table de recherche',
    category: 'placeable',
    maxStack: 8,
    description: 'Analyse des matériaux pour débloquer des recettes.',
    color: '#7a6038',
    color2: '#473921',
    glyph: 'Re',
    placeableId: 'research_table',
  },
];

function placeable(
  id: string,
  name: string,
  description: string,
  color: string,
  color2: string,
  glyph: string,
): ItemDef {
  return {
    id,
    name,
    category: 'placeable',
    maxStack: 32,
    description,
    color,
    color2,
    glyph,
    placeableId: id,
  };
}

const MAP: ReadonlyMap<string, ItemDef> = new Map(DEFS.map((d) => [d.id, d]));

export const ItemDatabase = {
  get(id: string): ItemDef {
    const def = MAP.get(id);
    if (!def) throw new Error(`Unknown item id: ${id}`);
    return def;
  },
  has(id: string): boolean {
    return MAP.has(id);
  },
  all(): ItemDef[] {
    return [...MAP.values()];
  },
  maxStack(id: string): number {
    return MAP.get(id)?.maxStack ?? 1;
  },
};
