import { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, Loader2, RefreshCw, CheckCircle2, XCircle, Clock, FileText, PenLine, Trash2 } from 'lucide-react';
import {
    getTrendingTopics, generateTrendingLessons, getGenerationJobs,
    getContentRequests, createContentRequest, cancelContentRequest,
} from '../api';
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

// ── Claude content-request queue ─────────────────────────────────────────────
// Request any topic and the hourly Claude content agent authors it directly
// into the repo (an Explains essay or Classroom lessons) and ships it via the
// normal deploy — no LLM pipeline involved. "Shipped" appears once the commit
// fulfilling the request has deployed.
const REQ_STATUS = {
    pending: { icon: Clock, cls: 'text-amber-500', label: 'Queued for the next agent run' },
    shipped: { icon: CheckCircle2, cls: 'text-emerald-500', label: 'Shipped' },
    cancelled: { icon: XCircle, cls: 'text-text-muted', label: 'Cancelled' },
};

function ClaudeRequestsPanel() {
    const [topic, setTopic] = useState('');
    const [kind, setKind] = useState('explains');
    const [notes, setNotes] = useState('');
    const [requests, setRequests] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        getContentRequests()
            .then((r) => setRequests(r.data?.requests || []))
            .catch((e) => setError(safeErrorMsg(e, 'Could not load requests')));
    }, []);
    useEffect(() => { load(); }, [load]);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (topic.trim().length < 3) { setError('Topic must be at least 3 characters.'); return; }
        setBusy(true);
        try {
            await createContentRequest(topic.trim(), kind, notes.trim());
            setTopic(''); setNotes('');
            load();
        } catch (err) {
            setError(safeErrorMsg(err, 'Request could not be filed'));
        } finally { setBusy(false); }
    };

    const cancel = async (id) => {
        try { await cancelContentRequest(id); load(); } catch { /* transient */ }
    };

    return (
        <div className="panel rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white shrink-0">
                    <PenLine size={20} aria-hidden="true" />
                </div>
                <div>
                    <h2 className="text-lg font-bold font-display text-text-primary">Request a topic from the Claude author</h2>
                    <p className="text-sm text-text-secondary mt-0.5">
                        The hourly content agent writes it by hand — an <span className="font-semibold text-text-primary">Explains essay</span> or{' '}
                        <span className="font-semibold text-text-primary">Classroom lessons</span> — and it goes live with the next deploy
                        (usually within the hour).
                    </p>
                </div>
            </div>

            <form onSubmit={submit} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        maxLength={200}
                        className="input-neo flex-1 py-2 text-sm"
                        placeholder="e.g. Transformers vs RNNs, SHAP values, DBSCAN…"
                        aria-label="Topic to author"
                    />
                    <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                        className="input-neo py-2 text-sm sm:w-48"
                        aria-label="Content type"
                    >
                        <option value="explains">Explains essay</option>
                        <option value="lessons">Classroom lessons</option>
                    </select>
                </div>
                <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                    className="input-neo w-full py-2 text-sm"
                    placeholder="Optional notes for the author (angle, audience, must-cover points)"
                    aria-label="Notes for the author"
                />
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                <button type="submit" disabled={busy}
                    className="btn-neo btn-neo-primary inline-flex items-center gap-2 py-2.5 disabled:opacity-50 cursor-pointer">
                    {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <PenLine size={16} aria-hidden="true" />}
                    File request
                </button>
            </form>

            <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-text-secondary">Request queue</h3>
                    <button onClick={load} className="text-xs text-text-muted hover:text-text-secondary inline-flex items-center gap-1 cursor-pointer">
                        <RefreshCw size={12} aria-hidden="true" /> Refresh
                    </button>
                </div>
                {requests === null ? (
                    <div className="h-16 rounded-xl bg-bg-inset animate-pulse" />
                ) : requests.length === 0 ? (
                    <p className="text-sm text-text-muted">No requests yet — file one above and the next agent run picks it up.</p>
                ) : (
                    <ul className="divide-y divide-border-default">
                        {requests.map((r) => {
                            const m = REQ_STATUS[r.status] || REQ_STATUS.pending;
                            const Icon = m.icon;
                            return (
                                <li key={r.id} className="flex items-center gap-3 py-2.5">
                                    <Icon size={16} className={`${m.cls} shrink-0`} aria-hidden="true" />
                                    <span className="text-sm text-text-primary flex-1 truncate" title={r.notes || undefined}>{r.topic}</span>
                                    <span className="text-[11px] text-text-muted uppercase tracking-wide">{r.kind}</span>
                                    <span className={`text-xs ${m.cls}`}>{m.label}</span>
                                    {r.status === 'pending' && (
                                        <button onClick={() => cancel(r.id)} aria-label={`Cancel request ${r.topic}`}
                                            className="text-text-muted hover:text-red-500 cursor-pointer p-1">
                                            <Trash2 size={14} aria-hidden="true" />
                                        </button>
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
            <ClaudeRequestsPanel />

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
