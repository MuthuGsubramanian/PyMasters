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
  getSchoolTemplates: vi.fn(),
  getOrgCohorts: vi.fn(),
  getSchoolConfig: vi.fn(),
  provisionCohortSyllabus: vi.fn(),
  updateSchoolConfig: vi.fn(),
  evaluateConceptCheck: vi.fn(),
  teachBack: vi.fn(),
}));

vi.mock('../api', () => apiMocks);

import SchoolProvisioningWizard from '../components/SchoolProvisioningWizard';
import ConceptStudyView from '../components/ConceptStudyView';

describe('Phase 1 School Provisioning & ConceptStudyView', () => {
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

  it('loads Board -> Grade templates and submits Load All Subjects cohort provisioning', async () => {
    apiMocks.getSchoolTemplates.mockResolvedValue({
      data: {
        boards: ['CBSE', 'ICSE', 'STATE', 'IB'],
        grades: [6, 7, 8, 9, 10, 11, 12],
        templates: [
          {
            id: 'tpl_cbse_g8',
            board: 'CBSE',
            grade: 8,
            subjects: [
              { id: 's1', subject_code: 'cs_ai', subject_name: 'Computer Science & AI', pedagogy_mode: 'coding_ide', unit_count: 1 },
              { id: 's2', subject_code: 'physics', subject_name: 'Physics', pedagogy_mode: 'concept_study', unit_count: 1 },
              { id: 's3', subject_code: 'social_studies', subject_name: 'Social Studies', pedagogy_mode: 'concept_study', unit_count: 1 },
            ],
          },
        ],
      },
    });
    apiMocks.getOrgCohorts.mockResolvedValue({ data: { cohorts: [] } });
    apiMocks.getSchoolConfig.mockResolvedValue({
      data: { config: { sso_provider: '', sso_domain: '', seat_limit: 250 } },
    });
    apiMocks.provisionCohortSyllabus.mockResolvedValue({
      data: { cohort_name: 'Grade 8 - Section A', subjects: [{}, {}, {}], modules_count: 3 },
    });

    await act(async () => {
      root.render(<SchoolProvisioningWizard orgId="org-school-1" orgType="school" />);
    });

    expect(container.textContent).toContain('School Syllabus & Cohort Provisioning');
    expect(container.textContent).toContain('Computer Science & AI');
    expect(container.textContent).toContain('Physics');
    expect(container.textContent).toContain('Social Studies');

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(apiMocks.provisionCohortSyllabus).toHaveBeenCalledTimes(1);
    const [orgArg, payload] = apiMocks.provisionCohortSyllabus.mock.calls[0];
    expect(orgArg).toBe('org-school-1');
    expect(payload.board).toBe('CBSE');
    expect(payload.grade).toBe(8);
    expect(payload.load_all_subjects).toBe(true);
    expect(payload.hide_public_tracks).toBe(true);
  });

  it('renders ConceptStudyView without Python code editor and grades concept check', async () => {
    apiMocks.evaluateConceptCheck.mockResolvedValue({
      data: { passed: true, explanation: 'Force per unit area!', xp_earned: 50 },
    });
    const onCompleted = vi.fn();

    await act(async () => {
      root.render(
        <ConceptStudyView
          onBack={() => {}}
          onCompleted={onCompleted}
          lesson={{
            id: 'school_concept_cbse_g8_physics_u1',
            title: { en: 'Force and Pressure' },
            description: { en: 'Understand how area changes pressure.' },
            subject_name: 'Physics',
            pedagogy_mode: 'concept_study',
            socratic_cards: [
              { id: 'c1', question: 'Why do camels have wide feet?', reveal: 'Large area lowers pressure on sand.', hint: 'P = F / A' },
            ],
            scrolly_steps: [{ title: 'Step 1', caption: 'Same force, bigger area = smaller pressure.' }],
            concept_checks: [
              {
                id: 'chk1',
                question: 'Which blade cuts more easily?',
                options: ['Blunt blade', 'Sharp blade'],
                correct_index: 1,
                explanation: 'Smaller contact area increases pressure.',
              },
            ],
          }}
        />,
      );
    });

    expect(container.textContent).toContain('Force and Pressure');
    expect(container.textContent).toContain('Why do camels have wide feet?');
    expect(container.querySelector('.cm-editor')).toBeNull();

    const optBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Sharp blade'),
    );
    expect(optBtn).toBeTruthy();
    await act(async () => {
      optBtn.click();
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Check Answer'),
    );
    expect(submitBtn).toBeTruthy();
    await act(async () => {
      submitBtn.click();
    });

    expect(apiMocks.evaluateConceptCheck).toHaveBeenCalledWith({
      lesson_id: 'school_concept_cbse_g8_physics_u1',
      check_id: 'chk1',
      selected_index: 1,
    });
    expect(onCompleted).toHaveBeenCalledWith('school_concept_cbse_g8_physics_u1');
  });
});
