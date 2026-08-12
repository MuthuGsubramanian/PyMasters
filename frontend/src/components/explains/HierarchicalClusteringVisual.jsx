import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Hierarchical clustering visual — 12 unlabelled points, merged bottom-up into
// a real dendrogram (average linkage), plus a height-driven cut. All merges,
// tree layout, and cut partitions are computed for real at module load from
// fixed input coordinates — nothing here is a canned animation.
// A second dataset (13 points, two blobs + a 3-point bridge) demonstrates how
// single linkage and average linkage disagree on the same points at the same
// cut height (the "catches" step). Pure SVG; step states clamp defensively
// (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Agglomerative clustering: repeatedly merge the two closest clusters until one remains.
function agglomerate(points, linkage) {
    const n = points.length;
    let active = points.map((_, i) => ({ id: i, members: [i] }));
    const nodes = {};
    points.forEach((_, i) => { nodes[i] = { id: i, height: 0, isLeaf: true }; });
    const merges = [];
    const clusterDist = (c1, c2) => {
        const ds = [];
        for (const i of c1.members) for (const j of c2.members) ds.push(dist(points[i], points[j]));
        if (linkage === 'single') return Math.min(...ds);
        return ds.reduce((s, v) => s + v, 0) / ds.length; // average linkage
    };
    let nextId = n;
    while (active.length > 1) {
        let bi = 0, bj = 1, bd = Infinity;
        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                const d = clusterDist(active[i], active[j]);
                if (d < bd) { bd = d; bi = i; bj = j; }
            }
        }
        const left = active[bi], right = active[bj];
        const id = nextId++;
        nodes[id] = { id, height: bd, left: left.id, right: right.id, isLeaf: false };
        merges.push({ id, leftId: left.id, rightId: right.id, height: bd, members: [...left.members, ...right.members] });
        active = active.filter((_, k) => k !== bi && k !== bj);
        active.push({ id, members: [...left.members, ...right.members] });
    }
    const rootId = merges[merges.length - 1].id;
    const order = [];
    (function visit(id) {
        const node = nodes[id];
        if (node.isLeaf) { order.push(id); return; }
        visit(node.left); visit(node.right);
    })(rootId);
    return { nodes, merges, rootId, order };
}

// Union-find over merges up to height h: returns each point's cluster label + cluster count.
function cutAt(points, merges, h) {
    const parent = {};
    points.forEach((_, i) => { parent[i] = i; });
    const find = (x) => { while (parent[x] !== x) x = parent[x]; return x; };
    for (const m of merges) {
        if (m.height <= h) {
            const target = find(m.members[0]);
            new Set(m.members.map(find)).forEach((r) => { parent[r] = target; });
        }
    }
    const labelOf = {};
    let next = 0;
    const labels = points.map((_, i) => {
        const r = find(i);
        if (!(r in labelOf)) labelOf[r] = next++;
        return labelOf[r];
    });
    return { labels, k: next };
}

// ── Main dataset: 3 blobs of 4 points ──────────────────────────────────────────
const PTS = [
    [70, 55], [88, 68], [62, 78], [80, 90],       // blob A (top-left)
    [300, 50], [318, 65], [292, 80], [312, 90],   // blob B (top-right)
    [175, 120], [195, 135], [160, 140], [190, 110], // blob C (bottom-centre)
];
const TREE = agglomerate(PTS, 'average');
const { nodes: NODES, merges: MERGES, rootId: ROOT_ID, order: LEAF_ORDER } = TREE;
const MAX_H = NODES[ROOT_ID].height;

// Dendrogram layout: leaves get evenly spaced x by in-order position; internal
// nodes sit at the mean x of their children. Height maps to y (leaves at the
// bottom, root near the top).
const DX0 = 25, DX1 = 375;
const DEND_BASE = 288, DEND_TOP = 182;
const yOf = (h) => DEND_BASE - (h / MAX_H) * (DEND_BASE - DEND_TOP);

const XPOS = {};
LEAF_ORDER.forEach((id, i) => {
    XPOS[id] = DX0 + (i + 0.5) * ((DX1 - DX0) / LEAF_ORDER.length);
});
// Internal nodes computed in merge order, so children's x is always already set.
MERGES.forEach((m) => { XPOS[m.id] = (XPOS[m.leftId] + XPOS[m.rightId]) / 2; });

const NEAREST_PAIR = MERGES[0]; // the very first, closest merge
const PAIR_DIST = NEAREST_PAIR.height;

// Palette: colour AND shape both carry cluster identity. 5th+ clusters (rare,
// only at very fine cuts) fall back to a neutral marker rather than reuse a shape.
const PALETTE = [
    { color: 'var(--accent-primary)', shape: 'circle' },
    { color: 'var(--secondary)', shape: 'square' },
    { color: 'var(--destructive)', shape: 'triangle' },
    { color: 'currentColor', shape: 'diamond' },
];

const Marker = ({ x, y, shape, color, faded }) => {
    const common = { fill: color, fillOpacity: faded ? 0.35 : 0.85, stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 };
    if (shape === 'square') return <rect x={x - 5.5} y={y - 5.5} width="11" height="11" rx="2" {...common} />;
    if (shape === 'triangle') return <polygon points={`${x},${y - 6.5} ${x + 6.5},${y + 5} ${x - 6.5},${y + 5}`} {...common} />;
    if (shape === 'diamond') return <polygon points={`${x},${y - 7} ${x + 6},${y} ${x},${y + 7} ${x - 6},${y}`} {...common} />;
    return <circle cx={x} cy={y} r="6" {...common} />;
};

function markerFor(k, label) {
    if (k > PALETTE.length) return { color: 'currentColor', shape: 'circle', faded: true };
    return { ...PALETTE[label % PALETTE.length], faded: false };
}

// ── Bridge dataset: two blobs + 3 connector points, for the linkage comparison ──
const BRIDGE = [
    [40, 42], [57, 52], [44, 66], [62, 29], [33, 57],       // blob 1
    [338, 41], [323, 53], [334, 64], [349, 28], [344, 56],  // blob 2
    [113, 50], [188, 46], [266, 52],                        // bridge points (10, 11, 12)
];
const BRIDGE_SINGLE = agglomerate(BRIDGE, 'single');
const BRIDGE_AVG = agglomerate(BRIDGE, 'average');
const COMPARE_H = 70; // same fixed height for both linkages
const CUT_SINGLE = cutAt(BRIDGE, BRIDGE_SINGLE.merges, COMPARE_H);
const CUT_AVG = cutAt(BRIDGE, BRIDGE_AVG.merges, COMPARE_H);

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'nearestpair' },
    { mode: 'tree', h: MERGES[2].height, revealMax: MERGES[2].height },  // 3 nearest pairs
    { mode: 'tree', h: MERGES[8].height, revealMax: MERGES[8].height },  // 3 blobs fully formed
    { mode: 'tree', h: MERGES[8].height, revealMax: MAX_H, gap: true },  // full tree + the gap
    { mode: 'interactive' },
    { mode: 'tree', h: 70, revealMax: 70 },                              // the deliberate cut
    { mode: 'catches' },
];

export default function HierarchicalClusteringVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    useReducedMotion(); // no motion in this visual, but keeps the pref reactive for future use

    const [sliderH, setSliderH] = useState(70);
    const h = interactive ? sliderH : state.h ?? 0;
    const revealMax = interactive ? sliderH : state.revealMax ?? 0;

    const cut = state.mode === 'tree' || interactive ? cutAt(PTS, MERGES, h) : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Points merging bottom-up into a dendrogram, cut at a chosen height to form clusters">
                {state.mode !== 'catches' && (
                    <>
                        <rect x="18" y="10" width="364" height="145" rx="8" fill="none" stroke="currentColor" strokeOpacity="0.1" />
                        <line x1="18" y1="164" x2="382" y2="164" stroke="currentColor" strokeOpacity="0.12" />
                        <rect x="18" y="172" width="364" height="120" rx="8" fill="none" stroke="currentColor" strokeOpacity="0.1" />

                        {/* Scatter points */}
                        {PTS.map((p, i) => {
                            let mk = { color: 'currentColor', shape: 'circle', faded: true };
                            if (cut) mk = markerFor(cut.k, cut.labels[i]);
                            const highlight = state.mode === 'nearestpair' && (i === NEAREST_PAIR.leftId || i === NEAREST_PAIR.rightId);
                            return <Marker key={i} x={p[0]} y={p[1]}
                                shape={highlight ? 'circle' : mk.shape}
                                color={highlight ? 'var(--accent-primary)' : mk.color}
                                faded={mk.faded && !highlight} />;
                        })}

                        {/* Nearest-pair highlight line */}
                        {state.mode === 'nearestpair' && (
                            <>
                                <line x1={PTS[NEAREST_PAIR.leftId][0]} y1={PTS[NEAREST_PAIR.leftId][1]}
                                    x2={PTS[NEAREST_PAIR.rightId][0]} y2={PTS[NEAREST_PAIR.rightId][1]}
                                    stroke="var(--accent-primary)" strokeWidth="1.5" strokeDasharray="3 3" />
                                <text x="200" y="158" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                                    distance = {PAIR_DIST.toFixed(1)} — the smallest of any pair
                                </text>
                            </>
                        )}
                        {state.mode === 'intro' && (
                            <text x="200" y="158" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                                12 points — no labels, no k chosen yet
                            </text>
                        )}

                        {/* Dendrogram brackets, revealed up to revealMax */}
                        {(state.mode === 'tree' || interactive) && MERGES.filter((m) => m.height <= revealMax).map((m) => {
                            const xL = XPOS[m.leftId], xR = XPOS[m.rightId], y = yOf(m.height);
                            const yL = yOf(NODES[m.leftId].height), yR = yOf(NODES[m.rightId].height);
                            const solid = m.height <= h;
                            return (
                                <g key={m.id} opacity={solid ? 1 : 0.3}>
                                    <line x1={xL} y1={yL} x2={xL} y2={y} stroke="currentColor" strokeWidth="1.3" />
                                    <line x1={xR} y1={yR} x2={xR} y2={y} stroke="currentColor" strokeWidth="1.3" />
                                    <line x1={xL} y1={y} x2={xR} y2={y} stroke="currentColor" strokeWidth="1.3" />
                                </g>
                            );
                        })}

                        {/* Cut line */}
                        {(state.mode === 'tree' || interactive) && (
                            <line x1={DX0 - 5} y1={yOf(h)} x2={DX1 + 5} y2={yOf(h)}
                                stroke="var(--accent-primary)" strokeWidth="1.5" strokeDasharray="5 3" strokeOpacity="0.8" />
                        )}

                        {/* The gap annotation */}
                        {state.gap && (
                            <>
                                <rect x={DX0 - 5} y={yOf(MAX_H)} width={DX1 - DX0 + 10} height={yOf(MERGES[8].height) - yOf(MAX_H)}
                                    fill="var(--accent-primary)" fillOpacity="0.08" />
                                <text x="200" y={(yOf(MAX_H) + yOf(MERGES[8].height)) / 2 + 4} textAnchor="middle"
                                    fontSize="10" fontWeight="700" fill="var(--accent-primary)">
                                    the gap: {MERGES[8].height.toFixed(0)} → {MAX_H.toFixed(0)}
                                </text>
                            </>
                        )}

                        {(state.mode === 'tree' || interactive) && (
                            <text x="368" y="182" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                                h = {h.toFixed(0)} · k = {cut.k}
                            </text>
                        )}
                    </>
                )}

                {/* Catches: same bridge points, single vs average linkage, same cut height */}
                {state.mode === 'catches' && (
                    <>
                        <text x="200" y="18" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="currentColor" fillOpacity="0.75">
                            same 13 points, same height ({COMPARE_H}) — different answer
                        </text>
                        <g transform="translate(0, 10)">
                            <rect x="18" y="20" width="364" height="95" rx="8" fill="none" stroke="currentColor" strokeOpacity="0.1" />
                            <text x="28" y="35" fontSize="10" fontWeight="700" fill="currentColor" fillOpacity="0.7">single linkage → k = {CUT_SINGLE.k}</text>
                            {BRIDGE.map((p, i) => {
                                const mk = markerFor(CUT_SINGLE.k, CUT_SINGLE.labels[i]);
                                return <g key={i}>
                                    <Marker x={p[0]} y={p[1] + 50} shape={mk.shape} color={mk.color} faded={mk.faded} />
                                    {i >= 10 && <circle cx={p[0]} cy={p[1] + 50} r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 2" />}
                                </g>;
                            })}
                        </g>
                        <g transform="translate(0, 155)">
                            <rect x="18" y="20" width="364" height="95" rx="8" fill="none" stroke="currentColor" strokeOpacity="0.1" />
                            <text x="28" y="35" fontSize="10" fontWeight="700" fill="currentColor" fillOpacity="0.7">average linkage → k = {CUT_AVG.k}</text>
                            {BRIDGE.map((p, i) => {
                                const mk = markerFor(CUT_AVG.k, CUT_AVG.labels[i]);
                                return <g key={i}>
                                    <Marker x={p[0]} y={p[1] + 50} shape={mk.shape} color={mk.color} faded={mk.faded} />
                                    {i >= 10 && <circle cx={p[0]} cy={p[1] + 50} r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 2" />}
                                </g>;
                            })}
                        </g>
                        <text x="200" y="292" textAnchor="middle" fontSize="9.5" fill="currentColor" fillOpacity="0.55">
                            dashed rings = the 3 connector points
                        </text>
                    </>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-2">
                    <input type="range" min="0" max={Math.ceil(MAX_H)} value={sliderH}
                        onChange={(e) => setSliderH(Number(e.target.value))}
                        aria-label="Cut height" className="flex-1 cursor-pointer" />
                    <span className="text-xs font-mono text-text-muted whitespace-nowrap">
                        h={sliderH} · k={cut.k}
                    </span>
                </div>
            )}
        </div>
    );
}
