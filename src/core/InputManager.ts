import type { SettingsManager } from './SettingsManager';

/**
 * Centralises keyboard/mouse input. Actions are resolved through the
 * user's (rebindable) keybinds so gameplay code never hard-codes key codes.
 */
export class InputManager {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private readonly releasedThisFrame = new Set<string>();

  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  leftDown = false;
  rightDown = false;
  leftPressed = false;
  rightPressed = false;
  pointerLocked = false;

  private enabled = true;
  private readonly canvas: HTMLCanvasElement;
  private readonly settings: SettingsManager;
  private readonly bound: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, settings: SettingsManager) {
    this.canvas = canvas;
    this.settings = settings;
    this.attach();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.down.clear();
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    // requestPointerLock returns a Promise in modern browsers; it rejects when
    // not triggered by a user gesture. Swallow it — a canvas click will retry.
    const result = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  exitPointerLock(): void {
    if (this.pointerLocked && document.pointerLockElement) document.exitPointerLock();
  }

  /** Held state of a logical action (e.g. "forward"). */
  action(name: string): boolean {
    const code = this.settings.get().keybinds[name];
    return code ? this.down.has(code) : false;
  }

  /** True only on the frame the action was first pressed. */
  actionPressed(name: string): boolean {
    const code = this.settings.get().keybinds[name];
    return code ? this.pressedThisFrame.has(code) : false;
  }

  keyDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Movement vector from WASD/ZQSD-mapped actions, range [-1,1] each axis. */
  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.action('forward')) y += 1;
    if (this.action('back')) y -= 1;
    if (this.action('right')) x += 1;
    if (this.action('left')) x -= 1;
    return { x, y };
  }

  /** Clear per-frame deltas. Call at the end of each frame. */
  endFrame(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.leftPressed = false;
    this.rightPressed = false;
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }

  private attach(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      // Tab would move focus / Space would scroll: prevent default for game keys.
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
      this.down.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.down.delete(e.code);
      this.releasedThisFrame.add(e.code);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.pointerLocked || !this.enabled) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!this.enabled) return;
      if (e.button === 0) {
        this.leftDown = true;
        this.leftPressed = true;
      }
      if (e.button === 2) {
        this.rightDown = true;
        this.rightPressed = true;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.leftDown = false;
      if (e.button === 2) this.rightDown = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
    };
    const onContext = (e: MouseEvent) => e.preventDefault();
    const onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    };
    const onBlur = () => this.down.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    this.canvas.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('blur', onBlur);

    this.bound.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('mousemove', onMouseMove),
      () => window.removeEventListener('mousedown', onMouseDown),
      () => window.removeEventListener('mouseup', onMouseUp),
      () => window.removeEventListener('wheel', onWheel),
      () => this.canvas.removeEventListener('contextmenu', onContext),
      () => document.removeEventListener('pointerlockchange', onLockChange),
      () => window.removeEventListener('blur', onBlur),
    );
  }

  dispose(): void {
    for (const off of this.bound) off();
    this.bound.length = 0;
    this.down.clear();
  }
}
