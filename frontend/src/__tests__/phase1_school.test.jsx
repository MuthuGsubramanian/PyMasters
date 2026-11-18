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
  getSchoolQuestionBank: vi.fn(),
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

  it('supports MATRIC / STATE boards, Question Bank preview, and multi-MCQ + Viva navigation', async () => {
    apiMocks.getSchoolTemplates.mockResolvedValue({
      data: {
        boards: ['STATE', 'MATRIC', 'CBSE', 'ICSE', 'IB'],
        grades: [6, 7, 8, 9, 10, 11, 12],
        templates: [
          {
            id: 'matric_g10_v1',
            board: 'MATRIC',
            grade: 10,
            subjects: [
              { id: 's1', subject_code: 'cs_ai', subject_name: 'Computer Science & AI', pedagogy_mode: 'coding_ide', unit_count: 7 },
              { id: 's2', subject_code: 'mathematics', subject_name: 'Mathematics', pedagogy_mode: 'concept_study', unit_count: 3 },
            ],
          },
        ],
      },
    });
    apiMocks.getOrgCohorts.mockResolvedValue({ data: { cohorts: [] } });
    apiMocks.getSchoolConfig.mockResolvedValue({ data: { config: {} } });
    apiMocks.getSchoolQuestionBank.mockResolvedValue({
      data: {
        board: 'MATRIC',
        board_name: 'Matriculation Mode',
        grade: 10,
        official_course_code: 'TN-MATRIC-CS-10',
        counts: { units: 5, mcqs: 15, short_answers: 5, coding_labs: 5 },
        units: [{ unit_order: 1, term: 'Term 1', unit_title: 'JSON, CSV & File Serialization' }],
      },
    });

    await act(async () => {
      root.render(<SchoolProvisioningWizard orgId="org-school-2" orgType="school" />);
    });

    const boardSelect = container.querySelector('select[aria-label="Educational Board"]');
    const optionValues = Array.from(boardSelect.querySelectorAll('option')).map((o) => o.value);
    expect(optionValues).toEqual(expect.arrayContaining(['STATE', 'MATRIC', 'CBSE', 'ICSE', 'IB']));

    const previewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Preview Question Bank'),
    );
    await act(async () => {
      previewBtn.click();
    });
    expect(container.textContent).toContain('TN-MATRIC-CS-10');
    expect(container.textContent).toContain('15 Verified MCQs');

    // Render multi-question ConceptStudyView with 2 MCQs + Viva Short Answer + Coding Lab
    apiMocks.evaluateConceptCheck.mockResolvedValue({
      data: { passed: true, explanation: 'Correct on Q2!', xp_earned: 75 },
    });

    await act(async () => {
      root.render(
        <ConceptStudyView
          onBack={() => {}}
          lesson={{
            id: 'school_matric_g10_cs_qb_t1',
            board: 'MATRIC',
            grade: 10,
            official_course_code: 'TN-MATRIC-CS-10',
            title: { en: 'Term 1 Question Bank & Viva Prep' },
            pedagogy_mode: 'concept_study',
            concept_checks: [
              { id: 'q1', prompt: 'Question One?', options: ['A1', 'B1'], correct_index: 0, marks: 1, bloom_level: 'remember' },
              { id: 'q2', prompt: 'Question Two?', options: ['A2', 'B2'], correct_index: 1, marks: 1, bloom_level: 'apply' },
            ],
            short_answers: [
              { id: 'sa1', marks: 2, question: 'Differentiate INNER JOIN and LEFT JOIN.', model_answer: 'LEFT JOIN keeps unmatched left rows.' },
            ],
            coding_labs: [
              { id: 'lab1', instruction: 'Print JSON keys', expected_output: "['id']", solution_code: "print(['id'])" },
            ],
          }}
        />,
      );
    });

    expect(container.textContent).toContain('Question 1 of 2');
    const nextBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Next'));
    await act(async () => {
      nextBtn.click();
    });
    expect(container.textContent).toContain('Question 2 of 2');
    expect(container.textContent).toContain('Question Two?');

    const vivaBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Differentiate INNER JOIN and LEFT JOIN.'),
    );
    await act(async () => {
      vivaBtn.click();
    });
    expect(container.textContent).toContain('LEFT JOIN keeps unmatched left rows.');
  });
});
