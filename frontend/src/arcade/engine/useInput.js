// Keyboard + touch input for the arcade games. Keys map to abstract actions so each game
// decides what "up" or "jump" means; swipes become directions once they are long enough.
import { useEffect, useRef, useState } from 'react';
import { shortcutsBlocked } from '../../games/engine/keys';

const KEYS = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ' ': 'jump', Enter: 'tap',
};

export function keyToAction(key) {
  return KEYS[key] || null;
}

export function swipeToDir(dx, dy, min = 24) {
  if (Math.abs(dx) < min && Math.abs(dy) < min) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * @param {{onAction?: (action: string, e?: Event)=>void, enabled?: boolean, target?: React.RefObject<HTMLElement>}} opts
 * @returns {{touch: boolean}} whether a touch device was detected (show on-screen controls)
 */
export function useInput({ onAction, enabled = true, target } = {}) {
  const cb = useRef(onAction);
  useEffect(() => { cb.current = onAction; }, [onAction]);
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window));

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (shortcutsBlocked(e)) return;
      const action = keyToAction(e.key);
      if (!action) return;
      e.preventDefault();
      cb.current?.(action, e);
    };
    const el = target?.current || window;
    let start = null;
    const onTouchStart = (e) => { setTouch(true); const t = e.touches[0]; start = { x: t.clientX, y: t.clientY, at: Date.now() }; };
    const onTouchEnd = (e) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dir = swipeToDir(t.clientX - start.x, t.clientY - start.y);
      cb.current?.(dir || 'tap', e);
      start = null;
    };
    window.addEventListener('keydown', onKey);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('keydown', onKey);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, target]);

  return { touch };
}

export default useInput;
