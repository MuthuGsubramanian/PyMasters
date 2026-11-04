import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import useStepPlayback from '../hooks/useStepPlayback';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let api;
function Probe({ total, opts }) {
  api = useStepPlayback(total, opts);
  return null;
}
let root, container;
function mount(total, opts) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(h(Probe, { total, opts })); });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useStepPlayback', () => {
  it('autoplays when motion is allowed and stops at the last step', () => {
    mount(3, { reducedMotion: false, intervalMs: 1000 });
    expect(api.step).toBe(0);
    expect(api.playing).toBe(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.step).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.step).toBe(2);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.step).toBe(2);
    expect(api.playing).toBe(false);
  });

  it('never autoplays with reduced motion', () => {
    mount(3, { reducedMotion: true, intervalMs: 1000 });
    expect(api.playing).toBe(false);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(api.step).toBe(0);
  });

  it('next at the end stays at total-1, prev at the start stays at 0', () => {
    mount(2, { reducedMotion: true });
    act(() => api.prev());
    expect(api.step).toBe(0);
    act(() => api.next());
    act(() => api.next());
    expect(api.step).toBe(1);
  });

  it('speed 2 halves the interval', () => {
    mount(4, { reducedMotion: true, intervalMs: 1000 });
    act(() => api.setSpeed(2));
    act(() => api.play());
    act(() => { vi.advanceTimersByTime(500); });
    expect(api.step).toBe(1);
  });

  it('restart goes to step 0', () => {
    mount(3, { reducedMotion: true });
    act(() => api.next());
    act(() => api.restart());
    expect(api.step).toBe(0);
  });

  it('calls onFinish after the last step has been held', () => {
    const onFinish = vi.fn();
    mount(2, { reducedMotion: false, intervalMs: 1000, onFinish });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onFinish).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
