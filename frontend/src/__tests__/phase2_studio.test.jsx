import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../hooks/useI18n', () => ({
  default: () => ({
    locale: 'en',
    t: (_key, fallback) => fallback || _key,
  }),
}));

const apiMocks = vi.hoisted(() => ({
  getStudioCurricula: vi.fn(),
  ingestCurriculumSyllabus: vi.fn(),
  createStudioCurriculum: vi.fn(),
  createStudioVersion: vi.fn(),
  publishStudioDelta: vi.fn(),
}));

vi.mock('../api', () => apiMocks);

import CurriculumStudioPanel from '../components/CurriculumStudioPanel';

describe('Phase 2 Enterprise Curriculum Studio', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('ingests topics, renders fastembed matches, Explainable Alignment Card, and v1.1 Impact Diff', async () => {
    apiMocks.getStudioCurricula.mockResolvedValue({
      data: {
        curricula: [
          {
            id: 'curr-1',
            title: 'AI Engineering Bootcamp',
            active_version: 'v1.0',
            group_name: 'Eng-Cohort-A',
            modules: [{ order: 1, lesson_id: 'ds_dicts', topic: 'Python Dictionaries' }],
            versions: [{ id: 'v1', version: 'v1.0' }],
            blueprint: {
              estimated_hours: 1.5,
              hands_on_lab_coverage_pct: 100,
              summary: 'AI Engineering Bootcamp spans 1 sequenced module (~1.5 hrs).',
              target_competencies: ['Dictionaries', 'Hash Maps'],
              module_rationales: [
                {
                  order: 1,
                  topic: 'Python Dictionaries',
                  why_included: 'Matched your syllabus requirement (91% semantic alignment).',
                },
              ],
            },
          },
        ],
      },
    });
    apiMocks.ingestCurriculumSyllabus.mockResolvedValue({
      data: {
        matched_count: 1,
        gap_count: 1,
        topics_count: 2,
        matches: [
          {
            topic: 'Python Dictionaries',
            best_score: 0.91,
            status: 'matched',
            matches: [{ id: 'ds_dicts', title: 'Dictionaries & Hash Maps', source_type: 'lesson' }],
          },
          {
            topic: 'Vector Databases',
            best_score: 0.12,
            status: 'gap_queued',
            matches: [],
            queued_job_id: 'job-xyz',
          },
        ],
      },
    });
    apiMocks.createStudioVersion.mockResolvedValue({
      data: {
        from_version: 'v1.0',
        version: 'v1.1',
        published: false,
        impact_diff: {
          added_modules: [{ topic: 'Async FastAPI', lesson_id: 'delta_1' }],
          affected_learners: 18,
        },
      },
    });

    await act(async () => {
      root.render(<CurriculumStudioPanel orgId="org-ent-1" groups={['Eng-Cohort-A']} />);
    });

    expect(container.textContent).toContain('Enterprise Curriculum Studio');
    expect(container.textContent).toContain('Explainable Curriculum Alignment Card');
    expect(container.textContent).toContain('91% semantic alignment');

    // Trigger semantic match form submit
    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(apiMocks.ingestCurriculumSyllabus).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('91% match');
    expect(container.textContent).toContain('Gap Queued');

    // Stage v1.1 delta module
    const deltaInput = container.querySelector('input[aria-label="New delta module topic"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(deltaInput, 'Async FastAPI');
      deltaInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const stageBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Stage Next Version'),
    );
    await act(async () => {
      stageBtn.click();
    });

    expect(apiMocks.createStudioVersion).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Impact Diff: v1.0 -> v1.1');
    expect(container.textContent).toContain('XP · Streaks · Credentials Preserved');
  });
});
