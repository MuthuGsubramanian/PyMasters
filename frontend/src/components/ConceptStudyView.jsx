import { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Eye,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';
import { evaluateConceptCheck, teachBack } from '../api';
import useI18n from '../hooks/useI18n';

/**
 * ConceptStudyView — Non-IDE interactive pedagogy flow for non-coding school
 * subjects (Mathematics, Physics, Chemistry, Biology, Social Studies).
 * Renders Socratic concept cards, scrolly visual explainers, interactive check,
 * and concept-aware Teach-It-Back mastery without any empty code pane.
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

  const [revealedCards, setRevealedCards] = useState({});
  const [hintShown, setHintShown] = useState({});
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const [teachText, setTeachText] = useState('');
  const [teachFeedback, setTeachFeedback] = useState(null);
  const [teaching, setTeaching] = useState(false);

  const toggleReveal = (id) => setRevealedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleHint = (id) => setHintShown((prev) => ({ ...prev, [id]: !prev[id] }));

  const activeCheck = checks[0] || null;

  const handleSubmitCheck = async () => {
    if (!activeCheck || selectedIdx === null) return;
    setChecking(true);
    try {
      const res = await evaluateConceptCheck({
        lesson_id: lesson.id,
        check_id: activeCheck.id || '',
        selected_index: selectedIdx,
      });
      setCheckResult(res.data);
      if (res.data?.passed) {
        if (Number(res.data.xp_earned) > 0) {
          window.dispatchEvent(new Event('pm:xp-earned'));
        }
        if (onCompleted) onCompleted(lesson.id);
      }
    } catch (err) {
      setCheckResult({
        passed: false,
        explanation: err?.response?.data?.detail || 'Could not verify answer right now.',
      });
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
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-default bg-bg-surface hover:bg-bg-elevated text-sm font-semibold text-text-secondary"
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
      <div className="panel p-6 rounded-2xl border border-border-default bg-bg-surface space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-accent-primary flex items-center gap-1.5">
          <BookOpen size={14} />
          {t('school.conceptStudio', 'Vaathiyaar Concept Studio')}
        </div>
        <h1 className="text-2xl font-display font-bold text-text-primary">{titleText}</h1>
        {descText && <p className="text-sm text-text-secondary leading-relaxed">{descText}</p>}
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
                className="rounded-2xl border border-border-default bg-bg-surface p-5 space-y-3"
              >
                <p className="text-base font-semibold text-text-primary">{card.question}</p>
                <div className="flex flex-wrap gap-2">
                  {card.hint && (
                    <button
                      type="button"
                      onClick={() => toggleHint(cid)}
                      className="min-h-10 px-3 py-1.5 rounded-xl border border-border-default bg-bg-elevated text-xs font-semibold text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5"
                    >
                      <HelpCircle size={13} />
                      {isHinted ? 'Hide Hint' : 'Show Vaathiyaar Hint'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleReveal(cid)}
                    className="min-h-10 px-3 py-1.5 rounded-xl bg-accent-subtle text-accent-primary text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Eye size={13} />
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
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{step.body}</p>
                </div>
                {step.visual_metric && (
                  <div className="rounded-xl bg-bg-elevated border border-border-default px-3 py-2 flex items-center justify-between text-xs">
                    <span className="text-text-muted font-medium">{step.visual_label || 'Model'}</span>
                    <span className="font-mono font-bold text-accent-primary">{step.visual_metric}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Interactive Concept Check */}
      {activeCheck && (
        <section className="rounded-2xl border border-border-default bg-bg-surface p-5 space-y-3">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            {t('school.warmUpCheck', 'Interactive Concept Check')}
          </h2>
          <p className="text-sm font-medium text-text-primary">{activeCheck.prompt || activeCheck.q}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(activeCheck.options || []).map((opt, idx) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`min-h-11 text-left px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
                  selectedIdx === idx
                    ? 'border-accent-primary bg-accent-subtle text-text-primary font-semibold'
                    : 'border-border-default bg-bg-elevated/60 text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              disabled={checking || selectedIdx === null}
              onClick={handleSubmitCheck}
              className="btn-neo min-h-11 px-4 py-2 text-sm font-bold"
            >
              {checking ? 'Checking…' : t('school.checkAnswer', 'Check Answer')}
            </button>
            {checkResult && (
              <span
                className={`text-xs font-semibold ${
                  checkResult.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300'
                }`}
              >
                {checkResult.passed
                  ? `Correct! ${checkResult.xp_earned ? `+${checkResult.xp_earned} XP` : ''}`
                  : 'Try another option!'}
              </span>
            )}
          </div>
          {checkResult?.explanation && (
            <p className="text-xs text-text-secondary bg-bg-elevated rounded-xl p-3 border border-border-default">
              {checkResult.explanation}
            </p>
          )}
        </section>
      )}

      {/* 4. Subject-Aware Teach It Back */}
      <section className="rounded-2xl border border-border-default bg-bg-surface p-5 space-y-3">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <MessageSquare size={16} className="text-accent-primary" />
          {t('school.teachItBackTitle', 'Teach It Back to Vaathiyaar (+15 XP)')}
        </h2>
        <p className="text-xs text-text-muted">
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
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={teaching || teachText.trim().length < 10}
            onClick={handleTeachBack}
            className="btn-neo min-h-11 px-4 py-2 text-sm font-bold inline-flex items-center gap-2"
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
