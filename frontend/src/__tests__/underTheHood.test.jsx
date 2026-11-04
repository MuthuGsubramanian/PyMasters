import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import UnderTheHood from '../components/animations/UnderTheHood';
import ALIAS from './fixtures/heapTraceAlias.json';
import ERR from './fixtures/heapTraceError.json';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Recorded with backend/vaathiyaar/tracer.py trace_code(code, mode="heap") (fixtures/*.json).
// Print-only program: no names are ever bound (Review Focus 4).
const PRINT_ONLY = {
  code: 'print(1)\nprint(2)\n',
  trace: {
    steps: [
      { line: 1, event: 'line', func: '<module>', depth: 1, vars: {}, out: 0, frames: [{ func: '<module>', depth: 1, names: {} }], objects: {}, events: [] },
      { line: 2, event: 'line', func: '<module>', depth: 1, vars: {}, out: 2, frames: [{ func: '<module>', depth: 1, names: {} }], objects: {}, events: [] },
      { line: 2, event: 'return', func: '<module>', depth: 1, vars: {}, out: 4, ret: 'None', frames: [{ func: '<module>', depth: 1, names: {} }], objects: {}, events: [] },
    ],
    stdout: '1\n2\n',
    error: null,
  },
};

let phone = false;
const saved = {};
beforeAll(() => {
  saved.matchMedia = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: query.includes('max-width') ? phone : false,
    media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
});
afterAll(() => { window.matchMedia = saved.matchMedia; });

let root, container;
function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}
beforeEach(() => {
  vi.useFakeTimers();
  phone = false;
  localStorage.setItem('pm_reduce_motion', '1');
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  vi.useRealTimers();
  localStorage.removeItem('pm_reduce_motion');
});

const btn = (name) => container.querySelector(`button[aria-label="${name}"]`);
const next = (n = 1) => { for (let i = 0; i < n; i++) act(() => btn('Next step').click()); };
const counter = () => container.querySelector('[role="group"] [aria-live]').textContent;
const nameRow = (n) => container.querySelector(`[data-uth-name="${n}"]`);
const headlineText = () => container.querySelector('[data-uth="headline"]').textContent;

const aliasProps = { code: ALIAS.code, trace: ALIAS, language: 'en' };

describe('UnderTheHood', () => {
  it('shows the code with the current line highlighted, whitespace kept', () => {
    mount(<UnderTheHood {...aliasProps} />);
    const code = container.querySelector('[data-uth="code"]');
    expect(code.className).toContain('overflow-x-auto');
    const active = code.querySelector('[aria-current="step"]');
    expect(active.textContent).toContain('a = [1, 2]');
    expect(code.innerHTML).toContain('whitespace-pre');
    next(7); // 8th step: inside f (line 7)
    expect(code.querySelector('[aria-current="step"]').textContent).toContain('return n * 2');
  });

  it('at the alias step both names point to the same object and the headline is the alias sentence', () => {
    mount(<UnderTheHood {...aliasProps} />);
    next(2);
    expect(nameRow('a').getAttribute('data-ref')).toBe('o1');
    expect(nameRow('b').getAttribute('data-ref')).toBe('o1');
    expect(container.querySelectorAll('[data-uth-obj]')).toHaveLength(1);
    expect(headlineText()).toBe('b and a now point to the same list object. Nothing was copied.');
    // identifiers are shown as code
    expect(container.querySelector('[data-uth="headline"] code').textContent).toBe('b');
  });

  it('marks the line that just ran, which is the line the explanation is about', () => {
    // Live check 2026-11-04: the alias sentence (from `b = a`, line 2) showed while only line 3 was highlighted.
    mount(<UnderTheHood {...aliasProps} />);
    const code = () => container.querySelector('[data-uth="code"]');
    expect(code().querySelector('[data-uth-ran]')).toBeNull();          // first step: nothing has run yet
    next(2);
    const ran = code().querySelector('[data-uth-ran]');
    expect(ran.textContent).toContain('b = a');
    expect(ran.textContent).toContain('just ran');
    expect(code().querySelector('[aria-current="step"]').textContent).toContain('b.append(3)');
  });

  it('at the mutate step the object shows the new items and is marked as changed', () => {
    mount(<UnderTheHood {...aliasProps} />);
    next(3);
    const box = container.querySelector('[data-uth-obj="o1"]');
    expect(box.getAttribute('data-changed')).toBe('true');
    const items = [...box.querySelectorAll('[data-uth-item]')].map((e) => e.textContent);
    expect(items).toEqual(['1', '2', '3']);
    expect(box.textContent).toContain('list');
    expect(headlineText()).toMatch(/same object, new contents/);
  });

  it('frames are listed innermost first, with the function name in the header', () => {
    mount(<UnderTheHood {...aliasProps} />);
    next(7);
    const headers = [...container.querySelectorAll('[data-uth-frame]')].map((e) => e.getAttribute('data-uth-frame'));
    expect(headers).toEqual(['f', '<module>']);
    expect(container.querySelector('[data-uth-frame="f"]').textContent).toContain('f');
    expect(nameRow('n').getAttribute('data-ref')).toBe('o3');
  });

  it('desktop draws arrows; phones show ref chips that match the object chips instead', () => {
    mount(<UnderTheHood {...aliasProps} />);
    next(2);
    expect(container.querySelector('svg[data-uth="arrows"]')).toBeTruthy();
    act(() => root.unmount());
    container.remove();

    phone = true;
    mount(<UnderTheHood {...aliasProps} />);
    next(2);
    expect(container.querySelector('svg[data-uth="arrows"]')).toBeNull();
    expect(nameRow('a').querySelector('[data-uth-chip]').textContent).toBe('o1');
    expect(nameRow('b').querySelector('[data-uth-chip]').textContent).toBe('o1');
    expect(container.querySelector('[data-uth-obj="o1"] [data-uth-chip]').textContent).toBe('o1');
  });

  it('a program that never binds a name shows "No names yet" and still steps', () => {
    mount(<UnderTheHood code={PRINT_ONLY.code} trace={PRINT_ONLY.trace} language="en" />);
    expect(container.textContent).toContain('No names yet');
    expect(counter()).toBe('Step 1 of 3');
    next(1);
    expect(counter()).toBe('Step 2 of 3');
    expect(headlineText()).toBe('Python runs line 2.');
    expect(container.querySelector('[data-uth="output"]').textContent).toContain('1');
  });

  it('an error trace shows a banner with the error message', () => {
    mount(<UnderTheHood code={ERR.code} trace={ERR} language="en" />);
    const banner = container.querySelector('[role="alert"]');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('ZeroDivisionError');
    expect(banner.textContent).toContain('division by zero');
    next(2);
    expect(headlineText()).toMatch(/An error, ZeroDivisionError, happens here/);
  });

  it('an error with no steps shows the banner instead of a blank view, and never a raw placeholder', () => {
    const trace = { steps: [], stdout: '', error: { type: 'SyntaxError', message: 'invalid syntax', line: 1 } };
    mount(<UnderTheHood code="x = (" trace={trace} language="en" />);
    expect(container.querySelector('[role="alert"]').textContent).toContain('invalid syntax');
    expect(container.textContent).not.toMatch(/[{}]/);
  });

  it('no trace at all renders a calm empty state', () => {
    mount(<UnderTheHood code="" trace={null} language="en" />);
    expect(container.textContent).not.toMatch(/[{}]|undefined/);
  });

  it('step limit keeps the steps and adds the banner', () => {
    const trace = { ...ALIAS, error: { type: 'StepLimit', message: 'Stopped after 300 steps - showing the first part.', line: null } };
    mount(<UnderTheHood code={ALIAS.code} trace={trace} language="en" />);
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(counter()).toBe(`Step 1 of ${ALIAS.steps.length}`);
  });

  it('capped objects and hidden frames are announced', () => {
    const step = {
      line: 1, event: 'line', func: 'r', depth: 14, vars: {}, out: 0,
      frames: [
        { func: '<module>', depth: 1, names: { a: 'o1' } },
        { func: '...', depth: 2, names: {}, hidden: 3 },
        { func: 'r', depth: 14, names: {} },
      ],
      objects: { o1: { type: 'dict', repr: "{'k': 1}", mutable: true, items: [["'k'", '1']], len: 1 } },
      more_objects: 4,
      events: [],
    };
    mount(<UnderTheHood code={'a = 1\n'} trace={{ steps: [step], stdout: '', error: null }} language="en" />);
    expect(container.textContent).toContain('+4 more');
    expect(container.textContent).toContain('3 more frames hidden');
    expect(container.querySelector('[data-uth-obj="o1"]').textContent).toContain("'k'");
  });

  it('reduced motion: no autoplay', () => {
    mount(<UnderTheHood {...aliasProps} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(counter()).toBe(`Step 1 of ${ALIAS.steps.length}`);
    expect(btn('Play')).toBeTruthy();
  });

  it('Tamil learner gets Tamil sentences with identifiers unchanged', () => {
    mount(<UnderTheHood {...aliasProps} language="ta" />);
    next(2);
    expect(headlineText()).toMatch(/[஀-௿]/);
    expect(headlineText()).toContain('b');
  });

  it('changed objects use a 3:1 border in light mode; unchanged objects are not marked', () => {
    mount(<UnderTheHood {...aliasProps} />);
    next(3);
    const box = container.querySelector('[data-uth-obj="o1"]');
    expect(box.className).toContain('border-amber-600');
    expect(box.className).toContain('dark:border-amber-400');
    expect(box.className).toContain('ring-amber-600');
    expect(box.className).not.toMatch(/(^|\s)border-amber-400/);
    next(1); // x = 1 created o2; o1 untouched
    expect(container.querySelector('[data-uth-obj="o1"]').getAttribute('data-changed')).toBe('false');
    expect(container.querySelector('[data-uth-obj="o2"]').getAttribute('data-changed')).toBe('true');
  });

  it('name rows expose their text plus an sr-only "points to" sentence, no aria-label', () => {
    mount(<UnderTheHood {...aliasProps} />);
    next(2);
    const row = nameRow('a');
    expect(row.hasAttribute('aria-label')).toBe(false);
    expect(row.querySelector('.sr-only').textContent).toBe('a points to o1');
  });

  it('the English-only error hint shows for en, not for ta', () => {
    mount(<UnderTheHood code={ERR.code} trace={ERR} language="en" />);
    expect(container.querySelector('[data-uth="error-hint"]')).toBeTruthy();
    act(() => root.unmount());
    container.remove();
    mount(<UnderTheHood code={ERR.code} trace={ERR} language="ta" />);
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.querySelector('[data-uth="error-hint"]')).toBeNull();
  });

  it('without ResizeObserver arrows re-measure on window resize and the listener is removed', () => {
    const savedRO = globalThis.ResizeObserver;
    delete globalThis.ResizeObserver;
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      mount(<UnderTheHood {...aliasProps} />);
      const added = add.mock.calls.filter(([e]) => e === 'resize');
      expect(added.length).toBeGreaterThan(0);
      act(() => { window.dispatchEvent(new Event('resize')); });
      act(() => root.unmount());
      root = null;
      const removed = remove.mock.calls.filter(([e]) => e === 'resize').map(([, fn]) => fn);
      for (const [, fn] of added) expect(removed).toContain(fn);
    } finally {
      add.mockRestore();
      remove.mockRestore();
      if (savedRO) globalThis.ResizeObserver = savedRO;
    }
  });

  it('a ref that is not a valid selector does not crash the arrows', () => {
    const step = {
      line: 1, event: 'line', func: '<module>', depth: 1, vars: {}, out: 0,
      frames: [{ func: '<module>', depth: 1, names: { a: 'o"]1' } }],
      objects: {}, events: [],
    };
    mount(<UnderTheHood code={'a = 1\n'} trace={{ steps: [step], stdout: '', error: null }} language="en" />);
    expect(nameRow('a')).toBeTruthy();
  });

  it('markup never uses text smaller than 12 px', () => {
    for (const p of [aliasProps, { code: ERR.code, trace: ERR }, PRINT_ONLY]) {
      const html = renderToStaticMarkup(<UnderTheHood {...p} />);
      expect(html).not.toMatch(/text-\[(9|10|11)px\]/);
    }
  });
});
