import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { createElement as h } from 'react';
import { act } from 'react';
import useStepPlayback from '../hooks/useStepPlayback';
import { PlayableVisual, getStepTotal } from '../components/animations/VisualControls';
import { loopStepCount } from '../components/animations/normalize';
import CodeStepper from '../components/animations/CodeStepper';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;
function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}
beforeEach(() => { vi.useFakeTimers(); localStorage.setItem('pm_reduce_motion', '0'); });
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  localStorage.removeItem('pm_reduce_motion');
});
const btn = (name) => container.querySelector(`button[aria-label="${name}"]`);
const key = (target, k) => {
  let ev;
  act(() => {
    ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
  });
  return ev;
};

describe('fix round 1', () => {
  it('a one-step visual autoplays and finishes once', () => {
    const onFinish = vi.fn();
    function P() { useStepPlayback(1, { reducedMotion: false, intervalMs: 1000, onFinish }); return null; }
    mount(h(P));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('Space toggles play/pause on the wrapper, not from a button or editor', () => {
    mount(
      <PlayableVisual total={5}>
        {() => <div><input data-t="in" /><div className="cm-content"><i data-t="cm" /></div></div>}
      </PlayableVisual>,
    );
    const wrap = container.querySelector('[tabindex="0"]');
    expect(btn('Pause')).toBeTruthy(); // autoplaying
    const ev = key(wrap, ' ');
    expect(ev.defaultPrevented).toBe(true);
    expect(btn('Play')).toBeTruthy();
    key(btn('Play'), ' ');
    expect(btn('Play')).toBeTruthy();
    key(container.querySelector('[data-t="in"]'), ' ');
    key(container.querySelector('[data-t="cm"]'), ' ');
    expect(btn('Play')).toBeTruthy();
    key(wrap, ' ');
    expect(btn('Pause')).toBeTruthy();
  });

  it('onComplete fires once per mount', () => {
    localStorage.setItem('pm_reduce_motion', '1');
    const onComplete = vi.fn();
    mount(<PlayableVisual total={1} onComplete={onComplete}>{() => <i />}</PlayableVisual>);
    act(() => btn('Next step').click());
    act(() => btn('Next step').click());
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('loopStepCount matches the component for each loop shape', () => {
    expect(loopStepCount({ loopType: 'while', condition: 'x < 3' })).toBe(0);
    expect(loopStepCount({ loopType: 'while', iterations: [{}, {}] })).toBe(2);
    expect(loopStepCount({ loopType: 'for_range', collection: ['a', 'b', 'c'], rangeStart: 0, rangeEnd: 2 })).toBe(2);
    expect(loopStepCount({ loopType: 'for', collection: ['a', 'b', 'c'] })).toBe(3);
    expect(loopStepCount({ loopType: 'for', collection: [], rangeStart: 0, rangeEnd: 10, rangeStep: 5 })).toBe(2);
    expect(getStepTotal('LoopVisualizer', { loopType: 'while', condition: 'x' })).toBe(0);
  });

  it('a wrapped CodeStepper reports each step through onStep', () => {
    localStorage.setItem('pm_reduce_motion', '1');
    const onStep = vi.fn();
    mount(
      <PlayableVisual total={3}>
        {(s) => <CodeStepper code={'a\nb\nc'} highlightSequence={[1, 2, 3]} onStep={onStep} controlledStep={s} />}
      </PlayableVisual>,
    );
    act(() => btn('Next step').click());
    act(() => btn('Next step').click());
    expect(onStep).toHaveBeenCalledWith(2, 3);
  });
});
