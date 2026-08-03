import { useState, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Linear Regression visual — one persistent scatter plot that evolves with the
// essay's steps (see pages/Explains.jsx). Pure SVG; the least-squares fit is
// computed for real from the points, not hardcoded.
//
// Data space: x ∈ [0, 10] (house size), y ∈ [0, 7] (price). Screen y inverted.
// ──────────────────────────────────────────────────────────────────────────────

const PTS = [
    [0.4, 1.62], [1.1, 1.35], [1.9, 2.6], [2.6, 1.95], [3.3, 3.02], [4.1, 2.7],
    [4.9, 4.5], [5.6, 3.9], [6.4, 4.6], [7.2, 3.95], [8.1, 5.8], [9.0, 5.85],
];
const OUTLIER = [9.4, 0.5];

const sx = (x) => 45 + (x / 10) * 320;
const sy = (y) => 262 - (y / 7) * 222;

function ols(pts) {
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n;
    const my = pts.reduce((s, p) => s + p[1], 0) / n;
    let num = 0, den = 0;
    pts.forEach(([x, y]) => { num += (x - mx) * (y - my); den += (x - mx) ** 2; });
    const m = num / den;
    return { m, b: my - m * mx, mx, my };
}
const sse = (pts, m, b) => pts.reduce((s, [x, y]) => s + (y - (m * x + b)) ** 2, 0);

const FIT = ols(PTS);
const FIT_OUT = ols([...PTS, OUTLIER]);
const BEST_SSE = sse(PTS, FIT.m, FIT.b);
const TSS = PTS.reduce((s, [, y]) => s + (y - FIT.my) ** 2, 0);
const R2 = 1 - BEST_SSE / TSS;

// A deliberately mediocre line for the residual/squares steps.
const GUESS = { m: 0.3, b: 2.6 };
// Faint candidate lines for the "which line?" step.
const CANDIDATES = [{ m: 0.2, b: 2.7 }, { m: 0.9, b: 0.1 }, { m: -0.05, b: 4.2 }, GUESS];

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'candidates' },
    { mode: 'residuals' },
    { mode: 'squares' },
    { mode: 'bestfit' },
    { mode: 'interactive' },
    { mode: 'outlier' },
    { mode: 'final' },
];

const Line = ({ m, b, ...props }) => (
    <line x1={sx(0)} y1={sy(b)} x2={sx(10)} y2={sy(m * 10 + b)} {...props} />
);

export default function LinearRegressionVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const { mode } = STEP_STATES[idx];

    // Interactive: reader picks a slope; the line pivots on the mean point.
    const [slope, setSlope] = useState(20); // slider value ÷ 100 = slope
    const interactive = mode === 'interactive';
    const { userLine, userSse, matched } = useMemo(() => {
        const m = slope / 100;
        const b = FIT.my - m * FIT.mx;
        const s = sse(PTS, m, b);
        return { userLine: { m, b }, userSse: s, matched: s <= BEST_SSE * 1.02 };
    }, [slope]);

    const guessLine = mode === 'residuals' || mode === 'squares' ? GUESS : null;
    const showBest = mode === 'bestfit' || mode === 'final';
    const points = mode === 'outlier' ? [...PTS, OUTLIER] : PTS;

    const residualFor = ([x, y], line) => ({ x: sx(x), y1: sy(y), y2: sy(line.m * x + line.b) });

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A scatter plot of house sizes and prices, with lines fit through the points">
                {/* Axes */}
                <line x1="40" y1="268" x2="380" y2="268" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                <line x1="40" y1="268" x2="40" y2="30" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                <text x="210" y="290" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.55">size  →</text>
                <text x="16" y="150" fontSize="11" fill="currentColor" fillOpacity="0.55" transform="rotate(-90 16 150)" textAnchor="middle">price  →</text>

                {/* Candidate lines */}
                {mode === 'candidates' && CANDIDATES.map((l, i) => (
                    <Line key={i} m={l.m} b={l.b} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="5 4" />
                ))}

                {/* Residuals (and their squares) against the mediocre guess line */}
                {guessLine && (
                    <g>
                        <Line m={guessLine.m} b={guessLine.b} stroke="var(--secondary)" strokeWidth="2" strokeOpacity="0.8" />
                        {PTS.map((p, i) => {
                            const r = residualFor(p, guessLine);
                            const side = Math.abs(r.y1 - r.y2);
                            return (
                                <g key={i}>
                                    {mode === 'squares' && side > 2 && (
                                        <rect x={r.x - side} y={Math.min(r.y1, r.y2)} width={side} height={side}
                                            fill="var(--destructive)" fillOpacity="0.10" stroke="var(--destructive)" strokeOpacity="0.35" strokeWidth="1" />
                                    )}
                                    <line x1={r.x} y1={r.y1} x2={r.x} y2={r.y2}
                                        stroke="var(--destructive)" strokeOpacity="0.6" strokeWidth="1.5" />
                                </g>
                            );
                        })}
                        <text x="370" y="40" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                            {mode === 'squares' ? 'error² — big misses hurt a lot' : 'residual = point − line'}
                        </text>
                    </g>
                )}

                {/* Least-squares fit */}
                {showBest && (
                    <g>
                        <Line m={FIT.m} b={FIT.b} stroke="var(--accent-primary)" strokeWidth="2.5" />
                        <text x="370" y="40" textAnchor="end" fontSize="12" fontFamily="monospace" fill="var(--accent-primary)">
                            {mode === 'final' ? `R² = ${R2.toFixed(2)}` : `ŷ = ${FIT.m.toFixed(2)}·x + ${FIT.b.toFixed(2)}`}
                        </text>
                    </g>
                )}

                {/* Interactive: the reader's line vs (hidden) best */}
                {interactive && (
                    <g>
                        <Line m={userLine.m} b={userLine.b} stroke="var(--accent-primary)" strokeWidth="2.5" />
                        {PTS.map((p, i) => {
                            const r = residualFor(p, userLine);
                            return <line key={i} x1={r.x} y1={r.y1} x2={r.x} y2={r.y2} stroke="var(--destructive)" strokeOpacity="0.4" strokeWidth="1.2" />;
                        })}
                        <circle cx={sx(FIT.mx)} cy={sy(FIT.my)} r="4" fill="var(--secondary)" opacity="0.8" />
                        <text x={sx(FIT.mx) + 8} y={sy(FIT.my) - 8} fontSize="9" fill="var(--secondary)">mean point</text>
                    </g>
                )}

                {/* Outlier: honest fit vs dragged fit */}
                {mode === 'outlier' && (
                    <g>
                        <Line m={FIT.m} b={FIT.b} stroke="var(--accent-primary)" strokeWidth="2" strokeDasharray="6 4" strokeOpacity="0.6" />
                        <Line m={FIT_OUT.m} b={FIT_OUT.b} stroke="var(--destructive)" strokeWidth="2.5" />
                        <circle cx={sx(OUTLIER[0])} cy={sy(OUTLIER[1])} r="11" fill="none" stroke="var(--destructive)" strokeWidth="1.5" strokeDasharray="3 3" />
                        <text x={sx(OUTLIER[0]) - 14} y={sy(OUTLIER[1]) + 4} textAnchor="end" fontSize="10" fill="var(--destructive)">one wild point</text>
                        <text x="370" y="40" textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">dashed = fit without it</text>
                    </g>
                )}

                {/* The data */}
                {points.map(([x, y], i) => (
                    <circle key={i} cx={sx(x)} cy={sy(y)} r="6.5"
                        fill="currentColor" fillOpacity={mode === 'intro' ? 0.55 : 0.4}
                        stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
                ))}
            </svg>

            {/* Interactive controls */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 space-y-2">
                    <div className="flex items-center gap-3">
                        <label htmlFor="lr-slope" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                            slope = {(slope / 100).toFixed(2)}
                        </label>
                        <input id="lr-slope" type="range" min="-20" max="120" value={slope}
                            onChange={(e) => setSlope(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer" aria-label="Line slope" />
                        <button onClick={() => setSlope(20)}
                            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary cursor-pointer">
                            <RotateCcw size={12} /> Reset
                        </button>
                    </div>
                    <p className="text-xs font-mono">
                        <span className="text-text-muted">sum of squared errors: </span>
                        <span className={matched ? 'text-emerald-500 font-bold' : 'text-text-secondary font-bold'}>{userSse.toFixed(2)}</span>
                        <span className="text-text-muted">  (best possible: {BEST_SSE.toFixed(2)})</span>
                        {matched && <span className="text-emerald-500 font-bold">  — you found least squares!</span>}
                    </p>
                </div>
            )}
        </div>
    );
}
