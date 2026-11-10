import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Sampling visual — a language model's scores (logits) for the next word are
// turned into probabilities with softmax at a chosen temperature, then optionally
// trimmed by top-k or top-p (nucleus). Everything is computed for real at module
// load (no random, no clock). The scores are illustrative, chosen for teaching.
// Kept words = solid bars; trimmed words = dashed hollow bars with a cross.
// ──────────────────────────────────────────────────────────────────────────────

const WORDS = ['Paris', 'the', 'a', 'in', 'Lyon', 'big', 'now', 'not'];
const LOGITS = [6.0, 4.2, 3.6, 3.2, 2.6, 2.0, 1.6, 0.8];

const softmax = (T) => {
    const m = Math.max(...LOGITS);
    const e = LOGITS.map((l) => Math.exp((l - m) / T));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / s);
};

// Words are already sorted by score, so "top" = first ones.
const keepTopK = (p, k) => p.map((_, i) => i < k);
const keepTopP = (p, top) => {
    let c = 0;
    let done = false;
    return p.map((v) => {
        if (done) return false;
        c += v;
        if (c >= top) done = true;
        return true;
    });
};
const renorm = (p, keep) => {
    const s = p.reduce((a, v, i) => a + (keep[i] ? v : 0), 0);
    return { probs: p.map((v, i) => (keep[i] ? v / s : 0)), mass: s };
};

const build = (T, trim) => {
    const raw = softmax(T);
    let keep = raw.map(() => true);
    if (trim && trim.k) keep = keepTopK(raw, trim.k);
    if (trim && trim.p) keep = keepTopP(raw, trim.p);
    const { probs, mass } = renorm(raw, keep);
    const entropy = -probs.reduce((a, v) => a + (v > 0 ? v * Math.log2(v) : 0), 0);
    return { T, raw, keep, probs, mass, entropy, kept: keep.filter(Boolean).length, trim };
};

const STEP_STATES = [
    { mode: 'logits' },
    { mode: 'probs', data: build(1) },
    { mode: 'probs', data: build(0.5) },
    { mode: 'probs', data: build(2) },
    { mode: 'interactive' },
    { mode: 'probs', data: build(1, { k: 3 }) },
    { mode: 'probs', data: build(1, { p: 0.9 }), thumb: true },
    { mode: 'probs', data: build(2, { p: 0.9 }) },
];

const X0 = 14, BW = 34, GAP = 11.5, BASE = 236, HMAX = 170;
const bx = (i) => X0 + i * (BW + GAP);
const pct = (v) => `${Math.round(v * 100)}%`;

export default function SamplingVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    useReducedMotion(); // static drawing — no animation to gate

    const [temp, setTemp] = useState(1);
    const safeT = Math.max(0.2, Math.min(3, temp));

    const isLogits = state.mode === 'logits';
    const data = state.mode === 'interactive' ? build(safeT) : state.data || null;
    const maxLogit = Math.max(...LOGITS);

    let caption = 'raw scores (logits) for the next word';
    if (data) {
        const t = data.trim;
        const trimTxt = t && t.k ? ` · top-k=${t.k}` : t && t.p ? ` · top-p=${t.p}` : '';
        caption = `temperature ${data.T.toFixed(data.T % 1 ? 1 : 0)}${trimTxt}`;
    }

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Bar chart of next-word probabilities for eight candidate words; solid bars are words that can still be chosen, dashed hollow bars with a cross are words removed by trimming">
                <line x1={X0 - 4} y1={BASE} x2={396} y2={BASE} stroke="currentColor" strokeOpacity="0.3" />
                <text x={X0} y="24" fontSize="12" fill="currentColor" fillOpacity="0.85">
                    The capital of France is ___
                </text>
                <text x="386" y="24" textAnchor="end" fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                    {caption}
                </text>

                {WORDS.map((w, i) => {
                    const x = bx(i);
                    let h; let label; let kept = true;
                    if (isLogits) {
                        h = (LOGITS[i] / maxLogit) * HMAX;
                        label = LOGITS[i].toFixed(1);
                    } else {
                        kept = data.keep[i];
                        const v = kept ? data.probs[i] : data.raw[i];
                        h = Math.max(2, v * HMAX);
                        label = kept ? pct(v) : '✕';
                    }
                    return (
                        <g key={w}>
                            {kept ? (
                                <rect x={x} y={BASE - h} width={BW} height={h} rx="2"
                                    fill="var(--accent-primary)" fillOpacity="0.85" />
                            ) : (
                                <rect x={x} y={BASE - h} width={BW} height={h} rx="2" fill="none"
                                    stroke="var(--destructive)" strokeWidth="1.5" strokeDasharray="3 3" />
                            )}
                            <text x={x + BW / 2} y={BASE - h - 5} textAnchor="middle" fontSize="12"
                                fontFamily="monospace" fill={kept ? 'currentColor' : 'var(--destructive)'}>
                                {label}
                            </text>
                            <text x={x + BW / 2} y={BASE + 16} textAnchor="middle" fontSize="12" fill="currentColor">
                                {w}
                            </text>
                        </g>
                    );
                })}

                <text x="200" y="272" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                    {isLogits
                        ? 'bigger score = model prefers that word'
                        : `${data.kept} of 8 words kept · uncertainty ${data.entropy.toFixed(2)} bits`}
                </text>
                {!isLogits && data.trim && (
                    <text x="200" y="290" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.7">
                        kept words held {pct(data.mass)} of the probability before renormalising
                    </text>
                )}
            </svg>

            {state.mode === 'interactive' && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="samp-temp" className="text-xs font-bold text-text-secondary">Temperature</label>
                    <input id="samp-temp" aria-label="Temperature" type="range" min="0.2" max="3" step="0.1"
                        value={safeT} onChange={(e) => setTemp(Number(e.target.value))}
                        className="flex-1 cursor-pointer" />
                    <span className="text-xs font-mono text-text-muted w-10 text-right">{safeT.toFixed(1)}</span>
                </div>
            )}
        </div>
    );
}
