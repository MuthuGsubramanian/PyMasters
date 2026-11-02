import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// A/B test visual — a permutation test computed for real at module load:
// 12 session lengths for design A, 12 for design B, 2000 label shuffles from a
// fixed-seed generator (no Math.random), and the exact p-value from them.
// Group A = circles, group B = squares (shape, not just colour).
// ──────────────────────────────────────────────────────────────────────────────

const A = [11.2, 9.8, 12.5, 10.1, 13.0, 9.4, 11.8, 10.7, 12.2, 10.9, 9.9, 11.5];
const B = [12.8, 11.9, 14.1, 10.8, 13.6, 12.4, 15.0, 11.7, 13.3, 12.9, 10.6, 14.4];
const N = A.length;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const MEAN_A = mean(A);
const MEAN_B = mean(B);
const OBS = MEAN_B - MEAN_A;

// Deterministic LCG so every visitor sees the same shuffles.
let seed = 12345;
const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
};
const POOL = [...A, ...B];
const SHUFFLES = 2000;
const DIFFS = [];
let firstShuffle = null;
for (let r = 0; r < SHUFFLES; r++) {
    const a = [...POOL];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    if (r === 0) firstShuffle = a;
    DIFFS.push(mean(a.slice(N)) - mean(a.slice(0, N)));
}
const EXTREME = DIFFS.filter((d) => Math.abs(d) >= Math.abs(OBS)).length;
const P_VALUE = EXTREME / SHUFFLES;
const FIRST_DIFF = mean(firstShuffle.slice(N)) - mean(firstShuffle.slice(0, N));

// Histogram geometry
const LO = -2.4, HI = 2.4, BINS = 24;
const binOf = (d) => Math.max(0, Math.min(BINS - 1, Math.floor(((d - LO) / (HI - LO)) * BINS)));
const X0 = 40, X1 = 360, YB = 250;
const xOf = (d) => X0 + ((d - LO) / (HI - LO)) * (X1 - X0);
const histCounts = (n) => {
    const c = new Array(BINS).fill(0);
    for (let i = 0; i < n; i++) c[binOf(DIFFS[i])]++;
    return c;
};
const FULL = histCounts(SHUFFLES);
const MAXC = Math.max(...FULL);

const stripX = (v) => 30 + ((v - 8.5) / (16 - 8.5)) * 340;

const STEP_STATES = [
    { mode: 'groups' },
    { mode: 'gap' },
    { mode: 'pooled' },
    { mode: 'shuffle' },
    { mode: 'interactive' },
    { mode: 'hist', tail: false },
    { mode: 'hist', tail: true },
    { mode: 'hist', tail: true, caveat: true },
];

const Dot = ({ x, y, kind }) =>
    kind === 'B' ? (
        <rect x={x - 5} y={y - 5} width="10" height="10" rx="2" fill="var(--secondary)" fillOpacity="0.85"
            stroke="currentColor" strokeOpacity="0.25" />
    ) : (
        <circle cx={x} cy={y} r="5.5" fill="var(--accent-primary)" fillOpacity="0.85"
            stroke="currentColor" strokeOpacity="0.25" />
    );

function Strip({ values, kinds, y }) {
    // Stagger dots that would overlap so every value stays visible.
    const placed = [];
    return values.map((v, i) => {
        const x = stripX(v);
        let row = 0;
        while (placed.some((p) => p.row === row && Math.abs(p.x - x) < 11)) row++;
        placed.push({ x, row });
        return <Dot key={i} x={x} y={y - row * 12} kind={kinds[i]} />;
    });
}

function Histogram({ counts, tail, reduced }) {
    const barW = (X1 - X0) / BINS;
    const scale = 150 / MAXC;
    const style = reduced ? undefined : { transition: 'height 150ms, y 150ms' };
    return (
        <g>
            <line x1={X0} y1={YB} x2={X1} y2={YB} stroke="currentColor" strokeOpacity="0.4" />
            {counts.map((c, i) => {
                const lo = LO + (i * (HI - LO)) / BINS;
                const hi = lo + (HI - LO) / BINS;
                const mid = (lo + hi) / 2;
                const inTail = tail && Math.abs(mid) >= Math.abs(OBS);
                const h = c * scale;
                return (
                    <rect key={i} x={X0 + i * barW + 1} y={YB - h} width={barW - 2} height={h} rx="1.5"
                        style={style}
                        fill={inTail ? 'var(--destructive)' : 'var(--accent-primary)'}
                        fillOpacity={inTail ? 0.9 : 0.55} />
                );
            })}
            {[-2, -1, 0, 1, 2].map((t) => (
                <g key={t}>
                    <line x1={xOf(t)} y1={YB} x2={xOf(t)} y2={YB + 4} stroke="currentColor" strokeOpacity="0.5" />
                    <text x={xOf(t)} y={YB + 16} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.7">
                        {t > 0 ? `+${t}` : t}
                    </text>
                </g>
            ))}
            <text x="200" y="285" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                B − A gap in mean minutes, under shuffled labels
            </text>
        </g>
    );
}

export default function ABTestVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const reduced = useReducedMotion();
    const [n, setN] = useState(0);
    const interactive = state.mode === 'interactive';
    const showN = interactive ? n : SHUFFLES;
    const counts = state.mode === 'hist' ? FULL : histCounts(showN);

    const kindsAB = [...A.map(() => 'A'), ...B.map(() => 'B')];

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A/B test: session lengths for two designs, then a histogram of gaps produced by shuffling the labels, with the real gap marked in the tail">
                <rect x="10" y="10" width="380" height="280" rx="10" fill="none" stroke="currentColor" strokeOpacity="0.12" />

                {(state.mode === 'groups' || state.mode === 'gap') && (
                    <g>
                        <text x="30" y="52" fontSize="11" fontWeight="700" fill="currentColor">Design A (circles)</text>
                        <Strip values={A} kinds={A.map(() => 'A')} y={110} />
                        <line x1={stripX(MEAN_A)} y1="58" x2={stripX(MEAN_A)} y2="122" stroke="var(--accent-primary)" strokeWidth="2" strokeDasharray="4 3" />
                        <text x="30" y="160" fontSize="11" fontWeight="700" fill="currentColor">Design B (squares)</text>
                        <Strip values={B} kinds={B.map(() => 'B')} y={218} />
                        <line x1={stripX(MEAN_B)} y1="166" x2={stripX(MEAN_B)} y2="230" stroke="var(--secondary)" strokeWidth="2" strokeDasharray="4 3" />
                        <text x="200" y="258" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">minutes per session</text>
                        {state.mode === 'gap' && (
                            <g>
                                <line x1={stripX(MEAN_A)} y1="140" x2={stripX(MEAN_B)} y2="140" stroke="var(--destructive)" strokeWidth="2.5" />
                                <text x={(stripX(MEAN_A) + stripX(MEAN_B)) / 2} y="134" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--destructive)">
                                    gap = {OBS.toFixed(2)} min
                                </text>
                            </g>
                        )}
                    </g>
                )}

                {state.mode === 'pooled' && (
                    <g>
                        <text x="30" y="52" fontSize="11" fontWeight="700" fill="currentColor">All 24 sessions in one pot</text>
                        <Strip values={POOL} kinds={kindsAB} y={150} />
                        <text x="200" y="230" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">
                            If the design did nothing, the A/B tag on each dot is arbitrary
                        </text>
                    </g>
                )}

                {state.mode === 'shuffle' && (
                    <g>
                        <text x="30" y="52" fontSize="11" fontWeight="700" fill="currentColor">Shuffle 1: labels dealt at random</text>
                        <Strip values={firstShuffle.slice(0, N)} kinds={A.map(() => 'A')} y={110} />
                        <Strip values={firstShuffle.slice(N)} kinds={B.map(() => 'B')} y={200} />
                        <text x="200" y="250" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="currentColor">
                            fake gap = {FIRST_DIFF >= 0 ? '+' : ''}{FIRST_DIFF.toFixed(2)} min
                        </text>
                    </g>
                )}

                {(interactive || state.mode === 'hist') && (
                    <g>
                        <Histogram counts={counts} tail={state.tail} reduced={reduced} />
                        {(state.mode === 'hist' || n > 0) && (
                            <g>
                                <line x1={xOf(OBS)} y1="70" x2={xOf(OBS)} y2={YB} stroke="var(--destructive)" strokeWidth="2" strokeDasharray="5 3" />
                                <text x={xOf(OBS)} y="64" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--destructive)">real gap</text>
                                {state.tail && (
                                    <>
                                        <line x1={xOf(-OBS)} y1="70" x2={xOf(-OBS)} y2={YB} stroke="var(--destructive)" strokeWidth="2" strokeDasharray="5 3" />
                                        <text x={xOf(-OBS)} y="64" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--destructive)">−real gap</text>
                                    </>
                                )}
                            </g>
                        )}
                        <text x="30" y="40" fontSize="11" fontFamily="monospace" fill="currentColor">
                            {showN.toLocaleString()} shuffles
                            {state.tail ? ` · p = ${P_VALUE.toFixed(3)} (${EXTREME}/${SHUFFLES})` : ''}
                        </text>
                        {state.caveat && (
                            <text x="200" y="162" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--destructive)">
                                small p ≠ big effect
                            </text>
                        )}
                    </g>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-2 text-xs">
                    <label htmlFor="ab-shuffles" className="font-medium text-text-secondary">Shuffles</label>
                    <input id="ab-shuffles" type="range" min="0" max={SHUFFLES} step="10" value={n}
                        aria-label="Number of label shuffles to include"
                        onChange={(e) => setN(Number(e.target.value))}
                        className="flex-1 cursor-pointer" />
                    <button onClick={() => setN(0)}
                        className="text-xs font-medium text-text-muted bg-bg-elevated border border-border-default rounded-lg px-3 py-2 hover:text-text-secondary transition-colors cursor-pointer">
                        Reset
                    </button>
                </div>
            )}
        </div>
    );
}
