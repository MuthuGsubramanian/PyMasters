import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchTopics, generateTopic, getModuleStatus } from '../api';
import { Search, Sparkles, Loader2, BookOpen, Wand2, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const LEVELS = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' },
    { id: 'advanced', label: 'Advanced' },
];

export default function TopicSearch() {
    useEffect(() => { document.title = 'Topic Search — PyMasters'; }, []);
    const { user } = useAuth();
    const navigate = useNavigate();

    const [q, setQ] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (!q.trim()) { setData(null); return; }
        setTouched(true);
        setLoading(true);
        const t = setTimeout(() => {
            searchTopics(q.trim(), user?.id)
                .then((r) => setData(r.data))
                .catch(() => setData({ results: [], can_generate: true, query: q }))
                .finally(() => setLoading(false));
        }, 300);
        return () => clearTimeout(t);
    }, [q, user?.id]);

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-text-primary font-display flex items-center gap-2">
                    <Search className="text-cyan-600 dark:text-cyan-400" size={24} /> Topic Search
                </h1>
                <p className="text-text-muted text-sm mt-1">
                    Search the catalogue — and if a topic isn't covered yet, Vaathiyaar will create a session for you.
                </p>
            </div>

            <div className="relative mb-6">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="e.g., decorators, async/await, list comprehensions, gradient descent…"
                    className="w-full bg-bg-elevated border border-border-default rounded-xl pl-12 pr-4 py-3.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/30"
                />
                {loading && <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-600 dark:text-cyan-400 animate-spin" />}
            </div>

            {data && data.results?.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-text-muted mb-2">{data.count} match{data.count === 1 ? '' : 'es'}</p>
                    {data.results.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => navigate('/dashboard/classroom')}
                            className="w-full text-left rounded-xl border border-border-default bg-bg-surface p-4 hover:border-cyan-500/30 transition-colors flex items-center gap-3"
                        >
                            <BookOpen size={18} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-text-primary truncate">
                                    {r.title}{r.generated && <span className="ml-2 text-[10px] text-fuchsia-600 dark:text-fuchsia-400 align-middle">Vaathiyaar-made</span>}
                                </p>
                                {r.description && <p className="text-xs text-text-muted truncate">{r.description}</p>}
                            </div>
                            <ArrowRight size={16} className="text-text-muted shrink-0" />
                        </button>
                    ))}
                </div>
            )}

            {data && touched && data.can_generate && q.trim() && !loading && (
                <GeneratePanel topic={q.trim()} userId={user?.id} />
            )}

            {!touched && (
                <p className="text-center text-text-muted text-sm py-12">Start typing to search across {''}all tracks.</p>
            )}
        </div>
    );
}

function GeneratePanel({ topic, userId }) {
    const navigate = useNavigate();
    const [level, setLevel] = useState('beginner');
    const [focus, setFocus] = useState('');
    const [phase, setPhase] = useState('idle'); // idle | working | done | error
    const [progress, setProgress] = useState(0);
    const [stage, setStage] = useState('');
    const pollRef = useRef(null);

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

    const start = useCallback(async () => {
        setPhase('working'); setProgress(5); setStage('Queued');
        try {
            const res = await generateTopic({ topic, level, focus, user_id: userId });
            const jobId = res.data.job_id;
            pollRef.current = setInterval(async () => {
                try {
                    const s = await getModuleStatus(jobId);
                    setProgress(s.data.progress_pct || 0);
                    setStage((s.data.current_stage || s.data.status || '').replace(/_/g, ' '));
                    if (s.data.status === 'completed') {
                        clearInterval(pollRef.current); setPhase('done');
                    } else if (s.data.status === 'failed') {
                        clearInterval(pollRef.current); setPhase('error');
                    }
                } catch { /* keep polling */ }
            }, 2500);
        } catch {
            setPhase('error');
        }
    }, [topic, level, focus, userId]);

    if (phase === 'done') {
        return (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                <CheckCircle2 className="mx-auto text-emerald-600 dark:text-emerald-400 mb-2" size={28} />
                <p className="text-text-primary font-bold">Your session on "{topic}" is ready!</p>
                <button onClick={() => navigate('/dashboard/classroom')}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] transition-transform">
                    Open in Classroom <ArrowRight size={16} />
                </button>
            </div>
        );
    }

    if (phase === 'error') {
        return (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 flex items-start gap-3">
                <AlertCircle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={18} />
                <div>
                    <p className="text-text-primary font-semibold text-sm">Generation didn't finish</p>
                    <p className="text-text-muted text-xs mt-1">Vaathiyaar couldn't build this session right now. Please try again in a moment.</p>
                    <button onClick={() => setPhase('idle')} className="mt-2 text-xs text-cyan-600 dark:text-cyan-400 font-semibold">Try again</button>
                </div>
            </div>
        );
    }

    if (phase === 'working') {
        return (
            <div className="mt-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-6">
                <div className="flex items-center gap-3 mb-3">
                    <Wand2 className="text-fuchsia-600 dark:text-fuchsia-400 animate-pulse" size={20} />
                    <p className="text-text-primary font-bold text-sm">Vaathiyaar is creating your session on "{topic}"…</p>
                </div>
                <div className="h-2 rounded-full bg-bg-inset overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-text-muted mt-2 capitalize">{stage || 'Working'}… {progress}%</p>
                <p className="text-[11px] text-text-muted mt-1">This can take a minute. You can keep browsing — it'll appear in your Classroom.</p>
            </div>
        );
    }

    return (
        <div className="mt-4 rounded-2xl border border-border-default bg-bg-surface p-6">
            <div className="flex items-center gap-2 mb-1">
                <Sparkles className="text-fuchsia-600 dark:text-fuchsia-400" size={18} />
                <p className="text-text-primary font-bold text-sm">No lesson on "{topic}" yet</p>
            </div>
            <p className="text-text-muted text-xs mb-4">Tell Vaathiyaar a couple of details and it'll generate a tailored session for you.</p>

            <label className="text-xs uppercase font-bold text-text-muted tracking-wider">Your level</label>
            <div className="grid grid-cols-3 gap-2 mt-1 mb-4">
                {LEVELS.map((l) => (
                    <button key={l.id} onClick={() => setLevel(l.id)}
                        className={clsx('py-2 rounded-lg text-sm font-medium border transition-colors',
                            level === l.id ? 'border-cyan-500/50 bg-cyan-500/10 text-text-primary' : 'border-border-default bg-bg-surface text-text-muted hover:border-border-strong')}>
                        {l.label}
                    </button>
                ))}
            </div>

            <label className="text-xs uppercase font-bold text-text-muted tracking-wider">What should it focus on? <span className="text-text-disabled normal-case font-medium">(optional)</span></label>
            <input value={focus} onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g., real-world examples, interview prep, the math behind it"
                className="mt-1 mb-4 w-full bg-bg-elevated border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-cyan-500/40" />

            <button onClick={start}
                className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.01] transition-transform flex items-center justify-center gap-2">
                <Wand2 size={16} /> Ask Vaathiyaar to create it
            </button>
        </div>
    );
}
