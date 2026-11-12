import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render } from '../games/__tests__/render.js';
import { getRankInfo, rankProgressPct, formatRankLabel } from '../utils/xpRank';

const apiGetMock = vi.fn();

vi.mock('../api', () => ({
  default: {
    get: (...args) => apiGetMock(...args),
    post: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ dark: false, toggle: vi.fn() }),
}));

import Guides from '../pages/Guides';
import VerifyCredential from '../pages/VerifyCredential';

let mounted = [];
const mount = (node) => {
  const r = render(node);
  mounted.push(r);
  return r;
};

const flush = (r) =>
  r.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

describe('xpRank canonical tiers', () => {
  it('maps XP boundaries consistently across all six ranks', () => {
    expect(getRankInfo(-25).rank).toBe('Novice');
    expect(getRankInfo(0).rank).toBe('Novice');
    expect(getRankInfo(99).rank).toBe('Novice');
    expect(getRankInfo(100).rank).toBe('Apprentice');
    expect(getRankInfo(499).rank).toBe('Apprentice');
    expect(getRankInfo(500).rank).toBe('Intermediate');
    expect(getRankInfo(999).rank).toBe('Intermediate');
    expect(getRankInfo(1000).rank).toBe('Advanced');
    expect(getRankInfo(1999).rank).toBe('Advanced');
    expect(getRankInfo(2000).rank).toBe('Expert');
    expect(getRankInfo(4999).rank).toBe('Expert');
    expect(getRankInfo(5000).rank).toBe('Master');
    expect(getRankInfo(25000).rank).toBe('Master');
  });

  it('computes progress within current band and formats education vs individual labels', () => {
    expect(rankProgressPct(0)).toBe(0);
    expect(rankProgressPct(50)).toBe(50);
    expect(rankProgressPct(300)).toBe(50);
    expect(rankProgressPct(5000)).toBe(100);
    expect(formatRankLabel(2200, 'individual')).toBe('Expert');
    expect(formatRankLabel(2200, 'education')).toBe('Level 5');
  });
});

describe('Guides public SEO index & article reader', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    apiGetMock.mockReset();
  });

  afterEach(() => {
    mounted.forEach((r) => r.unmount());
    mounted = [];
  });

  it('renders searchable engineering guides index at /guides', async () => {
    apiGetMock.mockResolvedValueOnce({
      data: {
        guides: [
          {
            slug: 'run-qwen3-0-6b-llm-on-any-laptop',
            title: 'Run Qwen3 0.6B LLM on Any Laptop in Python',
            description: 'Quantized local inference on CPU with clean token streaming.',
            reading_minutes: 12,
            level: 'Intermediate',
            tags: ['Local LLM', 'Inference'],
          },
        ],
      },
    });

    const r = mount(
      <MemoryRouter initialEntries={['/guides']}>
        <Routes>
          <Route path="/guides" element={<Guides />} />
        </Routes>
      </MemoryRouter>
    );
    await flush(r);

    expect(document.title).toMatch(/— PyMasters$/);
    expect(r.container.textContent).toContain('Run Qwen3 0.6B LLM on Any Laptop in Python');
    expect(r.container.textContent).toContain('Start Practicing Free');
  });

  it('renders guide detail with runnable Playground CTA and Under the Hood breakdown', async () => {
    apiGetMock.mockResolvedValueOnce({
      data: {
        slug: 'run-qwen3-0-6b-llm-on-any-laptop',
        title: 'Run Qwen3 0.6B LLM on Any Laptop in Python',
        description: 'Quantized local inference on CPU with clean token streaming.',
        reading_minutes: 12,
        level: 'Intermediate',
        tags: ['Local LLM'],
        content_markdown: '## Attention Masking\n\nPool non-padding tokens cleanly.',
        example_code: 'import numpy as np\nprint(np.mean([1.0, 2.0]))\n',
        under_the_hood: {
          summary: 'Mean pooling weights valid tokens using the attention mask.',
          steps: [{ title: 'Mask broadcast', body: 'Multiply hidden states by mask.' }],
          takeaway: 'Always L2-normalize after pooling.',
        },
      },
    });

    const r = mount(
      <MemoryRouter initialEntries={['/guides/run-qwen3-0-6b-llm-on-any-laptop']}>
        <Routes>
          <Route path="/guides/:slug" element={<Guides />} />
        </Routes>
      </MemoryRouter>
    );
    await flush(r);

    expect(r.container.textContent).toContain('Attention Masking');
    expect(r.container.textContent).toContain('Run in Playground');
    expect(r.container.textContent).toContain('Always L2-normalize after pooling.');
  });
});

describe('VerifyCredential public registry page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    apiGetMock.mockReset();
  });

  afterEach(() => {
    mounted.forEach((r) => r.unmount());
    mounted = [];
  });

  it('displays verified credential details and LinkedIn certification link', async () => {
    apiGetMock.mockResolvedValueOnce({
      data: {
        valid: true,
        cred_id: 'PYM-2026-ABCD12',
        kind: 'path',
        target_id: 'python_zero_to_hero',
        title: 'Python Zero to Hero',
        recipient_name: 'Aarav Raman',
        lessons_completed: 24,
        issued_at: '2026-11-12T10:00:00Z',
        issuer: 'PyMasters',
        partner_note: 'Official OpenEDG Python Institute Education Partner.',
      },
    });

    const r = mount(
      <MemoryRouter initialEntries={['/verify/PYM-2026-ABCD12']}>
        <Routes>
          <Route path="/verify/:credId" element={<VerifyCredential />} />
        </Routes>
      </MemoryRouter>
    );
    await flush(r);

    expect(r.container.textContent).toContain('Aarav Raman');
    expect(r.container.textContent).toContain('Python Zero to Hero');
    expect(r.container.textContent).toContain('24 completed');
    const linkedInAnchor = [...r.container.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Add to LinkedIn Profile')
    );
    expect(linkedInAnchor).toBeTruthy();
    expect(linkedInAnchor.getAttribute('href')).toContain('organizationId=113061910');
    expect(linkedInAnchor.getAttribute('href')).toContain('certId=PYM-2026-ABCD12');
  });

  it('renders an informative >80-char status card on unknown credential IDs', async () => {
    apiGetMock.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { response: { status: 404 } }));

    const r = mount(
      <MemoryRouter initialEntries={['/verify/PYM-0000-NOTFOUND']}>
        <Routes>
          <Route path="/verify/:credId" element={<VerifyCredential />} />
        </Routes>
      </MemoryRouter>
    );
    await flush(r);

    const statusCard = r.container.querySelector('section[aria-label="Credential Verification Status"]');
    expect(statusCard).toBeTruthy();
    expect(statusCard.textContent.trim().length).toBeGreaterThan(80);
    expect(statusCard.textContent).toContain('PYM-0000-NOTFOUND');
    expect(statusCard.textContent).toContain('pymasters.net');
  });
});
