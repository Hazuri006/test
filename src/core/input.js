/* ============================================================
   Input — keyboard + gamepad, per-player action mapping.
   Actions are polled as: held(), pressed() (edge), released().
   ============================================================ */

export const ACTIONS = [
  'up', 'down', 'left', 'right',
  'rush', 'smash', 'kiblast', 'blast1', 'blast2', 'ultimate',
  'guard', 'boost', 'charge', 'ascend', 'descend',
  'start', 'back',
];

const KEYMAP_P1 = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyJ: 'rush', KeyK: 'smash', KeyL: 'kiblast',
  KeyU: 'blast1', KeyI: 'blast2', KeyO: 'ultimate',
  Space: 'guard', ShiftLeft: 'boost', KeyC: 'charge',
  KeyE: 'ascend', KeyQ: 'descend',
  Enter: 'start', Escape: 'back',
};

const KEYMAP_P2 = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Numpad1: 'rush', Numpad2: 'smash', Numpad3: 'kiblast',
  Comma: 'rush', Period: 'smash', Slash: 'kiblast',
  Numpad4: 'blast1', Numpad5: 'blast2', Numpad6: 'ultimate',
  Semicolon: 'blast1', Quote: 'blast2', BracketRight: 'blast2',
  Numpad0: 'guard', ShiftRight: 'guard',
  NumpadDecimal: 'boost', ControlRight: 'boost',
  NumpadAdd: 'charge', Backslash: 'charge',
  Numpad9: 'ascend', Numpad7: 'descend',
  PageUp: 'ascend', PageDown: 'descend',
};

/* Standard gamepad layout:
   0 A/cross, 1 B/circle, 2 X/square, 3 Y/triangle,
   4 LB, 5 RB, 6 LT, 7 RT, 8 back, 9 start,
   12-15 dpad up/down/left/right                                   */
const PADMAP = {
  1: 'rush',       // circle → rush
  2: 'kiblast',    // square → ki blast
  3: 'guard',      // triangle → guard
  0: 'ascend',     // cross  → fly up
  5: 'boost',      // RB     → boost / dash
  7: 'smash',      // RT     → smash
  4: 'charge',     // LB     → charge ki
  6: 'blast2',     // LT     → super
  9: 'start', 8: 'back',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
  10: 'blast1', 11: 'ultimate',
};

class PlayerInput {
  constructor(id) {
    this.id = id;
    this.state = {};       // currently held
    this.prev = {};        // held last frame (pad edges + released())
    this.edges = {};       // press edges registered this frame
    this.axis = { x: 0, y: 0 };
    this.padIndex = -1;
    this.tapBuffer = {};   // action -> last press timestamp (for double-taps)
    this.mash = 0;         // rolling mash counter
    for (const a of ACTIONS) { this.state[a] = false; this.prev[a] = false; this.edges[a] = 0; }
  }
  held(a) { return !!this.state[a]; }
  pressed(a) { return this.edges[a] > 0; }
  released(a) { return !this.state[a] && !!this.prev[a]; }
  anyPressed() { return ACTIONS.some((a) => this.edges[a] > 0); }
  /** true if `a` was double-tapped within `win` ms */
  doubleTap(a, win = 260) {
    if (!this.pressed(a)) return false;
    const now = performance.now();
    const last = this.tapBuffer[a] || 0;
    this.tapBuffer[a] = now;
    if (now - last < win) { this.tapBuffer[a] = 0; return true; }
    return false;
  }
  /** normalized movement vector, -1..1 */
  move() {
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let y = (this.held('up') ? 1 : 0) - (this.held('down') ? 1 : 0);
    if (Math.abs(this.axis.x) > 0.22) x = this.axis.x;
    if (Math.abs(this.axis.y) > 0.22) y = this.axis.y;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, mag: Math.min(1, m) };
  }
}

export class Input {
  constructor() {
    this.keys = new Set();
    // Ordered queue of key presses waiting to be turned into edges.
    // A press is never dropped, and two presses of the same key are
    // never collapsed — they are handed out one frame at a time. That
    // matters both for menu spam and for fast combo taps during a
    // frame-time spike.
    this.tapQueue = [];
    this.players = [new PlayerInput(0), new PlayerInput(1)];
    this.padOwners = [0, 1];
    this.anyKeyFlag = false;
    this._onDown = (e) => {
      if (e.repeat) return;
      // don't swallow devtools / refresh
      if (e.code === 'F5' || (e.ctrlKey && e.code === 'KeyR')) return;
      this.keys.add(e.code);
      if (this.tapQueue.length < 32) this.tapQueue.push(e.code);
      this.anyKeyFlag = true;
      if (PREVENT.has(e.code)) e.preventDefault();
    };
    this._onUp = (e) => this.keys.delete(e.code);
    this._blur = () => { this.keys.clear(); this.tapQueue.length = 0; };
    window.addEventListener('keydown', this._onDown, { passive: false });
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._blur);
  }

  /** menu-level helpers, merged across both pads/keyboards */
  menu() {
    const [a, b] = this.players;
    return {
      up: a.pressed('up') || b.pressed('up'),
      down: a.pressed('down') || b.pressed('down'),
      left: a.pressed('left') || b.pressed('left'),
      right: a.pressed('right') || b.pressed('right'),
      confirm: a.pressed('rush') || a.pressed('start') || b.pressed('rush') || b.pressed('start'),
      cancel: a.pressed('guard') || a.pressed('back') || b.pressed('guard') || b.pressed('back'),
      any: a.anyPressed() || b.anyPressed(),
    };
  }

  update() {
    for (const p of this.players) {
      Object.assign(p.prev, p.state);
      for (const act of ACTIONS) { p.state[act] = false; p.edges[act] = 0; }
      p.axis.x = 0; p.axis.y = 0;
    }

    const apply = (code, edge) => {
      const a1 = KEYMAP_P1[code];
      if (a1) { this.players[0].state[a1] = true; if (edge) this.players[0].edges[a1]++; }
      const a2 = KEYMAP_P2[code];
      if (a2) { this.players[1].state[a2] = true; if (edge) this.players[1].edges[a2]++; }
      return !!(a1 || a2);
    };

    // held keys first (no edge — the press that started them was queued)
    for (const code of this.keys) apply(code, false);

    // then hand out at most one queued press per key code per frame
    const taken = new Set();
    const rest = [];
    for (const code of this.tapQueue) {
      if (taken.has(code)) { rest.push(code); continue; }
      taken.add(code);
      apply(code, true);
    }
    this.tapQueue = rest;

    // gamepads
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let slot = 0;
    for (let i = 0; i < pads.length && slot < 2; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) continue;
      const p = this.players[slot++];
      p.padIndex = i;
      for (const idx in PADMAP) {
        const btn = gp.buttons[idx];
        const act = PADMAP[idx];
        if (btn && (btn.pressed || btn.value > 0.5)) {
          if (!p.state[act] && !p.prev[act]) p.edges[act]++;
          p.state[act] = true;
        }
      }
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.18) { p.axis.x = ax; p.axis.y = -ay; }
    }
    this.anyKeyFlag = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._blur);
  }
}

const PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
  'Numpad0', 'NumpadAdd', 'NumpadDecimal', 'PageUp', 'PageDown', 'Enter',
]);
