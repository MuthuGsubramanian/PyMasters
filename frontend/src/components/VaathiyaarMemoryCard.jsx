import { useCallback, useEffect, useState } from 'react';
import { Brain, Trash2, RefreshCw } from 'lucide-react';
import { getLearnerNotes, deleteLearnerNote } from '../api';

// "What Vaathiyaar has learned about you" — transparency for the adaptive tutor.
// Shows the current pacing level (derived from recent attempts) and the distilled
// notes the nightly learning cycle keeps for this learner. Any note can be
// removed; a removed note is never shown to the tutor again.

const LEVEL_COPY = {
    high: { label: 'Extra support', tone: 'text-amber-700 bg-amber-50 border-amber-200', blurb: 'Vaathiyaar is teaching in smaller steps right now.' },
    medium: { label: 'Standard pacing', tone: 'text-sky-700 bg-sky-50 border-sky-200', blurb: 'Explain, show one example, then you try.' },
    low: { label: 'Stretch mode', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', blurb: 'You are doing well, so answers stay concise and challenge-forward.' },
};

const KIND_LABEL = { misconception: 'Watch out', preference: 'Preference', strength: 'Strength', context: 'Context' };

export default function VaathiyaarMemoryCard({ userId, Card, Heading }) {
    const [state, setState] = useState({ loading: true, notes: [], scaffolding: null, error: false });

    // load() never sets state synchronously (the initial state already says
    // loading), so the mount effect cannot trigger a cascading render; the
    // Refresh/Retry buttons flip the spinner on through refresh().
    const load = useCallback(() => {
        getLearnerNotes(userId)
            .then((r) => setState({ loading: false, notes: r.data?.notes || [], scaffolding: r.data?.scaffolding || null, error: false }))
            .catch(() => setState({ loading: false, notes: [], scaffolding: null, error: true }));
    }, [userId]);
    const refresh = () => { setState((s) => ({ ...s, loading: true, error: false })); load(); };

    useEffect(() => { if (userId) load(); }, [userId, load]);

    const remove = async (noteId) => {
        setState((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== noteId) }));
        try { await deleteLearnerNote(userId, noteId); } catch { /* keep the optimistic removal */ }
    };

    const level = state.scaffolding?.level && LEVEL_COPY[state.scaffolding.level];
    const body = (
        <>
            <Heading icon={Brain} title="What Vaathiyaar has learned about you" subtitle="Updated nightly from your sessions. You control this memory." />
            {state.error && (
                <p className="text-sm text-text-muted">Could not load your tutor memory right now. <button onClick={refresh} className="underline">Retry</button></p>
            )}
            {!state.error && level && (
                <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 mb-4 ${level.tone}`}>
                    <span className="text-xs font-semibold uppercase tracking-wide">{level.label}</span>
                    <span className="text-sm">{level.blurb}</span>
                    {state.scaffolding?.reasons?.[0] && (
                        <span className="text-xs opacity-80">Because: {state.scaffolding.reasons[0]}.</span>
                    )}
                </div>
            )}
            {!state.error && !state.loading && state.notes.length === 0 && (
                <p className="text-sm text-text-muted">
                    Nothing remembered yet. After a few sessions, Vaathiyaar keeps short notes here, such as a concept you tend to mix up or an explanation style you like, and uses them to adapt.
                </p>
            )}
            {!state.error && state.notes.length > 0 && (
                <ul className="divide-y divide-border">
                    {state.notes.map((n) => (
                        <li key={n.id} className="flex items-start gap-3 py-2.5">
                            <span className="mt-0.5 shrink-0 rounded-md bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-text-muted">
                                {KIND_LABEL[n.kind] || n.kind}
                            </span>
                            <span className="flex-1 min-w-0 text-sm text-text-primary">{n.note}</span>
                            <button
                                onClick={() => remove(n.id)}
                                className="shrink-0 p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Forget this"
                                aria-label="Forget this note"
                            >
                                <Trash2 size={14} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {!state.error && (
                <button onClick={refresh} className="mt-3 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary" disabled={state.loading}>
                    <RefreshCw size={12} className={state.loading ? 'animate-spin' : ''} /> Refresh
                </button>
            )}
        </>
    );
    return Card ? <Card index={5}>{body}</Card> : <div className="rounded-2xl border border-border p-6">{body}</div>;
}
