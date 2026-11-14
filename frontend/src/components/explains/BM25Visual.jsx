import { useState } from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// BM25 visual — six tiny documents, the query "python sort", and the real
// BM25 score of every document, built up one idea at a time: raw counts →
// rarity weights (IDF) → diminishing returns (k1) → length normalisation (b).
// Every number is computed at module load from the documents below (Lucene-style
// IDF: ln(1 + (N − df + 0.5) / (df + 0.5))); nothing is staged or random.
// Query terms are marked by SHAPE: circle = "python", square = "sort".
// Pure SVG + framer-motion; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const PY_C = 'var(--accent-primary)';
const SORT_C = 'var(--secondary)';

const DOCS = [
    { name: 'beginner tutorial', text: 'python tutorial for beginners learn python basics and python syntax' },
    { name: 'sorting a list', text: 'how to sort a python list sort the list in place with list sort' },
    { name: 'keyword-stuffed page', text: 'sort sort buy cheap sort deals click here best sort offers now sort sort' },
    { name: 'sorting algorithms (long)', text: 'python sort algorithms explained quicksort mergesort and timsort the algorithm behind python sort in detail with many examples of how comparisons are counted' },
    { name: 'pasta scraper', text: 'scraping pasta recipes with a python script' },
    { name: 'speeding up code', text: 'fast python code profiling and speedups for slow loops' },
].map((d) => ({ ...d, tokens: d.text.split(' ') }));

const QUERY = ['python', 'sort'];
const N = DOCS.length;
const AVG_LEN = DOCS.reduce((s, d) => s + d.tokens.length, 0) / N;

// Document frequency and IDF for each query term, computed for real.
const DF = {};
const IDF = {};
QUERY.forEach((t) => {
    DF[t] = DOCS.filter((d) => d.tokens.includes(t)).length;
    IDF[t] = Math.log(1 + (N - DF[t] + 0.5) / (DF[t] + 0.5));
});

const tfOf = (doc, term) => doc.tokens.filter((w) => w === term).length;

// Score of one document under a given stage of the build-up.
const scoreDoc = (doc, mode, k1, b) => QUERY.reduce((sum, t) => {
    const tf = tfOf(doc, t);
    if (mode === 'count') return sum + tf;
    if (mode === 'idf') return sum + tf * IDF[t];
    if (mode === 'sat') return sum + (IDF[t] * tf * (k1 + 1)) / (tf + k1);
    const norm = k1 * (1 - b + (b * doc.tokens.length) / AVG_LEN);
    return sum + (IDF[t] * tf * (k1 + 1)) / (tf + norm);
}, 0);

const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

const STEP_STATES = [
    { mode: 'docs', caption: 'six tiny documents; the query is "python sort"' },
    { mode: 'count', caption: 'stage 1: score = how many query words appear (stuffed page leads)' },
    { mode: 'idf', showIdf: true, caption: 'stage 2: rare words count for more (sort > python)' },
    { mode: 'sat', showIdf: true, caption: 'stage 3: repeats saturate — the stuffed page\'s lead shrinks' },
    { mode: 'bm25', showIdf: true, caption: 'stage 4: long documents are discounted — full BM25' },
    { mode: 'bm25', showIdf: true, sort: true, caption: 'sorted by BM25 score: the best honest match is on top' },
    { mode: 'bm25', showIdf: true, sort: true, caption: 'BM25 ranking for "python sort"' }, // thumbnail
    { mode: 'interactive' },
    { mode: 'bm25', showIdf: true, sort: true, warn: true, caption: 'keywords only: a page saying "order a list" would score 0' },
];

const fmt = (mode, v) => (mode === 'count' ? String(v) : v.toFixed(2));

// Token strip: grey cells for ordinary words, shapes for query words.
const TokenStrip = ({ doc, y }) => (
    <g>
        {doc.tokens.map((w, i) => {
            const x = 20 + i * 6.4;
            if (w === 'python') return <circle key={i} cx={x + 2.6} cy={y + 3} r="3.2" fill={PY_C} fillOpacity="0.9" />;
            if (w === 'sort') return <rect key={i} x={x} y={y} width="5.6" height="6" rx="1" fill={SORT_C} fillOpacity="0.9" />;
            return <rect key={i} x={x} y={y + 1} width="5" height="4" rx="1" fill="currentColor" fillOpacity="0.22" />;
        })}
    </g>
);

export default function BM25Visual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    const reducedMotion = useReducedMotion();

    const [k1, setK1] = useState(DEFAULT_K1);
    const [b, setB] = useState(DEFAULT_B);

    const mode = interactive ? 'bm25' : state.mode;
    const useK1 = interactive ? k1 : DEFAULT_K1;
    const useB = interactive ? b : DEFAULT_B;
    const showBars = mode !== 'docs';
    const sorted = interactive || state.sort;

    let rows = DOCS.map((doc, i) => ({
        doc,
        i,
        score: showBars ? scoreDoc(doc, mode, useK1, useB) : 0,
    }));
    if (sorted) rows = [...rows].sort((a, c) => c.score - a.score || a.i - c.i);
    const maxScore = Math.max(...rows.map((r) => r.score), 1e-9);
    const leader = rows[0];

    const BarTag = reducedMotion ? 'rect' : motion.rect;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Six short documents shown as strips of word cells, with circles marking the word python and squares marking the word sort, and horizontal bars showing each document's BM25 relevance score for the query python sort">

                {/* Legend: shape = query word (IDF shown once it matters) */}
                <circle cx="26" cy="13" r="4.5" fill={PY_C} fillOpacity="0.9" />
                <text x="35" y="17" fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                    python{state.showIdf || interactive ? ` idf ${IDF.python.toFixed(2)}` : ''}
                </text>
                <rect x="190" y="8.5" width="9" height="9" rx="1.5" fill={SORT_C} fillOpacity="0.9" />
                <text x="204" y="17" fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                    sort{state.showIdf || interactive ? ` idf ${IDF.sort.toFixed(2)}` : ''}
                </text>

                {rows.map((r, pos) => {
                    const y = 28 + pos * 41;
                    const w = showBars ? Math.max(2, (r.score / maxScore) * 118) : 0;
                    const isLeader = sorted && pos === 0;
                    return (
                        <g key={r.i}>
                            <text x="20" y={y + 11} fontSize="12" fill="currentColor"
                                fillOpacity={isLeader ? 0.95 : 0.75} fontWeight={isLeader ? '700' : '400'}>
                                {sorted ? `${pos + 1}. ` : ''}{r.doc.name}
                            </text>
                            <TokenStrip doc={r.doc} y={y + 18} />
                            {showBars && (
                                <g>
                                    <rect x="190" y={y + 12} width="118" height="14" rx="3"
                                        fill="currentColor" fillOpacity="0.07" />
                                    <BarTag x="190" y={y + 12} height="14" rx="3"
                                        fill={isLeader ? 'var(--accent-primary)' : 'currentColor'}
                                        fillOpacity={isLeader ? 0.85 : 0.4}
                                        {...(reducedMotion
                                            ? { width: w }
                                            : { initial: false, animate: { width: w }, transition: { type: 'spring', stiffness: 140, damping: 20 } })} />
                                    <text x="392" y={y + 24} textAnchor="end" fontSize="12" fontFamily="monospace"
                                        fill="currentColor" fillOpacity="0.9">{fmt(mode, r.score)}</text>
                                </g>
                            )}
                        </g>
                    );
                })}

                {/* Caption */}
                {!interactive && state.caption && (
                    <text x="200" y="294" textAnchor="middle" fontSize="12"
                        fontWeight={state.warn ? '700' : '400'}
                        fill={state.warn ? 'var(--destructive)' : 'currentColor'}
                        fillOpacity={state.warn ? '0.95' : '0.65'}>
                        {state.caption}
                    </text>
                )}
                {interactive && (
                    <text x="200" y="294" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.65">
                        top result: {leader.doc.name}
                    </text>
                )}
            </svg>

            {/* Interactive: two visibly-labelled sliders */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 space-y-2">
                    <div className="flex items-center gap-3">
                        <label htmlFor="bm25-k1-slider" className="text-xs font-medium text-text-muted whitespace-nowrap w-28">
                            k1 (saturation): <span className="font-mono font-bold text-text-primary">{k1.toFixed(1)}</span>
                        </label>
                        <input id="bm25-k1-slider" type="range" min="0.1" max="3" step="0.1" value={k1}
                            onChange={(e) => setK1(Number(e.target.value))}
                            aria-label="k1, how quickly repeated words stop adding score"
                            className="flex-1 cursor-pointer" style={{ accentColor: 'var(--accent-primary)' }} />
                    </div>
                    <div className="flex items-center gap-3">
                        <label htmlFor="bm25-b-slider" className="text-xs font-medium text-text-muted whitespace-nowrap w-28">
                            b (length penalty): <span className="font-mono font-bold text-text-primary">{b.toFixed(2)}</span>
                        </label>
                        <input id="bm25-b-slider" type="range" min="0" max="1" step="0.05" value={b}
                            onChange={(e) => setB(Number(e.target.value))}
                            aria-label="b, how strongly long documents are penalised"
                            className="flex-1 cursor-pointer" style={{ accentColor: 'var(--accent-primary)' }} />
                    </div>
                </div>
            )}
        </div>
    );
}
