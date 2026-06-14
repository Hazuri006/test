/* ============================================================
 * CHÂTEAU MAUDIT — Configuration 3D (Three.js, vue FPS)
 * Survival-horror réaliste inspiré de Resident Evil
 * Toutes les distances sont en UNITÉS MONDE (1 tuile = TILE u)
 * ============================================================ */

const CONFIG = {
  // Échelle du monde
  TILE: 4,           // unités par tuile
  WALL_H: 4.2,       // hauteur des murs
  EYE: 1.7,          // hauteur des yeux du joueur

  // Joueur (vitesses en unités/seconde)
  WALK: 4.6,
  SPRINT: 7.8,
  PLAYER_RADIUS: 0.62,
  PLAYER_MAX_HP: 100,
  STAMINA_MAX: 100,
  STAMINA_DRAIN: 26,     // /s
  STAMINA_REGEN: 16,     // /s
  INVULN: 0.7,           // s d'invincibilité après un coup
  MOUSE_SENS: 0.0022,
  HEADBOB: 0.06,

  // Combat (temps en secondes)
  GUN_RANGE: 70,
  GUN_DMG: 34,
  FIRE_CD: 0.16,
  START_AMMO: 15,
  AMMO_PICKUP: 8,
  KNIFE_DMG: 26,
  KNIFE_RANGE: 3.4,
  KNIFE_CD: 0.42,
  HEAL_AMOUNT: 45,

  // Ambiance / éclairage
  FOG_DENSITY: 0.045,
  AMBIENT: 0.13,
  FLASH_INTENSITY: 22,
  FLASH_ANGLE: 0.66,         // demi-angle du cône
  FLASH_DIST: 38,
  FLASH_PENUMBRA: 0.5,
  MAX_ACTIVE_TORCHES: 6,     // pour les performances

  // Tuiles
  T_FLOOR: 0,
  T_WALL: 1,
  T_VOID: 2,
};

const SOLID_TILES = new Set([CONFIG.T_WALL, CONFIG.T_VOID]);

// Types de monstres (distances en unités monde)
const MONSTER_TYPES = {
  zombie: {
    name: "Goule errante", hp: 70, speed: 1.7, dmg: 12,
    radius: 0.7, aggro: 28, touch: 1.9, score: 100, height: 1.85, color: 0x5d7a4e,
  },
  hound: {
    name: "Molosse du Cerbère", hp: 44, speed: 4.4, dmg: 9,
    radius: 0.6, aggro: 38, touch: 1.7, score: 150, height: 1.0, color: 0x6e4636,
  },
  crawler: {
    name: "Rampant", hp: 100, speed: 2.5, dmg: 16,
    radius: 0.85, aggro: 24, touch: 2.0, score: 200, height: 1.2, color: 0x7d5283,
  },
  boss: {
    name: "Le Gardien", hp: 640, speed: 2.9, dmg: 26,
    radius: 1.5, aggro: 70, touch: 3.0, score: 1000, height: 3.4, color: 0x8a2424,
  },
};

// Objets ramassables
const ITEM_TYPES = {
  ammo:     { name: "Munitions",          icon: "🔫", desc: "Balles de pistolet (+8)." },
  herb:     { name: "Herbe verte",        icon: "🌿", desc: "Restaure 45 PV une fois consommée." },
  rustyKey: { name: "Clé rouillée",       icon: "🗝️", desc: "Ouvre la porte de la Bibliothèque." },
  labKey:   { name: "Clé du Laboratoire", icon: "🔑", desc: "Ouvre le Laboratoire interdit." },
  cure:     { name: "Sérum-G",            icon: "🧪", desc: "L'antidote. Permet de fuir le château." },
  note:     { name: "Document",           icon: "📜", desc: "Une page arrachée d'un journal." },
};
