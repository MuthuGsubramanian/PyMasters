import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render } from '../games/__tests__/render.js';

// Redesign "Later" I9 (phone Playground): the layout was fixed in #239, but the controls were still 24-32px
// tall on a phone (Save px-2 py-1, Run py-2, Install py-1.5) and Run Code was white on green-600 (3.3:1).
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn() },
  getPlaygroundFiles: vi.fn(() => Promise.resolve({ data: { files: [] } })),
  getPlaygroundFile: vi.fn(), createPlaygroundFile: vi.fn(), updatePlaygroundFile: vi.fn(), deletePlaygroundFile: vi.fn(),
}));
vi.mock('../components/PythonEditor', () => ({ default: () => <div data-testid="editor" /> }));
vi.mock('../components/VaathiyaarMessage', () => ({ default: () => null }));
vi.mock('../components/VoiceTutor', () => ({ default: () => null }));
import Playground from '../pages/Playground';

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});

// Unmount after each test so nothing renders after the environment is torn down.
let mounted = [];
const mount = () => { const r = render(<Playground />); mounted.push(r); return r; };
afterEach(() => {
  for (const r of mounted) r.unmount();
  mounted = [];
});

const NAMES = ['Voice', 'Save', 'Save as', 'My files', 'Run Code', 'Visualize', 'Clear', 'Send to Vaathiyaar', 'Install'];
const ICON_ONLY_ON_PHONE = ['Save as', 'My files', 'Visualize', 'Send to Vaathiyaar'];

function find(root, name) {
  return [...root.querySelectorAll('button')].find((b) =>
    (b.getAttribute('aria-label') || b.textContent).trim() === name || b.textContent.trim() === name);
}

describe('Playground controls are 44px touch targets on a phone', () => {
  it.each(NAMES)('%s is at least 44px tall below the laptop breakpoint', (name) => {
    const { container } = mount();
    const b = find(container, name);
    expect(b, name).toBeTruthy();
    expect(b.className.split(/\s+/)).toContain('min-h-11');
    if (ICON_ONLY_ON_PHONE.includes(name)) expect(b.className.split(/\s+/)).toContain('min-w-11');
  });

  it('the pip package field is 44px tall too', () => {
    const { container } = mount();
    expect(container.querySelector('input[aria-label="Package name to install"]').className).toMatch(/\bmin-h-11\b/);
  });

  it('Run Code is white on green-700 (5:1), not green-600 (3.3:1)', () => {
    const { container } = mount();
    const run = find(container, 'Run Code');
    expect(run.className).toMatch(/\bbg-green-700\b/);
    expect(run.className).not.toMatch(/\bbg-green-600\b/);
  });
});
