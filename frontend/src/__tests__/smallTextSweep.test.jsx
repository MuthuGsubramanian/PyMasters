import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimationRenderer from '../components/animations/AnimationRenderer';

// Visual-clarity follow-ups (2026-11-04 report) + the app-wide rule: text is at least 12px (text-xs) and code-panel
// text keeps >= 4.5:1. code-foreground on bg-code: /60 is ~5.8:1, /50 ~4.4:1, /30 ~2.4:1.
const UP = '..'; // via a variable: vite rewrites a literal new URL('..', import.meta.url) into an asset URL
const SRC = fileURLToPath(new URL(UP, import.meta.url));
const files = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
  return /\.(jsx?|tsx?)$/.test(name) ? [p] : [];
});
const hits = (re) => files(SRC).flatMap((p) => readFileSync(p, 'utf8').split('\n')
  .map((line, i) => (re.test(line) ? `${p.slice(SRC.length)}:${i + 1}` : null)).filter(Boolean));

describe('no sub-12px or low-contrast code text anywhere in the app', () => {
  it('no text-[9px] / text-[10px] / text-[11px] (or 11.5px) class in frontend/src', () => {
    expect(hits(/text-\[(?:[1-9]|1[01])(?:\.\d+)?px\]/)).toEqual([]);
  });

  it('code-panel text is never fainter than code-foreground/60', () => {
    expect(hits(/text-code-foreground\/[1-5]0\b/)).toEqual([]);
  });
});

describe('DataStructure matrix rows scroll inside the card on a phone', () => {
  it('each matrix row is its own horizontal scroller', () => {
    const el = document.createElement('div');
    el.innerHTML = renderToStaticMarkup(<AnimationRenderer language="en" sequence={[{
      type: 'DataStructure', structure_type: 'matrix',
      data: [[101, 202, 303, 404, 505, 606, 707, 808], [1, 2, 3, 4, 5, 6, 7, 8]],
    }]} />);
    const rows = [...el.querySelectorAll('[data-matrix-row]')];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(['overflow-x-auto', 'max-w-full']));
      // its item column may shrink below the row's content width, or the row could never scroll
      expect(row.parentElement.className.split(/\s+/)).toContain('min-w-0');
    }
  });
});
