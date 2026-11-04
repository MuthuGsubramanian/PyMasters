import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ScrollyBody } from '../components/ScrollyExplain';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const steps = [
    { title: 'One', body: <p>text-zero</p> },
    { title: 'Two', body: <p>text-one</p> },
    { title: 'Three', body: <p>text-two</p> },
];
const Visual = ({ stepIndex }) => <i data-visual={stepIndex}>V{stepIndex}</i>;

let listeners = [];
function mockMatchMedia(desktop) {
    listeners = [];
    window.matchMedia = (query) => ({
        matches: query.includes('min-width: 1024px') ? desktop : false,
        media: query,
        addEventListener: (_t, fn) => listeners.push(fn),
        removeEventListener: (_t, fn) => { listeners = listeners.filter((l) => l !== fn); },
        addListener: () => {},
        removeListener: () => {},
    });
}

afterEach(() => { delete window.matchMedia; });

describe('ScrollyBody below lg', () => {
    it('stacks each Visual before its step text, with no sticky element', () => {
        mockMatchMedia(false);
        const html = renderToStaticMarkup(<ScrollyBody steps={steps} Visual={Visual} />);
        expect(html).not.toMatch(/\bsticky\b/);
        const idx = [0, 1, 2].map((i) => html.indexOf(`data-visual="${i}"`));
        const txt = [0, 1, 2].map((i) => html.indexOf(`text-${['zero', 'one', 'two'][i]}`));
        expect(idx.every((n) => n >= 0)).toBe(true);
        expect([...idx, ...txt].every((n) => n >= 0)).toBe(true);
        for (let i = 0; i < 3; i++) {
            expect(idx[i]).toBeLessThan(txt[i]);
            if (i < 2) expect(txt[i]).toBeLessThan(idx[i + 1]);
        }
        expect(html.match(/data-visual=/g)).toHaveLength(3);
        expect(html).toContain('clamp(220px, 40vh, 320px)');
    });

    it('keeps the sticky desktop layout with one Visual at lg+', () => {
        mockMatchMedia(true);
        const html = renderToStaticMarkup(<ScrollyBody steps={steps} Visual={Visual} />);
        expect(html).toMatch(/\bsticky\b/);
        expect(html.match(/data-visual=/g)).toHaveLength(1);
    });

    it('switches layout when the media query changes and cleans up', () => {
        mockMatchMedia(false);
        const el = document.createElement('div');
        const root = createRoot(el);
        act(() => { root.render(<ScrollyBody steps={steps} Visual={Visual} />); });
        expect(el.querySelectorAll('[data-visual]')).toHaveLength(3);
        expect(listeners.length).toBeGreaterThan(0);
        act(() => { root.unmount(); });
        expect(listeners).toHaveLength(0);
    });
});
