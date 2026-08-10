import { useState } from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Support Vector Machines visual — a real soft-margin SVM trained via Pegasos-
// style subgradient descent on a synthetic 16-part QA dataset (2 features:
// calibration time vs. output reading; PASS vs. FAIL). Everything — the
// candidate-line margins, the training trajectory, the final boundary and
// support vectors — is computed for real at module load (no faked numbers,
// no Math.random). Pure SVG + framer-motion; step states clamp defensively
// (see pages/Explains.jsx). PASS/FAIL are told apart by marker SHAPE (circle
// vs square) plus colour, never colour alone.
// ──────────────────────────────────────────────────────────────────────────────

// 16 synthetic QA readings: x = calibration time (s), y = output reading (V).
const PASS_PTS = [[2.0, 7.0], [2.4, 7.6], [2.8, 6.4], [1.6, 6.8], [3.2, 7.2], [2.0, 8.0], [3.6, 7.8], [1.2, 7.0]];
const FAIL_PTS = [[7.2, 2.4], [7.6, 3.0], [8.0, 1.8], [6.6, 1.2], [8.4, 2.6], [7.0, 3.4], [8.8, 2.0], [6.8, 0.8]];
const PTS = [...PASS_PTS, ...FAIL_PTS];
const LABELS = [...PASS_PTS.map(() => 1), ...FAIL_PTS.map(() => -1)];
const N = PTS.length;

// ── Two hand-picked "candidate" separating lines, y = m*x + c, evaluated for
// real: exact perpendicular distance from every point to the line. ──────────
function evalCandidate(m, c) {
    const norm = Math.sqrt(m * m + 1);
    let marginPos = Infinity, marginNeg = Infinity;
    PTS.forEach((p, i) => {
        const signed = (m * p[0] - p[1] + c) / norm; // >0 => FAIL side, <0 => PASS side
        if (LABELS[i] === 1) marginPos = Math.min(marginPos, -signed);
        else marginNeg = Math.min(marginNeg, signed);
    });
    return { m, c, marginPos, marginNeg, band: marginPos + marginNeg };
}
const HUGS_PASS = evalCandidate(1, 3.4);   // barely clears the PASS cluster
const BALANCED = evalCandidate(1, 0);      // a reasonable-looking guess down the middle

// ── Real soft-margin SVM training: Pegasos subgradient descent on hinge loss
// + L2 regularization. w, b start at zero; every step below is real arithmetic. ──
const LAMBDA = 0.05;
const SNAP_ITERS = [0, 50, 1000, 20000];
function trainSnapshots() {
    let w = [0, 0], b = 0;
    const snaps = {};
    if (SNAP_ITERS.includes(0)) snaps[0] = { w: [...w], b };
    const maxIter = SNAP_ITERS[SNAP_ITERS.length - 1];
    for (let t = 1; t <= maxIter; t++) {
        const eta = 1 / (LAMBDA * t);
        let dw = [0, 0], db = 0, active = 0;
        for (let i = 0; i < N; i++) {
            const margin = LABELS[i] * (w[0] * PTS[i][0] + w[1] * PTS[i][1] + b);
            if (margin < 1) {
                dw[0] += LABELS[i] * PTS[i][0];
                dw[1] += LABELS[i] * PTS[i][1];
                db += LABELS[i];
                active++;
            }
        }
        w[0] = (1 - eta * LAMBDA) * w[0] + (active ? (eta * dw[0]) / N : 0);
        w[1] = (1 - eta * LAMBDA) * w[1] + (active ? (eta * dw[1]) / N : 0);
        b = b + (active ? (eta * db) / N : 0);
        // Pegasos projection: keep ||w|| within the radius the regularizer allows.
        const norm = Math.hypot(w[0], w[1]);
        const cap = 1 / Math.sqrt(LAMBDA);
        if (norm > cap) { w[0] *= cap / norm; w[1] *= cap / norm; }
        if (SNAP_ITERS.includes(t)) snaps[t] = { w: [...w], b };
    }
    return snaps;
}
const SNAPS = trainSnapshots();
const FINAL = SNAPS[SNAP_ITERS[SNAP_ITERS.length - 1]];

// Support vectors at convergence: points whose margin sits at ~1 (the binding constraints).
const SUPPORT_IDX = PTS.reduce((acc, p, i) => {
    const margin = LABELS[i] * (FINAL.w[0] * p[0] + FINAL.w[1] * p[1] + FINAL.b);
    if (margin < 1.05) acc.push(i);
    return acc;
}, []);

// A fixed, illustrative 17th reading that would make the data NOT linearly
// separable — used only in the "catches" step.
const STRAY_POINT = { x: 5, y: 5, label: -1 };

// Layout: x = calibration time (0-10s), y = output reading (0-10V).
const AXIS_MAX = 10;
const PLOT_LEFT = 45, PLOT_RIGHT = 380, PLOT_TOP = 30, PLOT_BASE = 250;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT, PLOT_H = PLOT_BASE - PLOT_TOP;
const xOf = (x) => PLOT_LEFT + (x / AXIS_MAX) * PLOT_W;
const yOf = (y) => PLOT_BASE - (y / AXIS_MAX) * PLOT_H;

function Axes() {
    return (
        <g fontSize="10" fill="currentColor">
            <line x1={PLOT_LEFT} y1={PLOT_BASE} x2={PLOT_RIGHT} y2={PLOT_BASE} stroke="currentColor" strokeOpacity="0.25" />
            <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BASE} stroke="currentColor" strokeOpacity="0.25" />
            {[0, 2, 4, 6, 8, 10].map((v) => (
                <g key={`x${v}`}>
                    <line x1={xOf(v)} y1={PLOT_BASE} x2={xOf(v)} y2={PLOT_BASE + 4} stroke="currentColor" strokeOpacity="0.3" />
                    <text x={xOf(v)} y={PLOT_BASE + 15} textAnchor="middle" fillOpacity="0.55">{v}</text>
                </g>
            ))}
            {[0, 2, 4, 6, 8, 10].map((v) => (
                <g key={`y${v}`}>
                    <line x1={PLOT_LEFT - 4} y1={yOf(v)} x2={PLOT_LEFT} y2={yOf(v)} stroke="currentColor" strokeOpacity="0.3" />
                    <text x={PLOT_LEFT - 8} y={yOf(v) + 3} textAnchor="end" fillOpacity="0.55">{v}</text>
                </g>
            ))}
            <text x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={PLOT_BASE + 28} textAnchor="middle" fillOpacity="0.6">calibration time (s)</text>
            <text x="14" y={(PLOT_TOP + PLOT_BASE) / 2} textAnchor="middle" fillOpacity="0.6" transform={`rotate(-90 14 ${(PLOT_TOP + PLOT_BASE) / 2})`}>reading (V)</text>
        </g>
    );
}

function Scatter({ dim, highlightIdx }) {
    return (
        <>
            {PTS.map((p, i) => {
                const isPass = LABELS[i] === 1;
                const cx = xOf(p[0]), cy = yOf(p[1]);
                const isSV = highlightIdx?.includes(i);
                return (
                    <g key={i}>
                        {isSV && <circle cx={cx} cy={cy} r="9" fill="none" stroke="var(--secondary)" strokeWidth="1.5" />}
                        {isPass ? (
                            <circle cx={cx} cy={cy} r="4" fill="var(--accent-primary)" fillOpacity={dim ? 0.35 : 0.9} />
                        ) : (
                            <rect x={cx - 3.5} y={cy - 3.5} width="7" height="7" fill="var(--destructive)" fillOpacity={dim ? 0.35 : 0.9} />
                        )}
                    </g>
                );
            })}
        </>
    );
}

// Clip everything drawn from raw line math to the plot rectangle, since some
// candidate/margin lines run beyond the visible 0-10 axis range by construction.
function PlotClip({ children }) {
    return (
        <g clipPath="url(#svm-plot-clip)">
            <clipPath id="svm-plot-clip">
                <rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_W} height={PLOT_H} />
            </clipPath>
            {children}
        </g>
    );
}

function lineEndpoints(m, c) {
    return `${xOf(0).toFixed(1)},${yOf(c).toFixed(1)} ${xOf(AXIS_MAX).toFixed(1)},${yOf(m * AXIS_MAX + c).toFixed(1)}`;
}

// A candidate guess line (m, c) plus its two (possibly asymmetric) margin lines.
function CandidateLine({ cand }) {
    const norm = Math.sqrt(cand.m * cand.m + 1);
    const cPass = cand.c + cand.marginPos * norm; // offset toward the PASS side
    const cFail = cand.c - cand.marginNeg * norm;  // offset toward the FAIL side
    return (
        <PlotClip>
            <polygon
                points={`${lineEndpoints(cand.m, cPass)} ${xOf(AXIS_MAX).toFixed(1)},${yOf(cand.m * AXIS_MAX + cFail).toFixed(1)} ${xOf(0).toFixed(1)},${yOf(cFail).toFixed(1)}`}
                fill="var(--accent-primary)" fillOpacity="0.06"
            />
            <polyline points={lineEndpoints(cand.m, cPass)} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 3" fill="none" />
            <polyline points={lineEndpoints(cand.m, cFail)} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 3" fill="none" />
            <polyline points={lineEndpoints(cand.m, cand.c)} stroke="var(--secondary)" strokeWidth="2.5" fill="none" />
        </PlotClip>
    );
}

// The trained boundary w.x+b=0 plus its symmetric margin lines w.x+b=±1.
function TrainedLine({ w, b, dim }) {
    const m = -w[0] / w[1], c = -b / w[1];
    const yAt = (x, k) => (k - w[0] * x - b) / w[1];
    return (
        <PlotClip>
            <polyline
                points={`${xOf(0).toFixed(1)},${yOf(yAt(0, 1)).toFixed(1)} ${xOf(AXIS_MAX).toFixed(1)},${yOf(yAt(AXIS_MAX, 1)).toFixed(1)}`}
                stroke="currentColor" strokeOpacity={dim ? 0.15 : 0.3} strokeDasharray="3 3" fill="none"
            />
            <polyline
                points={`${xOf(0).toFixed(1)},${yOf(yAt(0, -1)).toFixed(1)} ${xOf(AXIS_MAX).toFixed(1)},${yOf(yAt(AXIS_MAX, -1)).toFixed(1)}`}
                stroke="currentColor" strokeOpacity={dim ? 0.15 : 0.3} strokeDasharray="3 3" fill="none"
            />
            <polyline
                points={lineEndpoints(m, c)}
                stroke="var(--accent-primary)" strokeOpacity={dim ? 0.4 : 1} strokeWidth="2.5" fill="none"
            />
        </PlotClip>
    );
}

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'candidate', cand: HUGS_PASS, label: 'hugs the PASS cluster' },
    { mode: 'candidate', cand: BALANCED, label: 'a reasonable guess' },
    { mode: 'train', it: 50 },
    { mode: 'train', it: 1000 },
    { mode: 'train', it: 20000 },
    { mode: 'train', it: 20000, highlightSV: true },
    { mode: 'interactive' },
    { mode: 'catches' },
];

export default function SVMVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const reducedMotion = useReducedMotion();
    const [testX, setTestX] = useState(4);
    const [testY, setTestY] = useState(4);

    const stage = state.mode === 'train' ? SNAPS[state.it] : null;
    const stageNorm = stage ? Math.hypot(stage.w[0], stage.w[1]) : null;

    const testScore = FINAL.w[0] * testX + FINAL.w[1] * testY + FINAL.b;
    const testPass = testScore >= 0;

    const MarkerTag = reducedMotion ? 'g' : motion.g;
    const markerProps = reducedMotion
        ? { transform: `translate(${xOf(testX)} ${yOf(testY)})` }
        : { initial: false, animate: { x: xOf(testX), y: yOf(testY) }, transition: { type: 'spring', stiffness: 140, damping: 20 } };

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A scatter of 16 QA readings, PASS as circles and FAIL as squares, with candidate and trained maximum-margin separating lines">
                <Axes />

                {state.mode === 'intro' && <Scatter />}

                {state.mode === 'candidate' && (
                    <>
                        <Scatter />
                        <CandidateLine cand={state.cand} />
                        <text x={PLOT_RIGHT} y="44" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                            margins: {state.cand.marginPos.toFixed(2)} / {state.cand.marginNeg.toFixed(2)}
                        </text>
                        <text x={PLOT_RIGHT} y="58" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.55">
                            {state.label}
                        </text>
                    </>
                )}

                {stage && (
                    <>
                        <Scatter dim={state.it === 0} highlightIdx={state.highlightSV ? SUPPORT_IDX : null} />
                        {stageNorm > 0 && <TrainedLine w={stage.w} b={stage.b} />}
                        <text x={PLOT_RIGHT} y="44" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                            {state.it === 0 ? 'untrained — no boundary' : `after ${state.it.toLocaleString()} step${state.it === 1 ? '' : 's'}`}
                        </text>
                        {stageNorm > 0 && (
                            <text x={PLOT_RIGHT} y="58" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.55">
                                margin band ≈ {(2 / stageNorm).toFixed(2)}
                            </text>
                        )}
                        {state.highlightSV && (
                            <text x={PLOT_LEFT + 4} y={PLOT_TOP + 12} fontSize="10" fontFamily="monospace" fill="var(--secondary)" fillOpacity="0.85">
                                ringed = support vectors
                            </text>
                        )}
                    </>
                )}

                {state.mode === 'interactive' && (
                    <>
                        <Scatter dim />
                        <TrainedLine w={FINAL.w} b={FINAL.b} dim />
                        <MarkerTag {...markerProps}>
                            {testPass ? (
                                <circle r="6" fill="var(--accent-primary)" stroke="currentColor" strokeWidth="1" />
                            ) : (
                                <rect x="-5.5" y="-5.5" width="11" height="11" fill="var(--destructive)" stroke="currentColor" strokeWidth="1" />
                            )}
                        </MarkerTag>
                        <text x={PLOT_RIGHT} y="44" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">
                            score = {testScore.toFixed(2)}
                        </text>
                        <text x={PLOT_RIGHT} y="58" textAnchor="end" fontSize="11" fontFamily="monospace"
                            fill={testPass ? 'var(--accent-primary)' : 'var(--destructive)'} fillOpacity="0.9">
                            predicted: {testPass ? 'PASS' : 'FAIL'}
                        </text>
                    </>
                )}

                {state.mode === 'catches' && (
                    <>
                        <Scatter dim />
                        <TrainedLine w={FINAL.w} b={FINAL.b} dim />
                        <g opacity="0.85">
                            <rect x={xOf(STRAY_POINT.x) - 4} y={yOf(STRAY_POINT.y) - 4} width="8" height="8"
                                fill="none" stroke="var(--destructive)" strokeWidth="1.5" strokeDasharray="2 2" />
                        </g>
                        <text x={PLOT_LEFT + 4} y={PLOT_TOP + 12} fontSize="10" fontFamily="monospace" fill="var(--destructive)" fillOpacity="0.85">
                            dashed square: one stray FAIL reading
                        </text>
                        <text x={PLOT_RIGHT} y="44" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">
                            no straight line separates this
                        </text>
                    </>
                )}
            </svg>

            {state.mode === 'interactive' && (
                <div className="flex-shrink-0 pt-2 space-y-1.5">
                    <div className="flex items-center gap-3">
                        <label htmlFor="svm-testx" className="text-[11px] font-mono text-text-muted flex-shrink-0 w-32">
                            time: {testX.toFixed(1)}s
                        </label>
                        <input
                            id="svm-testx" type="range" min="0" max={AXIS_MAX} step="0.1" value={testX}
                            onChange={(e) => setTestX(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer"
                            aria-label="Hypothetical part's calibration time in seconds"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label htmlFor="svm-testy" className="text-[11px] font-mono text-text-muted flex-shrink-0 w-32">
                            reading: {testY.toFixed(1)}V
                        </label>
                        <input
                            id="svm-testy" type="range" min="0" max={AXIS_MAX} step="0.1" value={testY}
                            onChange={(e) => setTestY(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer"
                            aria-label="Hypothetical part's output reading in volts"
                        />
                    </div>
                    <p className="text-[11px] text-text-muted">Drag either slider to move the point and watch the trained model classify it live.</p>
                </div>
            )}
        </div>
    );
}
