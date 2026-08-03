import { useMemo, useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// DBSCAN visual — a crescent-shaped cluster, a round blob, and four isolated
// strays. Coordinates are generated once from real trigonometry (the crescent)
// and a fixed point list (the blob/strays); DBSCAN itself — region queries,
// core/border/noise classification, and the density-reachable chain that grows
// each cluster — is computed for real at module load and again live while the
// eps slider is dragged. Pure SVG. Step states clamp defensively (Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

function crescentPoints(cx, cy, r, a0, a1, n, ripple) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const angle = ((a0 + t * (a1 - a0)) * Math.PI) / 180;
        const rr = r + ripple[i % ripple.length];
        pts.push([
            Math.round((cx + rr * Math.cos(angle)) * 10) / 10,
            Math.round((cy + rr * Math.sin(angle)) * 10) / 10,
        ]);
    }
    return pts;
}

const CRESCENT = crescentPoints(120, 110, 48, 160, 340, 11, [0, 4, -3, 3, -4]);
const BLOB = [
    [280, 190], [295, 175], [300, 205], [270, 205], [310, 190],
    [288, 215], [265, 180], [315, 210], [278, 165], [300, 230],
];
const STRAYS = [[60, 220], [200, 60], [350, 120], [180, 260]];
const PTS = [...CRESCENT, ...BLOB, ...STRAYS];
const HIGHLIGHT = CRESCENT.length; // first blob point — a crowded example neighbourhood

const MIN_PTS = 3;
const DEFAULT_EPS = 32;
const BAD_EPS = 22;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function regionQuery(pts, i, eps) {
    const out = [];
    for (let j = 0; j < pts.length; j++) {
        if (j !== i && dist(pts[i], pts[j]) <= eps) out.push(j);
    }
    return out;
}

// The real DBSCAN algorithm: region queries, core/border/noise classification,
// and cluster growth by chaining from core point to core point. `parent`
// records which core point first pulled each point in, for the chain visual.
function runDBSCAN(pts, eps, minPts) {
    const n = pts.length;
    const neighborCounts = pts.map((_, i) => regionQuery(pts, i, eps).length);
    const labels = new Array(n).fill(null);
    const visited = new Array(n).fill(false);
    const parent = new Array(n).fill(null);
    let clusterId = -1;

    for (let i = 0; i < n; i++) {
        if (visited[i]) continue;
        visited[i] = true;
        const neighbors = regionQuery(pts, i, eps);
        if (neighbors.length < minPts) {
            labels[i] = -1;
            continue;
        }
        clusterId += 1;
        labels[i] = clusterId;
        const seeds = [...neighbors];
        seeds.forEach((s) => { if (parent[s] == null) parent[s] = i; });
        for (let k = 0; k < seeds.length; k++) {
            const j = seeds[k];
            if (!visited[j]) {
                visited[j] = true;
                const jNeighbors = regionQuery(pts, j, eps);
                if (jNeighbors.length >= minPts) {
                    jNeighbors.forEach((x) => {
                        if (!seeds.includes(x)) {
                            seeds.push(x);
                            if (parent[x] == null) parent[x] = j;
                        }
                    });
                }
            }
            if (labels[j] == null || labels[j] === -1) labels[j] = clusterId;
        }
    }
    const kind = labels.map((l, i) => (neighborCounts[i] >= minPts ? 'core' : l === -1 ? 'noise' : 'border'));
    const clusterCount = clusterId + 1;
    const noiseCount = labels.filter((l) => l === -1).length;
    return { labels, neighborCounts, parent, kind, clusterCount, noiseCount };
}

const DEFAULT_RESULT = runDBSCAN(PTS, DEFAULT_EPS, MIN_PTS);
const BAD_RESULT = runDBSCAN(PTS, BAD_EPS, MIN_PTS);
const KIND_COUNTS = DEFAULT_RESULT.kind.reduce(
    (acc, k) => ({ ...acc, [k]: acc[k] + 1 }),
    { core: 0, border: 0, noise: 0 },
);

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'neighborhood' },
    { mode: 'kinds' },
    { mode: 'chain', clusters: [0] },
    { mode: 'chain', clusters: [0, 1] },
    { mode: 'interactive' },
    { mode: 'final' },
    { mode: 'bad' },
];

const COLORS = ['var(--accent-primary)', 'var(--secondary)', '#10b981'];

// A cross marks noise regardless of colour, so it's never mistaken for a
// tentative cluster even for colour-blind readers.
const NoiseMark = ({ x, y, dim }) => (
    <g stroke={dim ? 'currentColor' : 'var(--destructive)'} strokeOpacity={dim ? 0.3 : 0.8} strokeWidth="2" strokeLinecap="round">
        <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} />
        <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} />
    </g>
);

// Core/border/noise shown by shape alone (this step is before any cluster
// colouring exists): core = filled circle, border = open square, noise = cross.
const KindPoint = ({ x, y, kind }) => {
    if (kind === 'core') return <circle cx={x} cy={y} r="6" fill="currentColor" fillOpacity="0.8" />;
    if (kind === 'border') {
        return <rect x={x - 5.5} y={y - 5.5} width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />;
    }
    return <NoiseMark x={x} y={y} />;
};

// Cluster membership by shape AND colour: cluster 0 = circle, 1 = square,
// 2 = triangle (only appears when a low eps fragments the crescent).
const ClusterPoint = ({ x, y, label, dim }) => {
    if (label == null || label === -1) return <NoiseMark x={x} y={y} dim={dim} />;
    const color = dim ? 'currentColor' : COLORS[label % COLORS.length];
    const opacity = dim ? 0.25 : 0.85;
    const common = { fill: color, fillOpacity: opacity, stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 };
    if (label % 3 === 1) return <rect x={x - 5.5} y={y - 5.5} width="11" height="11" rx="2" {...common} />;
    if (label % 3 === 2) return <polygon points={`${x},${y - 6.5} ${x + 6},${y + 5} ${x - 6},${y + 5}`} {...common} />;
    return <circle cx={x} cy={y} r="6" {...common} />;
};

export default function DBSCANVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    useReducedMotion(); // no framer-motion here, but keeps prefs applied consistently

    const [eps, setEps] = useState(DEFAULT_EPS);
    const live = useMemo(() => (interactive ? runDBSCAN(PTS, eps, MIN_PTS) : null), [interactive, eps]);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Points being grouped into clusters by spreading through dense neighbourhoods, with isolated points marked as noise">
                <rect x="20" y="30" width="360" height="250" rx="10" fill="none" stroke="currentColor" strokeOpacity="0.12" />

                {/* Neighbourhood step: eps circle + highlighted neighbours around one point */}
                {state.mode === 'neighborhood' && (
                    <>
                        <circle cx={PTS[HIGHLIGHT][0]} cy={PTS[HIGHLIGHT][1]} r={DEFAULT_EPS}
                            fill="var(--accent-primary)" fillOpacity="0.08" stroke="var(--accent-primary)" strokeOpacity="0.5" strokeWidth="1.5" />
                        {regionQuery(PTS, HIGHLIGHT, DEFAULT_EPS).map((j) => (
                            <circle key={j} cx={PTS[j][0]} cy={PTS[j][1]} r="9" fill="none"
                                stroke="var(--accent-primary)" strokeWidth="1.5" strokeDasharray="2 2" />
                        ))}
                    </>
                )}

                {/* Chain step: dashed links from the core point that pulled each point in */}
                {state.mode === 'chain' && DEFAULT_RESULT.parent.map((p, i) => {
                    if (p == null || !state.clusters.includes(DEFAULT_RESULT.labels[i])) return null;
                    return (
                        <line key={i} x1={PTS[p][0]} y1={PTS[p][1]} x2={PTS[i][0]} y2={PTS[i][1]}
                            stroke={COLORS[DEFAULT_RESULT.labels[i] % COLORS.length]} strokeWidth="1.3" strokeDasharray="3 3" strokeOpacity="0.55" />
                    );
                })}

                {/* The points */}
                {PTS.map((p, i) => {
                    if (state.mode === 'intro') return <circle key={i} cx={p[0]} cy={p[1]} r="6" fill="currentColor" fillOpacity="0.5" />;
                    if (state.mode === 'neighborhood') {
                        const isHi = i === HIGHLIGHT;
                        return <circle key={i} cx={p[0]} cy={p[1]} r={isHi ? 7 : 6}
                            fill={isHi ? 'var(--accent-primary)' : 'currentColor'} fillOpacity={isHi ? 0.95 : 0.45} />;
                    }
                    if (state.mode === 'kinds') return <KindPoint key={i} x={p[0]} y={p[1]} kind={DEFAULT_RESULT.kind[i]} />;
                    if (state.mode === 'chain') {
                        const inCluster = state.clusters.includes(DEFAULT_RESULT.labels[i]);
                        return <ClusterPoint key={i} x={p[0]} y={p[1]} label={inCluster ? DEFAULT_RESULT.labels[i] : null} dim={!inCluster} />;
                    }
                    if (state.mode === 'final') return <ClusterPoint key={i} x={p[0]} y={p[1]} label={DEFAULT_RESULT.labels[i]} />;
                    if (state.mode === 'bad') return <ClusterPoint key={i} x={p[0]} y={p[1]} label={BAD_RESULT.labels[i]} />;
                    if (interactive) return <ClusterPoint key={i} x={p[0]} y={p[1]} label={live.labels[i]} />;
                    return null;
                })}

                {/* Captions */}
                {state.mode === 'intro' && (
                    <text x="200" y="272" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                        25 points — one crescent, one round blob, a few strays. No labels.
                    </text>
                )}
                {state.mode === 'neighborhood' && (
                    <text x="200" y="272" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                        {regionQuery(PTS, HIGHLIGHT, DEFAULT_EPS).length} neighbours within eps={DEFAULT_EPS} — enough for minPts={MIN_PTS}
                    </text>
                )}
                {state.mode === 'kinds' && (
                    <text x="200" y="272" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                        {KIND_COUNTS.core} core · {KIND_COUNTS.border} border · {KIND_COUNTS.noise} noise
                    </text>
                )}
                {state.mode === 'chain' && (
                    <text x="368" y="50" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                        {state.clusters.length === 1 ? 'cluster 1 growing' : 'cluster 2 growing'}
                    </text>
                )}
                {state.mode === 'final' && (
                    <text x="200" y="272" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                        {DEFAULT_RESULT.clusterCount} clusters · {DEFAULT_RESULT.noiseCount} noise points — no k chosen
                    </text>
                )}
                {state.mode === 'bad' && (
                    <text x="200" y="272" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--destructive)">
                        eps={BAD_EPS}: {BAD_RESULT.clusterCount} cluster · {BAD_RESULT.noiseCount} noise — the sparser crescent vanishes
                    </text>
                )}
                {interactive && (
                    <text x="200" y="272" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                        {live.clusterCount} clusters · {live.noiseCount} noise points
                    </text>
                )}
            </svg>

            {/* Interactive: one slider, visibly labelled */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="dbscan-eps-slider" className="text-xs font-medium text-text-muted whitespace-nowrap">
                        eps (radius): <span className="font-mono font-bold text-text-primary">{eps}</span>
                    </label>
                    <input id="dbscan-eps-slider" type="range" min="18" max="44" step="1" value={eps}
                        onChange={(e) => setEps(Number(e.target.value))}
                        aria-label="eps, the neighbourhood radius DBSCAN searches for neighbours"
                        className="flex-1 cursor-pointer" style={{ accentColor: 'var(--accent-primary)' }} />
                </div>
            )}
        </div>
    );
}
