import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Random Forest visual — reuses the Decision Trees essay's fruit dataset
// (weight vs roundness). Everything is computed for real at module load:
// a deterministic PRNG (mulberry32, seeded — not Math.random) drives bootstrap
// resampling, 25 real depth-2 trees are grown (each split restricted to a
// single randomly-chosen feature, the classic random-forest trick), and the
// majority-vote regions shown are the genuine output of those trees, rasterised
// on a grid since an ensemble's combined boundary isn't one clean line.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
//
// Feature panel: x ∈ [15, 230] ("weight"), y ∈ [45, 265] ("roundness", screen-down).
// ──────────────────────────────────────────────────────────────────────────────

const APPLE = 'var(--accent-primary)';
const LEMON = 'var(--secondary)';

const X0 = 15, X1 = 230, Y0 = 45, Y1 = 265;
const CELL = 12;

const LEMON_PTS = [[45, 90], [70, 70], [62, 122], [92, 95], [108, 62], [82, 142], [50, 165], [120, 118]];
const APPLE_PTS = [[150, 200], [175, 232], [202, 182], [160, 162], [212, 222], [142, 244], [60, 225], [95, 205], [75, 250], [188, 130]];
// Two ambiguous fruits near the boundary — the ones bootstrap resampling disagrees about.
const AMBIG_APPLE = [128, 155];
const AMBIG_LEMON = [140, 100];

// cls: 0 = lemon (square), 1 = apple (circle). Index order matters — it's what
// the seeded bootstrap draws reference.
const DATA = [
    ...LEMON_PTS.map(([x, y]) => ({ x, y, cls: 0 })),
    ...APPLE_PTS.map(([x, y]) => ({ x, y, cls: 1 })),
    { x: AMBIG_APPLE[0], y: AMBIG_APPLE[1], cls: 1 },
    { x: AMBIG_LEMON[0], y: AMBIG_LEMON[1], cls: 0 },
];
const N = DATA.length;

// Deterministic PRNG (mulberry32) — reproducible, not Math.random/Date.now.
function mulberry32(seed) {
    let s = seed;
    return function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const gini = (labels) => {
    if (!labels.length) return 0;
    const p1 = labels.filter((c) => c === 1).length / labels.length;
    return 1 - p1 * p1 - (1 - p1) * (1 - p1);
};

const majority = (rows) => {
    const ones = rows.filter((r) => r.cls === 1).length;
    return ones * 2 >= rows.length ? 1 : 0;
};

function bestSplit(rows, feature) {
    const vals = [...new Set(rows.map((r) => r[feature]))].sort((a, b) => a - b);
    if (vals.length < 2) return null;
    let best = null;
    for (let i = 0; i < vals.length - 1; i++) {
        const t = (vals[i] + vals[i + 1]) / 2;
        const L = rows.filter((r) => r[feature] < t);
        const R = rows.filter((r) => r[feature] >= t);
        if (!L.length || !R.length) continue;
        const wg = (L.length * gini(L.map((r) => r.cls)) + R.length * gini(R.map((r) => r.cls))) / rows.length;
        if (!best || wg < best.wg) best = { t, wg, feature };
    }
    return best;
}

// A random-forest node: bagging (rows already a bootstrap sample) PLUS feature
// subsampling — each split may only look at one randomly-chosen feature
// (with 2 features total, that's max_features='sqrt' rounded to 1).
function growNodeRF(rows, depth, prng) {
    const cls = majority(rows);
    if (depth === 0 || gini(rows.map((r) => r.cls)) === 0 || rows.length < 3) return { leaf: true, cls };
    const feature = prng() < 0.5 ? 'x' : 'y';
    const split = bestSplit(rows, feature);
    if (!split) return { leaf: true, cls };
    const L = rows.filter((r) => r[split.feature] < split.t);
    const R = rows.filter((r) => r[split.feature] >= split.t);
    return { leaf: false, feature, t: split.t, left: growNodeRF(L, depth - 1, prng), right: growNodeRF(R, depth - 1, prng) };
}

// Baseline: a single ordinary decision tree — full dataset, no bootstrap, best
// of BOTH features at every split. This is last essay's algorithm, unchanged.
function growNodeFull(rows, depth) {
    const cls = majority(rows);
    if (depth === 0 || gini(rows.map((r) => r.cls)) === 0 || rows.length < 3) return { leaf: true, cls };
    const sx = bestSplit(rows, 'x'), sy = bestSplit(rows, 'y');
    const split = !sx ? sy : !sy ? sx : (sx.wg <= sy.wg ? sx : sy);
    if (!split) return { leaf: true, cls };
    const L = rows.filter((r) => r[split.feature] < split.t);
    const R = rows.filter((r) => r[split.feature] >= split.t);
    return { leaf: false, feature: split.feature, t: split.t, left: growNodeFull(L, depth - 1), right: growNodeFull(R, depth - 1) };
}

function predict(node, pt) {
    return node.leaf ? node.cls : pt[node.feature] < node.t ? predict(node.left, pt) : predict(node.right, pt);
}

// Exact leaf rectangles for a tree whose splits are all axis-aligned — used to
// paint a single tree's regions precisely (no rasterising needed for one tree).
function leafRects(node, x0, y0, x1, y1, out) {
    if (node.leaf) { out.push({ x0, y0, x1, y1, cls: node.cls }); return; }
    if (node.feature === 'x') {
        leafRects(node.left, x0, y0, node.t, y1, out);
        leafRects(node.right, node.t, y0, x1, y1, out);
    } else {
        leafRects(node.left, x0, y0, x1, node.t, out);
        leafRects(node.right, x0, node.t, x1, y1, out);
    }
}
const rectsOf = (node) => { const out = []; leafRects(node, X0, Y0, X1, Y1, out); return out; };

// Exact split lines for a tree, confined to the sub-rectangle they actually cut.
function boundarySegments(node, x0, y0, x1, y1, out) {
    if (node.leaf) return;
    if (node.feature === 'x') {
        out.push({ x1: node.t, y1: y0, x2: node.t, y2: y1 });
        boundarySegments(node.left, x0, y0, node.t, y1, out);
        boundarySegments(node.right, node.t, y0, x1, y1, out);
    } else {
        out.push({ x1: x0, y1: node.t, x2: x1, y2: node.t });
        boundarySegments(node.left, x0, y0, x1, node.t, out);
        boundarySegments(node.right, x0, node.t, x1, y1, out);
    }
}
const segmentsOf = (node) => { const out = []; boundarySegments(node, X0, Y0, X1, Y1, out); return out; };

const FULL_TREE = growNodeFull(DATA, 2);

const NUM_TREES = 25;
const FOREST = Array.from({ length: NUM_TREES }, (_, t) => {
    const prng = mulberry32(1000 + t * 97);
    const idx = Array.from({ length: N }, () => Math.floor(prng() * N));
    const counts = {};
    idx.forEach((i) => { counts[i] = (counts[i] || 0) + 1; });
    const oob = Array.from({ length: N }, (_, i) => i).filter((i) => !counts[i]);
    const sample = idx.map((i) => DATA[i]);
    return { tree: growNodeRF(sample, 2, prng), counts, oob };
});

const forestVotes = (k, pt) => {
    let v = 0;
    for (let i = 0; i < k; i++) v += predict(FOREST[i].tree, pt);
    return v;
};
const forestPredict = (k, pt) => (forestVotes(k, pt) * 2 >= k ? 1 : 0);

// Rasterised majority-vote regions — cheap enough to recompute on every slider move.
function voteGrid(k) {
    const cells = [];
    for (let x = X0; x < X1; x += CELL) {
        for (let y = Y0; y < Y1; y += CELL) {
            const cls = forestPredict(k, { x: x + CELL / 2, y: y + CELL / 2 });
            cells.push({ x, y, cls });
        }
    }
    return cells;
}

const QUERY = { x: 132, y: 148 };
// Real, computed once: probability a given point is left out of one bootstrap
// sample of size N (drawn with replacement) — the "out-of-bag" fraction.
const OOB_PROB = Math.pow((N - 1) / N, N);

const STEP_STATES = [
    { mode: 'single' },                 // 0 one ordinary tree, all the data
    { mode: 'bootstrap' },              // 1 resample it, with replacement
    { mode: 'singleBoot' },             // 2 grow a tree on that resample (half-blind)
    { mode: 'multiBoot' },              // 3 three different resamples, three different trees
    { mode: 'vote', k: 3 },             // 4 combine by majority vote
    { mode: 'vote', k: 9 },             // 5 more trees, steadier boundary
    { mode: 'vote', k: 9 },             // 6 out-of-bag aside (thumbnail — reuse the k=9 view)
    { mode: 'interactive' },            // 7 try it yourself
    { mode: 'vote', k: 25, final: true }, // 8 the full forest
];

const dot = ({ x, y }, color, key, square) => (
    square ? (
        <rect key={key} x={x - 5.5} y={y - 5.5} width="11" height="11" rx="2.5"
            fill={color} fillOpacity="0.9" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    ) : (
        <circle key={key} cx={x} cy={y} r="6" fill={color} fillOpacity="0.9" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    )
);

function Points({ dim = () => false, badge = () => 0 }) {
    return (
        <g>
            {DATA.map((p, i) => {
                const color = p.cls === 1 ? APPLE : LEMON;
                const opacity = dim(i) ? 0.22 : 1;
                const n = badge(i);
                return (
                    <g key={i} opacity={opacity}>
                        {dot(p, color, `p${i}`, p.cls === 0)}
                        {n > 1 && (
                            <text x={p.x + 9} y={p.y - 7} fontSize="8" fontWeight="700" fontFamily="monospace"
                                fill="currentColor" fillOpacity="0.75">×{n}</text>
                        )}
                    </g>
                );
            })}
        </g>
    );
}

function Frame() {
    return (
        <g>
            <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} rx="8" fill="none" stroke="currentColor" strokeOpacity="0.15" />
            <text x={(X0 + X1) / 2} y="285" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.55">weight  →</text>
            <text x="7" y={(Y0 + Y1) / 2} fontSize="10" fill="currentColor" fillOpacity="0.55"
                transform={`rotate(-90 7 ${(Y0 + Y1) / 2})`} textAnchor="middle">roundness  →</text>
        </g>
    );
}

export default function RandomForestVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';

    const [userK, setUserK] = useState(9);
    const k = interactive ? userK : (state.k || 0);
    const votingActive = state.mode === 'vote' || interactive;

    const grid = votingActive ? voteGrid(k) : null;
    const votes = votingActive ? forestVotes(k, QUERY) : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A scatter of apples (circles) and lemons (squares) by weight and roundness, with one or many decision-tree boundaries drawn over it, and a rasterised majority-vote region once several trees are combined">
                <Frame />

                {state.mode === 'single' && (
                    <g>
                        {rectsOf(FULL_TREE).map((r, i) => (
                            <rect key={i} x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0}
                                fill={r.cls === 1 ? APPLE : LEMON} fillOpacity="0.09" />
                        ))}
                        {segmentsOf(FULL_TREE).map((s, i) => (
                            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                                stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="5 4" />
                        ))}
                        <Points />
                        <text x="200" y="20" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                            one ordinary tree, grown on all 20 fruits
                        </text>
                    </g>
                )}

                {state.mode === 'bootstrap' && (
                    <g>
                        <Points
                            dim={(i) => !FOREST[0].counts[i]}
                            badge={(i) => FOREST[0].counts[i] || 0}
                        />
                        <text x="200" y="20" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                            resample 20 fruits, with replacement — some picked twice, some skipped
                        </text>
                        <text x="200" y="282" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                            {FOREST[0].oob.length} of {N} sat out this round — the tree's own "out-of-bag" set
                        </text>
                    </g>
                )}

                {state.mode === 'singleBoot' && (
                    <g>
                        {rectsOf(FOREST[0].tree).map((r, i) => (
                            <rect key={i} x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0}
                                fill={r.cls === 1 ? APPLE : LEMON} fillOpacity="0.09" />
                        ))}
                        {segmentsOf(FOREST[0].tree).map((s, i) => (
                            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                                stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="5 4" />
                        ))}
                        <Points dim={(i) => !FOREST[0].counts[i]} />
                        <text x="200" y="20" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                            same 20 fruits, one resample — and only ONE feature allowed per split
                        </text>
                    </g>
                )}

                {state.mode === 'multiBoot' && (
                    <g>
                        <Points />
                        {[0, 1, 2].map((t) => (
                            <g key={t}>
                                {segmentsOf(FOREST[t].tree).map((s, i) => (
                                    <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                                        stroke="currentColor" strokeWidth={1.6}
                                        strokeOpacity={0.35 + t * 0.12}
                                        strokeDasharray={t === 0 ? 'none' : t === 1 ? '6 3' : '2 3'} />
                                ))}
                            </g>
                        ))}
                        <text x="200" y="20" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                            three trees, three resamples — solid / dashed / dotted boundaries
                        </text>
                        <text x="200" y="282" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                            each one alone would give a different verdict for the same fruit
                        </text>
                    </g>
                )}

                {votingActive && grid && (
                    <g>
                        {grid.map((c, i) => (
                            <rect key={i} x={c.x} y={c.y} width={CELL} height={CELL}
                                fill={c.cls === 1 ? APPLE : LEMON} fillOpacity="0.14" />
                        ))}
                        <Points />
                        <polygon points={`${QUERY.x},${QUERY.y - 7} ${QUERY.x + 7},${QUERY.y} ${QUERY.x},${QUERY.y + 7} ${QUERY.x - 7},${QUERY.y}`}
                            fill="none" stroke="currentColor" strokeWidth="2" />
                        {!interactive && (
                            <text x="200" y="20" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                                {k} tree{k === 1 ? '' : 's'} voting — shaded by the majority verdict per cell
                            </text>
                        )}
                        {state.mode === 'vote' && idx === 6 && (
                            <text x="200" y="282" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                                ≈{(OOB_PROB * 100).toFixed(1)}% of fruits are out-of-bag for any one tree — free validation data
                            </text>
                        )}
                        {state.final && (
                            <text x="200" y="282" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                                {NUM_TREES} trees — the diamond's verdict: {votes}/{k} vote apple
                            </text>
                        )}
                    </g>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="rf-k-slider" className="text-xs font-medium text-text-muted whitespace-nowrap">
                        trees in the forest: <span className="font-mono font-bold text-text-primary">{userK}</span>
                    </label>
                    <input id="rf-k-slider" type="range" min="1" max={NUM_TREES} value={userK}
                        onChange={(e) => setUserK(Number(e.target.value))}
                        aria-label="Number of trees voting in the forest"
                        className="flex-1 cursor-pointer" style={{ accentColor: 'var(--accent-primary)' }} />
                    <span className="text-xs font-mono text-text-muted whitespace-nowrap">
                        diamond: <span className="font-bold" style={{ color: (votes * 2 >= k) ? APPLE : LEMON }}>
                            {(votes * 2 >= k) ? 'apple' : 'lemon'}
                        </span> ({votes}–{k - votes})
                    </span>
                </div>
            )}
        </div>
    );
}
