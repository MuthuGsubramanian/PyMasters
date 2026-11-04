import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, SkipBack, ChevronLeft, ChevronRight, SkipForward, Play, Pause, History } from 'lucide-react';
import ErrorExplainer from './ErrorExplainer';
import UnderTheHood from './animations/UnderTheHood';
import { useTranslation } from '../i18n';
import { traceErrorMessage } from '../hooks/useCodeTrace';

// 44 px touch target; five of these plus the slider fit a 390 px phone (the slider shrinks).
const STEP_BTN = 'flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60';
const TAB = 'min-h-[44px] px-4 text-sm font-semibold border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60';

// Time-travel visualizer: scrub through every executed step of the learner's own code.
// trace = { steps: [{line, event, func, depth, vars, out, ret?, exc?}], stdout, error }
// With `loadHeap` (() => Promise<heap trace>) it also has an "Under the hood" tab: the object-model
// trace is fetched the first time that tab opens and kept for the life of the viewer.
export default function TraceViewer({ code, trace, onClose, loadHeap, language = 'en' }) {
    const { t } = useTranslation(language);
    const steps = trace?.steps || [];
    const [i, setI] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [tab, setTab] = useState('steps');
    const [heap, setHeap] = useState({ status: 'idle', data: null, error: '' });
    const heapRequested = useRef(false);
    const timer = useRef(null);

    // Give focus back to whatever opened the viewer (e.g. "Visualize my code") when it closes.
    // Captured during the first render, before anything inside the dialog can take focus.
    const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);
    useEffect(() => {
        const el = opener.current;
        return () => {
            if (el && el !== document.body && el.isConnected && typeof el.focus === 'function') el.focus();
        };
    }, []);

    const fetchHeap = useCallback(() => {
        if (!loadHeap || heapRequested.current) return;
        heapRequested.current = true;
        setHeap({ status: 'loading', data: null, error: '' });
        Promise.resolve()
            .then(() => loadHeap())
            .then((data) => setHeap({ status: 'done', data, error: '' }))
            .catch((err) => {
                heapRequested.current = false;   // a failed fetch may be retried by the learner
                setHeap({ status: 'error', data: null, error: traceErrorMessage(err) });
            });
    }, [loadHeap]);

    const openTab = (name) => {
        setTab(name);
        if (name === 'heap') { setPlaying(false); fetchHeap(); }
    };
    const stepsTab = tab === 'steps';
    const lines = useMemo(() => (code || '').replace(/\n$/, '').split('\n'), [code]);
    const last = Math.max(0, steps.length - 1);
    const step = steps[i] || null;
    const prev = i > 0 ? steps[i - 1] : null;

    const go = useCallback((n) => setI((cur) => Math.min(last, Math.max(0, typeof n === 'function' ? n(cur) : n))), [last]);

    useEffect(() => {
        if (!playing) return undefined;
        timer.current = setInterval(() => {
            setI((cur) => {
                if (cur >= last) { setPlaying(false); return cur; }
                return cur + 1;
            });
        }, 650);
        return () => clearInterval(timer.current);
    }, [playing, last]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return; }
            // The Under the hood view has its own step controls (and keys); these drive the Steps tab only.
            if (!stepsTab) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); go((c) => c + 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); go((c) => c - 1); }
            else if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go, onClose, stepsTab]);

    const changed = useMemo(() => {
        if (!step || !prev || prev.func !== step.func || prev.depth !== step.depth) return new Set();
        return new Set(Object.keys(step.vars || {}).filter((k) => (prev.vars || {})[k] !== step.vars[k]));
    }, [step, prev]);

    const outSoFar = (trace?.stdout || '').slice(0, step ? step.out : 0);
    const where = step ? (step.func === '<module>' ? 'main program' : `inside ${step.func}()`) : '';
    const verb = step?.event === 'return' ? 'returning from' : step?.event === 'exception' ? 'error on' : 'about to run';
    const err = trace?.error;
    const errText = err && err.type !== 'StepLimit' ? `File "<user>", line ${err.line ?? '?'}\n${err.type}: ${err.message}` : '';
    // The main program "returning" just means it ended; say that instead of "<module>() returns None".
    const moduleEnd = step?.event === 'return' && step.func === '<module>';
    const endLabel = err && err.type !== 'StepLimit' ? 'program stopped by an error' : 'program finished';
    const status = moduleEnd ? `${endLabel} at line ${step.line}` : `${verb} line ${step?.line} (${where})`;

    // Portal to <body>: inside the page container (a z-10 stacking context) the overlay's z-70 only competed
    // within that context, and the mobile top bar painted over the title and close button.
    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Time-travel visualizer">
            <div className="flex h-full max-h-[860px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f1020] text-slate-100 shadow-2xl">
                <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                    <History size={18} className="text-cyan-300" />
                    <h2 className="text-sm font-bold">Time-travel visualizer</h2>
                    {stepsTab && (
                        <span className="min-w-0 truncate text-xs text-slate-400">
                            {steps.length ? `Step ${i + 1} of ${steps.length} - ${status}` : 'No steps recorded'}
                        </span>
                    )}
                    <button onClick={onClose} className="ml-auto flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close visualizer"><X size={18} /></button>
                </div>

                {loadHeap && (
                    <div role="tablist" aria-label="View" className="flex flex-shrink-0 gap-1 border-b border-white/10 px-2">
                        {[['steps', t('uth.ui_tab_steps', 'Steps')], ['heap', t('uth.ui_title', 'Under the hood')]].map(([name, label]) => (
                            <button
                                key={name}
                                type="button"
                                role="tab"
                                id={`trace-tab-${name}`}
                                aria-selected={tab === name}
                                aria-controls={`trace-panel-${name}`}
                                onClick={() => openTab(name)}
                                className={`${TAB} ${tab === name ? 'border-cyan-400 text-white' : 'border-transparent text-slate-300 hover:text-white'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}

                {stepsTab ? (<>
                <div id="trace-panel-steps" role={loadHeap ? 'tabpanel' : undefined} aria-labelledby={loadHeap ? 'trace-tab-steps' : undefined} className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-5">
                    {/* Code */}
                    <div className="min-h-0 overflow-auto border-b border-white/10 py-3 font-mono text-[13px] lg:col-span-3 lg:border-b-0 lg:border-r">
                        {lines.map((text, idx) => {
                            const n = idx + 1;
                            const isCur = step && step.line === n;
                            const isPrev = !isCur && prev && prev.line === n;
                            return (
                                <div key={n} className={`flex items-start gap-3 px-3 ${isCur ? 'bg-cyan-400/15' : ''}`}>
                                    <span className={`w-6 flex-shrink-0 select-none text-right ${isCur ? 'text-cyan-300 font-bold' : isPrev ? 'text-green-400' : 'text-slate-500'}`}>
                                        {isCur ? '➜' : isPrev ? '✓' : n}
                                    </span>
                                    <pre className={`whitespace-pre-wrap break-all ${isCur ? 'text-white' : 'text-slate-300'}`}>{text || ' '}</pre>
                                </div>
                            );
                        })}
                    </div>

                    {/* State */}
                    <div className="flex min-h-0 flex-col overflow-auto lg:col-span-2">
                        <div className="border-b border-white/10 p-3">
                            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                                <span>Variables - {where}</span>
                                {step?.depth > 1 && <span className="rounded bg-violet-500/20 px-1.5 py-0.5 normal-case text-violet-200">call depth {step.depth}</span>}
                            </div>
                            {step && Object.keys(step.vars || {}).length ? (
                                <table className="w-full font-mono text-[12.5px]">
                                    <tbody>
                                        {Object.entries(step.vars).map(([k, v]) => (
                                            <tr key={k} className={changed.has(k) ? 'bg-amber-400/15' : ''}>
                                                <td className="py-1 pr-3 align-top text-cyan-300">{k}</td>
                                                <td className={`break-all py-1 ${changed.has(k) ? 'text-amber-200' : 'text-slate-100'}`}>{v}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <p className="text-xs italic text-slate-500">No variables yet.</p>}
                            {moduleEnd && <p className={`mt-2 text-xs ${err && err.type !== 'StepLimit' ? 'text-red-300' : 'text-green-300'}`}>{endLabel[0].toUpperCase() + endLabel.slice(1)}.</p>}
                            {step?.event === 'return' && !moduleEnd && <p className="mt-2 text-xs text-green-300">{step.func}() returns <span className="font-mono">{step.ret}</span></p>}
                            {step?.event === 'exception' && <p className="mt-2 text-xs text-red-300">Raised {step.exc}</p>}
                        </div>
                        <div className="p-3">
                            <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Output so far</div>
                            <pre className="min-h-[3rem] whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2 font-mono text-[12.5px] text-green-300">{outSoFar || ' '}</pre>
                            {i === last && err?.type === 'StepLimit' && <p className="mt-2 text-xs text-amber-300">{err.message}</p>}
                            {i === last && errText && <ErrorExplainer text={errText} />}
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 border-t border-white/10 px-2 py-2 sm:gap-2 sm:px-4 sm:py-3">
                    <button onClick={() => go(0)} className={STEP_BTN} aria-label="First step"><SkipBack size={16} /></button>
                    <button onClick={() => go((c) => c - 1)} className={STEP_BTN} aria-label="Previous step"><ChevronLeft size={16} /></button>
                    <button onClick={() => setPlaying((p) => !p)} className={`${STEP_BTN} bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30`} aria-label={playing ? 'Pause' : 'Play'}>
                        {playing ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button onClick={() => go((c) => c + 1)} className={STEP_BTN} aria-label="Next step"><ChevronRight size={16} /></button>
                    <button onClick={() => go(last)} className={STEP_BTN} aria-label="Last step"><SkipForward size={16} /></button>
                    <input type="range" min={0} max={last} value={i} onChange={(e) => go(Number(e.target.value))}
                           className="mx-1 min-w-0 flex-1 accent-cyan-400 sm:mx-2" aria-label="Step" disabled={!steps.length} />
                    <span className="hidden text-xs text-slate-400 sm:inline">← → to step, space to play</span>
                </div>
                </>) : (
                    /* `dark`: UnderTheHood uses the colour tokens; on this dark surface they must be the dark ones. */
                    <div id="trace-panel-heap" role="tabpanel" aria-labelledby="trace-tab-heap" className="dark min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
                        {heap.status === 'loading' && (
                            <p role="status" className="text-sm text-slate-300">{t('uth.ui_loading', 'Looking inside your code…')}</p>
                        )}
                        {heap.status === 'error' && (
                            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                                <span className="min-w-0 flex-1">{heap.error}</span>
                                <button type="button" onClick={fetchHeap} className="min-h-[44px] rounded-lg border border-white/20 px-3 text-sm font-semibold text-white hover:bg-white/10">
                                    {t('uth.ui_retry', 'Try again')}
                                </button>
                            </div>
                        )}
                        {heap.status === 'done' && <UnderTheHood code={heap.data?.code || code} trace={heap.data} language={language} />}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
