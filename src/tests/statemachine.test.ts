import { describe, it, expect, vi } from 'vitest';
import { StateMachine } from '../ai/StateMachine';

interface Ctx {
  log: string[];
  value: number;
}

describe('StateMachine', () => {
  it('calls enter/exit/update and tracks the current state', () => {
    const ctx: Ctx = { log: [], value: 0 };
    const sm = new StateMachine<Ctx>(ctx);
    sm.add({
      name: 'A',
      enter: (c) => c.log.push('enterA'),
      update: (c, dt) => (c.value += dt),
      exit: (c) => c.log.push('exitA'),
    }).add({
      name: 'B',
      enter: (c) => c.log.push('enterB'),
    });

    sm.transition('A');
    expect(sm.currentName).toBe('A');
    sm.update(0.5);
    expect(ctx.value).toBe(0.5);

    sm.transition('B');
    expect(sm.currentName).toBe('B');
    expect(ctx.log).toEqual(['enterA', 'exitA', 'enterB']);
  });

  it('ignores transitions to the current state and fires onChange', () => {
    const sm = new StateMachine<Ctx>({ log: [], value: 0 });
    const onChange = vi.fn();
    sm.onChange = onChange;
    sm.add({ name: 'A' }).add({ name: 'B' });
    sm.transition('A');
    sm.transition('A'); // no-op
    sm.transition('B');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('throws on unknown state', () => {
    const sm = new StateMachine<Ctx>({ log: [], value: 0 });
    expect(() => sm.transition('nope')).toThrow();
  });
});
