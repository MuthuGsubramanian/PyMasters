import { useState, useEffect } from 'react';

// Subscribes to a CSS media query. SSR-safe: false when matchMedia is missing.
// State starts from the live match so the first paint uses the right layout.
function read(query) {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(query).matches
    : false;
}

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => read(query));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener?.(update);
    update();
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener?.(update);
    };
  }, [query]);
  return matches;
}
