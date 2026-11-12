import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardrails against mobile WebView / browser scroll-trap and pull-to-refresh regressions.
 * Keeping document-level scrolling enabled below `lg` (`1024px`) ensures Android WebView
 * tracks `scrollY` accurately instead of thinking the page is pinned at `y = 0`.
 */
describe('Mobile scroll & pull-to-refresh guards', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    const layout = readFileSync(resolve(__dirname, '../components/Layout.jsx'), 'utf8');
    const playground = readFileSync(resolve(__dirname, '../pages/Playground.jsx'), 'utf8');

    it('disables vertical overscroll pull-to-refresh bounce on html and body', () => {
        expect(css).toMatch(/html\s*\{[^}]*overscroll-behavior-y:\s*none;/s);
        expect(css).toMatch(/body\s*\{[^}]*overscroll-behavior-y:\s*none;/s);
    });

    it('keeps Layout shell scrollable at the document level on mobile (<lg)', () => {
        expect(layout).toContain('min-h-[100dvh] lg:h-[100dvh]');
        expect(layout).toContain('overflow-x-clip lg:overflow-hidden');
        expect(layout).toContain('lg:overflow-y-auto overflow-x-clip overscroll-y-none');
        expect(layout).not.toMatch(/className="flex h-\[100dvh\]/);
        expect(layout).toContain('window.scrollTo(');
    });

    it('avoids fixed-height mobile scroll traps in Playground', () => {
        expect(playground).toContain('min-h-[calc(100dvh-8.5rem)] lg:h-[calc(100dvh-6.5rem)] flex flex-col lg:overflow-hidden');
        expect(playground).not.toMatch(/className="h-\[calc\(100dvh-8\.5rem\)\]/);
    });
});
