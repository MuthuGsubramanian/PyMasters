import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Gradient Boosting (XGBoost) visual — a curvy 1-D regression target and a
// boosted ensemble of REAL depth-1 trees (stumps) fit to residuals at module
// load. The staircase prediction visibly sharpens as trees are added.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
//
// Data space: x ∈ [0, 10], y ∈ [0, 7]. Screen y inverted.
// ──────────────────────────────────────────────────────────────────────────────

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const XS = Array.from({ length: 24 }, (_, i) => (i * 10) / 23);
const targetFn = (x) => 3.6 + 2.2 * Math.sin(x * 0.75) + 0.25 * Math.sin(x * 3.1);
const YS = XS.map(targetFn);

const LR = 0.45;       // shrinkage — each tree only contributes a fraction
const MAX_TREES = 40;

// Fit MAX_TREES regression stumps sequentially, each on the current residuals.
const BASE = mean(YS);
const STUMPS = (() => {
    const stumps = [];
    let pred = XS.map(() => BASE);
    for (let t = 0; t < MAX_TREES; t++) {
        const res = YS.map((y, i) => y - pred[i]);
        let best = null;
        for (let i = 1; i < XS.length; i++) {
            const s = (XS[i - 1] + XS[i]) / 2;
            const L = res.filter((_, j) => XS[j] < s);
            const R = res.filter((_, j) => XS[j] >= s);
            if (!L.length || !R.length) continue;
            const ml = mean(L), mr = mean(R);
            const err = L.reduce((a, v) => a + (v - ml) ** 2, 0) + R.reduce((a, v) => a + (v - mr) ** 2, 0);
            if (!best || err < best.err) best = { s, ml, mr, err };
        }
        stumps.push(best);
        pred = pred.map((p, i) => p + LR * (XS[i] < best.s ? best.ml : best.mr));
    }
    return stumps;
})();

const predictAt = (x, k) => {
    let p = BASE;
    for (let t = 0; t < Math.min(k, STUMPS.length); t++) {
        const st = STUMPS[t];
        p += LR * (x < st.s ? st.ml : st.mr);
    }
    return p;
};

const sx = (x) => 42 + (x / 10) * 330;
const sy = (y) => 262 - (y / 7) * 224;

// Dense sampling renders the staircase faithfully.
const predPoints = (k) => {
    const pts = [];
    for (let x = 0; x <= 10.001; x += 0.05) pts.push(`${sx(x)},${sy(predictAt(x, k))}`);
    return pts.join(' ');
};

const STEP_STATES = [
    { mode: 'intro', k: 0 },
    { mode: 'trees', k: 1, label: '1 tree — a single split' },
    { mode: 'residuals', k: 1, label: '1 tree — its leftover errors' },
    { mode: 'trees', k: 2, prev: 1, label: '2 trees — the second fixes the first' },
    { mode: 'trees', k: 5, label: '5 trees' },
    { mode: 'trees', k: 30, label: '30 trees' },
    { mode: 'interactive' },
    { mode: 'final', k: 30 },
];

export default function XGBoostVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';

    const [userK, setUserK] = useState(8);
    const k = interactive ? userK : (state.k || 0);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Data points on a curvy pattern, approximated by a staircase prediction that sharpens as boosted trees are added">
                {/* Axes */}
                <line x1="38" y1="268" x2="380" y2="268" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                <text x="210" y="290" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.55">feature  →</text>
                <text x="14" y="150" fontSize="11" fill="currentColor" fillOpacity="0.55" transform="rotate(-90 14 150)" textAnchor="middle">target  →</text>

                {/* Previous ensemble, faint, for the "second tree fixes the first" step */}
                {state.prev != null && (
                    <polyline points={predPoints(state.prev)} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 4" />
                )}

                {/* Current ensemble prediction */}
                {k > 0 && (
                    <polyline points={predPoints(k)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinejoin="round" />
                )}

                {/* Residual segments: what the NEXT tree will be trained on */}
                {state.mode === 'residuals' && XS.map((x, i) => (
                    <line key={i} x1={sx(x)} y1={sy(YS[i])} x2={sx(x)} y2={sy(predictAt(x, 1))}
                        stroke="var(--destructive)" strokeOpacity="0.55" strokeWidth="1.5" />
                ))}

                {/* The data */}
                {XS.map((x, i) => (
                    <circle key={i} cx={sx(x)} cy={sy(YS[i])} r="5"
                        fill="currentColor" fillOpacity="0.45" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
                ))}

                {/* Caption */}
                {(state.label || interactive) && (
                    <text x="372" y="38" textAnchor="end" fontSize="12" fontFamily="monospace" fill="var(--accent-primary)">
                        {interactive ? `${k} tree${k === 1 ? '' : 's'}` : state.label}
                    </text>
                )}
                {state.mode === 'residuals' && (
                    <text x="372" y="54" textAnchor="end" fontSize="10" fill="var(--destructive)" fillOpacity="0.85">
                        red = residuals → the next tree's target
                    </text>
                )}
                {state.mode === 'final' && (
                    <g fontSize="10" fill="currentColor" fillOpacity="0.7">
                        <text x="372" y="54" textAnchor="end">each tree shrunk by η = {LR}</text>
                        <text x="372" y="68" textAnchor="end">+ regularisation on tree size</text>
                    </g>
                )}
            </svg>

            {/* Interactive controls */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="xgb-k" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                        trees = {userK}
                    </label>
                    <input id="xgb-k" type="range" min="1" max={MAX_TREES} value={userK}
                        onChange={(e) => setUserK(Number(e.target.value))}
                        className="flex-1 accent-[var(--accent-primary)] cursor-pointer" aria-label="Number of boosted trees" />
                </div>
            )}
        </div>
    );
}
