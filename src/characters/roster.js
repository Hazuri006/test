/* ============================================================
   Roster — original fighters. Every value here drives both the
   procedural model and the combat tuning.
   stats are 1..10 and are converted to multipliers at runtime.
   ============================================================ */

export const ROSTER = [
  {
    id: 'kaido',
    name: 'KAIDŌ',
    tag: 'Le Poing du Ciel Clair',
    bio: "Élevé dans les montagnes après la chute de son clan. Se bat pour le plaisir du combat, jamais pour la victoire.",
    build: 'normal', scale: 1.0, hair: 'spiky', outfit: 'gi',
    palette: {
      skin: 0xf2c9a0, hair: 0x1a1620, primary: 0xf07a1c, secondary: 0x1f4fa8,
      accent: 0x2f6fe0, dark: 0x141824, aura: 0x59c8ff, auraCore: 0xffffff, outline: 0x0b1020,
    },
    face: { eyeColor: '#2a4a80', browColor: '#161018', angry: 0.3 },
    stats: { hp: 7, atk: 7, def: 6, speed: 7, ki: 7 },
    moves: {
      blast1: { name: 'Pas Fantôme', type: 'afterimage' },
      blast2: { name: 'Onde Céleste', type: 'beam' },
      ult: { name: 'CANON DU CIEL CLAIR', type: 'beam' },
    },
    transform: {
      name: 'ÉCLAT DORÉ',
      hairStyle: 'flame',
      palette: { hair: 0xffe14a, aura: 0xffd227 },
      boost: { atk: 1.28, speed: 1.22, def: 1.1 },
    },
    voice: 1.0,
  },
  {
    id: 'vaeron',
    name: 'VAERON',
    tag: 'Prince des Cendres',
    bio: "Dernier héritier d'un trône réduit en poussière. Sa fierté est une arme, et elle ne s'émousse jamais.",
    build: 'normal', scale: 0.96, hair: 'flame', outfit: 'battlesuit',
    palette: {
      skin: 0xefc39a, hair: 0x2b2130, primary: 0x1c2233, secondary: 0xd8dee8,
      accent: 0xd8a93c, dark: 0x11151f, aura: 0x9d6bff, auraCore: 0xffffff, outline: 0x080c16,
    },
    face: { eyeColor: '#5a3f86', browColor: '#221a26', angry: 0.75, smirk: true },
    stats: { hp: 6, atk: 8, def: 7, speed: 7, ki: 8 },
    moves: {
      blast1: { name: 'Garde Royale', type: 'guardboost' },
      blast2: { name: 'Lance de Néant', type: 'ball' },
      ult: { name: 'BRISEUR DE GALAXIE', type: 'ball' },
    },
    transform: {
      name: 'ORGUEIL ABSOLU',
      hairStyle: 'flame',
      palette: { hair: 0xf2e7ff, aura: 0xc79bff },
      boost: { atk: 1.34, speed: 1.16, def: 1.14 },
    },
    voice: 0.88,
  },
  {
    id: 'torrin',
    name: 'TORRIN',
    tag: 'Sage de Verdance',
    bio: "Gardien d'un monde sans nom. Il ne frappe qu'après avoir compris son adversaire — ce qui prend rarement longtemps.",
    build: 'normal', scale: 1.06, hair: 'bald', outfit: 'robe', cape: true, capeColor: 0xe8e3d4,
    palette: {
      skin: 0x86c46a, hair: 0x3a5f33, primary: 0x6c3fa8, secondary: 0xe8e3d4,
      accent: 0xd9c96a, dark: 0x1d2b1c, aura: 0x7dff9b, auraCore: 0xeaffe8, outline: 0x0d1a10,
    },
    face: { eyeColor: '#c22d2d', browColor: '#2c4426', angry: 0.5 },
    stats: { hp: 8, atk: 6, def: 8, speed: 5, ki: 7 },
    moves: {
      blast1: { name: 'Régénération', type: 'heal' },
      blast2: { name: 'Rayon Verdoyant', type: 'beam' },
      ult: { name: 'JUGEMENT DE VERDANCE', type: 'beam' },
    },
    transform: {
      name: 'ÉVEIL ANCESTRAL',
      palette: { skin: 0xa8e07f, aura: 0xc8ff7a },
      boost: { atk: 1.2, speed: 1.1, def: 1.3 },
    },
    voice: 0.78,
  },
  {
    id: 'zaira',
    name: 'ZAIRA',
    tag: 'Croc de Nova',
    bio: "Chasseuse de primes interstellaire. Elle frappe trois fois avant que l'écho du premier coup n'arrive.",
    build: 'slim', scale: 0.93, hair: 'ponytail', outfit: 'battlesuit',
    palette: {
      skin: 0xf6d3bb, hair: 0xff4f8b, primary: 0x2a1f3d, secondary: 0xb03a86,
      accent: 0xff89c4, dark: 0x150f22, aura: 0xff5fae, auraCore: 0xffe9f6, outline: 0x0d0716,
    },
    face: { eyeColor: '#c9256b', browColor: '#7a1f45', angry: 0.4, lashes: true, smirk: true },
    stats: { hp: 5, atk: 6, def: 5, speed: 10, ki: 7 },
    moves: {
      blast1: { name: 'Sur-Accélération', type: 'speedboost' },
      blast2: { name: 'Croc de Nova', type: 'rush' },
      ult: { name: 'PLUIE D\'ÉTOILES MORTES', type: 'rain' },
    },
    transform: {
      name: 'MODE PRÉDATEUR',
      palette: { hair: 0xffd0e6, aura: 0xff2f8f },
      boost: { atk: 1.22, speed: 1.4, def: 1.02 },
    },
    voice: 1.25,
  },
  {
    id: 'gordran',
    name: 'GORDRAN',
    tag: 'Montagne Vivante',
    bio: "On raconte qu'il a arrêté une lune. La lune, elle, n'a jamais démenti.",
    build: 'heavy', scale: 1.22, hair: 'horns', outfit: 'armor',
    palette: {
      skin: 0xc0563c, hair: 0xe8dcc0, primary: 0x4a3326, secondary: 0x8a7654,
      accent: 0xe8c05a, dark: 0x241a14, aura: 0xff7a2a, auraCore: 0xffe0a8, outline: 0x140b08,
    },
    face: { eyeColor: '#e8b83c', browColor: '#3a2418', angry: 0.9, scar: true },
    stats: { hp: 10, atk: 9, def: 9, speed: 3, ki: 4 },
    moves: {
      blast1: { name: 'Peau de Roche', type: 'armor' },
      blast2: { name: 'Écrase-Météore', type: 'ball' },
      ult: { name: 'FIN DU MONDE', type: 'ball' },
    },
    transform: {
      name: 'COLÈRE TITANESQUE',
      palette: { skin: 0xe0603c, aura: 0xff3c14 },
      boost: { atk: 1.42, speed: 1.06, def: 1.28 },
    },
    voice: 0.62,
  },
  {
    id: 'cyrix',
    name: 'CYRIX',
    tag: 'Unité Zéro-Sept',
    bio: "Construit pour effacer un seul nom d'une seule liste. La liste s'est allongée depuis.",
    build: 'normal', scale: 1.0, hair: 'crest', outfit: 'battlesuit', headgear: 'visor',
    palette: {
      skin: 0xd8dde6, hair: 0x39465c, primary: 0x2b3242, secondary: 0x8d97a8,
      accent: 0x37e0ff, dark: 0x10141d, aura: 0x37e0ff, auraCore: 0xdffaff, outline: 0x070a12,
    },
    face: { eyeColor: '#37e0ff', browColor: '#2a3346', angry: 0.2 },
    stats: { hp: 6, atk: 7, def: 6, speed: 8, ki: 10 },
    moves: {
      blast1: { name: 'Drain Photonique', type: 'drain' },
      blast2: { name: 'Grille Photon', type: 'beam' },
      ult: { name: 'PROTOCOLE EXTINCTION', type: 'beam' },
    },
    transform: {
      name: 'SURCHARGE NOYAU',
      palette: { accent: 0xffffff, aura: 0x9ffcff },
      boost: { atk: 1.24, speed: 1.3, def: 1.08 },
    },
    voice: 0.95,
  },
  {
    id: 'malphas',
    name: 'MALPHAS',
    tag: 'Empereur du Vide',
    bio: "Il n'a jamais couru. Pourquoi courir, quand l'univers finit toujours par venir à soi ?",
    build: 'slim', scale: 1.04, hair: 'long', outfit: 'armor', cape: true, capeColor: 0x3a1f66,
    palette: {
      skin: 0xe8e4f2, hair: 0x6a2fb0, primary: 0xf0ecf8, secondary: 0x3d2a63,
      accent: 0xb388ff, dark: 0x1a1030, aura: 0xb03cff, auraCore: 0xf0d8ff, outline: 0x0a0618,
    },
    face: { eyeColor: '#8a2be2', browColor: '#3a1f5c', angry: 0.6, smirk: true, marks: '#7a3fd0' },
    stats: { hp: 7, atk: 8, def: 7, speed: 8, ki: 9 },
    moves: {
      blast1: { name: 'Champ de Mépris', type: 'guardboost' },
      blast2: { name: 'Comète Funeste', type: 'ball' },
      ult: { name: 'SUPERNOVA DU VIDE', type: 'ball' },
    },
    transform: {
      name: 'FORME ULTIME',
      palette: { skin: 0xffffff, secondary: 0x8a2be2, aura: 0xe08cff },
      boost: { atk: 1.3, speed: 1.26, def: 1.2 },
    },
    voice: 1.05,
  },
  {
    id: 'nyx',
    name: 'NYX',
    tag: 'Fleur Astrale',
    bio: "Née d'une étoile morte. Elle parle peu, mais le ciel change de couleur quand elle s'énerve.",
    build: 'slim', scale: 0.9, hair: 'long', outfit: 'robe',
    palette: {
      skin: 0xf0d8e8, hair: 0x7fd8ff, primary: 0x1b2b52, secondary: 0x6fa8e0,
      accent: 0xd8f0ff, dark: 0x0f1830, aura: 0x8ad8ff, auraCore: 0xffffff, outline: 0x070c1c,
    },
    face: { eyeColor: '#4fb8e8', browColor: '#4a7ea8', angry: 0.15, lashes: true },
    stats: { hp: 5, atk: 6, def: 5, speed: 8, ki: 10 },
    moves: {
      blast1: { name: 'Voile Stellaire', type: 'heal' },
      blast2: { name: 'Floraison Astrale', type: 'rain' },
      ult: { name: 'CHANT DES ÉTOILES', type: 'beam' },
    },
    transform: {
      name: 'ÉCLOSION',
      palette: { hair: 0xffffff, aura: 0xd8b0ff },
      boost: { atk: 1.26, speed: 1.24, def: 1.12 },
    },
    voice: 1.3,
  },
  {
    id: 'kelver',
    name: "KEL'VER",
    tag: 'Le Parfait Inachevé',
    bio: "Un patchwork de cellules volées à mille guerriers. Il cherche encore le morceau qui lui manque.",
    build: 'normal', scale: 1.1, hair: 'crest', outfit: 'bio', tail: true,
    palette: {
      skin: 0x7fbf6a, hair: 0x2f5a2a, primary: 0x2f4a2a, secondary: 0xe8e0c0,
      accent: 0x3a2a5a, dark: 0x18220f, aura: 0xaaff3c, auraCore: 0xf0ffd8, outline: 0x0a1408,
    },
    face: { eyeColor: '#ff3c3c', browColor: '#20401c', angry: 0.8, marks: '#3a2a5a' },
    stats: { hp: 8, atk: 8, def: 7, speed: 6, ki: 8 },
    moves: {
      blast1: { name: 'Absorption', type: 'drain' },
      blast2: { name: 'Rayon Parasite', type: 'beam' },
      ult: { name: 'CELLULE ULTIME', type: 'beam' },
    },
    transform: {
      name: 'FORME PARFAITE',
      palette: { skin: 0x9fe07a, accent: 0x6a3fd0, aura: 0xd8ff4a },
      boost: { atk: 1.3, speed: 1.2, def: 1.22 },
    },
    voice: 0.85,
  },
  {
    id: 'sable',
    name: 'SABLE',
    tag: 'Ombre du Poing',
    bio: "Le reflet que Kaidō a laissé dans une flaque, un soir d'orage. Le reflet, lui, n'a jamais oublié.",
    build: 'normal', scale: 1.0, hair: 'spiky', outfit: 'gi',
    palette: {
      skin: 0x8a7f96, hair: 0x120f18, primary: 0x2a2438, secondary: 0x5a1030,
      accent: 0xd0203c, dark: 0x0e0c14, aura: 0xff2a4a, auraCore: 0xffd0d8, outline: 0x05040a,
    },
    face: { eyeColor: '#e02040', browColor: '#0f0c14', angry: 0.85, smirk: true },
    stats: { hp: 6, atk: 9, def: 5, speed: 8, ki: 7 },
    moves: {
      blast1: { name: 'Miroir Noir', type: 'afterimage' },
      blast2: { name: 'Onde Ténébreuse', type: 'beam' },
      ult: { name: 'ÉCLIPSE FINALE', type: 'beam' },
    },
    transform: {
      name: 'PLEINE ÉCLIPSE',
      hairStyle: 'flame',
      palette: { hair: 0x8a1030, aura: 0xff0a3c },
      boost: { atk: 1.4, speed: 1.3, def: 0.98 },
    },
    voice: 0.92,
  },
];

export const BY_ID = Object.fromEntries(ROSTER.map((c) => [c.id, c]));

/** stat (1..10) -> gameplay multipliers */
export function tuning(c) {
  const s = c.stats;
  return {
    maxHp: 780 + s.hp * 68,
    atk: 0.72 + s.atk * 0.055,
    def: 1.28 - s.def * 0.036,
    speed: 7.4 + s.speed * 0.72,
    flySpeed: 8.6 + s.speed * 0.86,
    boostSpeed: 17 + s.speed * 2.1,
    kiRegen: 3.4 + s.ki * 0.72,
    maxKi: 100,
    weight: 0.72 + (s.hp + (c.build === 'heavy' ? 6 : 0)) * 0.055,
  };
}
