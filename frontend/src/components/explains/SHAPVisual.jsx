import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// SHAP visual — a tiny 3-feature house-price model (boosted-stump style, with a
// real feature interaction) explained by EXACT Shapley values: all 3! feature
// orderings are enumerated and marginal contributions averaged, with missing
// features marginalised over an 8-house background set (interventional SHAP).
// Every number on screen — base value, per-order marginals, φ values, the
// waterfall, the efficiency check — is computed below at module load.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const COLORS = ['var(--accent-primary)', 'var(--secondary)', 'var(--destructive)'];
const FEATURES = [
    { key: 'size', label: 'size 150m²+', short: 'size' },
    { key: 'age', label: 'built recently', short: 'age' },
    { key: 'dist', label: 'near centre', short: 'location' },
];

// The model: base rate plus three stump rules and one interaction —
// exactly the shape a small boosted-tree ensemble learns.
const predict = ([size, age, dist]) =>
    2.0 +
    (size > 120 ? 1.8 : 0) +
    (age < 10 ? 0.9 : 0) +
    (dist < 5 ? 1.2 : 0) +
    (size > 120 && dist < 5 ? 0.6 : 0);

// Background population the "missing feature" averages come from.
const BACKGROUND = [
    [85, 25, 12], [100, 15, 8], [130, 5, 3], [70, 40, 15],
    [145, 8, 6], [110, 12, 4], [160, 2, 2], [90, 20, 10],
];

const HOUSES = [
    { name: 'A · big, new, central', x: [150, 4, 2] },
    { name: 'B · small, old, far out', x: [95, 30, 12] },
    { name: 'C · big but old & far', x: [150, 30, 12] },
];

// v(S): expected prediction when only features in S are known — the rest are
// filled in from every background row and averaged (interventional SHAP).
const valueOf = (x, S) => {
    let sum = 0;
    for (const b of BACKGROUND) {
        const mixed = b.map((bv, i) => (S.includes(i) ? x[i] : bv));
        sum += predict(mixed);
    }
    return sum / BACKGROUND.length;
};

const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

// Exact Shapley values: average each feature's marginal over all 3! orders.
function shapley(x) {
    const phi = [0, 0, 0];
    const orders = PERMS.map((perm) => {
        const S = [];
        const marginals = {};
        for (const i of perm) {
            const before = valueOf(x, S);
            S.push(i);
            const after = valueOf(x, S);
            marginals[i] = after - before;
            phi[i] += (after - before) / PERMS.length;
        }
        return { perm, marginals };
    });
    return { phi, orders };
}

const BASE = valueOf(HOUSES[0].x, []); // v(∅) — same for every instance
const EXPLAINED = HOUSES.map((h) => ({
    ...h,
    pred: predict(h.x),
    ...shapley(h.x),
}));

const fmt = (v, signed = true) => `${signed && v >= 0 ? '+' : ''}${v.toFixed(2)}`;

const STEP_STATES = [
    { mode: 'blackbox' },
    { mode: 'orders2' },
    { mode: 'orders6' },
    { mode: 'waterfall', house: 0, partial: true },
    { mode: 'waterfall', house: 0 },
    { mode: 'waterfall', house: 2 },
    { mode: 'waterfall', house: 0, showCheck: true }, // thumbnail
    { mode: 'interactive' },
    { mode: 'waterfall', house: 0, faded: true },
];

// Waterfall geometry: value axis 0..8 → y 250..40.
const vy = (v) => 250 - (v / 8) * 210;

function Waterfall({ house, partial = false, showCheck = false, faded = false }) {
    const h = EXPLAINED[house];
    // Features ordered by |φ| descending, SHAP-plot style.
    const order = [0, 1, 2].sort((a, b) => Math.abs(h.phi[b]) - Math.abs(h.phi[a]));
    const shown = partial ? order.slice(0, 1) : order;
    const bars = shown.reduce((acc, i, idx) => {
        const from = idx === 0 ? BASE : acc[idx - 1].to;
        acc.push({ i, from, to: from + h.phi[i], x: 120 + idx * 72 });
        return acc;
    }, []);
    return (
        <g opacity={faded ? 0.35 : 1}>
            {/* Base value line */}
            <line x1="40" y1={vy(BASE)} x2="380" y2={vy(BASE)} stroke="currentColor" strokeOpacity="0.3" strokeDasharray="4 4" />
            <text x="42" y={vy(BASE) - 6} fontSize="10" fill="currentColor" fillOpacity="0.65">
                base value {BASE.toFixed(2)} (average house)
            </text>

            {bars.map(({ i, from, to, x }) => (
                <g key={i}>
                    <rect x={x} y={Math.min(vy(from), vy(to))} width="46"
                        height={Math.max(2, Math.abs(vy(from) - vy(to)))} rx="4"
                        fill={COLORS[i]} fillOpacity="0.8" />
                    <line x1={x + 46} y1={vy(to)} x2={x + 72} y2={vy(to)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 3" />
                    <text x={x + 23} y={Math.min(vy(from), vy(to)) - 6} textAnchor="middle" fontSize="10"
                        fontFamily="monospace" fill={COLORS[i]}>
                        {fmt(h.phi[i])}
                    </text>
                    <text x={x + 23} y="268" textAnchor="middle" fontSize="9.5" fill="currentColor" fillOpacity="0.7">
                        {FEATURES[i].short}
                    </text>
                </g>
            ))}

            {/* Final prediction marker */}
            {!partial && (
                <g>
                    <line x1={336} y1={vy(h.pred)} x2="380" y2={vy(h.pred)} stroke="currentColor" strokeOpacity="0.6" strokeWidth="2" />
                    <text x="378" y={vy(h.pred) - 8} textAnchor="end" fontSize="11" fontWeight="700" fill="currentColor" fillOpacity="0.9">
                        prediction {h.pred.toFixed(2)}
                    </text>
                </g>
            )}
            <text x="210" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fillOpacity="0.85">
                {h.name}
            </text>
            {showCheck && (
                <text x="210" y="290" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                    check: {BASE.toFixed(2)} {h.phi.map((p) => fmt(p)).join(' ')} = {h.pred.toFixed(2)} — it adds up exactly
                </text>
            )}
        </g>
    );
}

export default function SHAPVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    const [userHouse, setUserHouse] = useState(0);

    const A = EXPLAINED[0];
    // Two contrasting orders for the "order matters" step: size first vs size last.
    const orderFirst = A.orders.find((o) => o.perm[0] === 0);
    const orderLast = A.orders.find((o) => o.perm[2] === 0);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A small model's prediction decomposed into exact Shapley values, shown as a waterfall from the base value to the prediction">

                {state.mode === 'blackbox' && (
                    <g>
                        <rect x="140" y="100" width="120" height="80" rx="12" fill="currentColor" fillOpacity="0.08"
                            stroke="currentColor" strokeOpacity="0.4" />
                        <text x="200" y="135" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" fillOpacity="0.85">the model</text>
                        <text x="200" y="152" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.55">(hundreds of trees)</text>
                        {FEATURES.map((f, i) => (
                            <g key={f.key}>
                                <text x="52" y={112 + i * 28} fontSize="10" fill={COLORS[i]}>{f.label}</text>
                                <line x1="118" y1={108 + i * 28} x2="138" y2={125 + i * 9} stroke={COLORS[i]} strokeWidth="1.5" strokeOpacity="0.7" />
                            </g>
                        ))}
                        <line x1="260" y1="140" x2="300" y2="140" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
                        <text x="310" y="132" fontSize="16" fontWeight="700" fontFamily="monospace" fill="currentColor" fillOpacity="0.9">{A.pred.toFixed(1)}</text>
                        <text x="310" y="148" fontSize="10" fill="currentColor" fillOpacity="0.6">price score</text>
                        <text x="200" y="240" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.7">…but WHY {A.pred.toFixed(1)}?</text>
                    </g>
                )}

                {state.mode === 'orders2' && (
                    <g>
                        <text x="200" y="40" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fillOpacity="0.85">
                            what did "size" contribute? depends when you ask
                        </text>
                        {[{ o: orderFirst, y: 80, label: 'size revealed first' }, { o: orderLast, y: 175, label: 'size revealed last' }].map(({ o, y, label }) => (
                            <g key={label}>
                                <text x="52" y={y - 8} fontSize="10" fill="currentColor" fillOpacity="0.65">{label}</text>
                                <rect x="52" y={y} width={Math.abs(o.marginals[0]) * 90} height="18" rx="4" fill={COLORS[0]} fillOpacity="0.8" />
                                <text x={58 + Math.abs(o.marginals[0]) * 90} y={y + 13} fontSize="11" fontFamily="monospace" fill={COLORS[0]}>
                                    {fmt(o.marginals[0])}
                                </text>
                            </g>
                        ))}
                        <text x="200" y="262" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                            same feature, same house — different credit. Order is arbitrary; that's the problem.
                        </text>
                    </g>
                )}

                {state.mode === 'orders6' && (
                    <g>
                        <text x="200" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fillOpacity="0.85">
                            Shapley's fix: score "size" in ALL 6 orders, then average
                        </text>
                        {A.orders.map((o, r) => (
                            <g key={r}>
                                <text x="52" y={62 + r * 26} fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">
                                    {o.perm.map((i) => FEATURES[i].short).join(' → ')}
                                </text>
                                <rect x="185" y={52 + r * 26} width={Math.abs(o.marginals[0]) * 70} height="14" rx="3" fill={COLORS[0]} fillOpacity="0.75" />
                                <text x={190 + Math.abs(o.marginals[0]) * 70} y={63 + r * 26} fontSize="10" fontFamily="monospace" fill={COLORS[0]}>
                                    {fmt(o.marginals[0])}
                                </text>
                            </g>
                        ))}
                        <line x1="52" y1="218" x2="360" y2="218" stroke="currentColor" strokeOpacity="0.3" />
                        <text x="52" y="238" fontSize="11" fontWeight="700" fill={COLORS[0]}>
                            average = φ(size) = {fmt(A.phi[0])}
                        </text>
                        <text x="52" y="256" fontSize="9.5" fill="currentColor" fillOpacity="0.6">
                            the one fair number no ordering can argue with
                        </text>
                    </g>
                )}

                {(state.mode === 'waterfall') && (
                    <Waterfall house={state.house} partial={state.partial} showCheck={state.showCheck} faded={state.faded} />
                )}

                {interactive && <Waterfall house={userHouse} showCheck />}
            </svg>

            {/* Interactive: pick a house to explain */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex flex-wrap items-center gap-2">
                    {EXPLAINED.map((h, i) => (
                        <button key={h.name} onClick={() => setUserHouse(i)}
                            className={`text-xs font-medium rounded-lg px-3 py-2 border transition-colors cursor-pointer ${
                                i === userHouse
                                    ? 'bg-accent-subtle text-accent-primary border-accent-primary/50 font-bold'
                                    : 'bg-bg-elevated text-text-muted border-border-default hover:text-text-secondary'
                            }`}>
                            {h.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
