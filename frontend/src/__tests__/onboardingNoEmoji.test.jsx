import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render } from '../games/__tests__/render.js';

// Redesign "Later" S6: org members (and everyone else) went through an onboarding with 56 emoji.
// Options use lucide icons (svg, aria-hidden) and plain text instead.
let mockUser = { id: 'u1', name: 'Asha', account_type: 'individual' };
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, updateUser: vi.fn() }) }));
vi.mock('../api', () => ({ default: { post: vi.fn(), get: vi.fn() }, saveOrgOnboarding: vi.fn() }));
vi.mock('../components/LanguageSelector', () => ({ default: () => <div data-testid="lang" /> }));
import Onboarding from '../pages/Onboarding';

const EMOJI = /\p{Extended_Pictographic}/u;
// Unmount after each test so no animation frame or timer renders after the environment is torn down.
let mounted = [];
const mount = () => { const r = render(<MemoryRouter><Onboarding /></MemoryRouter>); mounted.push(r); return r; };

describe('onboarding without emoji', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
  afterEach(() => { mounted.forEach((r) => r.unmount()); mounted = []; });

  it.each([['individual'], ['organization']])('%s onboarding has no emoji and gives every option an icon', (type) => {
    mockUser = { id: 'u1', name: 'Asha', account_type: type };
    const { container, click } = mount();
    expect(container.textContent).not.toMatch(EMOJI);
    const options = [...container.querySelectorAll('button[aria-pressed]')];
    expect(options.length).toBeGreaterThan(5);
    for (const b of options) expect(b.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    // A picked option shows a check icon, not a text tick.
    click(options[0]);
    expect(options[0].textContent).not.toMatch(/[✓✔]/);
    expect(container.textContent).not.toMatch(EMOJI);
  });

  it('the header and footer text is at least 12px and the skip link is a 44px target', () => {
    mockUser = { id: 'u1', name: 'Asha', account_type: 'organization' };
    const { container } = mount();
    expect(container.innerHTML).not.toMatch(/text-\[(9|10|11)px\]/);
    const skip = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Skip setup'));
    expect(skip.className).toMatch(/min-h-11/);
  });
});
