import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Embeddings & Semantic Search visual — ten short lesson blurbs are turned into
// real TF-IDF vectors, projected to 2D with a real (power-iteration) PCA so
// topics cluster on their own, then searched by cosine similarity against a
// handful of real queries. Nothing here is hand-placed: the vocabulary, the
// weights, the 2D layout and the similarity rankings are all computed below
// at module load from the corpus text. Pure SVG; step states clamp
// defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const ALGO = 'var(--accent-primary)';
const PY = 'var(--secondary)';
const RETRIEVAL = 'var(--destructive)';

const DOCS = [
    { text: 'gradient descent minimizes the loss function', group: 'algo', label: 'gradient descent' },
    { text: 'decision trees split data using simple rules', group: 'algo', label: 'decision trees' },
    { text: 'kmeans clusters unlabeled data into groups', group: 'algo', label: 'kmeans clustering' },
    { text: 'xgboost combines many weak decision trees', group: 'algo', label: 'xgboost' },
    { text: 'python lists store an ordered sequence of items', group: 'python', label: 'python lists' },
    { text: 'python dictionaries map keys to values', group: 'python', label: 'python dictionaries' },
    { text: 'python functions return values to the caller', group: 'python', label: 'python functions' },
    { text: 'embeddings map text into a vector space', group: 'retrieval', label: 'embeddings' },
    { text: 'cosine similarity measures the angle between vectors', group: 'retrieval', label: 'cosine similarity' },
    { text: 'semantic search retrieves documents using vector similarity', group: 'retrieval', label: 'semantic search' },
];
const GROUP_COLOR = { algo: ALGO, python: PY, retrieval: RETRIEVAL };

const QUERIES = [
    { text: 'python dictionaries return values', label: 'python dictionaries' },
    { text: 'grouping unlabeled data into clusters', label: 'grouping unlabeled data' },
    { text: 'vector similarity between text embeddings', label: 'vector similarity' },
    { text: 'puppies and kittens are cute', label: 'puppies and kittens' },
];

// ── Real TF-IDF over the corpus above ──────────────────────────────────────
const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'and', 'by', 'using', 'into', 'for', 'its', 'it', 'this', 'that', 'with', 'on', 'as', 'many']);
const tokenize = (text) => text.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));

const DOC_TOKENS = DOCS.map((d) => tokenize(d.text));
const VOCAB = Array.from(new Set(DOC_TOKENS.flat())).sort();
const V = VOCAB.length;
const VOCAB_INDEX = new Map(VOCAB.map((w, i) => [w, i]));
const N = DOCS.length;
const DF = VOCAB.map((w) => DOC_TOKENS.filter((toks) => toks.includes(w)).length);
const IDF = DF.map((df) => Math.log(N / df) + 1);

function vectorize(tokens) {
    const vec = new Array(V).fill(0);
    tokens.forEach((w) => {
        const i = VOCAB_INDEX.get(w);
        if (i != null) vec[i] += 1;
    });
    for (let i = 0; i < V; i++) vec[i] *= IDF[i];
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
    return vec.map((x) => x / norm);
}
const DOC_VECS = DOC_TOKENS.map(vectorize);
const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// ── Real PCA (power iteration + deflation on the mean-centered Gram matrix) ─
// so topics separate on their own — a miniature, from-scratch version of the
// dimensionality reduction that turns big embedding vectors into a 2D map.
const MEAN = new Array(V).fill(0);
DOC_VECS.forEach((v) => v.forEach((x, i) => { MEAN[i] += x / N; }));
const center = (v) => v.map((x, i) => x - MEAN[i]);
const CENTERED = DOC_VECS.map(center);

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const normalize = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); };
function applyGram(rows, v) {
    const Xv = rows.map((row) => dot(row, v));
    const out = new Array(v.length).fill(0);
    rows.forEach((row, n) => { const c = Xv[n]; for (let i = 0; i < row.length; i++) out[i] += row[i] * c; });
    return out;
}
function topEigenvector(rows, dim, deflate = []) {
    let v = normalize(VOCAB.map((_, i) => Math.sin(i * 0.37 + 1))); // deterministic seed, not random
    for (let iter = 0; iter < 300; iter++) {
        const Gv = applyGram(rows, v);
        deflate.forEach(({ vec: u, val: lambda }) => {
            const c = dot(u, v) * lambda;
            for (let i = 0; i < Gv.length; i++) Gv[i] -= c * u[i];
        });
        v = normalize(Gv);
    }
    const Gv = applyGram(rows, v);
    return { vec: v, val: dot(v, Gv) };
}
const U1 = topEigenvector(CENTERED, V);
const U2 = topEigenvector(CENTERED, V, [U1]);
const project = (vec) => { const c = center(vec); return { x: dot(c, U1.vec), y: dot(c, U2.vec) }; };

const DOC_PROJ = DOC_VECS.map(project);
const QUERY_VECS = QUERIES.map((q) => vectorize(tokenize(q.text)));
const QUERY_PROJ = QUERY_VECS.map(project);
const RANKINGS = QUERY_VECS.map((qv) => DOC_VECS
    .map((dv, i) => ({ i, sim: cosine(qv, dv) }))
    .sort((a, b) => b.sim - a.sim));

// Plot bounds from the real projected points (docs + every query).
const ALL_X = [...DOC_PROJ, ...QUERY_PROJ].map((p) => p.x);
const ALL_Y = [...DOC_PROJ, ...QUERY_PROJ].map((p) => p.y);
const [minX, maxX] = [Math.min(...ALL_X), Math.max(...ALL_X)];
const [minY, maxY] = [Math.min(...ALL_Y), Math.max(...ALL_Y)];
const PLOT = { x0: 55, x1: 372, y0: 34, y1: 172 };
const px = (x) => PLOT.x0 + ((x - minX) / (maxX - minX || 1)) * (PLOT.x1 - PLOT.x0);
const py = (y) => PLOT.y1 - ((y - minY) / (maxY - minY || 1)) * (PLOT.y1 - PLOT.y0);

// ── Tiny exact 2D toy for the cosine-vs-distance step (two words: cat, dog) ─
const TOY_A = [0, 5]; // "dog dog dog dog dog" — all dog
const TOY_B = [0, 1]; // "dog" — also all dog, just shorter
const TOY_C = [1, 3]; // "dog dog dog cat" — mostly dog, one cat
const toyCos = (a, b) => (a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(...a) || 1) * (Math.hypot(...b) || 1));
const toyDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const COS_AB = toyCos(TOY_A, TOY_B);
const COS_AC = toyCos(TOY_A, TOY_C);
const DIST_AB = toyDist(TOY_A, TOY_B);
const DIST_AC = toyDist(TOY_A, TOY_C);
const tx = (v) => 50 + (v / 5) * 300;
const ty = (v) => 215 - (v / 5) * 185;

const Shape = ({ x, y, group, r = 6, opacity = 0.85, color }) => {
    const c = color || GROUP_COLOR[group];
    const common = { fill: c, fillOpacity: opacity, stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 };
    if (group === 'python') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx="2" {...common} />;
    if (group === 'retrieval') return <polygon points={`${x},${y - r * 1.15} ${x + r},${y + r * 0.85} ${x - r},${y + r * 0.85}`} {...common} />;
    return <circle cx={x} cy={y} r={r} {...common} />;
};

const EXAMPLE_DOC = 2; // "kmeans clusters unlabeled data into groups"

export default function EmbeddingsVisual({ stepIndex = 0 }) {
    const STEP_STATES = [
        { mode: 'intro' },
        { mode: 'vectorize' },
        { mode: 'project' },
        { mode: 'cosine' },
        { mode: 'interactive' },
        { mode: 'search', queryIdx: 3 },
        { mode: 'search', queryIdx: 2 },
        { mode: 'final' },
    ];
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';

    const [userQuery, setUserQuery] = useState(0);
    const queryIdx = interactive ? userQuery : state.queryIdx;
    const showSearch = state.mode === 'search' || interactive;

    const ranking = showSearch ? RANKINGS[queryIdx] : null;
    const topDocIdx = ranking ? ranking[0].i : null;
    const hasMatch = ranking ? ranking[0].sim > 0.05 : false;
    const qPoint = showSearch ? QUERY_PROJ[queryIdx] : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Short text documents converted into weighted-word vectors, plotted by meaning, and ranked by cosine similarity to a search query">

                {/* ── intro: plain, ungrouped dots — just text, no vectors yet ── */}
                {state.mode === 'intro' && (
                    <g>
                        <rect x={PLOT.x0 - 15} y={PLOT.y0 - 14} width={PLOT.x1 - PLOT.x0 + 30} height={PLOT.y1 - PLOT.y0 + 30} rx="10" fill="none" stroke="currentColor" strokeOpacity="0.12" />
                        {DOC_PROJ.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r="5.5" fill="currentColor" fillOpacity="0.32" />)}
                        <text x="200" y="205" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.65">10 short lesson blurbs — just text, no numbers yet</text>
                        <text x="200" y="222" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">"kmeans clusters unlabeled data into groups" · "python lists store…" · …</text>
                    </g>
                )}

                {/* ── vectorize: one document's real TF-IDF weights as bars ── */}
                {state.mode === 'vectorize' && (() => {
                    const toks = DOC_TOKENS[EXAMPLE_DOC];
                    const words = Array.from(new Set(toks));
                    const weights = words.map((w) => DOC_VECS[EXAMPLE_DOC][VOCAB_INDEX.get(w)]);
                    const maxW = Math.max(...weights);
                    const bw = 300 / words.length;
                    return (
                        <g>
                            <text x="200" y="26" textAnchor="middle" fontSize="10.5" fontStyle="italic" fill="currentColor" fillOpacity="0.75">"{DOCS[EXAMPLE_DOC].text}"</text>
                            <line x1="45" y1="230" x2="375" y2="230" stroke="currentColor" strokeOpacity="0.25" />
                            {words.map((w, i) => {
                                const x0 = 50 + i * bw;
                                const h = (weights[i] / maxW) * 150;
                                return (
                                    <g key={w}>
                                        <rect x={x0 + 8} y={230 - h} width={bw - 16} height={h} rx="3" fill={ALGO} fillOpacity="0.85" />
                                        <text x={x0 + bw / 2} y="243" textAnchor="middle" fontSize="9.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">{w}</text>
                                        <text x={x0 + bw / 2} y={230 - h - 5} textAnchor="middle" fontSize="9" fontFamily="monospace" fill={ALGO}>{weights[i].toFixed(2)}</text>
                                    </g>
                                );
                            })}
                            <text x="200" y="266" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">weight = term frequency × inverse document frequency</text>
                            <text x="200" y="282" textAnchor="middle" fontSize="9.5" fill="currentColor" fillOpacity="0.5">rarer words (across all 10 docs) get more weight</text>
                        </g>
                    );
                })()}

                {/* ── project / interactive / search / final share one scatter ── */}
                {(state.mode === 'project' || showSearch || state.mode === 'final') && (
                    <g>
                        <rect x={PLOT.x0 - 15} y={PLOT.y0 - 14} width={PLOT.x1 - PLOT.x0 + 30} height={PLOT.y1 - PLOT.y0 + 30} rx="10" fill="none" stroke="currentColor" strokeOpacity="0.12" />
                        {DOC_PROJ.map((p, i) => {
                            const isTop = hasMatch && i === topDocIdx;
                            return <Shape key={i} x={px(p.x)} y={py(p.y)} group={DOCS[i].group} r={isTop ? 8 : 6} opacity={isTop ? 1 : 0.85} />;
                        })}
                        {showSearch && qPoint && (
                            <g>
                                {hasMatch && (
                                    <line x1={px(qPoint.x)} y1={py(qPoint.y)} x2={px(DOC_PROJ[topDocIdx].x)} y2={py(DOC_PROJ[topDocIdx].y)}
                                        stroke={GROUP_COLOR[DOCS[topDocIdx].group]} strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity="0.7" />
                                )}
                                <rect x={px(qPoint.x) - 6} y={py(qPoint.y) - 6} width="12" height="12" transform={`rotate(45 ${px(qPoint.x)} ${py(qPoint.y)})`}
                                    fill="currentColor" fillOpacity="0.9" stroke="var(--bg-elevated, white)" strokeWidth="1" />
                            </g>
                        )}
                        {/* legend */}
                        <g fontSize="8.5" fontFamily="monospace">
                            <circle cx="203" cy="20" r="3.5" fill={ALGO} /><text x="210" y="23" fill="currentColor" fillOpacity="0.7">algorithms</text>
                            <rect x="272" y="16" width="7" height="7" rx="1.5" fill={PY} /><text x="283" y="23" fill="currentColor" fillOpacity="0.7">python</text>
                            <polygon points="328,15 333,23 323,23" fill={RETRIEVAL} /><text x="337" y="23" fill="currentColor" fillOpacity="0.7">retrieval</text>
                        </g>
                    </g>
                )}
                {state.mode === 'project' && (
                    <text x="200" y="196" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">same 10 documents, plotted by meaning (real PCA, 2D)</text>
                )}
                {state.mode === 'final' && (
                    <text x="200" y="196" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">ten documents fit on one screen — real search engines index millions</text>
                )}

                {/* similarity bars for search / interactive */}
                {showSearch && ranking && (() => {
                    const top = ranking.slice(0, 4);
                    const maxSim = Math.max(top[0].sim, 0.01);
                    return (
                        <g>
                            <text x="40" y="196" fontSize="9.5" fill={hasMatch ? 'currentColor' : RETRIEVAL} fillOpacity={hasMatch ? 0.6 : 0.9} fontWeight={hasMatch ? '400' : '700'}>
                                query: “{QUERIES[queryIdx].label}”{!hasMatch && ' — 0% match, no shared words'}
                            </text>
                            {top.map(({ i, sim }, row) => {
                                const y0 = 206 + row * 20;
                                const w = Math.max(2, (sim / maxSim) * 195);
                                return (
                                    <g key={i}>
                                        <text x="40" y={y0 + 8} fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">{DOCS[i].label}</text>
                                        <rect x="150" y={y0} width="195" height="9" rx="4.5" fill="currentColor" fillOpacity="0.08" />
                                        <rect x="150" y={y0} width={sim > 0.01 ? w : 1} height="9" rx="4.5" fill={GROUP_COLOR[DOCS[i].group]} fillOpacity="0.9" />
                                        <text x="365" y={y0 + 8} textAnchor="end" fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">{Math.round(sim * 100)}%</text>
                                    </g>
                                );
                            })}
                        </g>
                    );
                })()}

                {/* ── cosine concept: exact toy example, two words only ── */}
                {state.mode === 'cosine' && (
                    <g>
                        <line x1="50" y1="215" x2="370" y2="215" stroke="currentColor" strokeOpacity="0.25" />
                        <line x1="50" y1="215" x2="50" y2="30" stroke="currentColor" strokeOpacity="0.25" />
                        <text x="210" y="228" textAnchor="middle" fontSize="9.5" fill="currentColor" fillOpacity="0.6">count of "cat" →</text>
                        <text x="14" y="122" textAnchor="middle" fontSize="9.5" fill="currentColor" fillOpacity="0.6" transform="rotate(-90 14 122)">count of "dog" →</text>

                        <line x1={tx(0)} y1={ty(0)} x2={tx(TOY_A[0])} y2={ty(TOY_A[1])} stroke={ALGO} strokeWidth="2" />
                        <line x1={tx(0)} y1={ty(0)} x2={tx(TOY_B[0])} y2={ty(TOY_B[1])} stroke={PY} strokeWidth="2" />
                        <line x1={tx(0)} y1={ty(0)} x2={tx(TOY_C[0])} y2={ty(TOY_C[1])} stroke={RETRIEVAL} strokeWidth="2" />
                        <circle cx={tx(TOY_A[0])} cy={ty(TOY_A[1])} r="5" fill={ALGO} />
                        <circle cx={tx(TOY_B[0])} cy={ty(TOY_B[1])} r="5" fill={PY} />
                        <circle cx={tx(TOY_C[0])} cy={ty(TOY_C[1])} r="5" fill={RETRIEVAL} />
                        <text x={tx(TOY_A[0]) + 8} y={ty(TOY_A[1]) + 3} fontSize="9.5" fontWeight="700" fill={ALGO}>A: "dog"×5</text>
                        <text x={tx(TOY_B[0]) + 8} y={ty(TOY_B[1]) + 3} fontSize="9.5" fontWeight="700" fill={PY}>B: "dog"×1</text>
                        <text x={tx(TOY_C[0]) + 8} y={ty(TOY_C[1]) + 3} fontSize="9.5" fontWeight="700" fill={RETRIEVAL}>C: "dog"×3 "cat"×1</text>

                        <g fontSize="10" fontFamily="monospace">
                            <text x="50" y="252" fill="currentColor" fillOpacity="0.85">cos(A,B) = {COS_AB.toFixed(2)}   dist(A,B) = {DIST_AB.toFixed(1)}</text>
                            <text x="50" y="266" fill="currentColor" fillOpacity="0.85">cos(A,C) = {COS_AC.toFixed(2)}   dist(A,C) = {DIST_AC.toFixed(1)}</text>
                        </g>
                        <text x="200" y="288" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" fillOpacity="0.75">
                            by distance, C looks closer to A — by angle, B does
                        </text>
                    </g>
                )}
            </svg>

            {/* Interactive controls */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex flex-wrap items-center gap-1.5">
                    {QUERIES.map((q, i) => (
                        <button key={i} onClick={() => setUserQuery(i)}
                            className={`text-[11px] font-medium rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                                userQuery === i
                                    ? 'text-white bg-gradient-primary'
                                    : 'text-text-secondary bg-bg-elevated border border-border-default hover:bg-bg-inset'
                            }`}>
                            {q.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
