/**
 * Typed, lightweight publish/subscribe event bus.
 * Decouples systems: emitters never reference listeners directly.
 */
export type EventMap = Record<string, unknown>;

export type Handler<T> = (payload: T) => void;

export class EventBus<M extends EventMap> {
  private readonly handlers = new Map<keyof M, Set<Handler<unknown>>>();

  on<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  once<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof M>(event: K, handler: Handler<M[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy to allow handlers to unsubscribe during emit.
    for (const handler of [...set]) {
      (handler as Handler<M[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Game-wide event definitions. Keep payloads serialisable where practical. */
export interface GameEvents extends EventMap {
  'game:started': { newGame: boolean };
  'game:paused': { paused: boolean };
  'game:over': { cause: string };
  'player:damage': { amount: number; cause: string };
  'player:death': { cause: string };
  'player:statsChanged': {
    health: number;
    hunger: number;
    thirst: number;
    stamina: number;
    oxygen: number;
  };
  'inventory:changed': void;
  'inventory:full': { itemId: string };
  'item:collected': { itemId: string; amount: number };
  notify: { message: string; kind?: 'info' | 'warn' | 'good' | 'bad' };
  'hook:thrown': void;
  'hook:caught': { itemId: string; amount: number };
  'build:placed': { buildingId: string };
  'build:removed': { buildingId: string };
  'craft:completed': { recipeId: string };
  'research:unlocked': { recipeId: string };
  'shark:state': { state: string };
  'shark:attack': { target: 'player' | 'raft' };
  'weather:changed': { weather: string };
  'time:changed': { hour: number; day: number };
  'save:done': { slot: string };
  'save:loaded': { slot: string };
  'tree:chopped': { islandId: string };
}
