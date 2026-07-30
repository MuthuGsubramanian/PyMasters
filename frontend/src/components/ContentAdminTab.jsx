import { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, Loader2, RefreshCw, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';
import { getTrendingTopics, generateTrendingLessons, getGenerationJobs } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

// Super-admin: turn the latest topics into lessons with one click. Generation
// runs through the same pipeline as "Learn Anything" and lands in the REVIEW
// POOL (generated_lessons) — never auto-published to the live catalogue.

const STATUS_META = {
    completed: { icon: CheckCircle2, cls: 'text-emerald-500', label: 'Ready to review' },
    failed: { icon: XCircle, cls: 'text-red-500', label: 'Failed' },
    queued: { icon: Clock, cls: 'text-amber-500', label: 'Queued' },
};
function statusMeta(s) {
    if (s === 'completed' || s === 'failed' || s === 'queued') return STATUS_META[s];
    return { icon: Loader2, cls: 'text-blue-500 animate-spin', label: (s || 'working').replace(/_/g, ' ') };
}

export default function ContentAdminTab() {
    const [topicsText, setTopicsText] = useState('');
    const [loadingSeed, setLoadingSeed] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [jobs, setJobs] = useState([]);
    const pollRef = useRef(null);

    useEffect(() => {
        getTrendingTopics()
            .then((r) => setTopicsText((r.data?.topics || []).join('\n')))
            .catch((e) => setError(safeErrorMsg(e, 'Could not load suggested topics')))
            .finally(() => setLoadingSeed(false));
    }, []);

    const loadJobs = useCallback(async () => {
        try {
            const r = await getGenerationJobs();
            setJobs(r.data?.jobs || []);
        } catch { /* transient; keep last */ }
    }, []);

    useEffect(() => {
        loadJobs();
        // Poll while any job is still in flight.
        pollRef.current = setInterval(() => {
            setJobs((cur) => {
                const active = cur.some((j) => j.status !== 'completed' && j.status !== 'failed');
                if (active) loadJobs();
                return cur;
            });
        }, 5000);
        return () => clearInterval(pollRef.current);
    }, [loadJobs]);

    const generate = async () => {
        setError(''); setNotice('');
        const topics = topicsText.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 10);
        if (topics.length === 0) { setError('Add at least one topic (one per line).'); return; }
        setGenerating(true);
        try {
            const r = await generateTrendingLessons(topics);
            setNotice(`Generating ${r.data?.count ?? topics.length} lesson(s) into the review pool — ${r.data?.note || ''}`);
            await loadJobs();
        } catch (e) {
            setError(safeErrorMsg(e, 'Generation could not be started'));
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="panel rounded-2xl p-6">
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white shrink-0">
                        <Sparkles size={20} aria-hidden="true" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold font-display text-text-primary">Generate lessons from the latest topics</h2>
                        <p className="text-sm text-text-secondary mt-0.5">
                            One click turns each topic into a full interactive lesson via Vaathiyaar. Results land in the
                            <span className="font-semibold text-text-primary"> review pool</span> — nothing goes live until you publish it.
                        </p>
                    </div>
                </div>

                <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
                    Topics (one per line · max 10)
                </label>
                {loadingSeed ? (
                    <div className="h-40 rounded-xl bg-bg-inset animate-pulse" />
                ) : (
                    <textarea
                        value={topicsText}
                        onChange={(e) => setTopicsText(e.target.value)}
                        rows={8}
                        spellCheck={false}
                        className="input-neo w-full font-mono text-[13px] leading-relaxed resize-y"
                        placeholder="Model Context Protocol for agents&#10;Speculative decoding&#10;..."
                    />
                )}

                {error && <p className="mt-3 text-sm text-red-500" role="alert">{error}</p>}
                {notice && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}

                <div className="flex items-center gap-3 mt-4">
                    <button
                        onClick={generate}
                        disabled={generating || loadingSeed}
                        className="btn-neo btn-neo-primary inline-flex items-center gap-2 py-2.5 disabled:opacity-50"
                    >
                        {generating ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                        Generate lessons
                    </button>
                    <button onClick={loadJobs} className="btn-neo btn-neo-ghost inline-flex items-center gap-2 py-2.5">
                        <RefreshCw size={15} aria-hidden="true" /> Refresh status
                    </button>
                </div>
            </div>

            {/* Review pool: recent generation jobs */}
            <div className="panel rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                    <FileText size={16} className="text-text-muted" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-text-secondary">Recent generation jobs</h3>
                </div>
                {jobs.length === 0 ? (
                    <p className="text-sm text-text-muted">No trend-generation jobs yet. Pick topics above and click Generate.</p>
                ) : (
                    <ul className="divide-y divide-border-default">
                        {jobs.map((j) => {
                            const m = statusMeta(j.status);
                            const Icon = m.icon;
                            return (
                                <li key={j.id} className="flex items-center gap-3 py-2.5">
                                    <Icon size={16} className={`${m.cls} shrink-0`} aria-hidden="true" />
                                    <span className="text-sm text-text-primary flex-1 truncate">{j.topic}</span>
                                    <span className={`text-xs ${m.cls}`}>{m.label}</span>
                                    {j.status === 'failed' && j.error_message && (
                                        <span className="text-[11px] text-text-muted max-w-[30%] truncate" title={j.error_message}>
                                            {j.error_message}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
