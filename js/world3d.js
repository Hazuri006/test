/* ============================================================
 * MONDE 3D — Plan du château, collisions, apparitions
 * (Données pures ; la géométrie est construite par game3d.js)
 * ============================================================ */

const World = {
  W: 44, H: 32,
  grid: [],
  rooms: [], doors: [], itemsSpawn: [], notesSpawn: [], monstersSpawn: [], torches: [],
  playerStart: { x: 0, z: 0 },

  build() {
    this.grid = [];
    for (let y = 0; y < this.H; y++) {
      const row = [];
      for (let x = 0; x < this.W; x++) row.push(CONFIG.T_VOID);
      this.grid.push(row);
    }

    this.rooms = [
      { id: "hall",      name: "Hall d'Entrée",  x: 2,  y: 2,  w: 11, h: 8 },
      { id: "corridor",  name: "Grande Galerie", x: 16, y: 2,  w: 12, h: 8 },
      { id: "dining",    name: "Salle à Manger", x: 31, y: 2,  w: 11, h: 8 },
      { id: "library",   name: "Bibliothèque",   x: 2,  y: 13, w: 11, h: 8 },
      { id: "courtyard", name: "Cour Intérieure",x: 16, y: 13, w: 12, h: 8 },
      { id: "armory",    name: "Armurerie",      x: 31, y: 13, w: 11, h: 8 },
      { id: "dungeon",   name: "Cachots",        x: 2,  y: 23, w: 11, h: 7 },
      { id: "chapel",    name: "Chapelle",       x: 16, y: 23, w: 12, h: 7 },
      { id: "lab",       name: "Laboratoire",    x: 31, y: 23, w: 11, h: 7 },
    ];

    for (const r of this.rooms) {
      for (let y = r.y - 1; y <= r.y + r.h; y++)
        for (let x = r.x - 1; x <= r.x + r.w; x++) {
          if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
          const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
          if (inside) this.grid[y][x] = CONFIG.T_FLOOR;
          else if (this.grid[y][x] === CONFIG.T_VOID) this.grid[y][x] = CONFIG.T_WALL;
        }
    }

    const link = (x1, y1, x2, y2) => {
      const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
      const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
      for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) this.grid[y][x] = CONFIG.T_FLOOR;
    };
    link(13, 5, 15, 5);  link(28, 5, 30, 5);
    link(13, 16, 15, 16); link(28, 16, 30, 16);
    link(13, 26, 15, 26); link(28, 26, 30, 26);
    link(7, 10, 7, 12);  link(21, 10, 21, 12); link(36, 10, 36, 12);
    link(7, 21, 7, 22);  link(21, 21, 21, 22); link(36, 21, 36, 22);

    this.doors = [
      { x: 7, y: 11, locked: true,  key: "rustyKey", open: false, horiz: false, name: "Bibliothèque" },
      { x: 36, y: 22, locked: true, key: "labKey",   open: false, horiz: false, name: "Laboratoire" },
      { x: 14, y: 5,  locked: false, open: false, horiz: true,  name: "Galerie" },
      { x: 29, y: 5,  locked: false, open: false, horiz: true,  name: "Salle à Manger" },
      { x: 21, y: 11, locked: false, open: false, horiz: false, name: "Cour" },
      { x: 7,  y: 22, locked: false, open: false, horiz: false, name: "Cachots" },
      { x: 21, y: 22, locked: false, open: false, horiz: false, name: "Chapelle" },
      { x: 14, y: 26, locked: false, open: false, horiz: true,  name: "Cachots" },
      { x: 29, y: 26, locked: false, open: false, horiz: true,  name: "Laboratoire" },
    ];

    // Grande porte de sortie (haut du hall)
    this.grid[1][6] = CONFIG.T_FLOOR;
    this.grid[1][7] = CONFIG.T_FLOOR;
    this.doors.push({ x: 6, y: 1, locked: true, key: "cure", open: false, horiz: true, name: "Grande Porte", isExit: true });
    this.doors.push({ x: 7, y: 1, locked: true, key: "cure", open: false, horiz: true, name: "Grande Porte", isExit: true });

    this.playerStart = this.tileCenter(7, 7);

    const it = (x, y, type, qty) => ({ x, y, type, qty: qty || 1 });
    this.itemsSpawn = [
      it(38, 4, "rustyKey"), it(34, 7, "ammo"), it(40, 6, "herb"),
      it(4, 15, "ammo"), it(10, 18, "herb"),
      it(33, 16, "ammo"), it(38, 18, "ammo"), it(35, 14, "herb"),
      it(4, 28, "labKey"), it(10, 25, "ammo"),
      it(20, 28, "herb"), it(24, 25, "ammo"), it(22, 16, "herb"),
      it(40, 28, "cure"),
    ];

    this.notesSpawn = [
      { x: 9, y: 4, title: "Lettre tachée de sang",
        body: "« Si vous lisez ceci, fuyez. Le Comte a réveillé quelque chose sous la chapelle. La grande porte ne s'ouvrira qu'avec le Sérum-G du laboratoire. »" },
      { x: 25, y: 6, title: "Note du majordome",
        body: "« La clé rouillée de la bibliothèque est restée dans la salle à manger. N'y allez pas la nuit... ils s'y rassemblent. »" },
      { x: 6, y: 16, title: "Page de journal",
        body: "« J'ai caché la clé du laboratoire dans les cachots. Que Dieu me pardonne pour ce que nous avons libéré là-bas. »" },
      { x: 22, y: 26, title: "Prière gravée",
        body: "« Le Gardien ne meurt pas facilement. Visez la tête, reculez sans cesse, et ne cessez jamais de bouger. »" },
      { x: 37, y: 25, title: "Rapport d'expérience",
        body: "« Sujet G stabilisé. Le sérum est l'unique remède ET l'unique clé de sortie. Détruisez le Gardien d'abord. »" },
    ];

    const mob = (x, y, type) => ({ x, y, type });
    this.monstersSpawn = [
      mob(20, 4, "zombie"), mob(24, 8, "zombie"),
      mob(34, 5, "zombie"), mob(39, 7, "hound"),
      mob(19, 16, "hound"), mob(24, 17, "zombie"),
      mob(6, 26, "zombie"), mob(10, 28, "crawler"), mob(4, 24, "hound"),
      mob(19, 27, "zombie"), mob(25, 26, "crawler"),
      mob(33, 18, "zombie"),
      mob(36, 26, "boss"),
    ];

    // Torches : une près de deux coins de chaque salle
    this.torches = [];
    for (const r of this.rooms) {
      this.torches.push(this.tileCenter(r.x, r.y));
      this.torches.push(this.tileCenter(r.x + r.w - 1, r.y + r.h - 1));
    }
  },

  // ---- Helpers (coordonnées monde X/Z) ----
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H; },
  tileAt(tx, ty) { return this.inBounds(tx, ty) ? this.grid[ty][tx] : CONFIG.T_VOID; },
  tileCenter(tx, ty) { return { x: tx * CONFIG.TILE + CONFIG.TILE / 2, z: ty * CONFIG.TILE + CONFIG.TILE / 2 }; },
  worldToTile(x, z) { return { tx: Math.floor(x / CONFIG.TILE), ty: Math.floor(z / CONFIG.TILE) }; },

  doorAtTile(tx, ty) { return this.doors.find(d => d.x === tx && d.y === ty); },

  isSolidWorld(x, z) {
    const tx = Math.floor(x / CONFIG.TILE), ty = Math.floor(z / CONFIG.TILE);
    if (SOLID_TILES.has(this.tileAt(tx, ty))) return true;
    const d = this.doorAtTile(tx, ty);
    if (d && !d.open) return true;
    return false;
  },

  roomAtWorld(x, z) {
    const { tx, ty } = this.worldToTile(x, z);
    return this.rooms.find(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) || null;
  },
};
