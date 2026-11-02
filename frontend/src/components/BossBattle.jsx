import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Swords, Heart, X, Trophy, RotateCcw } from 'lucide-react';
import { getBossBattle, answerWarmup } from '../api';

const BOSS_HP = 6;
const LIVES = 3;
const KEY = 'pm_boss_conquered';

const conquered = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

/**
 * Track boss battle (2026-11-02): up to 8 questions mixed from the lessons the learner has
 * completed in this track. Each right answer hits the boss (6 HP); each wrong one costs a life (3).
 * Graded server-side via the warm-up answer endpoint. No XP, so it can't be farmed - the prize
 * is the "Conquered" badge (kept in localStorage).
 */
export default function BossBattle({ track, name, accent = '#8b5cf6', lang = 'en' }) {
    const [open, setOpen] = useState(false);
    const [won, setWon] = useState(() => Boolean(conquered()[track]));

    return (
        <>
            <button onClick={() => setOpen(true)}
                className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors hover:bg-bg-elevated"
                style={{ borderColor: `${accent}55`, background: `${accent}0d` }}>
                <Swords size={18} style={{ color: accent }} />
                <span className="flex-1">
                    <span className="block text-sm font-bold text-text-primary">Boss battle: {name}</span>
                    <span className="block text-[11px] text-text-muted">Mixed questions from the lessons you've finished here. Beat the boss before you run out of lives.</span>
                </span>
                {won && <span className="rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold text-green-700">Conquered</span>}
            </button>
            {/* Portal: the track list animates with transforms, which would trap a fixed-position modal. */}
            {open && createPortal(<Battle track={track} name={name} accent={accent} lang={lang}
                onClose={() => setOpen(false)}
                onWin={() => {
                    const c = conquered(); c[track] = new Date().toISOString().slice(0, 10);
                    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
                    setWon(true);
                }} />, document.body)}
        </>
    );
}

function Battle({ track, name, accent, lang, onClose, onWin }) {
    const [data, setData] = useState(null);
    const [i, setI] = useState(0);
    const [hp, setHp] = useState(BOSS_HP);
    const [lives, setLives] = useState(LIVES);
    const [picked, setPicked] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        getBossBattle(track, lang).then((r) => setData(r.data)).catch(() => setError(true));
    }, [track, lang]);
    const rematch = () => {
        setData(null); setI(0); setHp(BOSS_HP); setLives(LIVES); setPicked(null); setResult(null); setError(false);
        getBossBattle(track, lang).then((r) => setData(r.data)).catch(() => setError(true));
    };

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const qs = data?.questions || [];
    const q = qs[i];
    const over = hp <= 0 ? 'won' : (lives <= 0 || (data && i >= qs.length)) ? 'lost' : null;

    const pick = async (choice) => {
        if (picked !== null || over) return;
        setPicked(choice);
        try {
            const r = (await answerWarmup(q.id, choice)).data;
            setResult(r);
            if (r.correct) {
                if (hp - 1 <= 0) onWin();
                setHp(hp - 1);
            } else {
                setLives((l) => l - 1);
            }
        } catch {
            setResult({ correct: false, correct_index: null, failed: true });
        }
    };
    const next = () => { setI((n) => n + 1); setPicked(null); setResult(null); };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label={`Boss battle: ${name}`}>
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#12122a] text-slate-100 shadow-2xl">
                <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
                    <Swords size={18} style={{ color: accent }} />
                    <h2 className="text-sm font-bold">Boss battle: {name}</h2>
                    <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close"><X size={18} /></button>
                </div>

                <div className="px-5 py-4">
                    {error && <p className="text-sm text-red-300">Could not load the battle. Please try again.</p>}
                    {!data && !error && <p className="text-sm text-slate-400">Summoning the boss…</p>}
                    {data && !data.unlocked && (
                        <p className="text-sm text-slate-300">Finish {data.needed - data.completed} more lesson{data.needed - data.completed === 1 ? '' : 's'} in this track to unlock the boss.</p>
                    )}

                    {data?.unlocked && (
                        <>
                            <div className="mb-4 flex items-center gap-4">
                                <div className="flex-1">
                                    <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wide text-slate-400"><span>Boss</span><span>{Math.max(0, hp)} / {BOSS_HP} HP</span></div>
                                    <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500" style={{ width: `${(Math.max(0, hp) / BOSS_HP) * 100}%` }} />
                                    </div>
                                </div>
                                <div className="flex gap-1" aria-label={`${lives} lives left`}>
                                    {Array.from({ length: LIVES }, (_, k) => (
                                        <Heart key={k} size={18} className={k < lives ? 'fill-rose-500 text-rose-500' : 'text-slate-600'} />
                                    ))}
                                </div>
                            </div>

                            {over === 'won' && (
                                <div className="py-6 text-center">
                                    <Trophy size={40} className="mx-auto mb-2 text-amber-300" />
                                    <p className="text-lg font-bold">Boss defeated!</p>
                                    <p className="mt-1 text-sm text-slate-400">{name} conquered with {lives} {lives === 1 ? 'life' : 'lives'} to spare.</p>
                                </div>
                            )}
                            {over === 'lost' && (
                                <div className="py-6 text-center">
                                    <p className="text-lg font-bold">The boss wins this round</p>
                                    <p className="mt-1 text-sm text-slate-400">Revisit the lessons behind the questions you missed, then come back for a rematch.</p>
                                    <button onClick={rematch} className="mx-auto mt-4 flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20">
                                        <RotateCcw size={14} /> Rematch
                                    </button>
                                </div>
                            )}

                            {!over && q && (
                                <div aria-live="polite">
                                    <div className="mb-2 flex justify-between text-[11px] text-slate-400">
                                        <span className="uppercase tracking-wide">{q.title}</span><span>{i + 1} / {qs.length}</span>
                                    </div>
                                    <p className="mb-2 text-sm font-semibold">{q.q.split('\n')[0]}</p>
                                    {q.q.includes('\n') && (
                                        <pre className="mb-3 overflow-x-auto rounded-lg bg-black/40 p-2.5 font-mono text-xs text-slate-200">{q.q.split('\n').slice(1).join('\n')}</pre>
                                    )}
                                    <div className="grid gap-2">
                                        {q.options.map((opt, k) => {
                                            const isRight = result && result.correct_index === k;
                                            const isWrong = result && picked === k && !result.correct;
                                            return (
                                                <button key={k} onClick={() => pick(k)} disabled={picked !== null}
                                                    className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                                                        isRight ? 'border-green-400 bg-green-500/15 text-green-200'
                                                            : isWrong ? 'border-red-400 bg-red-500/15 text-red-200'
                                                                : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
                                                    <span className="mr-2 text-slate-400">{String.fromCharCode(65 + k)}</span>{opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {result && (
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className={`text-sm font-semibold ${result.correct ? 'text-green-300' : 'text-red-300'}`}>
                                                {result.failed ? 'Could not check that answer.' : result.correct ? 'Direct hit!' : 'Ouch - the right answer is highlighted.'}
                                            </span>
                                            <button onClick={next} className="rounded-xl px-3 py-1.5 text-sm font-bold text-white" style={{ background: accent }}>Next</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
