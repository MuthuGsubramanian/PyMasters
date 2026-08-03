import { useState } from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Attention visual — scaled dot-product self-attention computed FOR REAL at
// module load on a 7-token sentence with hand-set, meaning-bearing embeddings.
// Q·Kᵀ/√d, softmax, and the weighted blend below are the actual numbers the
// essay quotes. Step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const TOKENS = ['the', 'bank', 'of', 'the', 'river', 'was', 'muddy'];
const BANK = 1;

// Embedding dims (hand-set so every number is traceable):
// [thing-ness, water/nature, money/finance, function-word "glue"]
const DIMS = ['thing', 'water', 'money', 'glue'];
const EMB = [
    [0.1, 0.0, 0.0, 1.0],   // the
    [1.4, 0.9, 0.9, 0.1],   // bank — genuinely ambiguous: water 0.9 = money 0.9
    [0.1, 0.0, 0.0, 0.9],   // of
    [0.1, 0.0, 0.0, 1.0],   // the
    [1.2, 1.5, 0.0, 0.1],   // river
    [0.15, 0.1, 0.0, 0.9],  // was
    [0.4, 1.3, 0.0, 0.1],   // muddy
];
const D = 4;

// Diagonal projection matrices (a head's learned W_Q / W_K, hand-set here).
// Head 1 amplifies content dims; head 2 amplifies the function-word dim.
const W_HEAD1 = [1.0, 1.2, 1.2, 0.4];
const W_HEAD2 = [0.2, 0.2, 0.2, 1.6];

const proj = (v, w) => v.map((x, i) => x * w[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const softmax = (xs) => {
    const m = Math.max(...xs);
    const es = xs.map((x) => Math.exp(x - m));
    const sum = es.reduce((a, b) => a + b, 0);
    return es.map((e) => e / sum);
};

// Full scaled dot-product self-attention for one head (V = raw embeddings).
function attend(w) {
    const Q = EMB.map((v) => proj(v, w));
    const K = EMB.map((v) => proj(v, w));
    const dots = Q.map((q) => K.map((k) => dot(q, k)));
    const scaled = dots.map((row) => row.map((s) => s / Math.sqrt(D)));
    const weights = scaled.map(softmax);
    const out = weights.map((row) =>
        DIMS.map((_, d) => row.reduce((s, wj, j) => s + wj * EMB[j][d], 0)));
    return { dots, scaled, weights, out };
}

const HEAD1 = attend(W_HEAD1);
const HEAD2 = attend(W_HEAD2);
const BANK_DOTS = HEAD1.dots[BANK];
const BANK_SCALED = HEAD1.scaled[BANK];
const BANK_W = HEAD1.weights[BANK];
const BANK_OUT = HEAD1.out[BANK];

// Layout ------------------------------------------------------------------
const X = TOKENS.map((_, i) => 44 + i * 52); // chip centres
const CHIP_Y = 238;                          // chip top; arcs spring from here

const arcPath = (x1, x2, cap = 165) => {
    if (x1 === x2) return `M ${x1 - 11} ${CHIP_Y} Q ${x1} ${CHIP_Y - 42} ${x1 + 11} ${CHIP_Y}`;
    const h = Math.min(cap, 34 + Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${CHIP_Y} Q ${(x1 + x2) / 2} ${CHIP_Y - h} ${x2} ${CHIP_Y}`;
};

const STEP_STATES = [
    { mode: 'ambiguity' },   // static embedding can't disambiguate
    { mode: 'allpairs' },    // every token looks at every token
    { mode: 'qkv' },         // query / key / value roles
    { mode: 'scores' },      // real dot products
    { mode: 'softmax' },     // real weights
    { mode: 'blend' },       // weighted sum → context-aware vector
    { mode: 'showcase' },    // attention-links diagram at its best (thumbnail)
    { mode: 'interactive' }, // pick a focus token
    { mode: 'multihead' },   // two heads, two patterns
];

const INTERACTIVE_CHOICES = [1, 4, 6, 0]; // bank, river, muddy, the

const Chip = ({ i, focus }) => (
    <g>
        <rect x={X[i] - 24} y={CHIP_Y} width="48" height="22" rx="6"
            fill={focus ? 'var(--accent-primary)' : 'none'} fillOpacity={focus ? 0.14 : 0}
            stroke={focus ? 'var(--accent-primary)' : 'currentColor'}
            strokeOpacity={focus ? 1 : 0.35} strokeWidth={focus ? 2 : 1} />
        <text x={X[i]} y={CHIP_Y + 15} textAnchor="middle" fontSize="11"
            fontWeight={focus ? 700 : 500}
            fill={focus ? 'var(--accent-primary)' : 'currentColor'} fillOpacity={focus ? 1 : 0.75}>
            {TOKENS[i]}
        </text>
        {focus && (
            <polygon points={`${X[i] - 5},${CHIP_Y + 30} ${X[i] + 5},${CHIP_Y + 30} ${X[i]},${CHIP_Y + 24}`}
                fill="var(--accent-primary)" />
        )}
    </g>
);

// Curved links out of a focus token, stroke-width ∝ real attention weight.
const FocusArcs = ({ focusIdx, weights, color, animate, cap = 165 }) => (
    <>
        {weights.map((w, j) => {
            const Tag = animate ? motion.path : 'path';
            const anim = animate
                ? { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.5, delay: j * 0.04 } }
                : {};
            return (
                <Tag key={`${focusIdx}-${j}`} d={arcPath(X[focusIdx], X[j], cap)}
                    fill="none" stroke={color} strokeWidth={Math.max(0.7, w * 16)}
                    strokeOpacity="0.85" strokeLinecap="round" {...anim} />
            );
        })}
    </>
);

// Compact weight read-out (top-left) so weight is never width-alone.
const WeightBars = ({ weights, focusIdx }) => (
    <g fontSize="9" fontFamily="monospace">
        {weights.map((w, j) => {
            const y = 38 + j * 15;
            return (
                <g key={j}>
                    <text x="68" y={y + 7} textAnchor="end" fill="currentColor"
                        fillOpacity={j === focusIdx ? 0.95 : 0.6} fontWeight={j === focusIdx ? 700 : 400}>
                        {TOKENS[j]}
                    </text>
                    <rect x="74" y={y} width={Math.max(1.5, w * 180)} height="8" rx="2"
                        fill="var(--accent-primary)" fillOpacity={j === focusIdx ? 0.95 : 0.65} />
                    <text x={78 + w * 180} y={y + 7} fill="currentColor" fillOpacity="0.6">
                        {(w * 100).toFixed(0)}%
                    </text>
                </g>
            );
        })}
    </g>
);

// Mini token row + arcs for the multi-head step.
const MiniHead = ({ x0, focusIdx, weights, color, label }) => {
    const xs = TOKENS.map((_, i) => x0 + i * 26);
    const miniArc = (x1, x2) => {
        if (x1 === x2) return `M ${x1 - 6} 246 Q ${x1} 222 ${x1 + 6} 246`;
        const h = Math.min(56, 12 + Math.abs(x2 - x1) * 0.4);
        return `M ${x1} 246 Q ${(x1 + x2) / 2} ${246 - h} ${x2} 246`;
    };
    return (
        <g>
            <text x={x0 + 78} y="172" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>{label}</text>
            {weights.map((w, j) => (
                <path key={j} d={miniArc(xs[focusIdx], xs[j])} fill="none" stroke={color}
                    strokeWidth={Math.max(0.5, w * 11)} strokeOpacity="0.8" strokeLinecap="round" />
            ))}
            {TOKENS.map((t, i) => (
                <g key={i}>
                    <text x={xs[i]} y="256" textAnchor="middle" fontSize="8"
                        fontWeight={i === focusIdx ? 700 : 400}
                        fill={i === focusIdx ? color : 'currentColor'} fillOpacity={i === focusIdx ? 1 : 0.6}>
                        {t}
                    </text>
                    {i === focusIdx && (
                        <line x1={xs[i] - 8} y1="259" x2={xs[i] + 8} y2="259" stroke={color} strokeWidth="1.5" />
                    )}
                </g>
            ))}
        </g>
    );
};

// 4-dim vector as labelled mini-bars (used in ambiguity + blend steps).
const VectorBars = ({ x, title, values, highlightDims = {} }) => (
    <g fontSize="9" fontFamily="monospace">
        <text x={x} y="44" fontSize="10" fontWeight="700" fill="currentColor" fillOpacity="0.8"
            fontFamily="inherit">{title}</text>
        {DIMS.map((dim, d) => {
            const y = 54 + d * 17;
            const color = highlightDims[dim] || 'currentColor';
            return (
                <g key={dim}>
                    <text x={x + 34} y={y + 8} textAnchor="end" fill="currentColor" fillOpacity="0.6">{dim}</text>
                    <rect x={x + 40} y={y} width={Math.max(1.5, values[d] * 58)} height="9" rx="2"
                        fill={color} fillOpacity={highlightDims[dim] ? 0.9 : 0.45} />
                    <text x={x + 44 + values[d] * 58} y={y + 8} fill="currentColor" fillOpacity="0.65">
                        {values[d].toFixed(2)}
                    </text>
                </g>
            );
        })}
    </g>
);

export default function AttentionVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const { mode } = STEP_STATES[idx];
    const reducedMotion = useReducedMotion();

    const interactive = mode === 'interactive';
    const [focus, setFocus] = useState(BANK);
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setFocus(BANK);
    }

    const focusIdx = interactive ? focus : BANK;
    const focusW = HEAD1.weights[focusIdx];
    const chipFocus = { ambiguity: BANK, qkv: BANK, scores: BANK, softmax: BANK, blend: BANK, showcase: BANK, interactive: focus }[mode];
    const showChips = mode !== 'multihead';

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Tokens of the sentence 'the bank of the river was muddy' connected by curved links whose thickness shows real attention weights">

                {/* ── ambiguity: one frozen vector, two senses ── */}
                {mode === 'ambiguity' && (
                    <g>
                        <text x="200" y="34" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.75">
                            &ldquo;bank&rdquo; arrives with one fixed vector — its two senses in a permanent tie
                        </text>
                        <g fontSize="10" fontFamily="monospace">
                            {[['money sense', EMB[BANK][2]], ['water sense', EMB[BANK][1]]].map(([label, v], r) => (
                                <g key={label}>
                                    <text x="150" y={70 + r * 24} textAnchor="end" fill="currentColor" fillOpacity="0.7">{label}</text>
                                    <rect x="158" y={61 + r * 24} width={v * 160} height="12" rx="3"
                                        fill="var(--accent-primary)" fillOpacity="0.7" />
                                    <text x={164 + v * 160} y={71 + r * 24} fill="currentColor" fillOpacity="0.7">{v.toFixed(1)}</text>
                                </g>
                            ))}
                        </g>
                        <line x1={X[BANK]} y1={CHIP_Y - 2} x2="180" y2="130" stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" />
                        <text x="184" y="128" fontSize="10" fill="currentColor" fillOpacity="0.55" fontStyle="italic">
                            the vault kind… or the muddy kind?
                        </text>
                        <text x="200" y="292" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.55">
                            same stored vector whether the sentence says river or loan
                        </text>
                    </g>
                )}

                {/* ── allpairs: every token can look at every token ── */}
                {mode === 'allpairs' && (
                    <g>
                        {TOKENS.map((_, i) => TOKENS.map((_2, j) => (j > i ? (
                            <path key={`${i}-${j}`} d={arcPath(X[i], X[j])} fill="none"
                                stroke="currentColor" strokeWidth="1" strokeOpacity="0.22" />
                        ) : null)))}
                        {TOKENS.map((_, i) => (
                            <path key={`self-${i}`} d={arcPath(X[i], X[i])} fill="none"
                                stroke="currentColor" strokeWidth="1" strokeOpacity="0.22" />
                        ))}
                        <text x="200" y="34" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.75">
                            7 tokens × 7 tokens = 49 pairs, weighed all at once
                        </text>
                    </g>
                )}

                {/* ── qkv: the three roles ── */}
                {mode === 'qkv' && (
                    <g>
                        <g fontSize="10">
                            <rect x="118" y="42" width="11" height="11" transform="rotate(45 123.5 47.5)" fill="var(--accent-primary)" />
                            <text x="136" y="52" fill="currentColor" fillOpacity="0.8">
                                <tspan fontWeight="700">Q</tspan> — the question this token asks
                            </text>
                            <circle cx="123.5" cy="70" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
                            <text x="136" y="74" fill="currentColor" fillOpacity="0.8">
                                <tspan fontWeight="700">K</tspan> — the tag each token advertises
                            </text>
                            <rect x="117.5" y="86" width="12" height="12" rx="2" fill="var(--secondary)" fillOpacity="0.8" />
                            <text x="136" y="96" fill="currentColor" fillOpacity="0.8">
                                <tspan fontWeight="700">V</tspan> — the content it hands over
                            </text>
                        </g>
                        <rect x={X[BANK] - 5.5} y="196" width="11" height="11" transform={`rotate(45 ${X[BANK]} 201.5)`} fill="var(--accent-primary)" />
                        <text x={X[BANK] + 12} y="205" fontSize="9" fill="var(--accent-primary)" fontWeight="700">Q</text>
                        <line x1={X[BANK]} y1="210" x2={X[BANK]} y2={CHIP_Y - 14} stroke="var(--accent-primary)" strokeWidth="1.5" strokeOpacity="0.6" />
                        {TOKENS.map((_, i) => (
                            <g key={i}>
                                <circle cx={X[i]} cy={CHIP_Y - 8} r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.55" />
                                <rect x={X[i] - 5} y={CHIP_Y + 34} width="10" height="10" rx="2" fill="var(--secondary)" fillOpacity="0.7" />
                            </g>
                        ))}
                        <text x="200" y="292" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.55">
                            bank&rsquo;s query will be compared against every key below
                        </text>
                    </g>
                )}

                {/* ── scores: the real dot products ── */}
                {mode === 'scores' && (
                    <g fontSize="10" fontFamily="monospace">
                        <text x="200" y="36" textAnchor="middle" fillOpacity="0.75" fill="currentColor">
                            score(bank → token) = q_bank · k_token
                        </text>
                        {BANK_DOTS.map((s, j) => {
                            const y = 52 + j * 24;
                            return (
                                <g key={j}>
                                    <text x="108" y={y + 10} textAnchor="end" fill="currentColor" fillOpacity="0.7">
                                        {TOKENS[j]}{j === BANK ? ' *' : ''}
                                    </text>
                                    <rect x="116" y={y} width={Math.max(2, s * 46)} height="13" rx="3"
                                        fill="var(--accent-primary)" fillOpacity={j === BANK ? 0.95 : 0.65} />
                                    <text x={122 + s * 46} y={y + 10} fill="currentColor" fillOpacity="0.7">{s.toFixed(2)}</text>
                                </g>
                            );
                        })}
                        <text x="108" y="232" textAnchor="end" fill="currentColor" fillOpacity="0.45">* itself</text>
                    </g>
                )}

                {/* ── softmax: scores become shares ── */}
                {mode === 'softmax' && (
                    <g fontSize="10" fontFamily="monospace">
                        <text x="200" y="36" textAnchor="middle" fillOpacity="0.75" fill="currentColor">
                            softmax(score / √4) → weights that sum to 1
                        </text>
                        {BANK_W.map((w, j) => {
                            const y = 52 + j * 24;
                            return (
                                <g key={j}>
                                    <text x="108" y={y + 10} textAnchor="end" fill="currentColor" fillOpacity="0.7">{TOKENS[j]}</text>
                                    <rect x="116" y={y} width={Math.max(2, w * 420)} height="13" rx="3"
                                        fill="var(--accent-primary)" fillOpacity={j === BANK ? 0.95 : 0.65} />
                                    <text x={122 + w * 420} y={y + 10} fill="currentColor" fillOpacity="0.8">{(w * 100).toFixed(0)}%</text>
                                    <text x="372" y={y + 10} textAnchor="end" fill="currentColor" fillOpacity="0.4">{BANK_SCALED[j].toFixed(2)}</text>
                                </g>
                            );
                        })}
                        <text x="372" y="36" textAnchor="end" fill="currentColor" fillOpacity="0.4">score/√4</text>
                    </g>
                )}

                {/* ── blend: weighted sum → a context-aware vector ── */}
                {mode === 'blend' && (
                    <g>
                        <FocusArcs focusIdx={BANK} weights={BANK_W} color="var(--accent-primary)"
                            animate={!reducedMotion} cap={96} />
                        <VectorBars x="34" title="bank — stored" values={EMB[BANK]}
                            highlightDims={{ water: 'var(--secondary)', money: 'var(--destructive)' }} />
                        <VectorBars x="222" title="bank — after attention" values={BANK_OUT}
                            highlightDims={{ water: 'var(--secondary)', money: 'var(--destructive)' }} />
                        <text x="200" y="292" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                            money 0.90 → 0.35, water 0.90 → 0.95 — the river sense wins
                        </text>
                    </g>
                )}

                {/* ── showcase / interactive: the attention-links diagram ── */}
                {(mode === 'showcase' || interactive) && (
                    <g>
                        <FocusArcs focusIdx={focusIdx} weights={focusW}
                            color="var(--accent-primary)" animate={!reducedMotion} />
                        <WeightBars weights={focusW} focusIdx={focusIdx} />
                        {mode === 'showcase' && (
                            <text x="368" y="42" textAnchor="end" fontSize="11" fontWeight="700"
                                fill="currentColor" fillOpacity="0.75">
                                who does &ldquo;bank&rdquo; listen to?
                            </text>
                        )}
                        {interactive && (
                            <text x="368" y="42" textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.55">
                                link thickness = real weight
                            </text>
                        )}
                    </g>
                )}

                {/* ── multihead: two heads, two patterns ── */}
                {mode === 'multihead' && (
                    <g>
                        <text x="200" y="52" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.75">
                            real Transformers run many attentions in parallel —
                        </text>
                        <text x="200" y="68" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.75">
                            each head has its own W_Q, W_K, W_V and finds its own pattern
                        </text>
                        <MiniHead x0={30} focusIdx={BANK} weights={HEAD1.weights[BANK]}
                            color="var(--accent-primary)" label="Head 1 — meaning" />
                        <MiniHead x0={214} focusIdx={0} weights={HEAD2.weights[0]}
                            color="var(--secondary)" label="Head 2 — grammar" />
                        <text x="200" y="292" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.55">
                            head outputs are concatenated and mixed, then the next layer repeats
                        </text>
                    </g>
                )}

                {/* Token chips (all modes except multihead) */}
                {showChips && TOKENS.map((_, i) => (
                    <Chip key={i} i={i} focus={i === chipFocus} />
                ))}
            </svg>

            {/* Interactive controls: pick the focus token */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-text-muted font-medium">Focus token:</span>
                    {INTERACTIVE_CHOICES.map((i) => (
                        <button key={i} onClick={() => setFocus(i)}
                            className={`text-xs font-bold rounded-lg px-3 py-2 transition-transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                                focus === i
                                    ? 'text-white bg-gradient-primary'
                                    : 'text-text-muted bg-bg-elevated border border-border-default hover:text-text-secondary'
                            }`}>
                            {TOKENS[i]}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
