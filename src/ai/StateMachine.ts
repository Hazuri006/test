/**
 * Minimal generic finite state machine. States receive a shared context `C`
 * and the frame delta. Transitions are explicit and logged via onChange.
 */
export interface State<C> {
  name: string;
  enter?(ctx: C): void;
  update?(ctx: C, dt: number): void;
  exit?(ctx: C): void;
}

export class StateMachine<C> {
  private states = new Map<string, State<C>>();
  private current: State<C> | null = null;
  onChange?: (name: string) => void;

  constructor(private readonly ctx: C) {}

  add(state: State<C>): this {
    this.states.set(state.name, state);
    return this;
  }

  get currentName(): string {
    return this.current?.name ?? 'none';
  }

  transition(name: string): void {
    if (this.current?.name === name) return;
    const next = this.states.get(name);
    if (!next) throw new Error(`Unknown state: ${name}`);
    this.current?.exit?.(this.ctx);
    this.current = next;
    next.enter?.(this.ctx);
    this.onChange?.(name);
  }

  update(dt: number): void {
    this.current?.update?.(this.ctx, dt);
  }
}
