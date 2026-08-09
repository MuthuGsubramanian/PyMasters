import { useState } from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Bayesian Inference visual — a Beta posterior over an unknown click-through
// rate, updated visitor-by-visitor from a fixed (hardcoded, non-random) 60-row
// outcome log. The Beta density, its peak, and its 90% credible interval are
// all computed for real at module load via log-factorials and a trapezoidal
// numerical integral — no faked numbers. Pure SVG + framer-motion; step states
// clamp defensively (see pages/Explains.jsx). Curves are told apart by stroke
// pattern (solid vs dashed) plus text labels, never colour alone.
// ──────────────────────────────────────────────────────────────────────────────

// 60 site visits, hardcoded outcomes (1 = clicked, 0 = did not). 20 clicks total.
const CLICKS = [
    0, 1, 0, 0, 1, 0, 0, 0, 1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 0,
    1, 1, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 1, 0, 0, 0,
    1, 0, 0, 1, 0, 0, 0, 1, 0, 1,
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
];

const FLAT_PRIOR = { a0: 1, b0: 1 };
const SKEPTIC_PRIOR = { a0: 20, b0: 20 }; // centred on 50%, fairly confident

function paramsAtN(n, prior = FLAT_PRIOR) {
    const seen = CLICKS.slice(0, n);
    const successes = seen.reduce((s, v) => s + v, 0);
    return [prior.a0 + successes, prior.b0 + (n - successes)];
}

// log(n!) by direct summation — exact for the small integer a,b we use here.
function logFactorial(n) {
    let s = 0;
    for (let k = 2; k <= n; k++) s += Math.log(k);
    return s;
}
function logBeta(a, b) {
    return logFactorial(a - 1) + logFactorial(b - 1) - logFactorial(a + b - 1);
}
function betaPdf(x, a, b) {
    if (x <= 0 || x >= 1) return 0;
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(a, b));
}

const GRID = 240;
function curveXs() {
    const xs = [];
    for (let i = 0; i <= GRID; i++) {
        let x = i / GRID;
        if (x <= 0) x = 0.002;
        if (x >= 1) x = 0.998;
        xs.push(x);
    }
    return xs;
}
const XS = curveXs();

function densities(a, b) {
    return XS.map((x) => betaPdf(x, a, b));
}

// 90% credible interval + mean, via trapezoidal cumulative integration.
function summarize(a, b) {
    const pdf = densities(a, b);
    const cum = [0];
    for (let i = 1; i <= GRID; i++) {
        cum.push(cum[i - 1] + 0.5 * (pdf[i] + pdf[i - 1]) * (XS[i] - XS[i - 1]));
    }
    const total = cum[GRID];
    const norm = cum.map((c) => c / total);
    const findX = (q) => {
        for (let i = 1; i <= GRID; i++) {
            if (norm[i] >= q) {
                const t = (q - norm[i - 1]) / (norm[i] - norm[i - 1] || 1);
                return XS[i - 1] + t * (XS[i] - XS[i - 1]);
            }
        }
        return XS[GRID];
    };
    return { mean: a / (a + b), lo: findX(0.05), hi: findX(0.95), pdf };
}

const xOf = (p) => 40 + p * 340;
const PLOT_TOP = 34;
const PLOT_BASE = 258;
const PLOT_H = PLOT_BASE - PLOT_TOP;

// Shared vertical scale so peak height itself shows growing certainty —
// computed from the actual curves this essay renders, not a guessed constant.
const STAGE_NS = [0, 1, 5, 20, 60];
const ALL_PEAKS = [
    ...STAGE_NS.map((n) => Math.max(...summarize(...paramsAtN(n)).pdf)),
    Math.max(...summarize(...paramsAtN(60, SKEPTIC_PRIOR)).pdf),
];
const SCALE = PLOT_H / Math.max(...ALL_PEAKS);
const yOf = (density) => PLOT_BASE - density * SCALE;

const pathFor = (pdf) => XS.map((x, i) => `${xOf(x).toFixed(1)},${yOf(pdf[i]).toFixed(1)}`).join(' ');

const STAGE_CACHE = Object.fromEntries(
    STAGE_NS.map((n) => {
        const [a, b] = paramsAtN(n);
        return [n, { a, b, ...summarize(a, b) }];
    })
);
const SKEPTIC_60 = (() => {
    const [a, b] = paramsAtN(60, SKEPTIC_PRIOR);
    return { a, b, ...summarize(a, b) };
})();

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'stage', n: 0 },
    { mode: 'stage', n: 1 },
    { mode: 'stage', n: 5 },
    { mode: 'stage', n: 20 },
    { mode: 'interactive' },
    { mode: 'stage', n: 60 },
    { mode: 'compare' },
];

const MeanMarker = ({ p, animate }) => {
    const Tag = animate ? motion.g : 'g';
    const props = animate
        ? { initial: false, animate: { x: xOf(p) }, transition: { type: 'spring', stiffness: 130, damping: 18 } }
        : { transform: `translate(${xOf(p)} 0)` };
    return (
        <Tag {...props}>
            <line x1="0" y1={PLOT_TOP} x2="0" y2={PLOT_BASE} stroke="var(--secondary)" strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity="0.75" />
            <polygon points="-5,26 5,26 0,34" fill="var(--secondary)" />
        </Tag>
    );
};

function Axis() {
    return (
        <g fontSize="10" fill="currentColor">
            <line x1="40" y1={PLOT_BASE} x2="380" y2={PLOT_BASE} stroke="currentColor" strokeOpacity="0.25" />
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                <g key={p}>
                    <line x1={xOf(p)} y1={PLOT_BASE} x2={xOf(p)} y2={PLOT_BASE + 4} stroke="currentColor" strokeOpacity="0.3" />
                    <text x={xOf(p)} y={PLOT_BASE + 15} textAnchor="middle" fillOpacity="0.55">{Math.round(p * 100)}%</text>
                </g>
            ))}
            <text x="210" y={PLOT_BASE + 28} textAnchor="middle" fillOpacity="0.6">click-through rate</text>
        </g>
    );
}

export default function BayesianInferenceVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const reducedMotion = useReducedMotion();
    const interactive = state.mode === 'interactive';

    const [n, setN] = useState(30);
    const stage = interactive
        ? (() => { const [a, b] = paramsAtN(n); return { a, b, ...summarize(a, b) }; })()
        : state.mode === 'stage'
            ? STAGE_CACHE[state.n]
            : null;

    const showCI = stage && (state.mode === 'stage' ? state.n > 0 : n > 0);
    const clicked = n > 0 ? CLICKS[n - 1] : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A probability density curve over an unknown click-through rate, narrowing and shifting as more visitor outcomes arrive">
                <Axis />

                {state.mode === 'intro' && (
                    <text x="210" y="150" textAnchor="middle" fontSize="13" fill="currentColor" fillOpacity="0.55">
                        p = unknown, until visitors show us
                    </text>
                )}

                {stage && (
                    <>
                        {showCI && (
                            <rect x={xOf(stage.lo)} y={PLOT_TOP} width={xOf(stage.hi) - xOf(stage.lo)} height={PLOT_H}
                                fill="var(--accent-primary)" fillOpacity="0.09" />
                        )}
                        <polyline points={pathFor(stage.pdf)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
                        <MeanMarker p={stage.mean} animate={!reducedMotion} />
                        <text x="368" y="46" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                            {state.mode === 'stage' && state.n === 0 ? 'prior only — no data yet' : `n = ${interactive ? n : state.n}`}
                        </text>
                        {showCI && (
                            <text x="368" y="60" textAnchor="end" fontSize="10" fontFamily="monospace" fill="var(--secondary)" fillOpacity="0.85">
                                mean {(stage.mean * 100).toFixed(0)}% · 90% CI [{(stage.lo * 100).toFixed(0)}–{(stage.hi * 100).toFixed(0)}%]
                            </text>
                        )}
                        {interactive && n > 0 && (
                            <text x="40" y="46" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">
                                visitor {n}: {clicked ? 'clicked' : 'no click'}
                            </text>
                        )}
                    </>
                )}

                {state.mode === 'compare' && (
                    <>
                        <rect x={xOf(STAGE_CACHE[60].lo)} y={PLOT_TOP} width={xOf(STAGE_CACHE[60].hi) - xOf(STAGE_CACHE[60].lo)} height={PLOT_H}
                            fill="var(--accent-primary)" fillOpacity="0.07" />
                        <polyline points={pathFor(STAGE_CACHE[60].pdf)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
                        <polyline points={pathFor(SKEPTIC_60.pdf)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5"
                            strokeDasharray="6 4" strokeLinecap="round" opacity="0.85" />
                        <MeanMarker p={STAGE_CACHE[60].mean} animate={false} />
                        <text x="40" y="46" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                            solid: flat prior → mean {(STAGE_CACHE[60].mean * 100).toFixed(0)}%
                        </text>
                        <text x="40" y="60" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                            dashed: skeptical prior → mean {(SKEPTIC_60.mean * 100).toFixed(0)}%
                        </text>
                        <text x="368" y="46" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">
                            both after n = 60
                        </text>
                    </>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 space-y-1.5">
                    <div className="flex items-center gap-3">
                        <label htmlFor="bayes-n" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                            visitors seen: {n}
                        </label>
                        <input
                            id="bayes-n" type="range" min="0" max={CLICKS.length} value={n}
                            onChange={(e) => setN(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer"
                            aria-label="Number of visitors observed so far"
                        />
                    </div>
                    <p className="text-[11px] text-text-muted">Drag to replay all 60 visits, one at a time, and watch the curve update.</p>
                </div>
            )}
        </div>
    );
}
