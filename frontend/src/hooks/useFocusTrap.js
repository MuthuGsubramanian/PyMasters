import { useEffect } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * Trap Tab focus within `ref` while `active`, and restore focus to the
 * previously-focused element on unmount. For modals/drawers (WCAG 2.4.3).
 */
export function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const node = ref.current;
    const prev = document.activeElement;
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE));
    (focusables()[0] || node).focus();
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [ref, active]);
}

export default useFocusTrap;
