import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Wand2, AlertCircle } from 'lucide-react';
import { requestModule, getModuleStatus } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

// Friendly labels for each generation stage (maps to backend status values).
const STAGE_LABELS = {
    queued: 'Vaathiyaar is getting ready…',
    stage_1_outline: 'Planning the lesson outline…',
    stage_1_complete: 'Outline ready…',
    stage_2_narrative: 'Writing the story…',
    stage_2_complete: 'Story ready…',
    stage_3_animation: 'Designing the animations…',
    stage_3_complete: 'Animations ready…',
    stage_4_challenges: 'Creating practice challenges…',
    stage_4_complete: 'Challenges ready…',
    stage_5_assembly: 'Putting it all together…',
    completed: 'Your lesson is ready!',
};

const SUGGESTIONS = ['Web scraping with Python', 'Decorators explained', 'How recursion works', 'Build a REST API', 'List comprehensions'];

// ──────────────────────────────────────────────────────────────────────────
// "Learn anything" — type a topic, Vaathiyaar generates a tailor-made lesson.
// ──────────────────────────────────────────────────────────────────────────
export default function LearnAnything({ userId, onLessonReady, initialTopic = '' }) {
    const [topic, setTopic] = useState(initialTopic);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(null);   // { status, progress_pct }
    const [err, setErr] = useState('');
    const pollRef = useRef(null);

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

    // Seed the input when a topic arrives via prop after mount — e.g. the Trending
    // "Explore Topic" deep-link (/dashboard/classroom?topic=<title>). Optional and
    // backward-compatible: when `initialTopic` is the default '' nothing changes,
    // so every existing call site behaves exactly as before. Guarded on an idle,
    // empty box so it never clobbers what the learner is typing or an in-progress
    // generation.
    useEffect(() => {
        if (initialTopic && !busy) setTopic(initialTopic);
    }, [initialTopic]); // eslint-disable-line react-hooks/exhaustive-deps

    const start = async (e) => {
        e?.preventDefault();
        const t = topic.trim();
        if (!t || busy || !userId) return;
        setBusy(true); setErr(''); setStatus({ status: 'queued', progress_pct: 5 });
        try {
            const res = await requestModule(userId, t);
            const jobId = res.data.job_id;
            let tries = 0;
            pollRef.current = setInterval(async () => {
                tries += 1;
                try {
                    const s = await getModuleStatus(jobId);
                    setStatus(s.data);
                    if (s.data.status === 'completed' && s.data.result_lesson_id) {
                        clearInterval(pollRef.current);
                        setBusy(false); setStatus(null); setTopic('');
                        onLessonReady(s.data.result_lesson_id);
                    } else if (s.data.status === 'failed' || tries > 90) {
                        clearInterval(pollRef.current);
                        setBusy(false); setStatus(null);
                        setErr(s.data.error_message || 'That took too long — please try again.');
                    }
                } catch (e2) {
                    clearInterval(pollRef.current);
                    setBusy(false); setStatus(null);
                    setErr(safeErrorMsg(e2, 'Lost connection while generating.'));
                }
            }, 4000);
        } catch (e1) {
            setBusy(false); setStatus(null);
            setErr(safeErrorMsg(e1, 'Could not start generation. Please try again.'));
        }
    };

    const pct = status?.progress_pct ?? 0;
    const label = STAGE_LABELS[status?.status] || 'Working…';

    return (
        <div className="rounded-2xl border border-purple-200 dark:border-border-default bg-gradient-to-br from-purple-50 via-white to-cyan-50 dark:bg-none dark:bg-bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white shadow-md">
                    <Wand2 size={16} />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-text-primary">Learn anything</h3>
                    <p className="text-xs text-slate-500 dark:text-text-muted">Tell Vaathiyaar a topic and get a custom, interactive lesson built just for you.</p>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {busy ? (
                    <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
                        <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-accent-primary font-medium">
                            <Loader2 size={15} className="animate-spin" /> {label}
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-purple-100 dark:bg-bg-inset overflow-hidden">
                            <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(pct, 5)}%` }}
                                transition={{ ease: 'easeOut', duration: 0.6 }}
                            />
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-text-muted">This usually takes 1–3 minutes. Hang tight — your lesson opens automatically when it's ready.</p>
                    </motion.div>
                ) : (
                    <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
                        <form onSubmit={start} className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 rounded-xl border border-purple-200 dark:border-border-default bg-white dark:bg-bg-elevated px-3 py-2.5 focus-within:border-purple-400 focus-within:ring-1 focus-within:ring-purple-200 dark:focus-within:ring-accent-primary/30 transition-all">
                                <Sparkles size={16} className="text-purple-400 flex-shrink-0" />
                                <input
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="e.g. How do Python generators work?"
                                    className="flex-1 bg-transparent text-sm text-slate-800 dark:text-text-primary placeholder-slate-400 dark:placeholder:text-text-muted outline-none"
                                />
                            </div>
                            <button type="submit" disabled={!topic.trim()} className="btn-neo btn-neo-primary text-sm py-2.5 px-5 disabled:opacity-40 disabled:cursor-not-allowed">
                                Generate
                            </button>
                        </form>
                        {err && (
                            <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
                                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {err}
                            </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {SUGGESTIONS.map((s) => (
                                <button key={s} onClick={() => setTopic(s)} className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-bg-elevated border border-purple-200 dark:border-border-default text-purple-600 dark:text-accent-primary hover:bg-purple-50 dark:hover:bg-bg-inset transition-colors">
                                    {s}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
