/* ============================================================
 * ENTRÉES FPS — Pointer Lock, souris, clavier
 * ============================================================ */

const Input = {
  keys: {},
  _pressed: {},
  _consumed: {},
  mouseDown: false,
  rightDown: false,
  lookDX: 0,
  lookDY: 0,
  locked: false,
  canvas: null,

  init(canvas) {
    this.canvas = canvas;

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys[k]) this._pressed[k] = true;
      this.keys[k] = true;
      if ([" ", "tab"].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => { this.keys[e.key.toLowerCase()] = false; });

    document.addEventListener("mousemove", (e) => {
      if (this.locked) {
        this.lookDX += e.movementX || 0;
        this.lookDY += e.movementY || 0;
      }
    });
    document.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    document.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (typeof Game !== "undefined" && Game.onLockChange) Game.onLockChange(this.locked);
    });
  },

  requestLock() {
    if (this.canvas && this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  },
  exitLock() { if (document.exitPointerLock) document.exitPointerLock(); },

  down(...alts) { return alts.some(k => this.keys[k.toLowerCase()]); },

  pressed(k) {
    k = k.toLowerCase();
    if (this._pressed[k] && !this._consumed[k]) { this._consumed[k] = true; return true; }
    return false;
  },

  // Renvoie et réinitialise le mouvement souris accumulé
  consumeLook() {
    const d = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  },

  // Vecteur de déplacement (avant/droite), ZQSD + WASD + flèches
  moveAxis() {
    let f = 0, s = 0;
    if (this.down("w", "z", "arrowup")) f += 1;
    if (this.down("s", "arrowdown")) f -= 1;
    if (this.down("d", "arrowright")) s += 1;
    if (this.down("a", "q", "arrowleft")) s -= 1;
    return { f, s };
  },

  endFrame() { this._pressed = {}; this._consumed = {}; },
};
