import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Eye,
  FileQuestion,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';
import { evaluateConceptCheck, teachBack } from '../api';
import useI18n from '../hooks/useI18n';

/**
 * ConceptStudyView — Interactive non-IDE pedagogy & Board Question Bank flow for
 * school subjects (Computer Science Term Question Banks, Mathematics, Physics,
 * Chemistry, Biology, Social Studies).
 * Renders Socratic concept cards, scrolly visual explainers, a multi-question
 * MCQ navigator (1..N), Board Exam Short-Answer / Viva accordions, Practical
 * Coding Lab references, and Teach-It-Back mastery.
 */
export default function ConceptStudyView({
  lesson,
  onBack,
  onCompleted,
}) {
  const { t } = useI18n();
  const titleText =
    typeof lesson?.title === 'object' ? lesson.title.en || Object.values(lesson.title)[0] : lesson?.title || '';
  const descText =
    typeof lesson?.description === 'object'
      ? lesson.description.en || Object.values(lesson.description)[0]
      : lesson?.description || '';

  const socraticCards = lesson?.socratic_cards || [];
  const scrollySteps = lesson?.scrolly_steps || [];
  const checks = lesson?.concept_checks || lesson?.quiz || [];
  const shortAnswers = lesson?.short_answers || [];
  const codingLabs = lesson?.coding_labs || [];
  const examSections = lesson?.exam_pattern?.sections || [];

  const [revealedCards, setRevealedCards] = useState({});
  const [hintShown, setHintShown] = useState({});

  const [activeCheckIdx, setActiveCheckIdx] = useState(0);
  const [selectedByIdx, setSelectedByIdx] = useState({});
  const [resultsByIdx, setResultsByIdx] = useState({});
  const [checking, setChecking] = useState(false);

  const [openVivaIds, setOpenVivaIds] = useState({});
  const [openLabSolutionIds, setOpenLabSolutionIds] = useState({});

  const [teachText, setTeachText] = useState('');
  const [teachFeedback, setTeachFeedback] = useState(null);
  const [teaching, setTeaching] = useState(false);

  useEffect(() => {
    setRevealedCards({});
    setHintShown({});
    setActiveCheckIdx(0);
    setSelectedByIdx({});
    setResultsByIdx({});
    setOpenVivaIds({});
    setOpenLabSolutionIds({});
    setTeachText('');
    setTeachFeedback(null);
  }, [lesson?.id]);

  const toggleReveal = (id) => setRevealedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleHint = (id) => setHintShown((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleViva = (id) => setOpenVivaIds((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleLabSol = (id) => setOpenLabSolutionIds((prev) => ({ ...prev, [id]: !prev[id] }));

  const safeIdx = checks.length > 0 ? Math.min(activeCheckIdx, checks.length - 1) : 0;
  const activeCheck = checks[safeIdx] || null;
  const selectedIdx = selectedByIdx[safeIdx] ?? null;
  const checkResult = resultsByIdx[safeIdx] || null;

  const answeredCount = Object.keys(resultsByIdx).length;
  const passedCount = Object.values(resultsByIdx).filter((r) => r?.passed).length;

  const handleSelectOption = (idx) => {
    setSelectedByIdx((prev) => ({ ...prev, [safeIdx]: idx }));
  };

  const handleSubmitCheck = async () => {
    if (!activeCheck || selectedIdx === null) return;
    setChecking(true);
    try {
      const res = await evaluateConceptCheck({
        lesson_id: lesson.id,
        check_id: activeCheck.id || '',
        selected_index: selectedIdx,
      });
      setResultsByIdx((prev) => ({ ...prev, [safeIdx]: res.data }));
      if (res.data?.passed) {
        if (Number(res.data.xp_earned) > 0) {
          window.dispatchEvent(new Event('pm:xp-earned'));
        }
        if (onCompleted) onCompleted(lesson.id);
      }
    } catch (err) {
      setResultsByIdx((prev) => ({
        ...prev,
        [safeIdx]: {
          passed: false,
          explanation: err?.response?.data?.detail || 'Could not verify answer right now.',
        },
      }));
    } finally {
      setChecking(false);
    }
  };

  const handleTeachBack = async () => {
    if (teachText.trim().length < 10) return;
    setTeaching(true);
    try {
      const res = await teachBack({
        lesson_id: lesson.id,
        concept: titleText || lesson.topic || lesson.id,
        explanation: teachText.trim(),
      });
      setTeachFeedback(res.data);
      if (Number(res.data?.xp_awarded) > 0) {
        window.dispatchEvent(new Event('pm:xp-earned'));
      }
    } catch (err) {
      setTeachFeedback({
        verdict: 'needs_detail',
        what_landed: err?.response?.data?.detail || 'Add one more concrete everyday example.',
      });
    } finally {
      setTeaching(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border-default bg-bg-surface hover:bg-bg-elevated text-sm font-semibold text-text-secondary"
        >
          <ArrowLeft size={16} />
          {t('classroom.backToLessons', 'Back to Lessons')}
        </button>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {lesson?.board && (
            <span className="px-2.5 py-1 rounded-full bg-accent-subtle text-accent-primary">
              {lesson.board} · Grade {lesson.grade}
            </span>
          )}
          {lesson?.official_course_code && (
            <span className="px-2.5 py-1 rounded-full bg-bg-elevated border border-border-default text-text-primary font-mono">
              {lesson.official_course_code}
            </span>
          )}
          {lesson?.subject_name && (
            <span className="px-2.5 py-1 rounded-full bg-bg-elevated border border-border-default text-text-secondary">
              {lesson.subject_name}
            </span>
          )}
          {lesson?.term && (
            <span className="px-2.5 py-1 rounded-full bg-bg-elevated border border-border-default text-text-muted">
              {lesson.term}
            </span>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="panel p-5 sm:p-6 rounded-2xl border border-border-default bg-bg-surface space-y-2.5">
        <div className="text-xs font-bold uppercase tracking-wider text-accent-primary flex items-center gap-1.5">
          <BookOpen size={14} />
          {t('school.conceptStudio', 'Vaathiyaar Concept Studio')}
        </div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-text-primary break-words">{titleText}</h1>
        {descText && <p className="text-sm text-text-secondary leading-relaxed">{descText}</p>}
        {examSections.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {examSections.map((sec) => (
              <span
                key={sec}
                className="text-xs px-2.5 py-1 rounded-lg bg-bg-elevated border border-border-default text-text-secondary"
              >
                {sec}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 1. Vaathiyaar Socratic Concept Cards */}
      {socraticCards.length > 0 && (
        <section className="space-y-3" aria-label="Socratic Concept Cards">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Lightbulb size={16} className="text-amber-500" />
            {t('school.socraticCards', 'Think First: Socratic Concept Cards')}
          </h2>
          {socraticCards.map((card, idx) => {
            const cid = card.id || `card-${idx}`;
            const isRevealed = !!revealedCards[cid];
            const isHinted = !!hintShown[cid];
            return (
              <div
                key={cid}
                className="rounded-2xl border border-border-default bg-bg-surface p-4 sm:p-5 space-y-3"
              >
                <p className="text-sm sm:text-base font-semibold text-text-primary">{card.question}</p>
                <div className="flex flex-wrap gap-2">
                  {card.hint && (
                    <button
                      type="button"
                      onClick={() => toggleHint(cid)}
                      className="min-h-11 px-3.5 py-2 rounded-xl border border-border-default bg-bg-elevated text-xs font-semibold text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5"
                    >
                      <HelpCircle size={14} />
                      {isHinted ? 'Hide Hint' : 'Show Vaathiyaar Hint'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleReveal(cid)}
                    className="min-h-11 px-3.5 py-2 rounded-xl bg-accent-subtle text-accent-primary text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Eye size={14} />
                    {isRevealed ? 'Hide Explanation' : 'Reveal Insight'}
                  </button>
                </div>
                {isHinted && card.hint && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-800 dark:text-amber-200">
                    <strong>Hint:</strong> {card.hint}
                  </div>
                )}
                {isRevealed && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-sm text-text-primary space-y-1">
                    <p>{card.reveal}</p>
                    {card.takeaway && (
                      <p className="text-xs text-text-muted pt-1">
                        <strong>Key takeaway:</strong> {card.takeaway}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* 2. Scrollytelling Visual Explainers */}
      {scrollySteps.length > 0 && (
        <section className="space-y-3" aria-label="Visual Concept Breakdown">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Sparkles size={16} className="text-accent-primary" />
            {t('school.visualExplainer', 'Step-by-Step Visual Breakdown')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scrollySteps.map((step, idx) => (
              <div
                key={step.title || idx}
                className="rounded-2xl border border-border-default bg-bg-surface p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-accent-primary">
                    Step {idx + 1}
                  </span>
                  <h3 className="text-sm font-bold text-text-primary mt-0.5">{step.title}</h3>
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                    {step.body || step.caption}
                  </p>
                </div>
                {step.visual_metric && (
                  <div className="rounded-xl bg-bg-elevated border border-border-default px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-text-muted font-medium">{step.visual_label || 'Model'}</span>
                    <span className="font-mono font-bold text-accent-primary">{step.visual_metric}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Multi-Question Bank & Interactive Concept Check Navigator */}
      {activeCheck && (
        <section
          className="rounded-2xl border border-border-default bg-bg-surface p-4 sm:p-5 space-y-4"
          aria-label="Question Bank Navigator"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              {t('school.warmUpCheck', 'Interactive Concept Check')}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-accent-subtle text-accent-primary font-bold">
                Question {safeIdx + 1} of {checks.length}
              </span>
              {checks.length > 1 && (
                <span className="px-2.5 py-1 rounded-full bg-bg-elevated border border-border-default text-text-secondary font-semibold">
                  Score: {passedCount}/{checks.length} ({answeredCount} answered)
                </span>
              )}
            </div>
          </div>

          {checks.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Question numbers">
              {checks.map((chk, idx) => {
                const res = resultsByIdx[idx];
                const isCurrent = idx === safeIdx;
                return (
                  <button
                    key={chk.id || idx}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    aria-label={`Question ${idx + 1}`}
                    onClick={() => setActiveCheckIdx(idx)}
                    className={`min-h-11 min-w-11 px-2.5 rounded-xl border text-xs font-bold transition-colors ${
                      isCurrent
                        ? 'border-accent-primary bg-accent-primary text-primary-foreground'
                        : res?.passed
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : res
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'border-border-default bg-bg-elevated text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          )}

          {(activeCheck.unit_title || activeCheck.marks || activeCheck.difficulty || activeCheck.bloom_level) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {activeCheck.unit_title && (
                <span className="px-2.5 py-0.5 rounded-md bg-bg-elevated border border-border-default text-text-secondary font-medium">
                  {activeCheck.unit_title}
                </span>
              )}
              {activeCheck.marks && (
                <span className="px-2 py-0.5 rounded-md bg-accent-subtle text-accent-primary font-bold">
                  {activeCheck.marks} {activeCheck.marks === 1 ? 'Mark' : 'Marks'}
                </span>
              )}
              {activeCheck.difficulty && (
                <span className="px-2 py-0.5 rounded-md bg-bg-elevated border border-border-default text-text-muted capitalize">
                  {activeCheck.difficulty}
                </span>
              )}
              {activeCheck.bloom_level && (
                <span className="px-2 py-0.5 rounded-md bg-bg-elevated border border-border-default text-text-muted capitalize">
                  Bloom: {activeCheck.bloom_level}
                </span>
              )}
            </div>
          )}

          <p className="text-sm font-medium text-text-primary leading-relaxed">
            {activeCheck.prompt || activeCheck.question || activeCheck.q}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(activeCheck.options || []).map((opt, idx) => (
              <button
                key={`${safeIdx}-${idx}-${opt}`}
                type="button"
                onClick={() => handleSelectOption(idx)}
                className={`min-h-11 text-left px-3.5 py-2.5 rounded-xl border text-sm transition-colors break-words ${
                  selectedIdx === idx
                    ? 'border-accent-primary bg-accent-subtle text-text-primary font-semibold'
                    : 'border-border-default bg-bg-elevated/60 text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={checking || selectedIdx === null}
                onClick={handleSubmitCheck}
                className="btn-neo btn-neo-primary min-h-11 px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {checking ? 'Checking…' : t('school.checkAnswer', 'Check Answer')}
              </button>
              {checks.length > 1 && (
                <>
                  <button
                    type="button"
                    disabled={safeIdx === 0}
                    onClick={() => setActiveCheckIdx((i) => Math.max(0, i - 1))}
                    className="min-h-11 px-3 py-2 rounded-xl border border-border-default bg-bg-elevated text-xs font-semibold text-text-secondary hover:text-text-primary disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    <ChevronLeft size={14} />
                    {t('school.prevQuestion', 'Prev')}
                  </button>
                  <button
                    type="button"
                    disabled={safeIdx >= checks.length - 1}
                    onClick={() => setActiveCheckIdx((i) => Math.min(checks.length - 1, i + 1))}
                    className="min-h-11 px-3 py-2 rounded-xl border border-border-default bg-bg-elevated text-xs font-semibold text-text-secondary hover:text-text-primary disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    {t('school.nextQuestion', 'Next')}
                    <ChevronRight size={14} />
                  </button>
                </>
              )}
            </div>

            {checkResult && (
              <span
                className={`text-xs font-semibold ${
                  checkResult.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {checkResult.passed
                  ? `Correct! ${checkResult.xp_earned ? `+${checkResult.xp_earned} XP` : ''}`
                  : 'Try another option!'}
              </span>
            )}
          </div>

          {checkResult?.explanation && (
            <p className="text-xs text-text-secondary bg-bg-elevated rounded-xl p-3 border border-border-default leading-relaxed">
              {checkResult.explanation}
            </p>
          )}
        </section>
      )}

      {/* 4. Board Exam Short-Answer / Viva-Voce Bank */}
      {shortAnswers.length > 0 && (
        <section
          className="rounded-2xl border border-border-default bg-bg-surface p-4 sm:p-5 space-y-3"
          aria-label="Board Short-Answer and Viva Bank"
        >
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <FileQuestion size={16} className="text-accent-primary" />
            {t('school.vivaBankTitle', 'Board Short-Answer & Viva-Voce Bank')}
          </h2>
          <div className="space-y-2.5">
            {shortAnswers.map((sa, idx) => {
              const sid = sa.id || `sa-${idx}`;
              const isOpen = !!openVivaIds[sid];
              return (
                <div
                  key={sid}
                  className="rounded-xl border border-border-default bg-bg-elevated/60 overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleViva(sid)}
                    className="min-h-11 w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 hover:bg-bg-elevated transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-accent-subtle text-accent-primary font-bold">
                          {sa.marks || 2} Marks
                        </span>
                        {sa.unit_title && (
                          <span className="text-text-muted truncate">{sa.unit_title}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-text-primary">{sa.question}</p>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-text-muted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-border-default text-xs text-text-secondary leading-relaxed">
                      <strong className="text-emerald-700 dark:text-emerald-300">Model Answer: </strong>
                      {sa.model_answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Practical Python 3.11 Coding Lab Reference */}
      {codingLabs.length > 0 && (
        <section
          className="rounded-2xl border border-border-default bg-bg-surface p-4 sm:p-5 space-y-3"
          aria-label="Practical Coding Lab Reference"
        >
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Code2 size={16} className="text-accent-primary" />
            {t('school.codingLabRefTitle', 'Practical Python 3.11 Lab Exercises')}
          </h2>
          <div className="space-y-3">
            {codingLabs.map((lab, idx) => {
              const lid = lab.id || `lab-${idx}`;
              const showSol = !!openLabSolutionIds[lid];
              return (
                <div
                  key={lid}
                  className="rounded-xl border border-border-default bg-bg-elevated/60 p-3.5 space-y-2.5"
                >
                  {lab.unit_title && (
                    <span className="inline-block text-xs font-semibold text-accent-primary">
                      {lab.unit_title}
                    </span>
                  )}
                  <p className="text-sm font-medium text-text-primary">{lab.instruction}</p>
                  {lab.expected_output && (
                    <div className="text-xs text-text-secondary">
                      <span className="font-semibold text-text-muted">Expected stdout: </span>
                      <code className="font-mono px-1.5 py-0.5 rounded bg-bg-surface border border-border-default break-all">
                        {lab.expected_output}
                      </code>
                    </div>
                  )}
                  {lab.solution_code && (
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleLabSol(lid)}
                        className="min-h-11 px-3.5 py-2 rounded-xl border border-border-default bg-bg-surface text-xs font-semibold text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5"
                      >
                        <Code2 size={14} />
                        {showSol ? 'Hide Reference Code' : 'View Verified Python 3.11 Solution'}
                      </button>
                      {showSol && (
                        <pre className="mt-2 p-3 rounded-xl bg-bg-surface border border-border-default text-xs font-mono text-text-primary overflow-x-auto">
                          <code>{lab.solution_code}</code>
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. Subject-Aware Teach It Back */}
      <section className="rounded-2xl border border-border-default bg-bg-surface p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <MessageSquare size={16} className="text-accent-primary" />
          {t('school.teachItBackTitle', 'Teach It Back to Vaathiyaar (+15 XP)')}
        </h2>
        <p className="text-xs text-text-muted leading-relaxed">
          {lesson?.teach_back_prompt ||
            `Explain "${titleText}" in your own everyday words with one real-life example.`}
        </p>
        <textarea
          rows={3}
          value={teachText}
          onChange={(e) => setTeachText(e.target.value)}
          placeholder="Example: When I press a thumbtack vs a flat palm with the same push, because the tip has tiny area..."
          className="input-neo w-full p-3 text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={teaching || teachText.trim().length < 10}
            onClick={handleTeachBack}
            className="btn-neo btn-neo-primary min-h-11 px-4 py-2 text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Send size={14} />
            {teaching ? 'Evaluating…' : t('school.submitTeachBack', 'Submit Explanation')}
          </button>
          {teachFeedback?.clarity_score && (
            <span className="text-xs font-bold text-accent-primary">
              Clarity: {teachFeedback.clarity_score}/5 ({teachFeedback.verdict})
            </span>
          )}
        </div>
        {teachFeedback && (
          <div className="rounded-xl bg-bg-elevated border border-border-default p-3.5 text-xs space-y-1">
            <p className="text-text-primary">{teachFeedback.what_landed}</p>
            {teachFeedback.follow_up_question && (
              <p className="text-text-muted">
                <strong>Next question:</strong> {teachFeedback.follow_up_question}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
