import { useState, useEffect } from 'react';

// F4: single source of truth for reduced-motion. Effective value is the user's
// explicit toggle if set, otherwise the OS `prefers-reduced-motion` setting.
// The toggle therefore overrides the OS in BOTH directions.
//   pref '1' → force reduced ON   |   '0' → force reduced OFF   |   null → follow OS
const KEY = 'pm_reduce_motion';
const EVT = 'pm:reduce-motion-change';

export function getReduceMotionPref() {
    try { return localStorage.getItem(KEY); } catch { return null; }
}

export function osPrefersReduced() {
    return typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
}

export function isReducedMotion() {
    const p = getReduceMotionPref();
    return p === '1' ? true : p === '0' ? false : osPrefersReduced();
}

// Reflect the effective value onto <html> so CSS (and the pre-React inline script
// in index.html) can suppress animations consistently.
export function applyReduceMotionClass() {
    const on = isReducedMotion();
    if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('reduce-motion', on);
    }
    return on;
}

// Persist the user's choice: true/false to force, null to follow the OS again.
export function setReduceMotionPref(value) {
    try {
        if (value === null) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, value ? '1' : '0');
    } catch { /* storage unavailable */ }
    applyReduceMotionClass();
    try { window.dispatchEvent(new Event(EVT)); } catch { /* no-op */ }
}

export default function useReducedMotion() {
    const [on, setOn] = useState(() => applyReduceMotionClass());
    useEffect(() => {
        const update = () => setOn(applyReduceMotionClass());
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        mq?.addEventListener?.('change', update);
        window.addEventListener(EVT, update);
        update();
        return () => {
            mq?.removeEventListener?.('change', update);
            window.removeEventListener(EVT, update);
        };
    }, []);
    return on;
}
