import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import gsap from 'gsap';
import VariableBox from '../components/animations/VariableBox';
import TerminalOutput from '../components/animations/TerminalOutput';
import ComparisonPanel from '../components/animations/ComparisonPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const saved = {};
beforeAll(() => {
  saved.matchMedia = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: false, media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
});
afterAll(() => { window.matchMedia = saved.matchMedia; });

let root, container;
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.removeItem('pm_reduce_motion');
});

function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

describe('reduced motion: VariableBox and TerminalOutput show the final state at once', () => {
  it('VariableBox: last value at first render, onComplete once, no timers', () => {
    localStorage.setItem('pm_reduce_motion', '1');
    vi.useFakeTimers();
    const delayed = vi.spyOn(gsap, 'delayedCall');
    const done = vi.fn();
    mount(<VariableBox variable="x" values={[1, 2, 3]} onComplete={done} />);
    expect(container.textContent).toContain('3');
    expect(done).toHaveBeenCalledTimes(1);
    expect(delayed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('VariableBox boxes list: onComplete once after every box', () => {
    localStorage.setItem('pm_reduce_motion', '1');
    const done = vi.fn();
    mount(<VariableBox boxes={[{ variable: 'a', values: [1, 2] }, { variable: 'b', values: [7, 8] }]} onComplete={done} />);
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('8');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('TerminalOutput: all lines at first render, onComplete once, no timers', () => {
    localStorage.setItem('pm_reduce_motion', '1');
    vi.useFakeTimers();
    const delayed = vi.spyOn(gsap, 'delayedCall');
    const done = vi.fn();
    mount(<TerminalOutput output={['one', 'two', 'three']} onComplete={done} />);
    for (const l of ['one', 'two', 'three']) expect(container.textContent).toContain(l);
    expect(done).toHaveBeenCalledTimes(1);
    expect(delayed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('TerminalOutput with no lines: completes at once under reduced motion', () => {
    localStorage.setItem('pm_reduce_motion', '1');
    const done = vi.fn();
    mount(<TerminalOutput output={[]} onComplete={done} />);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('VariableBox lifecycle with motion allowed', () => {
  it('unmount mid-play leaves no pending delayedCall and no React warning', () => {
    localStorage.setItem('pm_reduce_motion', '0');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const kill = vi.fn();
    const orig = gsap.delayedCall.bind(gsap);
    vi.spyOn(gsap, 'delayedCall').mockImplementation((...a) => {
      const c = orig(...a);
      const k = c.kill.bind(c);
      c.kill = () => { kill(); return k(); };
      return c;
    });
    mount(<VariableBox variable="x" values={[1, 2, 3]} />);
    act(() => root.unmount());
    root = null;
    expect(kill).toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it('an active CodeStepper (syncStep changing) drives the value and pauses the self-timer', () => {
    localStorage.setItem('pm_reduce_motion', '0');
    const delayed = vi.spyOn(gsap, 'delayedCall');
    mount(<VariableBox variable="x" values={[10, 20, 30]} syncStep={0} />);
    expect(delayed.mock.calls.length).toBe(1);
    const first = delayed.mock.results[0].value;
    const killSpy = vi.spyOn(first, 'kill');
    // The stepper moves: the box follows it; the old self-timer is killed and any
    // replacement waits well beyond the normal hold so it cannot run ahead.
    act(() => { root.render(<VariableBox variable="x" values={[10, 20, 30]} syncStep={1} />); });
    expect(killSpy).toHaveBeenCalled();
    for (const c of delayed.mock.calls.slice(1)) expect(c[0]).toBeGreaterThan(2);
  });
});

describe('ComparisonPanel VS badge on one-column layouts', () => {
  it('is static and inline below sm, absolute overlay from sm up', () => {
    const html = renderToStaticMarkup(<ComparisonPanel before={{ label: 'a', code: 'x' }} after={{ label: 'b', code: 'y' }} />);
    const badge = html.match(/<div[^>]*class="([^"]*)"[^>]*>\s*<div[^>]*>VS<\/div>/);
    expect(badge, html).not.toBeNull();
    const cls = badge[1].split(/\s+/);
    expect(cls).not.toContain('absolute');
    expect(cls).toContain('sm:absolute');
    expect(cls).toContain('sm:left-1/2');
    expect(cls).toContain('sm:top-1/2');
    expect(cls).toContain('sm:-translate-x-1/2');
    expect(cls).toContain('sm:-translate-y-1/2');
    expect(cls).toContain('justify-self-center');
  });
});
