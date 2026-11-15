import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Sparkles,
    Play,
    Code2,
    MessageSquareHeart,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    Zap,
    HelpCircle,
    Mic,
} from 'lucide-react';
import api from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import VaathiyaarGlyph from '../assets/vaathiyaar-glyph.svg';

function resolveText(obj, language = 'en') {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[language] || obj.en || Object.values(obj)[0] || '';
}

/**
 * Single-focus swipeable 4-step lesson card flow for mobile viewports (< lg):
 *   1. Concept Story
 *   2. Watch It Run Trace
 *   3. Interactive Code / Practice (+ Feedback)
 *   4. Teach It Back
 */
export default function MobileLessonFlow({
    lesson,
    language = 'en',
    t,
    phase = 'intro',
    headerMeta = null,
    introNode = null,
    storyContent = '',
    traceNode = null,
    practiceNode = null,
    feedbackNode = null,
    evalResult = null,
    onEnterIntro,
    onEnterPractice,
    onContinue,
    nextLesson = null,
    onNextLesson,
    initialStep = 0,
}) {
    const [step, setStep] = useState(initialStep);
    const touchStartRef = useRef(null);

    // Inline Teach It Back state for Step 4
    const defaultConcept = resolveText(lesson?.active_title || lesson?.title, language) || '';
    const [concept, setConcept] = useState(defaultConcept);
    const [explanation, setExplanation] = useState('');
    const [tbLoading, setTbLoading] = useState(false);
    const [tbError, setTbError] = useState('');
    const [tbResult, setTbResult] = useState(null);

    useEffect(() => {
        setStep(0);
        setConcept(resolveText(lesson?.active_title || lesson?.title, language) || '');
        setExplanation('');
        setTbResult(null);
        setTbError('');
    }, [lesson?.id, language, lesson?.active_title, lesson?.title]);

    useEffect(() => {
        if ((phase === 'practice' || phase === 'feedback') && step < 2) {
            setStep(2);
        } else if (phase === 'intro' && step > 1) {
            setStep(0);
        }
    }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

    const steps = [
        {
            id: 'story',
            shortLabel: t?.('classroom.mobileSteps.storyShort', '1. Story') || '1. Story',
            title: t?.('classroom.mobileSteps.story', '1. Concept Story') || '1. Concept Story',
            icon: Sparkles,
        },
        {
            id: 'trace',
            shortLabel: t?.('classroom.mobileSteps.traceShort', '2. Trace') || '2. Trace',
            icon: Play,
            title: t?.('classroom.mobileSteps.trace', '2. Watch It Run Trace') || '2. Watch It Run Trace',
        },
        {
            id: 'practice',
            shortLabel: t?.('classroom.mobileSteps.practiceShort', '3. Code') || '3. Code',
            icon: Code2,
            title: t?.('classroom.mobileSteps.practice', '3. Interactive Code / Practice') || '3. Interactive Code / Practice',
        },
        {
            id: 'teach',
            shortLabel: t?.('classroom.mobileSteps.teachBackShort', '4. Teach') || '4. Teach',
            icon: MessageSquareHeart,
            title: t?.('classroom.mobileSteps.teachBack', '4. Teach It Back') || '4. Teach It Back',
        },
    ];

    const goToStep = (nextIdx) => {
        const clamped = Math.max(0, Math.min(steps.length - 1, nextIdx));
        setStep(clamped);
        if (clamped === 0) {
            onEnterIntro?.();
        } else if (clamped === 2) {
            onEnterPractice?.();
        }
    };

    const handleTouchStart = (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e) => {
        const start = touchStartRef.current;
        const touch = e.changedTouches?.[0];
        touchStartRef.current = null;
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = Math.abs(touch.clientY - start.y);
        // Ignore vertical scrolls or edits inside code editors
        if (dy > 45 || Math.abs(dx) < 60) return;
        if (e.target?.closest?.('.cm-editor, textarea, input')) return;
        if (dx < -60 && step < steps.length - 1) goToStep(step + 1);
        else if (dx > 60 && step > 0) goToStep(step - 1);
    };

    const handleTeachSubmit = async (e) => {
        e.preventDefault();
        if (!concept.trim() || explanation.trim().length < 10 || tbLoading) return;
        setTbLoading(true);
        setTbError('');
        try {
            const res = await api.post('/classroom/teach-back', {
                concept: concept.trim(),
                explanation: explanation.trim(),
                lesson_id: lesson?.id || '',
            });
            setTbResult(res.data || null);
            if (res.data?.xp_awarded > 0) {
                window.dispatchEvent(new CustomEvent('pm:xp-earned'));
            }
        } catch (err) {
            setTbError(safeErrorMsg(err, 'Could not evaluate your explanation right now.'));
        } finally {
            setTbLoading(false);
        }
    };

    return (
        <section
            aria-label="Mobile vertical lesson flow"
            data-testid="mobile-lesson-flow"
            className="space-y-4"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Compact header — omitted on Step 0 when IntroPhase already renders its full header */}
            {(!introNode || step > 0) && (
                <header className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-subtle text-accent-primary text-xs font-bold uppercase tracking-wider">
                            <Sparkles size={12} aria-hidden="true" />
                            {headerMeta ? `${headerMeta.trackName} · ${headerMeta.position}/${headerMeta.total}` : 'Lesson'}
                        </span>
                        {lesson?.xp_reward && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold">
                                +{lesson.xp_reward} XP
                            </span>
                        )}
                    </div>
                    <h2 className="text-lg font-bold text-text-primary font-display leading-snug">
                        {defaultConcept}
                    </h2>
                </header>
            )}

            {/* 4-step micro-card switcher */}
            <div
                role="tablist"
                aria-label="Lesson steps"
                className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-bg-elevated border border-border-default"
            >
                {steps.map((s, idx) => {
                    const Icon = s.icon;
                    const active = step === idx;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => goToStep(idx)}
                            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] px-1.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                                active
                                    ? 'bg-bg-surface text-accent-primary border border-border-default shadow-sm'
                                    : 'text-text-secondary hover:text-text-primary'
                            }`}
                        >
                            <Icon size={14} aria-hidden="true" />
                            <span className="truncate max-w-full">{s.shortLabel}</span>
                        </button>
                    );
                })}
            </div>

            {/* Active single-focus micro-step card */}
            <div className="min-w-0">
                {step === 0 && (
                    introNode ? (
                        <div className="space-y-4" data-testid="mobile-step-story">
                            {introNode}
                            <button
                                type="button"
                                onClick={() => goToStep(1)}
                                className="w-full min-h-11 rounded-xl border border-border-default bg-bg-surface text-text-primary text-sm font-semibold flex items-center justify-center gap-1.5"
                            >
                                <span>Next: {steps[1].title}</span>
                                <ChevronRight size={16} aria-hidden="true" />
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-2xl bg-bg-surface border border-border-default p-4 space-y-4 shadow-sm" data-testid="mobile-step-story">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shrink-0">
                                    <img src={VaathiyaarGlyph} alt="" className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-accent-primary uppercase tracking-wider">{steps[0].title}</p>
                                    <p className="text-xs text-text-muted">Vaathiyaar explanation</p>
                                </div>
                            </div>
                            <div className="prose prose-sm dark:prose-invert max-w-none text-text-secondary leading-relaxed">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {storyContent || 'Explore how this concept works step by step.'}
                                </ReactMarkdown>
                            </div>
                            <button
                                type="button"
                                onClick={() => goToStep(1)}
                                className="w-full min-h-11 rounded-xl bg-gradient-primary text-white text-sm font-bold flex items-center justify-center gap-1.5"
                            >
                                <span>Next: {steps[1].title}</span>
                                <ChevronRight size={16} aria-hidden="true" />
                            </button>
                        </div>
                    )
                )}

                {step === 1 && (
                    <div className="rounded-2xl bg-bg-surface border border-border-default p-4 space-y-4 shadow-sm" data-testid="mobile-step-trace">
                        <p className="text-xs font-bold text-cyan-700 dark:text-cyan-300 uppercase tracking-wider">
                            {steps[1].title}
                        </p>
                        {traceNode || (
                            <p className="text-sm text-text-secondary leading-relaxed">
                                Ready to practice! Advance to Interactive Code to write and trace your solution live.
                            </p>
                        )}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => goToStep(0)}
                                className="min-h-11 px-3 rounded-xl border border-border-default text-text-secondary text-sm font-semibold flex items-center gap-1"
                            >
                                <ChevronLeft size={16} aria-hidden="true" /> Story
                            </button>
                            <button
                                type="button"
                                onClick={() => goToStep(2)}
                                className="flex-1 min-h-11 rounded-xl bg-gradient-primary text-white text-sm font-bold flex items-center justify-center gap-1.5"
                            >
                                <span>Next: {steps[2].title}</span>
                                <ChevronRight size={16} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4" data-testid="mobile-step-practice">
                        {practiceNode}
                        {evalResult && feedbackNode}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => goToStep(1)}
                                className="min-h-11 px-3 rounded-xl border border-border-default text-text-secondary text-sm font-semibold flex items-center gap-1"
                            >
                                <ChevronLeft size={16} aria-hidden="true" /> Trace
                            </button>
                            <button
                                type="button"
                                onClick={() => goToStep(3)}
                                className="flex-1 min-h-11 rounded-xl bg-bg-elevated border border-border-default text-text-primary text-sm font-bold flex items-center justify-center gap-1.5"
                            >
                                <span>Next: {steps[3].title}</span>
                                <ChevronRight size={16} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="rounded-2xl bg-bg-surface border border-border-default p-4 space-y-4 shadow-sm" data-testid="mobile-step-teachback">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-bold text-accent-primary uppercase tracking-wider">{steps[3].title}</p>
                                <p className="text-xs text-text-muted">Explain in 2–3 sentences to cement mastery (+15 XP)</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new CustomEvent('pm:open-vaathiyaar-voice'))}
                                className="min-h-10 px-3 rounded-xl bg-accent-subtle text-accent-primary text-xs font-bold flex items-center gap-1.5 shrink-0"
                            >
                                <Mic size={14} aria-hidden="true" /> Ask by Voice
                            </button>
                        </div>

                        <form onSubmit={handleTeachSubmit} className="space-y-3">
                            <div>
                                <label htmlFor="mobile-tb-concept" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                                    Concept
                                </label>
                                <input
                                    id="mobile-tb-concept"
                                    type="text"
                                    value={concept}
                                    onChange={(e) => setConcept(e.target.value)}
                                    required
                                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm text-text-primary"
                                />
                            </div>
                            <div>
                                <label htmlFor="mobile-tb-explain" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                                    Your explanation
                                </label>
                                <textarea
                                    id="mobile-tb-explain"
                                    rows={3}
                                    value={explanation}
                                    onChange={(e) => setExplanation(e.target.value)}
                                    placeholder="Explain what it does and give a quick real-world analogy..."
                                    minLength={10}
                                    required
                                    className="w-full px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm text-text-primary"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={tbLoading || !concept.trim() || explanation.trim().length < 10}
                                className="w-full min-h-11 rounded-xl bg-gradient-primary text-white text-sm font-bold disabled:opacity-50"
                            >
                                {tbLoading ? 'Evaluating clarity…' : 'Check My Explanation'}
                            </button>
                        </form>

                        {tbError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{tbError}</p>}

                        {tbResult && (
                            <div className="rounded-xl border border-border-strong bg-bg-elevated p-3.5 space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-primary">
                                        <CheckCircle2 size={14} className="text-emerald-500" />
                                        Clarity: {tbResult.clarity_score}/5 · {tbResult.verdict}
                                    </span>
                                    {tbResult.xp_awarded > 0 && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold">
                                            <Zap size={12} /> +{tbResult.xp_awarded} XP
                                        </span>
                                    )}
                                </div>
                                {tbResult.what_landed && <p className="text-xs text-text-secondary">{tbResult.what_landed}</p>}
                                {tbResult.follow_up_question && (
                                    <p className="text-xs text-text-secondary flex items-start gap-1">
                                        <HelpCircle size={13} className="text-accent-primary shrink-0 mt-0.5" />
                                        <span>{tbResult.follow_up_question}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => goToStep(2)}
                                className="min-h-11 px-3 rounded-xl border border-border-default text-text-secondary text-sm font-semibold flex items-center gap-1"
                            >
                                <ChevronLeft size={16} aria-hidden="true" /> Code
                            </button>
                            {nextLesson && onNextLesson ? (
                                <button
                                    type="button"
                                    onClick={onNextLesson}
                                    className="flex-1 min-h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold"
                                >
                                    Next Lesson →
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onContinue}
                                    className="flex-1 min-h-11 rounded-xl bg-bg-elevated border border-border-default text-text-primary text-sm font-bold"
                                >
                                    All Lessons
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
