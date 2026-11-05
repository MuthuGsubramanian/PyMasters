import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render } from '../games/__tests__/render.js';

// Redesign "Later" I11: Login was dark-always (bg-[#020617], text-white, slate-400/500) while the app follows
// the light/dark toggle. It now uses the semantic tokens, so it follows the theme like every product screen.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('../api', () => {
  const off = () => Promise.resolve({ data: { enabled: false } });
  return {
    loginUser: vi.fn(), registerUser: vi.fn(), getMe: vi.fn(),
    getLinkedInConfig: off, getGitHubConfig: off, startLinkedIn: vi.fn(), startGitHub: vi.fn(),
  };
});
import Login from '../pages/Login';

// Fixed dark-palette classes that cannot follow the theme.
const HARD_DARK = /bg-\[#020617\]|(?:^|\s)text-white(?:\s|$)|text-slate-\d00|placeholder-slate|bg-white\/\[0\.0\d\]|border-white\/\[0\.0\d\]/;
// Solid-colour buttons keep white text (>= 4.5:1 on purple-600 / GitHub / LinkedIn in both themes).
const SOLID = /bg-purple-600|bg-\[#24292f\]|bg-\[#0a66c2\]/;

function offenders(root) {
  return [...root.querySelectorAll('*')]
    .filter((el) => typeof el.className === 'string' && HARD_DARK.test(el.className))
    .filter((el) => !SOLID.test(el.className) && !el.closest('button[class*="bg-purple-600"]'))
    .map((el) => `${el.tagName.toLowerCase()}.${el.className.split(/\s+/).filter((c) => HARD_DARK.test(` ${c} `)).join('.')}`);
}

const buttonWith = (root, txt) => [...root.querySelectorAll('button')].find((b) => b.textContent.includes(txt));

// Unmount after each test so no animation frame or timer renders after the environment is torn down.
let mounted = [];
const mount = () => { const r = render(<MemoryRouter><Login /></MemoryRouter>); mounted.push(r); return r; };

describe('Login follows the light/dark theme', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { mounted.forEach((r) => r.unmount()); mounted = []; });

  it('sign-in uses theme tokens, no fixed dark palette, gradients or glass blur', () => {
    const { container } = mount();
    const root = container.firstElementChild;
    expect(root.className).toMatch(/bg-bg-base/);
    expect(container.querySelector('h2').className).toMatch(/text-text-primary/);
    expect(offenders(container)).toEqual([]);
    expect(container.innerHTML).not.toMatch(/gradient|blur-\[|backdrop-blur|text-\[(9|10|11)px\]/);
    expect(buttonWith(container, 'Sign In').className).toMatch(/bg-purple-600/);
  });

  it('the sign-up account-type and organisation steps use theme tokens too', async () => {
    const r = mount();
    // AnimatePresence mode="wait" swaps steps after the exit animation.
    const settle = () => r.act(async () => { await new Promise((ok) => setTimeout(ok, 600)); });
    r.click(buttonWith(r.container, 'Sign up'));
    await settle();
    expect(r.container.textContent).toMatch(/Individual Learner/);
    expect(offenders(r.container)).toEqual([]);
    r.click(buttonWith(r.container, 'Organization / School / Enterprise'));
    await settle();
    expect(r.container.textContent).toMatch(/Organization Name/);
    expect(offenders(r.container)).toEqual([]);
    expect(r.container.innerHTML).not.toMatch(/gradient|text-\[(9|10|11)px\]/);
  });
});
