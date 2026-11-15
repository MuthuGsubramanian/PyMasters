import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// LoRA visual — an 8×8 "fine-tuning update" ΔW (deterministic: two real
// directions plus a little wiggle) is factored by a real truncated SVD (power
// iteration with deflation, computed at module load) into B·A of rank r.
// Every singular value, approximation and error figure is computed for real.
// Positive cells are filled; negative cells carry a dash — sign is never colour alone.
// ──────────────────────────────────────────────────────────────────────────────

const N = 8;
const u1 = [0.9, 0.6, -0.3, 0.8, -0.7, 0.2, 0.5, -0.4];
const v1 = [0.5, -0.8, 0.6, 0.3, -0.5, 0.9, -0.2, 0.4];
const u2 = [-0.4, 0.7, 0.5, -0.6, 0.3, 0.8, -0.9, 0.1];
const v2 = [0.7, 0.4, -0.6, 0.8, 0.2, -0.3, 0.5, -0.7];
const DW = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) =>
        3 * u1[i] * v1[j] + 1.4 * u2[i] * v2[j] + 0.12 * Math.sin(7 * i + 3 * j + 1)));
const W0 = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => 0.9 * Math.cos(2.3 * i - 1.7 * j) + 0.4 * Math.sin(i * j + 2)));

const matVec = (M, x) => M.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
const matTVec = (M, x) => M[0].map((_, j) => M.reduce((s, row, i) => s + row[j] * x[i], 0));
const norm = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0));

// Truncated SVD by power iteration on MᵀM, deflating after each component.
function svd(M, k) {
    let R = M.map((r) => [...r]);
    const out = [];
    for (let c = 0; c < k; c++) {
        let v = Array.from({ length: N }, (_, j) => 1 + 0.1 * j);
        for (let it = 0; it < 200; it++) {
            const w = matTVec(R, matVec(R, v));
            const n = norm(w) || 1;
            v = w.map((x) => x / n);
        }
        const Rv = matVec(R, v);
        const s = norm(Rv);
        const u = Rv.map((x) => x / (s || 1));
        out.push({ s, u, v });
        R = R.map((row, i) => row.map((x, j) => x - s * u[i] * v[j]));
    }
    return out;
}
const COMPS = svd(DW, 4);
const frob = (M) => Math.sqrt(M.reduce((s, r) => s + r.reduce((a, x) => a + x * x, 0), 0));
const TOTAL = frob(DW);

// Rank-r factors: B (N×r) = U·√Σ, A (r×N) = √Σ·Vᵀ.
function factors(r) {
    const B = Array.from({ length: N }, (_, i) => COMPS.slice(0, r).map((c) => c.u[i] * Math.sqrt(c.s)));
    const A = COMPS.slice(0, r).map((c) => c.v.map((x) => x * Math.sqrt(c.s)));
    const P = Array.from({ length: N }, (_, i) =>
        Array.from({ length: N }, (_, j) => B[i].reduce((s, b, k) => s + b * A[k][j], 0)));
    const err = frob(DW.map((row, i) => row.map((x, j) => x - P[i][j]))) / TOTAL;
    return { B, A, P, err, params: 2 * N * r };
}
const FACT = [null, factors(1), factors(2), factors(3), factors(4)];
const MAXV = Math.max(...DW.flat().map(Math.abs));

const STEP_STATES = [
    { mode: 'w' },
    { mode: 'dw' },
    { mode: 'sv' },
    { mode: 'fact', r: 1 },
    { mode: 'fact', r: 2 },
    { mode: 'interactive' },
    { mode: 'final', r: 2 },
    { mode: 'scale' },
];

function Grid({ M, x, y, cell, max, label }) {
    return (
        <g>
            {M.map((row, i) => row.map((v, j) => (
                <g key={`${i}-${j}`}>
                    <rect x={x + j * cell} y={y + i * cell} width={cell - 1} height={cell - 1} rx="2"
                        fill={v >= 0 ? 'var(--accent-primary)' : 'var(--secondary)'}
                        fillOpacity={Math.min(1, Math.abs(v) / max) * 0.85}
                        stroke="currentColor" strokeOpacity="0.15" />
                    {v < 0 && Math.abs(v) / max > 0.15 && (
                        <line x1={x + j * cell + cell * 0.3} x2={x + j * cell + cell * 0.65}
                            y1={y + i * cell + cell / 2} y2={y + i * cell + cell / 2}
                            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    )}
                </g>
            )))}
            {label && (
                <text x={x + (M[0].length * cell) / 2} y={y + M.length * cell + 14} textAnchor="middle"
                    fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">{label}</text>
            )}
        </g>
    );
}

const Op = ({ x, y, t }) => (
    <text x={x} y={y} textAnchor="middle" fontSize="18" fill="currentColor" fillOpacity="0.7">{t}</text>
);

function Factored({ r, cell = 15 }) {
    const f = FACT[r];
    const bw = r * cell, aw = N * cell;
    const total = bw + aw + aw + 56;
    const x0 = (400 - total) / 2;
    const y0 = 70;
    const xa = x0 + bw + 28, xp = xa + aw + 28;
    return (
        <g>
            <Grid M={f.B} x={x0} y={y0} cell={cell} max={MAXV} label="B" />
            <Op x={x0 + bw + 14} y={y0 + 4 * cell + 6} t="×" />
            {/* A is r rows tall; centre it vertically against B */}
            <Grid M={f.A} x={xa} y={y0 + ((N - r) * cell) / 2} cell={cell} max={MAXV} />
            <text x={xa + aw / 2} y={y0 + N * cell + 14} textAnchor="middle" fontSize="12" fontFamily="monospace"
                fill="currentColor" fillOpacity="0.8">A</text>
            <Op x={xp - 14} y={y0 + 4 * cell + 6} t="≈" />
            <Grid M={f.P} x={xp} y={y0} cell={cell} max={MAXV} label={`BA (rank ${r})`} />
            <text x="200" y="236" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.85">
                {f.params} numbers instead of {N * N} · {(f.err * 100).toFixed(1)}% of ΔW left unexplained
            </text>
        </g>
    );
}

export default function LoRAVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const reducedMotion = useReducedMotion();
    const [rank, setRank] = useState(1);
    const r = Math.max(1, Math.min(4, rank));
    const sty = reducedMotion ? undefined : { transition: 'opacity 0.3s' };

    const smax = COMPS[0].s;
    const FULL = 4096 * 4096, LORA = 2 * 4096 * 8;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img" style={sty}
                aria-label="An 8 by 8 grid of weight changes being compressed into two thin matrices B and A">
                {state.mode === 'w' && (
                    <g>
                        <Grid M={W0} x={104} y={36} cell={24} max={1.3} label="W (frozen, 64 numbers)" />
                        <text x="200" y="262" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.8">
                            One pretrained weight matrix — 64 numbers, here
                        </text>
                    </g>
                )}
                {state.mode === 'dw' && (
                    <g>
                        <Grid M={DW} x={104} y={36} cell={24} max={MAXV} label="ΔW (what fine-tuning learned)" />
                        <text x="200" y="262" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.8">
                            Filled = increase · dash = decrease
                        </text>
                    </g>
                )}
                {state.mode === 'sv' && (
                    <g>
                        <line x1="50" y1="230" x2="360" y2="230" stroke="currentColor" strokeOpacity="0.4" />
                        {COMPS.map((c, i) => {
                            const h = (c.s / smax) * 160;
                            return (
                                <g key={i}>
                                    <rect x={80 + i * 70} y={230 - h} width="44" height={h} rx="3"
                                        fill={i < 2 ? 'var(--accent-primary)' : 'var(--secondary)'} fillOpacity="0.8"
                                        stroke="currentColor" strokeOpacity="0.2" />
                                    <text x={102 + i * 70} y={224 - h} textAnchor="middle" fontSize="12" fontFamily="monospace"
                                        fill="currentColor">{c.s.toFixed(2)}</text>
                                    <text x={102 + i * 70} y="248" textAnchor="middle" fontSize="12" fill="currentColor"
                                        fillOpacity="0.8">{`direction ${i + 1}`}</text>
                                </g>
                            );
                        })}
                        <text x="200" y="274" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.8">
                            Strength of each direction in ΔW (singular values)
                        </text>
                    </g>
                )}
                {state.mode === 'fact' && <Factored r={state.r} />}
                {state.mode === 'interactive' && <Factored r={r} />}
                {state.mode === 'final' && (
                    <g>
                        <Factored r={state.r} cell={14} />
                        <text x="200" y="50" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
                            W stays frozen · only B and A train
                        </text>
                    </g>
                )}
                {state.mode === 'scale' && (
                    <g>
                        <text x="200" y="50" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
                            One 4096 × 4096 layer, rank 8
                        </text>
                        <rect x="40" y="80" width="320" height="34" rx="4" fill="var(--secondary)" fillOpacity="0.8"
                            stroke="currentColor" strokeOpacity="0.2" />
                        <text x="200" y="102" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="currentColor">
                            full update: {FULL.toLocaleString('en-US')}
                        </text>
                        <rect x="40" y="140" width={Math.max(3, 320 * (LORA / FULL))} height="34" rx="4"
                            fill="var(--accent-primary)" fillOpacity="0.85" stroke="currentColor" strokeOpacity="0.2" />
                        <text x="48" y="192" fontSize="12" fontFamily="monospace" fill="currentColor">
                            LoRA: {LORA.toLocaleString('en-US')} ({((LORA / FULL) * 100).toFixed(2)}%)
                        </text>
                        <text x="200" y="244" textAnchor="middle" fontSize="12" fill="var(--destructive)">
                            Catch: if the real update isn&apos;t low-rank, LoRA can&apos;t express it
                        </text>
                    </g>
                )}
            </svg>

            {state.mode === 'interactive' && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="lora-rank" className="text-xs font-bold text-text-secondary">Rank r = {r}</label>
                    <input id="lora-rank" type="range" min="1" max="4" step="1" value={r} aria-label="LoRA rank"
                        onChange={(e) => setRank(Number(e.target.value))} className="flex-1 cursor-pointer" />
                </div>
            )}
        </div>
    );
}
