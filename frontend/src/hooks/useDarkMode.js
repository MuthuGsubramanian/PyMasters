/**
 * useDarkMode — Persisted dark mode toggle for PyMasters
 */
import { useState, useEffect } from 'react';

export default function useDarkMode() {
    const [isDark, setIsDark] = useState(() => {
        try {
            const saved = localStorage.getItem('pm_dark_mode');
            if (saved !== null) return JSON.parse(saved);
            // Default to system preference
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch { return false; }
    });

    useEffect(() => {
        localStorage.setItem('pm_dark_mode', JSON.stringify(isDark));
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    const toggle = () => setIsDark(d => !d);

    return { isDark, toggle, setIsDark };
}
