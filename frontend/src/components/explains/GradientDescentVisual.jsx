import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Gradient Descent visual — one persistent SVG "loss valley" that evolves with
// the essay's steps (see pages/Explains.jsx). Pure SVG + framer-motion.
//
// World: parameter x ∈ [40, 360], loss L(x) = c·(x−200)². Screen y grows
// downward, so the valley floor (min loss) is the LOWEST point on screen.
// Gradient-descent update: x ← x − η·L'(x), L'(x) = K·(x−200).
// ──────────────────────────────────────────────────────────────────────────────
const K = 0.011;
const MIN_X = 200;
const yOf = (x) => Math.max(24, 250 - 0.0055 * (x - MIN_X) ** 2);
// Wiggly "real world" landscape for the finale: several local dips.
const yWiggly = (x) =>
    Math.max(30, Math.min(256, 215 - 0.002 * (x - 230) ** 2 + 20 * Math.sin((x - 40) / 24)));

function descend(x0, lr, n) {
    const xs = [x0];
    let x = x0;
    for (let i = 0; i < n; i++) {
        x = x - lr * K * (x - MIN_X);
        x = Math.max(12, Math.min(388, x));
        xs.push(x);
    }
    return xs;
}

const curvePoints = (fn) => {
    const pts = [];
    for (let x = 40; x <= 360; x += 4) pts.push(`${x},${fn(x)}`);
    return pts.join(' ');
};

// Per-step visual state. mode: which decorations to draw.
const STEP_STATES = [
    { ball: 70, mode: 'intro' },
    { ball: 70, mode: 'landscape' },
    { ball: 70, mode: 'gradient' },
    { ball: descend(70, 55, 1)[1], trail: [70], mode: 'step', lrLabel: 'η = 0.55' },
    { ball: descend(70, 12, 10).at(-1), trail: descend(70, 12, 10).slice(0, -1), mode: 'small', lrLabel: 'η = 0.12  (too timid)' },
    { ball: descend(70, 185, 8).at(-1), trail: descend(70, 185, 8).slice(0, -1), mode: 'large', lrLabel: 'η = 1.85  (too bold — diverging!)' },
    { ball: descend(70, 70, 6).at(-1), trail: descend(70, 70, 6).slice(0, -1), mode: 'right', lrLabel: 'η = 0.70  (just right)' },
    { ball: 70, mode: 'interactive' },
    { ball: 122, mode: 'wiggly' },
];

export default function GradientDescentVisual({ stepIndex }) {
    const state = STEP_STATES[Math.min(stepIndex, STEP_STATES.length - 1)];
    const wiggly = state.mode === 'wiggly';
    const fn = wiggly ? yWiggly : yOf;

    // Interactive descent (step "Try it yourself")
    const [lr, setLr] = useState(70);
    const [runTrail, setRunTrail] = useState([]);
    const [runBall, setRunBall] = useState(70);
    const [running, setRunning] = useState(false);
    const timerRef = useRef(null);

    const startRun = () => {
        if (running) return;
        const path = descend(70, lr, 14);
        setRunTrail([]);
        setRunBall(70);
        setRunning(true);
        let i = 0;
        timerRef.current = setInterval(() => {
            i += 1;
            if (i >= path.length) {
                clearInterval(timerRef.current);
                setRunning(false);
                return;
            }
            setRunTrail(path.slice(0, i));
            setRunBall(path[i]);
        }, 240);
    };
    const resetRun = () => {
        clearInterval(timerRef.current);
        setRunning(false);
        setRunTrail([]);
        setRunBall(70);
    };
    useEffect(() => () => clearInterval(timerRef.current), []);
    useEffect(() => { if (state.mode !== 'interactive') resetRun(); }, [state.mode]); // eslint-disable-line react-hooks/exhaustive-deps

    const interactive = state.mode === 'interactive';
    const ballX = interactive ? runBall : state.ball;
    const ballY = fn(ballX) - 9;
    const trail = interactive ? runTrail : (state.trail || []);

    const finalVerdict = useMemo(() => {
        if (!interactive || running || runTrail.length === 0) return null;
        if (Math.abs(runBall - MIN_X) < 5) return { text: 'Converged!', cls: 'text-emerald-500' };
        if (runBall <= 14 || runBall >= 386) return { text: 'Diverged — η too large', cls: 'text-red-500' };
        return { text: 'Still descending… run again', cls: 'text-amber-500' };
    }, [interactive, running, runTrail.length, runBall]);

    // Downhill (negative-gradient) arrow for the "gradient" step.
    const slope = K * (state.ball - MIN_X); // negative left of the minimum
    const arrowLen = Math.min(80, Math.abs(slope) * 46);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A U-shaped loss curve with a ball descending toward the minimum">
                {/* Axes */}
                <line x1="30" y1="270" x2="380" y2="270" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                <text x="205" y="290" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.55">parameter value  →</text>
                <text x="16" y="150" fontSize="11" fill="currentColor" fillOpacity="0.55" transform="rotate(-90 16 150)" textAnchor="middle">loss  →</text>

                {/* Loss curve (crossfades between valley and wiggly landscape) */}
                <motion.polyline
                    points={curvePoints(fn)}
                    fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round"
                    initial={false} animate={{ opacity: 1 }} key={wiggly ? 'w' : 'v'}
                />

                {/* Minimum marker */}
                {!wiggly && state.mode !== 'intro' && (
                    <g>
                        <line x1={MIN_X} y1={yOf(MIN_X) + 6} x2={MIN_X} y2="268" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="3 4" />
                        <text x={MIN_X} y="264" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">minimum</text>
                    </g>
                )}

                {/* Local-minimum labels on the wiggly landscape */}
                {wiggly && (
                    <g fontSize="10" fill="currentColor" fillOpacity="0.6">
                        <text x="122" y={yWiggly(122) + 22} textAnchor="middle">stuck here?</text>
                        <text x="252" y={yWiggly(252) + 22} textAnchor="middle">true minimum</text>
                    </g>
                )}

                {/* Trail of previous positions */}
                {trail.map((tx, i) => (
                    <circle key={i} cx={tx} cy={fn(tx) - 9} r="4.5"
                        fill="var(--accent-primary)" opacity={0.14 + (i / Math.max(trail.length, 1)) * 0.3} />
                ))}
                {/* Hop connectors for the oscillating case */}
                {(state.mode === 'large') && trail.map((tx, i) => {
                    const next = trail[i + 1] ?? state.ball;
                    return <line key={`l${i}`} x1={tx} y1={fn(tx) - 9} x2={next} y2={fn(next) - 9}
                        stroke="var(--destructive)" strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="2 3" />;
                })}

                {/* Negative-gradient (downhill) arrow */}
                {state.mode === 'gradient' && (
                    <g>
                        <defs>
                            <marker id="gd-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                                <path d="M0,0 L6,3 L0,6 z" fill="var(--secondary)" />
                            </marker>
                        </defs>
                        <line x1={state.ball} y1={ballY - 14} x2={state.ball + arrowLen} y2={ballY - 14 + arrowLen * 0.55}
                            stroke="var(--secondary)" strokeWidth="2.5" markerEnd="url(#gd-arrow)" />
                        <text x={state.ball + arrowLen + 8} y={ballY + arrowLen * 0.55 - 16} fontSize="11" fill="var(--secondary)">downhill</text>
                    </g>
                )}

                {/* The ball */}
                <motion.circle
                    r="9" fill="var(--accent-primary)" stroke="white" strokeWidth="1.5"
                    initial={false}
                    animate={{ cx: ballX, cy: ballY }}
                    transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                />

                {/* Learning-rate caption */}
                {state.lrLabel && (
                    <text x="370" y="40" textAnchor="end" fontSize="12" fontFamily="monospace"
                        fill={state.mode === 'large' ? 'var(--destructive)' : 'currentColor'} fillOpacity="0.8">
                        {state.lrLabel}
                    </text>
                )}
            </svg>

            {/* Interactive controls (only on the "try it" step) */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 space-y-2">
                    <div className="flex items-center gap-3">
                        <label htmlFor="gd-lr" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                            η = {(lr / 100).toFixed(2)}
                        </label>
                        <input
                            id="gd-lr" type="range" min="8" max="220" value={lr}
                            onChange={(e) => { setLr(Number(e.target.value)); resetRun(); }}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer"
                            aria-label="Learning rate"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={startRun} disabled={running}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-primary rounded-lg px-3 py-1.5 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer">
                            <Play size={12} /> {running ? 'Descending…' : 'Run descent'}
                        </button>
                        <button onClick={resetRun}
                            className="flex items-center gap-1.5 text-xs font-medium text-text-muted bg-bg-elevated border border-border-default rounded-lg px-3 py-1.5 hover:text-text-secondary transition-colors cursor-pointer">
                            <RotateCcw size={12} /> Reset
                        </button>
                        {finalVerdict && <span className={`text-xs font-bold ${finalVerdict.cls}`}>{finalVerdict.text}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}
