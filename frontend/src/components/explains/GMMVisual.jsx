import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw } from 'lucide-react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Gaussian Mixture visual — two overlapping bell-shaped groups fitted by EM.
// Points come from a fixed-seed generator and every E-step / M-step below is
// computed for real at module load (full 2x2 covariances, soft responsibilities,
// log-likelihood). Pure SVG; step states clamp defensively.
// ──────────────────────────────────────────────────────────────────────────────

const COLORS = ['var(--accent-primary)', 'var(--secondary)'];

// Deterministic pseudo-random normals (LCG + Box-Muller) — no Math.random.
function makeNormals(seed) {
    let s = seed;
    const u = () => { s = (s * 1664525 + 1013904223) % 4294967296; return (s + 1) / 4294967297; };
    return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
const randn = makeNormals(7);
const PTS = [];
for (let i = 0; i < 16; i++) { // group A: wide and tilted
    const a = randn() * 34, b = randn() * 11;
    PTS.push([115 + a * 0.85 - b * 0.5, 120 + a * 0.5 + b * 0.85]);
}
for (let i = 0; i < 16; i++) { // group B: tighter, lower right
    PTS.push([265 + randn() * 22, 195 + randn() * 24]);
}

const gauss = (p, mu, S) => {
    const [a, b, c] = S; // [[a,b],[b,c]]
    const det = a * c - b * b;
    const dx = p[0] - mu[0], dy = p[1] - mu[1];
    const q = (c * dx * dx - 2 * b * dx * dy + a * dy * dy) / det;
    return Math.exp(-0.5 * q) / (2 * Math.PI * Math.sqrt(det));
};

function estep(params) {
    let ll = 0;
    const resp = PTS.map((p) => {
        const w = params.map((g) => g.pi * gauss(p, g.mu, g.S));
        const tot = w[0] + w[1];
        ll += Math.log(tot);
        return w.map((v) => v / tot);
    });
    return { resp, ll };
}

function mstep(resp) {
    return [0, 1].map((k) => {
        const nk = resp.reduce((s, r) => s + r[k], 0);
        const mu = [
            PTS.reduce((s, p, i) => s + resp[i][k] * p[0], 0) / nk,
            PTS.reduce((s, p, i) => s + resp[i][k] * p[1], 0) / nk,
        ];
        let a = 0, b = 0, c = 0;
        PTS.forEach((p, i) => {
            const dx = p[0] - mu[0], dy = p[1] - mu[1];
            a += resp[i][k] * dx * dx; b += resp[i][k] * dx * dy; c += resp[i][k] * dy * dy;
        });
        return { pi: nk / PTS.length, mu, S: [a / nk + 1e-3, b / nk, c / nk + 1e-3] };
    });
}

// Snapshot k holds the parameters in force, plus responsibilities under them.
const INIT = [
    { pi: 0.5, mu: [150, 150], S: [1600, 0, 1600] },
    { pi: 0.5, mu: [240, 160], S: [1600, 0, 1600] },
];
const SNAPS = [];
{
    let params = INIT;
    for (let it = 0; it <= 25; it++) {
        const { resp, ll } = estep(params);
        SNAPS.push({ params, resp, ll, iter: it });
        const next = mstep(resp);
        const moved = next.some((g, k) => Math.hypot(g.mu[0] - params[k].mu[0], g.mu[1] - params[k].mu[1]) > 0.01);
        params = next;
        if (!moved) break;
    }
}
const FINAL = SNAPS[SNAPS.length - 1];
const LL_MIN = SNAPS[0].ll, LL_MAX = FINAL.ll;
const MID = SNAPS[Math.min(3, SNAPS.length - 1)];

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'snap', snap: SNAPS[0], soft: false },
    { mode: 'snap', snap: SNAPS[0], soft: true },
    { mode: 'snap', snap: SNAPS[1], soft: true },
    { mode: 'snap', snap: MID, soft: true },
    { mode: 'interactive' },
    { mode: 'snap', snap: FINAL, soft: true },
    { mode: 'curve' },
];

const ellipse = (g) => {
    const [a, b, c] = g.S;
    const m = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
    const l1 = m + d, l2 = Math.max(m - d, 1e-6);
    const ang = (0.5 * Math.atan2(2 * b, a - c) * 180) / Math.PI;
    return { rx: 2 * Math.sqrt(l1), ry: 2 * Math.sqrt(l2), ang };
};

// Membership: circle = component 0, square = component 1 (by larger responsibility).
const Point = ({ x, y, r }) => {
    const k = r && r[1] > r[0] ? 1 : 0;
    const common = { stroke: 'currentColor', strokeOpacity: 0.25, strokeWidth: 1 };
    const fill = (c, o) => ({ fill: c, fillOpacity: o });
    if (!r) return <circle cx={x} cy={y} r="5.5" fill="currentColor" fillOpacity="0.35" {...common} />;
    const shape = (props) => (k === 1
        ? <rect x={x - 5.5} y={y - 5.5} width="11" height="11" rx="2" {...props} />
        : <circle cx={x} cy={y} r="6" {...props} />);
    return (
        <g>
            {shape({ ...fill(COLORS[0], r[0]), ...common })}
            {shape({ ...fill(COLORS[1], r[1] * 0.9), stroke: 'none' })}
        </g>
    );
};

const Gauss = ({ g, color, animate }) => {
    const e = ellipse(g);
    const Tag = animate ? motion.g : 'g';
    const props = animate
        ? { initial: false, animate: { x: g.mu[0], y: g.mu[1], rotate: e.ang }, transition: { type: 'spring', stiffness: 90, damping: 18 } }
        : { transform: `translate(${g.mu[0]} ${g.mu[1]}) rotate(${e.ang})` };
    return (
        <Tag {...props}>
            <ellipse rx={e.rx} ry={e.ry} fill={color} fillOpacity="0.08" stroke={color} strokeWidth="2" />
            <line x1="-5" y1="0" x2="5" y2="0" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <line x1="0" y1="-5" x2="0" y2="5" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </Tag>
    );
};

function Curve({ upto }) {
    const x0 = 50, x1 = 360, y0 = 230, y1 = 70;
    const n = SNAPS.length;
    const px = (i) => x0 + ((x1 - x0) * i) / Math.max(n - 1, 1);
    const py = (v) => y0 - ((y0 - y1) * (v - LL_MIN)) / Math.max(LL_MAX - LL_MIN, 1e-9);
    const pts = SNAPS.slice(0, upto + 1).map((s, i) => `${px(i)},${py(s.ll)}`).join(' ');
    return (
        <g>
            <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="currentColor" strokeOpacity="0.3" />
            <line x1={x0} y1={y0} x2={x0} y2={y1 - 10} stroke="currentColor" strokeOpacity="0.3" />
            <polyline points={pts} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" />
            {SNAPS.map((s, i) => <circle key={i} cx={px(i)} cy={py(s.ll)} r="3" fill="var(--accent-primary)" />)}
            <text x={(x0 + x1) / 2} y="256" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">EM iteration</text>
            <text x="14" y="150" fontSize="11" fill="currentColor" fillOpacity="0.7" transform="rotate(-90 14 150)" textAnchor="middle">log-likelihood</text>
            <text x="360" y="62" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">
                {SNAPS[0].ll.toFixed(1)} → {LL_MAX.toFixed(1)}
            </text>
        </g>
    );
}

export default function GMMVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    const reducedMotion = useReducedMotion();

    const [it, setIt] = useState(0);
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setIt(0);
    }
    const done = it >= SNAPS.length - 1;

    let snap = null, soft = true;
    if (state.mode === 'snap') { snap = state.snap; soft = state.soft; }
    else if (interactive) snap = SNAPS[it];

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Points fitted by two Gaussian bell-shaped groups, drawn as ellipses that move and reshape as the EM algorithm iterates">
                {state.mode === 'curve' ? (
                    <Curve upto={SNAPS.length - 1} />
                ) : (
                    <>
                        <rect x="20" y="30" width="360" height="250" rx="10" fill="none" stroke="currentColor" strokeOpacity="0.12" />
                        {PTS.map((p, i) => (
                            <Point key={i} x={p[0]} y={p[1]}
                                r={snap ? (soft ? snap.resp[i] : (snap.resp[i][1] > snap.resp[i][0] ? [0, 1] : [1, 0])) : null} />
                        ))}
                        {snap && snap.params.map((g, k) => (
                            <Gauss key={k} g={g} color={COLORS[k]} animate={!reducedMotion} />
                        ))}
                        {state.mode === 'intro' && (
                            <text x="200" y="272" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                                32 points — two overlapping groups, no labels
                            </text>
                        )}
                        {snap && (
                            <text x="368" y="50" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                                {snap === FINAL ? 'converged' : `iteration ${snap.iter}`} · log-lik {snap.ll.toFixed(1)}
                            </text>
                        )}
                    </>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex flex-wrap items-center gap-2">
                    <button onClick={() => setIt((s) => Math.min(s + 1, SNAPS.length - 1))} disabled={done}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-primary rounded-lg px-3 py-2 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer">
                        <Play size={12} /> Run one EM round
                    </button>
                    <button onClick={() => setIt(0)}
                        className="flex items-center gap-1.5 text-xs font-medium text-text-muted bg-bg-elevated border border-border-default rounded-lg px-3 py-2 hover:text-text-secondary transition-colors cursor-pointer">
                        <RotateCcw size={12} /> Reset
                    </button>
                    <span className="text-xs font-mono text-text-muted">
                        round {it} · log-lik {SNAPS[it].ll.toFixed(1)}
                        {done && <span className="text-emerald-500 font-bold">  — converged!</span>}
                    </span>
                </div>
            )}
        </div>
    );
}
