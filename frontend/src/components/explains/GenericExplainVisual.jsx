// ──────────────────────────────────────────────────────────────────────────────
// GenericExplainVisual — the persistent visual for ON-DEMAND generated Explains
// essays (per-lesson "Explain this visually" button). It renders DATA (the step
// titles the LLM produced), never code: a numbered progress spine with the active
// step highlighted, so a data-driven essay still gets a real evolving visual.
//
// Props: steps [{title, body}], stepIndex. Defensive against any shape.
// ──────────────────────────────────────────────────────────────────────────────
export default function GenericExplainVisual({ steps = [], stepIndex = 0 }) {
    const list = Array.isArray(steps) ? steps : [];
    const active = Math.max(0, Math.min(stepIndex, Math.max(0, list.length - 1)));
    const current = list[active] || {};

    return (
        <div className="h-full w-full flex items-stretch gap-4 text-text-secondary">
            {/* Numbered spine */}
            <div className="flex flex-col items-center justify-center gap-0 py-2 shrink-0" aria-hidden="true">
                {list.map((_, i) => {
                    const done = i < active;
                    const isActive = i === active;
                    return (
                        <div key={i} className="flex flex-col items-center">
                            <div
                                className={`flex items-center justify-center rounded-full font-bold font-mono transition-all duration-300 ${
                                    isActive
                                        ? 'w-8 h-8 text-white text-xs shadow-glow'
                                        : done
                                        ? 'w-5 h-5 text-white text-[10px]'
                                        : 'w-5 h-5 text-text-muted text-[10px] bg-bg-inset'
                                }`}
                                style={isActive || done ? { background: 'var(--gradient-primary)' } : undefined}
                            >
                                {i + 1}
                            </div>
                            {i < list.length - 1 && (
                                <div
                                    className="w-0.5 h-6 rounded-full transition-colors duration-300"
                                    style={{ background: i < active ? 'var(--accent-primary)' : 'var(--border-default)' }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Active step, shown large — the "picture" that evolves as you scroll */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="panel rounded-2xl p-5 lg:p-7 bg-gradient-card">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-accent-primary mb-2">
                        Step {active + 1} of {list.length || 1}
                    </div>
                    <h3 className="text-xl lg:text-2xl font-bold font-display text-text-primary leading-snug break-words">
                        {current.title || current.body?.slice(0, 80) || 'Explaining…'}
                    </h3>
                    <div className="mt-4 h-1 rounded-full bg-bg-inset overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${((active + 1) / (list.length || 1)) * 100}%`, background: 'var(--gradient-primary)' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
