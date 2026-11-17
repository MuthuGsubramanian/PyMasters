import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';
import {
    TEST, NBINS, BEST_T, BEFORE, AFTER, reliability, histogram, accuracyAt,
} from './calibrationMath';

// ──────────────────────────────────────────────────────────────────────────────
// Calibration visual — a reliability diagram for a deliberately over-confident
// classifier. All numbers (bins, ECE, Brier, fitted temperature) come from
// calibrationMath.js, computed for real at module load on a seeded dataset.
// Markers: squares = before temperature scaling, circles = after.
// ──────────────────────────────────────────────────────────────────────────────

const X0 = 60, W = 220, Y0 = 250, H = 200;
const px = (p) => X0 + p * W;
const py = (q) => Y0 - q * H;

const HIST_BEFORE = histogram(TEST.logits, 1);
const HIST_AFTER = histogram(TEST.logits, BEST_T);
const HMAX = Math.max(...HIST_BEFORE, ...HIST_AFTER);
const ACC_BEFORE = accuracyAt(TEST.logits, TEST.labels, 1);
const ACC_AFTER = accuracyAt(TEST.logits, TEST.labels, BEST_T);
const pct = (v) => `${Math.round(v * 100)}%`;

const STEP_STATES = [
    { mode: 'hist' },
    { mode: 'hist', highlight: NBINS - 1 },
    { mode: 'rel', data: BEFORE, shape: 'square' },
    { mode: 'rel', data: BEFORE, shape: 'square', gaps: true },
    { mode: 'interactive' },
    { mode: 'rel', data: AFTER, shape: 'circle', fitted: true },
    { mode: 'overlay' },                      // thumbnail
    { mode: 'caveat' },
];

const Axes = ({ xLabel = 'predicted probability', yLabel = 'actual frequency' }) => (
    <g>
        <rect x={X0} y={Y0 - H} width={W} height={H} fill="none" stroke="currentColor" strokeOpacity="0.15" />
        {[0, 0.5, 1].map((t) => (
            <g key={t}>
                <text x={px(t)} y={Y0 + 13} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">{t}</text>
                <text x={X0 - 6} y={py(t) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">{t}</text>
            </g>
        ))}
        <text x={X0 + W / 2} y={Y0 + 28} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">{xLabel}</text>
        <text x="14" y={Y0 - H / 2} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7"
            transform={`rotate(-90 14 ${Y0 - H / 2})`}>{yLabel}</text>
    </g>
);

const Marker = ({ x, y, n, shape, color, faint }) => {
    const r = 3.5 + Math.sqrt(n) * 0.9;
    const common = {
        fill: color, fillOpacity: faint ? 0.25 : 0.8,
        stroke: 'currentColor', strokeOpacity: faint ? 0.15 : 0.35, strokeWidth: 1,
    };
    return shape === 'square'
        ? <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx="2" {...common} />
        : <circle cx={x} cy={y} r={r} {...common} />;
};

const Reliability = ({ data, shape, color, gaps, faint }) => (
    <g>
        {data.pts.map((p, i) => (
            <g key={i}>
                {gaps && (
                    <line x1={px(p.conf)} y1={py(p.conf)} x2={px(p.conf)} y2={py(p.acc)}
                        stroke="var(--destructive)" strokeWidth="2.5" strokeOpacity="0.7" />
                )}
                <Marker x={px(p.conf)} y={py(p.acc)} n={p.n} shape={shape} color={color} faint={faint} />
            </g>
        ))}
    </g>
);

const Hist = ({ counts, highlight, reduced }) => (
    <g>
        {counts.map((n, i) => {
            const h = (n / HMAX) * H;
            const hot = highlight === i;
            return (
                <motion.rect key={i} x={X0 + i * (W / NBINS) + 1} width={W / NBINS - 2} rx="2"
                    fill={hot ? 'var(--destructive)' : 'var(--accent-primary)'} fillOpacity={hot ? 0.8 : 0.45}
                    initial={false}
                    animate={{ y: Y0 - h, height: h }}
                    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18 }} />
            );
        })}
    </g>
);

export default function CalibrationVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    const reduced = useReducedMotion();

    const [T, setT] = useState(1);
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setT(1);
    }
    const live = useMemo(() => reliability(TEST.logits, TEST.labels, T), [T]);

    const readout = (d, extra) => (
        <g fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">
            <text x="292" y="70">ECE {d.ece.toFixed(3)}</text>
            <text x="292" y="86">Brier {d.brier.toFixed(3)}</text>
            {extra && <text x="292" y="102">{extra}</text>}
        </g>
    );

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Reliability diagram: how often a classifier's stated confidence matches how often it is actually right">
                {state.mode === 'hist' && (
                    <g>
                        <Axes xLabel="confidence the model reports" yLabel="number of predictions" />
                        <Hist counts={HIST_BEFORE} highlight={state.highlight} reduced={reduced} />
                        <text x="292" y="60" fontSize="11" fill="currentColor" fillOpacity="0.8">200 test</text>
                        <text x="292" y="74" fontSize="11" fill="currentColor" fillOpacity="0.8">predictions</text>
                        {state.highlight != null && (
                            <g fontSize="11" fill="var(--destructive)" fontWeight="700">
                                <text x="292" y="110">{HIST_BEFORE[NBINS - 1]} said</text>
                                <text x="292" y="124">“over 90%”</text>
                            </g>
                        )}
                    </g>
                )}

                {(state.mode === 'rel' || interactive || state.mode === 'overlay') && (
                    <g>
                        <Axes />
                        <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="currentColor"
                            strokeOpacity="0.5" strokeDasharray="4 4" />
                        <text x={px(0.62)} y={py(0.72)} fontSize="11" fill="currentColor" fillOpacity="0.7"
                            transform={`rotate(-42 ${px(0.62)} ${py(0.72)})`}>perfectly calibrated</text>
                    </g>
                )}

                {state.mode === 'rel' && (
                    <g>
                        <Reliability data={state.data} shape={state.shape}
                            color={state.shape === 'square' ? 'var(--destructive)' : 'var(--accent-primary)'}
                            gaps={state.gaps} />
                        {readout(state.data, state.fitted ? `T = ${BEST_T.toFixed(2)}` : state.gaps ? 'gap = ECE' : null)}
                        {!state.fitted && (
                            <text x="292" y="130" fontSize="11" fill="var(--destructive)" fontWeight="700">
                                <tspan x="292">below the line =</tspan>
                                <tspan x="292" dy="14">over-confident</tspan>
                            </text>
                        )}
                    </g>
                )}

                {interactive && (
                    <g>
                        <Reliability data={live} shape="circle" color="var(--accent-primary)" />
                        {readout(live, `T = ${T.toFixed(1)}`)}
                    </g>
                )}

                {state.mode === 'overlay' && (
                    <g>
                        <Reliability data={BEFORE} shape="square" color="var(--destructive)" faint />
                        <Reliability data={AFTER} shape="circle" color="var(--accent-primary)" />
                        {readout(AFTER, `was ${BEFORE.ece.toFixed(3)}`)}
                        <g fontSize="11" fill="currentColor" fillOpacity="0.8">
                            <rect x="292" y="140" width="9" height="9" fill="var(--destructive)" fillOpacity="0.4" />
                            <text x="306" y="149">before</text>
                            <circle cx="296.5" cy="164" r="4.5" fill="var(--accent-primary)" fillOpacity="0.8" />
                            <text x="306" y="168">after</text>
                        </g>
                    </g>
                )}

                {state.mode === 'caveat' && (
                    <g>
                        <Axes xLabel="confidence the model reports" yLabel="number of predictions" />
                        <Hist counts={HIST_BEFORE} reduced={reduced} />
                        {HIST_AFTER.map((n, i) => (
                            <rect key={i} x={X0 + i * (W / NBINS) + 4} width={W / NBINS - 8}
                                y={Y0 - (n / HMAX) * H} height={(n / HMAX) * H}
                                fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
                        ))}
                        <g fontSize="11" fill="currentColor" fillOpacity="0.85">
                            <text x="292" y="60">Filled: before</text>
                            <text x="292" y="74">Dashed: after</text>
                            <text x="292" y="100" fontFamily="monospace">accuracy</text>
                            <text x="292" y="114" fontFamily="monospace">{pct(ACC_BEFORE)} → {pct(ACC_AFTER)}</text>
                        </g>
                    </g>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <label htmlFor="calib-t" className="text-xs font-bold text-text-secondary">
                        Temperature T = {T.toFixed(1)}
                    </label>
                    <div className="min-h-[44px] flex items-center flex-1 min-w-[140px]">
                        <input id="calib-t" type="range" min="0.5" max="4" step="0.1" value={T}
                            aria-label="Temperature T for softening the model's confidence"
                            onChange={(e) => setT(Number(e.target.value))}
                            className="w-full cursor-pointer" />
                    </div>
                    <button onClick={() => setT(Math.round(BEST_T * 10) / 10)}
                        className="text-xs font-bold text-white bg-gradient-primary rounded-lg px-3 py-2 cursor-pointer">
                        Use fitted T
                    </button>
                </div>
            )}
        </div>
    );
}
