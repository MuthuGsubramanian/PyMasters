import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Quantization visual — 48 model "weights" (deterministic, one big outlier) are
// snapped onto a grid of 2^bits evenly spaced levels. Every quantized value and
// every error figure is computed for real at module load (no random, no clock).
// Weights = circles, quantized values = squares; error = vertical segments.
// ──────────────────────────────────────────────────────────────────────────────

const N = 48;
const OUTLIER_AT = 30;

// Tiny deterministic LCG; sum of 4 uniforms ≈ bell-shaped weights.
const makeWeights = () => {
    let s = 12345;
    const u = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const w = [];
    for (let i = 0; i < N; i++) w.push(((u() + u() + u() + u()) - 2) * 0.9);
    w[OUTLIER_AT] = 2.4; // one large weight, as real LLMs have
    return w.map((v) => Math.round(v * 1000) / 1000);
};
const WEIGHTS = makeWeights();

// Symmetric quantization of a slice: scale = limit / (2^(b-1) - 1).
const quantSlice = (vals, bits, limit) => {
    const qmax = 2 ** (bits - 1) - 1;
    const scale = limit / qmax;
    return vals.map((v) => {
        const code = Math.max(-qmax, Math.min(qmax, Math.round(v / scale)));
        return code * scale;
    });
};
const absMax = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const mse = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length;

// mode: 'abs' (one scale from the biggest weight), 'clip' (ignore the outlier
// when picking the scale, clamp it), 'block' (a separate scale per 8 weights).
function quantize(bits, mode = 'abs') {
    let q;
    let limit = absMax(WEIGHTS);
    if (mode === 'block') {
        q = [];
        for (let i = 0; i < N; i += 8) {
            const blk = WEIGHTS.slice(i, i + 8);
            q.push(...quantSlice(blk, bits, absMax(blk)));
        }
    } else {
        if (mode === 'clip') limit = absMax(WEIGHTS.filter((_, i) => i !== OUTLIER_AT));
        q = quantSlice(WEIGHTS, bits, limit);
    }
    return { bits, mode, q, limit, err: mse(WEIGHTS, q), levels: 2 ** bits - 1 };
}

const BITS_TABLE = {};
for (let b = 2; b <= 8; b++) BITS_TABLE[b] = quantize(b, 'abs');
const CLIP4 = quantize(4, 'clip');
const BLOCK4 = quantize(4, 'block');

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'grid', q: BITS_TABLE[3] },
    { mode: 'snap', q: BITS_TABLE[3] },
    { mode: 'snap', q: BITS_TABLE[8] },
    { mode: 'interactive' },
    { mode: 'snap', q: CLIP4, label: 'outlier clamped' },
    { mode: 'snap', q: BITS_TABLE[4], thumb: true },
    { mode: 'snap', q: BLOCK4, label: 'per-block scales' },
];

const X0 = 28, X1 = 384, YMID = 160, YSCALE = 52; // value 2.4 → ~125px above mid
const px = (i) => X0 + (i / (N - 1)) * (X1 - X0);
const py = (v) => YMID - v * YSCALE;
const fmt = (v) => (v < 0.001 ? v.toExponential(1) : v.toFixed(4));

// Quantized values are squares, originals are circles (shape, not colour alone).
const Sq = ({ x, y, color }) => (
    <rect x={x - 3.5} y={y - 3.5} width="7" height="7" rx="1" fill="none" stroke={color} strokeWidth="1.6" />
);

export default function QuantizationVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    useReducedMotion(); // static drawing — no animation to gate, hook kept for consistency

    const [bits, setBits] = useState(4);
    const safeBits = Math.max(2, Math.min(8, bits));

    const q = interactive ? BITS_TABLE[safeBits] : state.q || null;
    const showQ = state.mode !== 'intro' && state.mode !== 'grid' && q;
    const showGrid = q && state.mode !== 'intro' && q.levels <= 31;

    // Grid level lines at integer multiples of scale within the plotted range.
    const gridLines = [];
    if (q && showGrid) {
        const qmax = 2 ** (q.bits - 1) - 1;
        const scale = q.limit / qmax;
        for (let c = -qmax; c <= qmax; c++) gridLines.push(c * scale);
    }

    const bitsLabel = q ? `${q.bits}-bit · ${q.levels} levels` : '';
    const memPct = q ? +((q.bits / 32) * 100).toFixed(1) : 100;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Model weights as circles on a number line, snapped to a grid of evenly spaced levels shown as squares, with error segments between them">
                <line x1={X0} y1={YMID} x2={X1} y2={YMID} stroke="currentColor" strokeOpacity="0.25" />
                {gridLines.map((g, i) => (
                    <line key={i} x1={X0} y1={py(g)} x2={X1} y2={py(g)}
                        stroke="var(--secondary)" strokeOpacity="0.35" strokeDasharray="2 3" />
                ))}

                {showQ && WEIGHTS.map((w, i) => (
                    Math.abs(w - q.q[i]) > 1e-9 && (
                        <line key={`e${i}`} x1={px(i)} y1={py(w)} x2={px(i)} y2={py(q.q[i])}
                            stroke="var(--destructive)" strokeWidth="1.5" />
                    )
                ))}
                {WEIGHTS.map((w, i) => (
                    <circle key={i} cx={px(i)} cy={py(w)} r="3.2" fill="var(--accent-primary)" fillOpacity="0.85"
                        stroke="currentColor" strokeOpacity="0.2" />
                ))}
                {showQ && q.q.map((v, i) => <Sq key={`q${i}`} x={px(i)} y={py(v)} color="var(--secondary)" />)}

                <text x={X0} y="30" fontSize="11" fill="currentColor" fillOpacity="0.7">
                    ● original weight {showQ && '   □ quantized'}
                </text>
                {state.mode === 'intro' && (
                    <text x="200" y="285" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                        48 weights · 32 bits each · one unusually large
                    </text>
                )}
                {state.mode === 'grid' && (
                    <text x="200" y="285" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                        dashed lines = the only values 3 bits can store
                    </text>
                )}
                {showQ && (
                    <>
                        <text x={X1} y="30" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">
                            {bitsLabel}{state.label ? ` · ${state.label}` : ''}
                        </text>
                        <text x="200" y="272" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">
                            mean squared error {fmt(q.err)}
                        </text>
                        <text x="200" y="288" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                            memory: {memPct}% of float32
                        </text>
                    </>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="quant-bits" className="text-xs font-bold text-text-secondary">Bits per weight</label>
                    <input id="quant-bits" aria-label="Bits per weight" type="range" min="2" max="8" step="1"
                        value={safeBits} onChange={(e) => setBits(Number(e.target.value))}
                        className="flex-1 cursor-pointer" />
                    <span className="text-xs font-mono text-text-muted w-16 text-right">{safeBits} bits</span>
                </div>
            )}
        </div>
    );
}
