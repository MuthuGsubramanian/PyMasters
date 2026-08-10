import { useState } from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Logistic Regression visual — a real gradient-descent fit of P(pass) from
// hours studied, on the classic 20-student exam dataset (hours studied vs.
// pass/fail). Coefficients are trained for real via batch gradient descent on
// module load (no faked numbers, no Math.random) and converge to the textbook
// values (w ≈ 1.504, b ≈ -4.076). The OLS comparison line is a real closed-form
// least-squares fit on the same data. Pure SVG + framer-motion; step states
// clamp defensively (see pages/Explains.jsx). Pass/fail are told apart by
// marker SHAPE (circle vs square) plus colour, never colour alone.
// ──────────────────────────────────────────────────────────────────────────────

// The classic hours-studied / pass-exam dataset (20 students).
const HOURS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 4.0, 4.25, 4.5, 4.75, 5.0, 5.5];
const PASS = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1];
const N = HOURS.length;

function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
}

// Batch gradient descent on the log-loss, snapshotting w,b at chosen iterations.
const SNAP_ITERS = [0, 10, 100, 1000, 5000];
function trainSnapshots(xs, ys, lr, iters, snapAt) {
    let w = 0, b = 0;
    const n = xs.length;
    const snaps = {};
    if (snapAt.includes(0)) snaps[0] = { w, b };
    for (let it = 1; it <= iters; it++) {
        let dw = 0, db = 0;
        for (let i = 0; i < n; i++) {
            const p = sigmoid(w * xs[i] + b);
            const err = p - ys[i];
            dw += err * xs[i];
            db += err;
        }
        dw /= n; db /= n;
        w -= lr * dw;
        b -= lr * db;
        if (snapAt.includes(it)) snaps[it] = { w, b };
    }
    return snaps;
}
const SNAPS = trainSnapshots(HOURS, PASS, 0.1, 5000, SNAP_ITERS);
const FINAL = SNAPS[5000];

// Closed-form OLS on the same data, for the "why not a straight line" step.
function ols(xs, ys) {
    const n = xs.length;
    const xbar = xs.reduce((a, c) => a + c, 0) / n;
    const ybar = ys.reduce((a, c) => a + c, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - xbar) * (ys[i] - ybar); sxx += (xs[i] - xbar) ** 2; }
    const slope = sxy / sxx;
    return { slope, intercept: ybar - slope * xbar };
}
const LINE = ols(HOURS, PASS);

// Layout: x = hours studied (0-6), y = probability (0-1).
const X_MAX = 6;
const PLOT_TOP = 30;
const PLOT_BASE = 250;
const PLOT_H = PLOT_BASE - PLOT_TOP;
const xOf = (hours) => 45 + (hours / X_MAX) * 335;
const yOf = (p) => PLOT_BASE - p * PLOT_H;

const CURVE_GRID = 80;
function sigmoidPath(w, b) {
    const pts = [];
    for (let i = 0; i <= CURVE_GRID; i++) {
        const x = (i / CURVE_GRID) * X_MAX;
        pts.push(`${xOf(x).toFixed(1)},${yOf(sigmoid(w * x + b)).toFixed(1)}`);
    }
    return pts.join(' ');
}

function Axes() {
    return (
        <g fontSize="10" fill="currentColor">
            <line x1="45" y1={PLOT_BASE} x2="380" y2={PLOT_BASE} stroke="currentColor" strokeOpacity="0.25" />
            <line x1="45" y1={PLOT_TOP} x2="45" y2={PLOT_BASE} stroke="currentColor" strokeOpacity="0.25" />
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
                <g key={h}>
                    <line x1={xOf(h)} y1={PLOT_BASE} x2={xOf(h)} y2={PLOT_BASE + 4} stroke="currentColor" strokeOpacity="0.3" />
                    <text x={xOf(h)} y={PLOT_BASE + 15} textAnchor="middle" fillOpacity="0.55">{h}h</text>
                </g>
            ))}
            {[0, 0.5, 1].map((p) => (
                <g key={p}>
                    <line x1="41" y1={yOf(p)} x2="45" y2={yOf(p)} stroke="currentColor" strokeOpacity="0.3" />
                    <text x="37" y={yOf(p) + 3} textAnchor="end" fillOpacity="0.55">{Math.round(p * 100)}%</text>
                </g>
            ))}
            <text x="212" y={PLOT_BASE + 28} textAnchor="middle" fillOpacity="0.6">hours studied</text>
        </g>
    );
}

function Scatter({ dim }) {
    return (
        <>
            {HOURS.map((h, i) => {
                const passed = PASS[i] === 1;
                const cx = xOf(h), cy = yOf(passed ? 1 : 0);
                return passed ? (
                    <circle key={i} cx={cx} cy={cy} r="4" fill="var(--accent-primary)" fillOpacity={dim ? 0.35 : 0.9} />
                ) : (
                    <rect key={i} x={cx - 3.5} y={cy - 3.5} width="7" height="7" fill="var(--destructive)" fillOpacity={dim ? 0.35 : 0.9} />
                );
            })}
        </>
    );
}

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'linear' },
    { mode: 'fit', it: 0 },
    { mode: 'fit', it: 10 },
    { mode: 'fit', it: 100 },
    { mode: 'fit', it: 1000 },
    { mode: 'fit', it: 5000 },
    { mode: 'interactive' },
    { mode: 'catches' },
];

export default function LogisticRegressionVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const reducedMotion = useReducedMotion();
    const [hours, setHours] = useState(3);

    const stage = state.mode === 'fit' ? SNAPS[state.it] : null;
    const boundary = stage && stage.w > 0 ? -stage.b / stage.w : null;

    const predP = sigmoid(FINAL.w * hours + FINAL.b);
    const predPass = predP >= 0.5;

    const MarkerTag = reducedMotion ? 'g' : motion.g;
    const markerProps = reducedMotion
        ? { transform: `translate(${xOf(hours)} ${yOf(predP)})` }
        : { initial: false, animate: { x: xOf(hours), y: yOf(predP) }, transition: { type: 'spring', stiffness: 140, damping: 20 } };

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A scatter of 20 students' study hours against pass or fail, with a logistic regression curve fit to the data via gradient descent">
                <Axes />

                {state.mode === 'intro' && <Scatter />}

                {state.mode === 'linear' && (
                    <>
                        <rect x="41" y={PLOT_TOP} width="343" height={PLOT_H} fill="var(--accent-primary)" fillOpacity="0.05" />
                        <Scatter />
                        <polyline
                            points={`${xOf(0).toFixed(1)},${yOf(LINE.intercept).toFixed(1)} ${xOf(X_MAX).toFixed(1)},${yOf(LINE.intercept + LINE.slope * X_MAX).toFixed(1)}`}
                            fill="none" stroke="var(--secondary)" strokeWidth="2.5" strokeDasharray="6 4" />
                        <text x="368" y="44" textAnchor="end" fontSize="10" fontFamily="monospace" fill="var(--secondary)" fillOpacity="0.85">
                            straight-line fit
                        </text>
                        <text x="368" y="58" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">
                            exits 0–100% at both ends
                        </text>
                    </>
                )}

                {stage && (
                    <>
                        <Scatter dim={state.it === 0} />
                        {boundary != null && boundary >= 0 && boundary <= X_MAX && (
                            <line x1={xOf(boundary)} y1={PLOT_TOP} x2={xOf(boundary)} y2={PLOT_BASE}
                                stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" />
                        )}
                        <polyline points={sigmoidPath(stage.w, stage.b)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
                        <text x="368" y="44" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                            {state.it === 0 ? 'untrained — all 50%' : `after ${state.it.toLocaleString()} step${state.it === 1 ? '' : 's'}`}
                        </text>
                    </>
                )}

                {state.mode === 'interactive' && (
                    <>
                        <Scatter dim />
                        <line x1={xOf(-FINAL.b / FINAL.w)} y1={PLOT_TOP} x2={xOf(-FINAL.b / FINAL.w)} y2={PLOT_BASE}
                            stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" />
                        <polyline points={sigmoidPath(FINAL.w, FINAL.b)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
                        <line x1={xOf(hours)} y1={PLOT_TOP} x2={xOf(hours)} y2={PLOT_BASE} stroke="currentColor" strokeOpacity="0.2" />
                        <MarkerTag {...markerProps}>
                            {predPass ? (
                                <circle r="6" fill="var(--accent-primary)" stroke="currentColor" strokeWidth="1" />
                            ) : (
                                <rect x="-5.5" y="-5.5" width="11" height="11" fill="var(--destructive)" stroke="currentColor" strokeWidth="1" />
                            )}
                        </MarkerTag>
                        <text x="368" y="44" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">
                            P(pass) = {(predP * 100).toFixed(0)}%
                        </text>
                        <text x="368" y="58" textAnchor="end" fontSize="11" fontFamily="monospace"
                            fill={predPass ? 'var(--accent-primary)' : 'var(--destructive)'} fillOpacity="0.9">
                            predicted: {predPass ? 'PASS' : 'FAIL'}
                        </text>
                    </>
                )}

                {state.mode === 'catches' && (
                    <>
                        <Scatter dim />
                        <line x1={xOf(-FINAL.b / FINAL.w)} y1={PLOT_TOP} x2={xOf(-FINAL.b / FINAL.w)} y2={PLOT_BASE}
                            stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 3" />
                        <polyline points={sigmoidPath(FINAL.w, FINAL.b)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
                        <polyline
                            points={`${xOf(0).toFixed(1)},${yOf(LINE.intercept).toFixed(1)} ${xOf(X_MAX).toFixed(1)},${yOf(LINE.intercept + LINE.slope * X_MAX).toFixed(1)}`}
                            fill="none" stroke="var(--secondary)" strokeWidth="2" strokeDasharray="6 4" opacity="0.85" />
                        <text x="50" y="44" fontSize="10" fontFamily="monospace" fill="var(--accent-primary)" fillOpacity="0.85">
                            solid: logistic (stays in 0–100%)
                        </text>
                        <text x="50" y="58" fontSize="10" fontFamily="monospace" fill="var(--secondary)" fillOpacity="0.85">
                            dashed: straight line (doesn't)
                        </text>
                        <text x="368" y="44" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">
                            one straight cut = boundary
                        </text>
                    </>
                )}
            </svg>

            {state.mode === 'interactive' && (
                <div className="flex-shrink-0 pt-2 space-y-1.5">
                    <div className="flex items-center gap-3">
                        <label htmlFor="logreg-hours" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                            hours studied: {hours.toFixed(1)}
                        </label>
                        <input
                            id="logreg-hours" type="range" min="0" max={X_MAX} step="0.1" value={hours}
                            onChange={(e) => setHours(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer"
                            aria-label="Hours studied by a hypothetical student"
                        />
                    </div>
                    <p className="text-[11px] text-text-muted">Drag to see the trained model's predicted pass probability update live.</p>
                </div>
            )}
        </div>
    );
}
