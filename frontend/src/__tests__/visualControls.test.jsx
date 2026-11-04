import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PlayableVisual } from '../components/animations/VisualControls';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;
function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem('pm_reduce_motion', '1');
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  localStorage.removeItem('pm_reduce_motion');
});

const visual = (label) => (step) => <div data-testid={label}>{label}:{step}</div>;
const btn = (c, name) => c.querySelector(`button[aria-label="${name}"]`);
const keydown = (target, key) => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
});

describe('VisualControls', () => {
  it('renders labelled buttons and a polite step counter', () => {
    mount(<PlayableVisual total={5}>{visual('a')}</PlayableVisual>);
    for (const n of ['Previous step', 'Play', 'Next step', 'Restart']) {
      expect(btn(container, n), n).toBeTruthy();
    }
    expect(container.querySelector('button[aria-label^="Speed"]')).toBeTruthy();
    const counter = container.querySelector('[aria-live="polite"]');
    expect(counter.textContent).toBe('Step 1 of 5');
    act(() => btn(container, 'Next step').click());
    expect(counter.textContent).toBe('Step 2 of 5');
    expect(container.textContent).toContain('a:1');
  });

  it('toggles Play to Pause', () => {
    mount(<PlayableVisual total={5}>{visual('a')}</PlayableVisual>);
    act(() => btn(container, 'Play').click());
    expect(btn(container, 'Pause')).toBeTruthy();
  });

  it('ArrowRight on the focused wrapper advances; ArrowLeft goes back', () => {
    mount(<PlayableVisual total={5}>{visual('a')}</PlayableVisual>);
    const wrap = container.querySelector('[tabindex="0"]');
    keydown(wrap, 'ArrowRight');
    expect(container.textContent).toContain('a:1');
    keydown(wrap, 'ArrowLeft');
    expect(container.textContent).toContain('a:0');
  });

  it('ignores arrow keys from inputs, textareas and the code editor', () => {
    mount(
      <PlayableVisual total={5}>
        {(s) => (
          <div>
            <span>a:{s}</span>
            <input data-t="input" />
            <textarea data-t="ta" />
            <div className="cm-content"><span data-t="cm" /></div>
          </div>
        )}
      </PlayableVisual>,
    );
    for (const t of ['input', 'ta', 'cm']) {
      keydown(container.querySelector(`[data-t="${t}"]`), 'ArrowRight');
    }
    expect(container.textContent).toContain('a:0');
  });

  it('two visuals keep independent counters', () => {
    mount(
      <div>
        <PlayableVisual total={5}>{visual('first')}</PlayableVisual>
        <PlayableVisual total={5}>{visual('second')}</PlayableVisual>
      </div>,
    );
    const nexts = container.querySelectorAll('button[aria-label="Next step"]');
    act(() => nexts[0].click());
    const counters = container.querySelectorAll('[aria-live="polite"]');
    expect(counters[0].textContent).toBe('Step 2 of 5');
    expect(counters[1].textContent).toBe('Step 1 of 5');
  });

  it('Next on the last step completes the sequence', () => {
    const onComplete = vi.fn();
    mount(<PlayableVisual total={2} onComplete={onComplete}>{visual('a')}</PlayableVisual>);
    act(() => btn(container, 'Next step').click());
    expect(onComplete).not.toHaveBeenCalled();
    act(() => btn(container, 'Next step').click());
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
