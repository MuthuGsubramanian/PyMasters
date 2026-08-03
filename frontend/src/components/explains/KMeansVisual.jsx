import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw } from 'lucide-react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// K-Means visual — three unlabelled blobs of points, k centroids that assign
// and update until convergence. The iterations are computed for real at module
// load (assign → update snapshots), so the essay shows the true algorithm.
// Pure SVG + framer-motion; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const COLORS = ['var(--accent-primary)', 'var(--secondary)', '#10b981'];

const PTS = [
    // blob A (top-left)
    [72, 78], [95, 70], [108, 96], [84, 108], [60, 95], [100, 118], [88, 58], [115, 80],
    // blob B (top-right)
    [265, 82], [288, 70], [300, 100], [272, 110], [310, 85], [295, 120], [255, 100], [318, 108],
    // blob C (bottom-centre)
    [168, 210], [190, 235], [205, 215], [175, 248], [200, 242], [158, 228], [215, 232], [185, 258],
];
const INIT3 = [[150, 160], [210, 130], [240, 190]];
const INIT2 = [[120, 120], [240, 180]];

const meanOf = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
const nearest = (p, cents) => {
    let best = 0, bd = Infinity;
    cents.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
        if (d < bd) { bd = d; best = i; }
    });
    return best;
};

// Run k-means, recording a snapshot after each assign and each update.
function runKMeans(init) {
    let cents = init.map((c) => [...c]);
    const snaps = [];
    for (let it = 0; it < 8; it++) {
        const assign = PTS.map((p) => nearest(p, cents));
        snaps.push({ cents: cents.map((c) => [...c]), assign, phase: 'assign', iter: it + 1 });
        const next = cents.map((c, ci) => {
            const mine = PTS.filter((_, i) => assign[i] === ci);
            if (!mine.length) return [...c];
            return [meanOf(mine.map((p) => p[0])), meanOf(mine.map((p) => p[1]))];
        });
        const moved = next.some((c, i) => Math.hypot(c[0] - cents[i][0], c[1] - cents[i][1]) > 0.5);
        const prev = cents;
        cents = next;
        snaps.push({ cents: cents.map((c) => [...c]), prevCents: prev, assign, phase: 'update', iter: it + 1 });
        if (!moved) break;
    }
    return snaps;
}

const SNAPS = runKMeans(INIT3);
const FINAL = SNAPS[SNAPS.length - 1];
const SNAPS2 = runKMeans(INIT2);
const FINAL2 = SNAPS2[SNAPS2.length - 1];

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'seeds' },
    { mode: 'snap', snap: SNAPS[0] },                    // first assignment
    { mode: 'snap', snap: SNAPS[1], arrows: true },      // first update
    { mode: 'snap', snap: SNAPS[3], arrows: true },      // second iteration
    { mode: 'interactive' },
    { mode: 'snap', snap: FINAL },                       // converged (thumbnail)
    { mode: 'badk' },                                    // wrong k
];

const Centroid = ({ x, y, color, animate = true }) => {
    const Tag = animate ? motion.g : 'g';
    const props = animate
        ? { initial: false, animate: { x, y }, transition: { type: 'spring', stiffness: 110, damping: 16 } }
        : { transform: `translate(${x} ${y})` };
    return (
        <Tag {...props}>
            <line x1="-8" y1="0" x2="8" y2="0" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
            <line x1="0" y1="-8" x2="0" y2="8" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
            <circle r="12" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.5" />
        </Tag>
    );
};

// Cluster membership is shown by shape as well as colour (colour-blind fallback):
// cluster 0 = circle, 1 = square, 2 = triangle. Unassigned points are circles.
const Point = ({ x, y, cluster, color }) => {
    const common = {
        fill: color, fillOpacity: cluster == null ? 0.4 : 0.8,
        stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1,
    };
    if (cluster === 1) return <rect x={x - 5.5} y={y - 5.5} width="11" height="11" rx="2" {...common} />;
    if (cluster === 2) return <polygon points={`${x},${y - 6.5} ${x + 6},${y + 5} ${x - 6},${y + 5}`} {...common} />;
    return <circle cx={x} cy={y} r="6" {...common} />;
};

export default function KMeansVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    const reducedMotion = useReducedMotion();

    // Interactive: step through the real snapshots. Reset when leaving the step.
    const [snapIdx, setSnapIdx] = useState(-1); // -1 = seeds only
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setSnapIdx(-1);
    }
    const done = snapIdx >= SNAPS.length - 1;

    let snap = null, seedsOnly = false, badk = false;
    if (state.mode === 'seeds') seedsOnly = true;
    else if (state.mode === 'snap') snap = state.snap;
    else if (state.mode === 'badk') badk = true;
    else if (interactive) { if (snapIdx < 0) seedsOnly = true; else snap = SNAPS[snapIdx]; }

    const cents = badk ? FINAL2.cents : snap ? snap.cents : seedsOnly ? (badk ? INIT2 : INIT3) : null;
    const assign = badk ? FINAL2.assign : snap ? snap.assign : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Unlabelled points being grouped into clusters by moving centroids">
                <rect x="20" y="30" width="360" height="250" rx="10" fill="none" stroke="currentColor" strokeOpacity="0.12" />

                {/* Update arrows: centroid movement */}
                {state.arrows && snap?.prevCents && snap.prevCents.map((p, i) => (
                    <line key={i} x1={p[0]} y1={p[1]} x2={snap.cents[i][0]} y2={snap.cents[i][1]}
                        stroke={COLORS[i]} strokeWidth="1.5" strokeDasharray="3 3" strokeOpacity="0.6" />
                ))}

                {/* The points */}
                {PTS.map((p, i) => (
                    <Point key={i} x={p[0]} y={p[1]}
                        cluster={assign ? assign[i] : null}
                        color={assign ? COLORS[assign[i]] : 'currentColor'} />
                ))}

                {/* The centroids */}
                {cents && cents.map((c, i) => (
                    <Centroid key={i} x={c[0]} y={c[1]} color={COLORS[i]} animate={!reducedMotion} />
                ))}

                {/* Captions */}
                {state.mode === 'intro' && (
                    <text x="200" y="272" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                        24 points — no labels, no answer key
                    </text>
                )}
                {snap && !interactive && (
                    <text x="368" y="50" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                        {state.snap === FINAL ? 'converged' : `iteration ${snap.iter} · ${snap.phase}`}
                    </text>
                )}
                {badk && (
                    <text x="200" y="272" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--destructive)">
                        k = 2: two real groups forced to share one centroid
                    </text>
                )}
            </svg>

            {/* Interactive controls */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-2">
                    <button onClick={() => setSnapIdx((s) => Math.min(s + 1, SNAPS.length - 1))} disabled={done}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-primary rounded-lg px-3 py-2 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer">
                        <Play size={12} />
                        {snapIdx < 0 ? 'Assign points' : SNAPS[snapIdx].phase === 'assign' ? 'Move centroids' : 'Re-assign'}
                    </button>
                    <button onClick={() => setSnapIdx(-1)}
                        className="flex items-center gap-1.5 text-xs font-medium text-text-muted bg-bg-elevated border border-border-default rounded-lg px-3 py-2 hover:text-text-secondary transition-colors cursor-pointer">
                        <RotateCcw size={12} /> Reset
                    </button>
                    <span className="text-xs font-mono text-text-muted">
                        {snapIdx < 0 ? 'seeds placed' : `iter ${SNAPS[snapIdx].iter} · ${SNAPS[snapIdx].phase}`}
                        {done && <span className="text-emerald-500 font-bold">  — converged!</span>}
                    </span>
                </div>
            )}
        </div>
    );
}
