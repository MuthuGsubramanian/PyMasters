import { useEffect } from 'react';

/** Call `onEscape` when the user presses Escape (while `active`). */
export function useEscapeKey(onEscape, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape, active]);
}

export default useEscapeKey;
