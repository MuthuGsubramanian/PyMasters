import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Softmax & temperature visual — six candidate next words after the prompt
// "The capital of France is". Raw scores (logits) are hand-chosen constants;
// every exponential, probability, entropy and top-p cut below is computed for
// real at module load (no random, no clock). The most likely word carries a
// diamond marker; words kept by top-p are solid bars, dropped ones dashed.
// ──────────────────────────────────────────────────────────────────────────────

const TOKENS = ['Paris', 'the', 'a', 'Lyon', 'located', 'banana'];
const LOGITS = [6.0, 4.2, 3.5, 3.0, 2.2, 0.5];
const EXPS = LOGITS.map((l) => Math.exp(l));
const EXP_MAX = Math.max(...EXPS);

const softmax = (logits, T) => {
    const t = Math.max(0.05, T);
    const m = Math.max(...logits);
    const e = logits.map((l) => Math.exp((l - m) / t)); // subtract max for stability
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / s);
};
const entropyBits = (p) => -p.reduce((s, x) => (x > 0 ? s + x * Math.log2(x) : s), 0);

// Nucleus (top-p): keep the smallest set of top words whose probability reaches p.
const nucleus = (probs, topP) => {
    const order = probs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
    const keep = new Set();
    let c = 0;
    for (const [x, i] of order) {
        keep.add(i);
        c += x;
        if (c >= topP) break;
    }
    return { keep, mass: c };
};

const P1 = softmax(LOGITS, 1);
const P05 = softmax(LOGITS, 0.5);
const P2 = softmax(LOGITS, 2);
const NUC = nucleus(P1, 0.9);

const STEP_STATES = [
    { mode: 'logits' },
    { mode: 'exp' },
    { mode: 'prob', T: 1, probs: P1 },
    { mode: 'prob', T: 0.5, probs: P05 },
    { mode: 'prob', T: 2, probs: P2 },
    { mode: 'interactive' },
    { mode: 'prob', T: 1, probs: P1, nuc: NUC },
    { mode: 'prob', T: 1, probs: P1, nuc: NUC },
];

const BAR_X = 96, BAR_W = 232, ROW0 = 62, ROW_H = 34;
const pct = (v) => (v >= 0.0005 ? `${(v * 100).toFixed(1)}%` : '<0.1%');

export default function SoftmaxTemperatureVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    useReducedMotion(); // static drawing — nothing animates

    const [temp, setTemp] = useState(1);
    const safeT = Math.max(0.1, Math.min(3, Number.isFinite(temp) ? temp : 1));

    const probs = interactive ? softmax(LOGITS, safeT) : state.probs;
    const T = interactive ? safeT : state.T;
    const isProb = state.mode === 'prob' || interactive;
    const nuc = state.nuc;
    const H = isProb ? entropyBits(probs) : null;

    const barLen = (i) => {
        if (state.mode === 'logits') return (LOGITS[i] / 6) * BAR_W;
        if (state.mode === 'exp') return (EXPS[i] / EXP_MAX) * BAR_W;
        return probs[i] * BAR_W;
    };
    const valueText = (i) => {
        if (state.mode === 'logits') return LOGITS[i].toFixed(1);
        if (state.mode === 'exp') return EXPS[i].toFixed(1);
        return pct(probs[i]);
    };
    const topIdx = isProb ? probs.indexOf(Math.max(...probs)) : 0;

    const title = {
        logits: 'raw scores (logits)',
        exp: 'e^score — always positive',
        prob: `probabilities · T = ${T}`,
        interactive: `probabilities · T = ${safeT.toFixed(1)}`,
    }[state.mode];

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Horizontal bars for six candidate next words after 'The capital of France is'. Bars show raw scores, then exponentiated scores, then probabilities that sum to one, sharpened or flattened by temperature">
                <text x="200" y="22" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">
                    “The capital of France is …”
                </text>
                <text x="200" y="40" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.75">
                    {title}
                </text>
                {TOKENS.map((tok, i) => {
                    const y = ROW0 + i * ROW_H;
                    const dropped = nuc && !nuc.keep.has(i);
                    const w = Math.max(1.5, barLen(i));
                    return (
                        <g key={tok}>
                            <text x={BAR_X - 8} y={y + 14} textAnchor="end" fontSize="12" fontFamily="monospace"
                                fill="currentColor" fillOpacity={dropped ? 0.5 : 0.95}>{tok}</text>
                            <rect x={BAR_X} y={y} width={w} height="20" rx="3"
                                fill={dropped ? 'none' : (i === topIdx && isProb ? 'var(--accent-primary)' : 'var(--secondary)')}
                                fillOpacity={dropped ? 0 : 0.85}
                                stroke={dropped ? 'var(--destructive)' : 'currentColor'}
                                strokeOpacity={dropped ? 1 : 0.2}
                                strokeDasharray={dropped ? '4 3' : undefined} strokeWidth="1.5" />
                            {i === topIdx && isProb && (
                                <path d={`M ${BAR_X + w + 8} ${y + 4} l 6 6 l -6 6 l -6 -6 z`}
                                    fill="var(--accent-primary)" />
                            )}
                            <text x={BAR_X + w + (i === topIdx && isProb ? 22 : 8)} y={y + 14} fontSize="11"
                                fontFamily="monospace" fill="currentColor" fillOpacity="0.85">{valueText(i)}</text>
                        </g>
                    );
                })}
                <text x="200" y="278" textAnchor="middle" fontSize="11" fontFamily="monospace"
                    fill="currentColor" fillOpacity="0.8">
                    {state.mode === 'logits' && 'scores can be negative or any size'}
                    {state.mode === 'exp' && `sum = ${EXPS.reduce((a, b) => a + b, 0).toFixed(1)}  → divide each by it`}
                    {isProb && !nuc && `sum = 100% · uncertainty ${H.toFixed(2)} bits`}
                    {isProb && nuc && `dashed = dropped · kept mass ${(NUC.mass * 100).toFixed(1)}%`}
                </text>
                {isProb && (
                    <text x="200" y="292" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                        ◆ = most likely word
                    </text>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="softmax-temp" className="text-xs font-bold text-text-secondary">Temperature</label>
                    <input id="softmax-temp" aria-label="Temperature" type="range" min="0.1" max="3" step="0.1"
                        value={safeT} onChange={(e) => setTemp(Number(e.target.value))}
                        className="flex-1 cursor-pointer" />
                    <span className="text-xs font-mono text-text-muted w-10 text-right">{safeT.toFixed(1)}</span>
                </div>
            )}
        </div>
    );
}
