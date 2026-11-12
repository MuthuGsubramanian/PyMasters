import { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// PageRank visual — a five-page web, the "random surfer" and power iteration.
// Every rank shown is computed here at module load by repeatedly splitting each
// page's rank among its out-links (plus a teleport share when damping < 1).
// No randomness, no faked numbers. Pure SVG; step states clamp defensively.
// ──────────────────────────────────────────────────────────────────────────────

const ACCENT = 'var(--accent-primary)';
const SECOND = 'var(--secondary)';
const BAD = 'var(--destructive)';
const NEUTRAL = 'currentColor';

// PAGERANK-CORE-START
const NAMES = ['A', 'B', 'C', 'D', 'E'];
const LINKS = { A: ['B', 'C'], B: ['C'], C: ['A'], D: ['C', 'E'], E: ['C', 'D'] };
const N = NAMES.length;

// One power-iteration step: every page keeps (1-d)/N for free (teleport) and
// hands d * rank / out-degree to each page it links to.
const stepRanks = (r, d) => {
    const next = NAMES.map(() => (1 - d) / N);
    NAMES.forEach((s, i) => {
        LINKS[s].forEach((t) => {
            next[NAMES.indexOf(t)] += (d * r[i]) / LINKS[s].length;
        });
    });
    return next;
};

const runIterations = (d, count) => {
    const out = [NAMES.map(() => 1 / N)];
    for (let k = 0; k < count; k++) out.push(stepRanks(out[k], d));
    return out;
};
// PAGERANK-CORE-END

const PLAIN = runIterations(1, 30);      // no teleport: pure random walk
const DAMPED = runIterations(0.85, 30);  // the classic d = 0.85

// Slider table: converged ranks for d = 0.00 … 0.99 (200 iterations each).
const BY_D = Array.from({ length: 100 }, (_, k) => {
    const hist = runIterations(k / 100, 200);
    return hist[hist.length - 1];
});

const POS = { A: [70, 92], B: [200, 44], C: [200, 140], D: [92, 222], E: [308, 222] };
const rad = (rank) => 8 + 40 * rank;
const f3 = (v) => v.toFixed(3);

const STEP_STATES = [
    { mode: 'graph' },                                 // 0 five pages, arrows = links
    { mode: 'walk' },                                  // 1 random surfer: split evenly
    { mode: 'rank', src: 'plain', it: 0 },             // 2 everyone starts equal
    { mode: 'rank', src: 'plain', it: 1 },             // 3 one round
    { mode: 'rank', src: 'plain', it: 20, drain: true }, // 4 D and E drain away
    { mode: 'rank', src: 'damped', it: 1, tele: true }, // 5 teleport share
    { mode: 'rank', src: 'damped', it: 30, final: true }, // 6 converged (thumbnail)
    { mode: 'interactive' },                           // 7 slide the damping
    { mode: 'rank', src: 'damped', it: 30, final: true, caveats: true }, // 8 fine print
];

const EDGES = NAMES.flatMap((s) => LINKS[s].map((t) => ({ s, t })));
const hasReverse = (s, t) => LINKS[t].includes(s);

// Straight arrow between node borders; two-way pairs are nudged apart.
function edgeGeometry(s, t, rS, rT) {
    const [x1, y1] = POS[s];
    const [x2, y2] = POS[t];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const off = hasReverse(s, t) ? 7 : 0;
    const px = -uy * off, py = ux * off;
    return {
        ax: x1 + ux * (rS + 2) + px, ay: y1 + uy * (rS + 2) + py,
        bx: x2 - ux * (rT + 5) + px, by: y2 - uy * (rT + 5) + py,
        mx: (x1 + x2) / 2 + px * 2.4, my: (y1 + y2) / 2 + py * 2.4,
    };
}

function Graph({ ranks, showProb, reduced, dim }) {
    const radii = ranks.map(rad);
    return (
        <g>
            <defs>
                <marker id="prArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" fill={NEUTRAL} fillOpacity="0.7" />
                </marker>
            </defs>
            {EDGES.map(({ s, t }) => {
                const g = edgeGeometry(s, t, radii[NAMES.indexOf(s)], radii[NAMES.indexOf(t)]);
                return (
                    <g key={`${s}${t}`}>
                        <line x1={g.ax} y1={g.ay} x2={g.bx} y2={g.by} stroke={NEUTRAL} strokeOpacity={dim ? 0.3 : 0.6}
                            strokeWidth="1.5" markerEnd="url(#prArrow)" />
                        {showProb && (
                            <text x={g.mx} y={g.my + 4} textAnchor="middle" fontSize="12" fontWeight="700"
                                fontFamily="monospace" fill={SECOND}>
                                {LINKS[s].length === 1 ? '1' : '0.5'}
                            </text>
                        )}
                    </g>
                );
            })}
            {NAMES.map((n, i) => {
                const [x, y] = POS[n];
                return (
                    <g key={n}>
                        {reduced ? (
                            <circle cx={x} cy={y} r={radii[i]} fill={ACCENT} fillOpacity="0.75" stroke={ACCENT} strokeWidth="2" />
                        ) : (
                            <motion.circle cx={x} cy={y} initial={false} animate={{ r: radii[i] }}
                                transition={{ duration: 0.35 }} fill={ACCENT} fillOpacity="0.75" stroke={ACCENT} strokeWidth="2" />
                        )}
                        <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff"
                            stroke="rgba(0,0,0,0.55)" strokeWidth="0.6" paintOrder="stroke">{n}</text>
                        <text x={x} y={y + radii[i] + 15} textAnchor="middle" fontSize="12" fontWeight="700"
                            fontFamily="monospace" fill={NEUTRAL} fillOpacity="0.85">
                            {showProb ? '' : f3(ranks[i])}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}

export default function PageRankVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const reduced = useReducedMotion();
    const interactive = state.mode === 'interactive';

    const [dPct, setDPct] = useState(85);
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setDPct(85);
    }

    let ranks = PLAIN[0];
    let caption = '';
    if (state.mode === 'graph') {
        caption = 'five pages · an arrow means "this page links to that one"';
    } else if (state.mode === 'walk') {
        caption = 'a surfer picks one link at random: 0.5 each, or 1 if there is only one';
    } else if (state.mode === 'rank') {
        const hist = state.src === 'plain' ? PLAIN : DAMPED;
        ranks = hist[Math.min(state.it, hist.length - 1)];
        if (state.src === 'plain') {
            caption = state.it === 0 ? 'start: every page holds 0.200'
                : state.drain ? `after ${state.it} rounds, D and E hold almost nothing`
                    : `after round ${state.it}: C is up, D and E are down`;
        } else if (state.tele) {
            caption = 'round 1 with teleport: every page also gets 0.15 ÷ 5 = 0.030 free';
        } else {
            caption = state.caveats ? 'a ranking of pages, not of truth: popular ≠ correct'
                : 'converged (d = 0.85): C > A > B > D = E';
        }
    } else {
        ranks = BY_D[Math.max(0, Math.min(99, dPct))];
        caption = `converged ranks when the surfer follows links ${dPct}% of the time`;
    }

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A five-page web drawn as circles joined by arrows. Circle size grows with PageRank, which is computed by repeatedly passing each page's rank along its outgoing links">
                <text x="200" y="16" textAnchor="middle" fontSize="12" fontWeight="700" fill={NEUTRAL} fillOpacity="0.85">
                    {state.mode === 'rank' && state.src === 'plain' ? `follow links only · round ${state.it}`
                        : state.mode === 'rank' ? (state.tele ? 'with teleport (d = 0.85) · round 1' : 'with teleport (d = 0.85) · converged')
                            : state.mode === 'interactive' ? `damping d = ${(dPct / 100).toFixed(2)}`
                                : 'a tiny web'}
                </text>
                <Graph ranks={ranks} showProb={state.mode === 'walk'} reduced={reduced} dim={state.mode === 'walk'} />
                <text x="200" y="284" textAnchor="middle" fontSize="12" fill={state.drain ? BAD : NEUTRAL}
                    fillOpacity={state.drain ? 1 : 0.75} fontWeight={state.drain ? 700 : 400}>{caption}</text>
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                        Damping d
                        <input type="range" min="0" max="99" step="1" value={dPct}
                            onChange={(e) => setDPct(Number(e.target.value))}
                            aria-label="Damping factor, percent of the time the surfer follows a link" className="cursor-pointer" />
                    </label>
                    <span className="text-xs font-mono text-text-muted">d = {(dPct / 100).toFixed(2)}</span>
                    <button onClick={() => setDPct(85)}
                        className="flex items-center gap-1.5 text-xs font-medium text-text-muted bg-bg-elevated border border-border-default rounded-lg px-3 py-2 hover:text-text-secondary transition-colors cursor-pointer">
                        <RotateCcw size={12} /> Reset
                    </button>
                </div>
            )}
        </div>
    );
}
