import { useState } from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// k-NN visual — two loose clusters (circles vs squares) with a noisy overlap
// zone, a query point (diamond), and the real k-nearest vote. All distances,
// neighbour sets and verdicts are computed at module load from hand-set points,
// so every outcome shown — including the k=1 → k=3 flip caused by the stray
// square — is genuinely computed, not staged.
// Pure SVG + framer-motion; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const CIRCLE_C = 'var(--accent-primary)';
const SQUARE_C = 'var(--secondary)';

// Class "circle" — loose cluster on the left (9 points).
const CIRCLE_PTS = [
    [45, 60], [65, 50], [60, 140], [95, 130], [120, 105],
    [85, 175], [125, 160], [140, 130], [150, 175],
];
// Class "square" — loose cluster on the right (10 points)…
const SQUARE_PTS = [
    [250, 95], [285, 85], [310, 120], [265, 140], [300, 160],
    [330, 145], [255, 185], [290, 200], [320, 190], [240, 230],
];
// …plus one stray square deep in circle territory, right beside the query.
const NOISE_SQUARE = [155, 138];
const QUERY = [170, 150];

const ALL = [
    ...CIRCLE_PTS.map(([x, y]) => ({ x, y, cls: 'circle', noise: false })),
    ...SQUARE_PTS.map(([x, y]) => ({ x, y, cls: 'square', noise: false })),
    { x: NOISE_SQUARE[0], y: NOISE_SQUARE[1], cls: 'square', noise: true },
];

// Real euclidean distances to the query, sorted once at module load.
const NEIGHBOURS = ALL
    .map((p) => ({ ...p, d: Math.hypot(p.x - QUERY[0], p.y - QUERY[1]) }))
    .sort((a, b) => a.d - b.d);

// Real vote for a given k: the jury, the tally, the enclosing radius, the verdict.
const voteAt = (k) => {
    const kk = Math.max(1, Math.min(k, NEIGHBOURS.length));
    const jury = NEIGHBOURS.slice(0, kk);
    const circles = jury.filter((p) => p.cls === 'circle').length;
    const squares = kk - circles;
    return { k: kk, jury, circles, squares, radius: jury[kk - 1].d, winner: circles > squares ? 'circle' : 'square' };
};

const STEP_STATES = [
    { mode: 'points', caption: 'training complete — the model just memorised all 20 points' },
    { mode: 'distances', caption: 'a new point (the diamond): measure the distance to everyone' },
    { mode: 'vote', k: 1, flagNoise: true, warn: true, caption: 'k = 1: the single nearest point is the stray square — noise decides' },
    { mode: 'vote', k: 3, caption: 'k = 3: two circles outvote the stray square — verdict flips' },
    { mode: 'vote', k: 7, caption: 'k = 7: a bigger jury, a steadier verdict' },
    { mode: 'vote', k: 15, warn: true, caption: 'k = 15: the far cluster joins the vote and outnumbers the local one' },
    { mode: 'vote', k: 7, caption: 'the k-nearest vote: no training, just distance and democracy' }, // thumbnail
    { mode: 'interactive' },
    { mode: 'vote', k: 7, caption: 'distance IS the model — scale your features, or it lies' },
];

// Class is shape AND colour: circles vs squares, never colour alone.
const Point = ({ p }) => (
    p.cls === 'square' ? (
        <rect x={p.x - 5.5} y={p.y - 5.5} width="11" height="11" rx="2.5"
            fill={SQUARE_C} fillOpacity="0.85" stroke={SQUARE_C} strokeWidth="1" strokeOpacity="0.5" />
    ) : (
        <circle cx={p.x} cy={p.y} r="6"
            fill={CIRCLE_C} fillOpacity="0.85" stroke={CIRCLE_C} strokeWidth="1" strokeOpacity="0.5" />
    )
);

// The query point — a hollow diamond, deliberately unlike either class.
const QueryMark = () => (
    <g>
        <polygon
            points={`${QUERY[0]},${QUERY[1] - 9.5} ${QUERY[0] + 9.5},${QUERY[1]} ${QUERY[0]},${QUERY[1] + 9.5} ${QUERY[0] - 9.5},${QUERY[1]}`}
            fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx={QUERY[0]} cy={QUERY[1]} r="1.8" fill="currentColor" />
    </g>
);

// Vote tally strip (top-left, above the plot frame).
const Tally = ({ vote }) => (
    <g>
        <circle cx="34" cy="15" r="5.5" fill={CIRCLE_C} fillOpacity="0.85" />
        <text x="44" y="19" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">× {vote.circles}</text>
        <rect x="84" y="9.5" width="11" height="11" rx="2.5" fill={SQUARE_C} fillOpacity="0.85" />
        <text x="101" y="19" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">× {vote.squares}</text>
        <text x="146" y="19" fontSize="11" fontWeight="700" fontFamily="monospace"
            fill={vote.winner === 'circle' ? CIRCLE_C : SQUARE_C}>
            → {vote.winner === 'circle' ? 'circles' : 'squares'} win {Math.max(vote.circles, vote.squares)}–{Math.min(vote.circles, vote.squares)}
        </text>
    </g>
);

// Dashed circle through the k-th nearest neighbour; radius animates unless reduced.
const NeighbourRing = ({ r, reduced }) => {
    const Tag = reduced ? 'circle' : motion.circle;
    const props = reduced
        ? { r }
        : { initial: false, animate: { r }, transition: { type: 'spring', stiffness: 120, damping: 18 } };
    return (
        <Tag cx={QUERY[0]} cy={QUERY[1]} {...props} fill="none"
            stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="6 5" />
    );
};

export default function KNNVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    const reducedMotion = useReducedMotion();

    const [kSlider, setKSlider] = useState(7);

    const vote = state.mode === 'vote' ? voteAt(state.k) : interactive ? voteAt(kSlider) : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Two clusters of points, circles and squares, with a query diamond in the overlap zone; a dashed circle encloses its k nearest neighbours and a tally shows which shape wins the vote">

                {/* Vote tally + current k */}
                {vote && <Tally vote={vote} />}
                {vote && (
                    <text x="372" y="19" textAnchor="end" fontSize="11" fontFamily="monospace"
                        fill="currentColor" fillOpacity="0.7">k = {vote.k}</text>
                )}

                {/* Plot frame */}
                <rect x="20" y="30" width="360" height="245" rx="10" fill="none" stroke="currentColor" strokeOpacity="0.12" />

                {/* Distances mode: faint spokes to every stored point */}
                {state.mode === 'distances' && ALL.map((p, i) => (
                    <line key={`d${i}`} x1={QUERY[0]} y1={QUERY[1]} x2={p.x} y2={p.y}
                        stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
                ))}

                {/* Vote mode: enclosing ring + lines to the jury */}
                {vote && <NeighbourRing r={vote.radius} reduced={reducedMotion} />}
                {vote && vote.jury.map((p, i) => (
                    <line key={`j${i}`} x1={QUERY[0]} y1={QUERY[1]} x2={p.x} y2={p.y}
                        stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.2" />
                ))}

                {/* Flag the stray square when it single-handedly decides the verdict */}
                {state.flagNoise && (
                    <circle cx={NEIGHBOURS[0].x} cy={NEIGHBOURS[0].y} r="11.5" fill="none"
                        stroke="var(--destructive)" strokeWidth="1.6" strokeDasharray="3 2.5" />
                )}

                {/* The memorised points */}
                {ALL.map((p, i) => <Point key={i} p={p} />)}

                {/* The query */}
                {state.mode !== 'points' && <QueryMark />}

                {/* Caption */}
                {state.caption && (
                    <text x="200" y="293" textAnchor="middle" fontSize="11"
                        fontWeight={state.warn ? '700' : '400'}
                        fill={state.warn ? 'var(--destructive)' : 'currentColor'}
                        fillOpacity={state.warn ? '0.95' : '0.6'}>
                        {state.caption}
                    </text>
                )}
            </svg>

            {/* Interactive: one slider, visibly labelled */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="knn-k-slider" className="text-xs font-medium text-text-muted whitespace-nowrap">
                        k (neighbours): <span className="font-mono font-bold text-text-primary">{kSlider}</span>
                    </label>
                    <input id="knn-k-slider" type="range" min="1" max="15" step="2" value={kSlider}
                        onChange={(e) => setKSlider(Number(e.target.value))}
                        aria-label="k, the number of nearest neighbours consulted"
                        className="flex-1 cursor-pointer" style={{ accentColor: 'var(--accent-primary)' }} />
                    {vote && (
                        <span className="text-xs font-mono text-text-muted whitespace-nowrap">
                            verdict: <span className="font-bold" style={{ color: vote.winner === 'circle' ? CIRCLE_C : SQUARE_C }}>
                                {vote.winner === 'circle' ? 'circle' : 'square'}
                            </span> ({vote.circles}–{vote.squares})
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
