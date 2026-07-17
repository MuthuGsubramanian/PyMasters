import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';

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
export default function ScrollyExplain({ title, subtitle, minutes, steps, Visual, takeaway }) {
    const navigate = useNavigate();
    const [active, setActive] = useState(0);
    const stepRefs = useRef([]);

    useEffect(() => {
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
    }, [steps.length]);

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

            {/* Scrolly body */}
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
