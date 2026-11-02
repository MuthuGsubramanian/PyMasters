import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Check, X, ChevronRight, Flame, RotateCcw } from 'lucide-react';
import { getWarmup, answerWarmup } from '../api';
import { loadStreak, finishToday } from '../utils/warmupStreak';

/**
 * 5-minute warm-up (2026-11-02): a few quiz questions mixed from lessons the
 * learner has already learned, most-forgotten first. Retrieval + interleaving;
 * each answer feeds the spaced-repetition schedule server-side. Renders nothing
 * until the learner has learned lessons with quizzes.
 */
export default function WarmUp({ lang = 'en' }) {
    const navigate = useNavigate();
    const [questions, setQuestions] = useState(null);
    const [phase, setPhase] = useState('intro'); // intro | play | done
    const [i, setI] = useState(0);
    const [picked, setPicked] = useState(null);
    const [result, setResult] = useState(null); // { correct, correct_index }
    const [score, setScore] = useState(0);
    const [missed, setMissed] = useState([]);
    const [streak, setStreak] = useState(() => loadStreak());

    const load = () => {
        getWarmup(lang).then((r) => setQuestions(r.data?.questions || [])).catch(() => setQuestions([]));
    };
    useEffect(load, [lang]);

    if (!questions || questions.length === 0) return null;
    const q = questions[i];

    const start = () => {
        setPhase('play'); setI(0); setPicked(null); setResult(null); setScore(0); setMissed([]);
    };
    const pick = async (choice) => {
        if (picked !== null) return;
        setPicked(choice);
        try {
            const r = (await answerWarmup(q.id, choice)).data;
            setResult(r);
            if (r.correct) setScore((s) => s + 1);
            else setMissed((m) => (m.some((x) => x.topic === q.topic) ? m : [...m, { topic: q.topic, title: q.title }]));
        } catch {
            setResult({ correct: false, correct_index: null, failed: true });
        }
    };
    const next = () => {
        if (i + 1 < questions.length) { setI(i + 1); setPicked(null); setResult(null); return; }
        setStreak({ streak: finishToday(), doneToday: true });
        setPhase('done');
    };
    const again = () => { setQuestions(null); setPhase('intro'); load(); };

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-violet-300/40 bg-gradient-to-br from-violet-50/70 to-cyan-50/40 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-violet-200/50">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center"><Zap size={18} /></div>
                    <div>
                        <h3 className="font-bold text-sm text-text-primary">5-minute warm-up</h3>
                        <p className="text-[11px] text-text-muted">{questions.length} quick questions mixed from lessons you've learned</p>
                    </div>
                </div>
                {streak.streak > 0 && (
                    <span className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-100 rounded-full px-2.5 py-1" title="Days in a row">
                        <Flame size={13} /> {streak.streak}
                    </span>
                )}
            </div>

            {phase === 'intro' && (
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <p className="text-sm text-text-secondary">
                        {streak.doneToday ? 'Done for today - another round keeps it fresh.' : 'Pulling ideas back from memory is what makes them stick.'}
                    </p>
                    <button onClick={start} className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500">
                        {streak.doneToday ? 'Another round' : 'Start'}
                    </button>
                </div>
            )}

            {phase === 'play' && q && (
                <div className="px-5 py-4" aria-live="polite">
                    <div className="mb-2 flex items-center justify-between text-[11px] text-text-muted">
                        <span className="uppercase tracking-wider">{q.title}</span>
                        <span>{i + 1} / {questions.length}</span>
                    </div>
                    {/* Questions may carry a short snippet after the first line: show it as code. */}
                    <p className="mb-2 text-sm font-semibold text-text-primary">{q.q.split('\n')[0]}</p>
                    {q.q.includes('\n') && (
                        <pre className="surface-code mb-3 overflow-x-auto rounded-lg p-2.5 font-mono text-xs">{q.q.split('\n').slice(1).join('\n')}</pre>
                    )}
                    <div className="grid gap-2">
                        {q.options.map((opt, k) => {
                            const isRight = result && result.correct_index === k;
                            const isWrongPick = result && picked === k && !result.correct;
                            return (
                                <button key={k} onClick={() => pick(k)} disabled={picked !== null}
                                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                                        isRight ? 'border-green-400 bg-green-50 text-green-800'
                                            : isWrongPick ? 'border-red-300 bg-red-50 text-red-800'
                                                : picked === k ? 'border-violet-300 bg-violet-50 text-text-primary'
                                                    : 'border-slate-200 bg-white/70 text-text-primary hover:border-violet-300'}`}>
                                    <span className="w-5 shrink-0">{isRight ? <Check size={15} /> : isWrongPick ? <X size={15} /> : String.fromCharCode(65 + k)}</span>
                                    <span>{opt}</span>
                                </button>
                            );
                        })}
                    </div>
                    {result && (
                        <div className="mt-3 flex items-center justify-between">
                            <span className={`text-sm font-semibold ${result.correct ? 'text-green-700' : 'text-red-700'}`}>
                                {result.failed ? 'Could not check that answer.' : result.correct ? 'Correct!' : 'Not quite - the right answer is highlighted.'}
                            </span>
                            <button onClick={next} className="flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-violet-500">
                                {i + 1 < questions.length ? 'Next' : 'Finish'} <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {phase === 'done' && (
                <div className="px-5 py-4">
                    <p className="text-sm font-bold text-text-primary">
                        {score} / {questions.length} correct{score === questions.length ? ' - perfect recall!' : ''}
                        <span className="ml-2 font-normal text-text-muted">Streak: {streak.streak} day{streak.streak === 1 ? '' : 's'}</span>
                    </p>
                    {missed.length > 0 && (
                        <div className="mt-2 space-y-1">
                            <p className="text-[11px] uppercase tracking-wider text-text-muted">Worth a quick revisit</p>
                            {missed.map((m) => (
                                <button key={m.topic} onClick={() => navigate(`/dashboard/classroom?lesson=${encodeURIComponent(m.topic)}`)}
                                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-violet-700 hover:bg-violet-100/60">
                                    {m.title} <ChevronRight size={14} />
                                </button>
                            ))}
                        </div>
                    )}
                    <button onClick={again} className="mt-3 flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-900">
                        <RotateCcw size={12} /> New round
                    </button>
                </div>
            )}
        </motion.div>
    );
}
