import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import useReducedMotion from '../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// ScrollyExplain — MLU-Explain-style scrollytelling engine.
//
// One persistent visualization stays pinned while short prose steps scroll
// past; entering a step re-renders the SAME visual in a new state, so the
// reader watches one picture evolve instead of parsing many figures.
//
// Props:
//   title, subtitle, minutes  — essay header
//   steps: [{ title?, body }] — prose sections (body = JSX)
//   Visual                    — component; receives { stepIndex }
//   takeaway                  — closing card content (JSX)
//
// Desktop: text column left, sticky visual right. Mobile: sticky visual on
// top, text scrolls beneath it. Step activation via IntersectionObserver.
// ──────────────────────────────────────────────────────────────────────────────
// ── ScrollyBody ───────────────────────────────────────────────────────────────
// The reusable scrollytelling core: two-column grid, sticky synced visual with
// progress dots, IntersectionObserver step activation. Used by ScrollyExplain
// (Explains essays) and by the Classroom lesson intro (scroll-synced flow).
export function ScrollyBody({ steps, Visual }) {
    const [active, setActive] = useState(0);
    const stepRefs = useRef([]);
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        // F4: no scroll-driven advancement under reduced motion — the explicit
        // step controls drive `active` instead (below). Skip the observer entirely.
        if (reducedMotion) return undefined;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const idx = Number(entry.target.dataset.step);
                        if (!Number.isNaN(idx)) setActive(idx);
                    }
                });
            },
            // Fire when a step crosses the vertical middle of the viewport.
            { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
        );
        stepRefs.current.forEach((el) => el && observer.observe(el));
        return () => observer.disconnect();
    }, [steps.length, reducedMotion]);

    // Clamp active if the step count shrinks.
    useEffect(() => { if (active > steps.length - 1) setActive(Math.max(0, steps.length - 1)); }, [steps.length, active]);

    // ── F4: reduced-motion path — one step at a time, driven by prev/next controls.
    // Same `Visual` receiving the same stepIndex, so the teaching is complete; only
    // the scroll-driven motion is removed. Keyboard: ← / → move between steps.
    if (reducedMotion) {
        const step = steps[active] || steps[0];
        const go = (d) => setActive((a) => Math.min(steps.length - 1, Math.max(0, a + d)));
        return (
            <div
                className="lg:grid lg:grid-cols-2 lg:gap-10"
                role="group"
                aria-roledescription="Step-by-step lesson"
                onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); }}
            >
                <div className="order-2 lg:order-2 lg:col-start-2 lg:row-start-1 h-[42vh] lg:h-[70vh] mb-6 lg:mb-0">
                    <div className="panel rounded-2xl h-full p-3 lg:p-5 flex flex-col overflow-hidden">
                        <div className="flex-1 min-h-0"><Visual stepIndex={active} /></div>
                        <div className="flex items-center justify-center gap-1.5 pt-2 flex-shrink-0" aria-hidden="true">
                            {steps.map((_, i) => (
                                <span key={i} className={`rounded-full ${i === active ? 'w-4 h-1.5 bg-accent-primary' : 'w-1.5 h-1.5 bg-bg-inset'}`} />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="lg:col-start-1 lg:row-start-1 flex flex-col justify-center">
                    <div className="max-w-md" aria-live="polite">
                        {step?.title && (
                            <h2 className="text-lg font-bold font-display text-text-primary mb-2">
                                <span className="text-accent-primary mr-2 font-mono text-sm">{String(active + 1).padStart(2, '0')}</span>
                                {step.title}
                            </h2>
                        )}
                        <div className="text-[15px] text-text-secondary leading-relaxed space-y-3">{step?.body}</div>
                    </div>
                    <div className="flex items-center gap-3 mt-6">
                        <button
                            onClick={() => go(-1)}
                            disabled={active === 0}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-border-default bg-bg-elevated text-text-secondary hover:bg-bg-inset disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft size={16} /> Previous
                        </button>
                        <span className="text-xs text-text-muted tabular-nums">Step {active + 1} of {steps.length}</span>
                        <button
                            onClick={() => go(1)}
                            disabled={active >= steps.length - 1}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-accent-primary/40 bg-accent-subtle text-accent-primary hover:bg-accent-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="lg:grid lg:grid-cols-2 lg:gap-10">
                {/* Sticky visual — top on mobile, right column on desktop */}
                <div className="sticky top-14 lg:top-6 z-20 order-2 h-[42vh] lg:h-[78vh] mb-6 lg:mb-0 lg:order-2 lg:col-start-2 lg:row-start-1 float-none">
                    <div className="panel rounded-2xl h-full p-3 lg:p-5 flex flex-col overflow-hidden">
                        <div className="flex-1 min-h-0">
                            <Visual stepIndex={active} />
                        </div>
                        {/* Progress dots */}
                        <div className="flex items-center justify-center gap-1.5 pt-2 flex-shrink-0" aria-hidden="true">
                            {steps.map((_, i) => (
                                <span
                                    key={i}
                                    className={`rounded-full transition-all duration-300 ${
                                        i === active ? 'w-4 h-1.5 bg-accent-primary' : 'w-1.5 h-1.5 bg-bg-inset'
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Prose steps */}
                <div className="lg:col-start-1 lg:row-start-1">
                    {steps.map((step, i) => (
                        <section
                            key={i}
                            ref={(el) => { stepRefs.current[i] = el; }}
                            data-step={i}
                            className="min-h-[55vh] lg:min-h-[70vh] flex items-center"
                            aria-current={i === active ? 'step' : undefined}
                        >
                            <div
                                className={`max-w-md transition-opacity duration-300 ${
                                    i === active ? 'opacity-100' : 'opacity-40'
                                }`}
                            >
                                {step.title && (
                                    <h2 className="text-lg font-bold font-display text-text-primary mb-2">
                                        <span className="text-accent-primary mr-2 font-mono text-sm">{String(i + 1).padStart(2, '0')}</span>
                                        {step.title}
                                    </h2>
                                )}
                                <div className="text-[15px] text-text-secondary leading-relaxed space-y-3">{step.body}</div>
                            </div>
                        </section>
                    ))}
                </div>
        </div>
    );
}

export default function ScrollyExplain({ title, subtitle, minutes, steps, Visual, takeaway }) {
    const navigate = useNavigate();

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <button
                onClick={() => navigate('/dashboard/explains')}
                className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-accent-primary transition-colors mb-4 cursor-pointer"
            >
                <ArrowLeft size={14} />
                All Explains
            </button>
            <header className="mb-6 max-w-2xl">
                <h1 className="text-3xl lg:text-4xl font-bold font-display text-text-primary tracking-tight">{title}</h1>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{subtitle}</p>
                {minutes && (
                    <p className="text-[11px] text-text-muted mt-2 flex items-center gap-1">
                        <Clock size={11} /> {minutes} min · scroll to explore
                    </p>
                )}
            </header>

            <ScrollyBody steps={steps} Visual={Visual} />

            {/* Takeaway */}
            {takeaway && (
                <div className="max-w-2xl mt-4 mb-12 panel rounded-2xl p-5 border-l-2 border-accent-primary/50">
                    <h3 className="text-sm font-bold font-display text-text-primary mb-2">The takeaway</h3>
                    <div className="text-sm text-text-secondary leading-relaxed space-y-2">{takeaway}</div>
                </div>
            )}
        </div>
    );
}
