import { describe, it, expect } from 'vitest';
import { useTranslation } from '../i18n';
import { explainEvent, headline, explainStep } from '../components/animations/underTheHoodText';

const en = useTranslation('en').t;
const ta = useTranslation('ta').t;

const EVENTS = {
  new_object: { kind: 'new_object', ref: 'o1', type: 'list' },
  bind: { kind: 'bind', name: 'a', ref: 'o1', func: '<module>' },
  rebind: { kind: 'rebind', name: 'x', from: 'o1', to: 'o2', func: '<module>' },
  alias: { kind: 'alias', name: 'b', ref: 'o1', other: 'a', type: 'list' },
  mutate: { kind: 'mutate', ref: 'o1', name: 'a', type: 'list' },
  call: { kind: 'call', func: 'f', depth: 2 },
  return: { kind: 'return', func: 'f' },
  unbind: { kind: 'unbind', name: 'n', ref: 'o3', func: 'f' },
  exception: { kind: 'exception', func: 'f', name: 'ZeroDivisionError' },
};

describe('explainEvent en', () => {
  it('alias keeps identifiers in backticks', () => {
    const s = explainEvent(EVENTS.alias, en);
    expect(s).toContain('`b`');
    expect(s).toContain('`a`');
    expect(s).toContain('`list`');
    expect(s).toMatch(/same/);
  });
  it('mutate says same object, new contents', () => {
    expect(explainEvent(EVENTS.mutate, en)).toMatch(/same object, new contents/);
  });
  it('rebind, call, return, exception, unbind, bind, new_object', () => {
    expect(explainEvent(EVENTS.rebind, en)).toContain('`x` now points to a different object');
    expect(explainEvent(EVENTS.call, en)).toContain('Python calls `f`');
    expect(explainEvent(EVENTS.return, en)).toContain('`f` finishes and hands control back');
    expect(explainEvent(EVENTS.exception, en)).toContain('`ZeroDivisionError`');
    expect(explainEvent(EVENTS.unbind, en)).toContain('`n`');
    expect(explainEvent(EVENTS.bind, en)).toContain('`a`');
    expect(explainEvent(EVENTS.new_object, en)).toContain('`list`');
  });
  it('no unreplaced placeholders for any kind', () => {
    for (const ev of Object.values(EVENTS)) {
      expect(explainEvent(ev, en)).not.toMatch(/[{}]/);
      expect(explainEvent(ev, ta)).not.toMatch(/[{}]/);
    }
  });
});

describe('missing names', () => {
  it('never produce empty backticks or undefined', () => {
    const evs = [
      { kind: 'bind', ref: 'o1' }, { kind: 'rebind', from: 'o1', to: 'o2' }, { kind: 'unbind', ref: 'o1' },
      { kind: 'alias', name: 'b', ref: 'o1' }, { kind: 'mutate', ref: 'o1' },
    ];
    for (const ev of evs) {
      for (const t of [en, ta]) {
        const s = explainEvent(ev, t);
        expect(s).not.toContain('``');
        expect(s).not.toContain('undefined');
        expect(s).not.toMatch(/[{}]/);
      }
    }
    expect(explainEvent({ kind: 'bind' }, en)).toMatch(/^A name now/);
    expect(explainEvent({ kind: 'alias', name: 'b' }, en)).toContain('`b` and a name');
  });
  it('every kind with all optional fields missing is clean in en and ta', () => {
    for (const kind of Object.keys(EVENTS)) {
      for (const t of [en, ta]) {
        const s = explainEvent({ kind }, t);
        expect(s, kind).toBeTruthy();
        expect(s, kind).not.toContain('``');
        expect(s, kind).not.toContain('undefined');
        expect(s, kind).not.toContain('{');
      }
    }
    expect(explainEvent({ kind: 'alias', other: 'a' }, en)).toContain('`a` and a name');
    expect(explainEvent({ kind: 'call' }, en)).toContain('Python calls a function');
    expect(explainEvent({ kind: 'exception' }, en)).toMatch(/^An error happens here/);
    expect(explainEvent({ kind: 'call' }, ta)).toContain('ஒரு செயல்பாட்டை அழைக்கிறது');
  });
});

describe('explainEvent ta', () => {
  it('is Tamil for every kind and keeps identifiers', () => {
    for (const [kind, ev] of Object.entries(EVENTS)) {
      const s = explainEvent(ev, ta);
      expect(s, kind).toMatch(/[஀-௿]/);
      expect(s, kind).not.toBe(explainEvent(ev, en));
      const used = {
        new_object: [ev.type], bind: [ev.name], rebind: [ev.name], alias: [ev.name, ev.other, ev.type],
        mutate: [ev.type], call: [ev.func], return: [ev.func], unbind: [ev.name], exception: [ev.name],
      }[kind];
      for (const id of used) {
        expect(s, `${kind} ${id}`).toContain(id);
      }
    }
    expect(explainEvent(EVENTS.alias, ta)).toContain('`b`');
  });
});

describe('headline', () => {
  it('follows priority order', () => {
    const order = ['exception', 'alias', 'mutate', 'rebind', 'new_object', 'call', 'return', 'bind', 'unbind'];
    for (let i = 0; i < order.length - 1; i++) {
      const evs = [EVENTS[order[order.length - 1]], EVENTS[order[i + 1]], EVENTS[order[i]]];
      expect(headline(evs).kind).toBe(order[i]);
    }
  });
  it('null when empty', () => {
    expect(headline([])).toBeNull();
    expect(headline(undefined)).toBeNull();
  });
});

describe('explainStep', () => {
  it('headline plus details, type taken from objects', () => {
    const step = {
      line: 2,
      objects: { o1: { type: 'list' } },
      events: [{ kind: 'bind', name: 'b', ref: 'o1' }, { kind: 'alias', name: 'b', ref: 'o1', other: 'a' }],
    };
    const r = explainStep(step, en);
    expect(r.headline).toContain('`b` and `a`');
    expect(r.headline).toContain('`list`');
    expect(r.details).toHaveLength(1);
  });
  it('neutral sentence when no events', () => {
    expect(explainStep({ line: 5, events: [] }, en)).toEqual({ headline: 'Python runs line 5.', details: [] });
    expect(explainStep({ line: 5 }, ta).headline).toMatch(/[஀-௿]/);
    expect(explainStep({ line: 5 }, ta).headline).toContain('5');
  });
  it('a missing line never leaks a raw placeholder', () => {
    for (const step of [null, undefined, {}, { line: null, events: [] }]) {
      expect(explainStep(step, en)).toEqual({ headline: 'Python runs the next line.', details: [] });
      const s = explainStep(step, ta).headline;
      expect(s).toMatch(/[஀-௿]/);
      expect(s).not.toMatch(/[{}]/);
    }
  });
});
