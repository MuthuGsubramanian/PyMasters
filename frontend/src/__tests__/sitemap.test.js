// SEO: every public, indexable page in the router is listed in public/sitemap.xml.
// 2026-11-04: /pricing was public but missing, so search engines were never told about it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const app = read('../App.jsx');
const sitemap = read('../../public/sitemap.xml');
const robots = read('../../public/robots.txt');

// Flows reached from an email or a link, not pages anyone searches for.
const NOT_INDEXABLE = new Set(['/forgot-password']);

function publicRoutes() {
    const out = [];
    for (const m of app.matchAll(/<Route path="(\/[^"]*)" element=\{(.*?)\} \/>/g)) {
        const [, path, element] = m;
        if (path.includes(':') || path.includes('*')) continue;          // per-user links (join, reset, verify)
        if (/PrivateRoute|<Navigate/.test(element)) continue;            // signed-in only, or redirects
        if (robots.split('\n').some((l) => l.startsWith('Disallow:') && path.startsWith(l.slice(9).trim()))) continue;
        out.push(path);
    }
    return out;
}

describe('sitemap.xml', () => {
    it('lists every public page in the router', () => {
        const listed = new Set([...sitemap.matchAll(/<loc>https:\/\/pymasters\.net([^<]*)<\/loc>/g)].map((m) => m[1] || '/'));
        const missing = publicRoutes().filter((p) => !listed.has(p) && !NOT_INDEXABLE.has(p));
        expect(missing).toEqual([]);
    });

    it.each(['Pricing', 'Terms', 'Privacy', 'Security'])('the %s page sets its own title for search results', (page) => {
        expect(read(`../pages/${page}.jsx`)).toMatch(/document\.title = '[^']+ — PyMasters'/);
    });

    it('finds the public routes it is meant to check', () => {
        expect(publicRoutes()).toEqual(expect.arrayContaining(['/pricing', '/terms', '/privacy', '/security']));
    });
});
