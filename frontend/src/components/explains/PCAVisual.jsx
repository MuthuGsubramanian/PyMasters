import { useState, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// PCA visual — one persistent scatter plot that evolves with the essay's steps
// (see pages/Explains.jsx). Pure SVG; the mean, covariance matrix, eigenvectors
// and eigenvalues are computed for real from the points at module load — the
// 2×2 eigenproblem has a closed form, so nothing below is hardcoded or faked.
//
// Data space: height ∈ [0, 10], weight ∈ [0, 10]. The screen uses the SAME
// pixels-per-unit on both axes so perpendicular projections LOOK perpendicular.
// ──────────────────────────────────────────────────────────────────────────────

const PTS = [
    [1.2, 2.0], [1.8, 2.9], [2.3, 2.2], [2.9, 3.8], [3.4, 3.1], [3.9, 4.6],
    [4.4, 3.9], [4.9, 5.4], [5.4, 4.7], [5.9, 6.1], [6.4, 5.3], [6.9, 6.8],
    [7.4, 6.2], [7.9, 7.6], [8.5, 6.9], [9.0, 8.1],
];

const S = 26; // px per data unit — identical for x and y (angles stay honest)
const sx = (x) => 60 + x * S;
const sy = (y) => 285 - y * S;

// Full PCA of a 2-D cloud: mean, sample covariance, closed-form eigen-decomposition.
function pca(pts) {
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n;
    const my = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    pts.forEach(([x, y]) => { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); });
    sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
    const half = (sxx + syy) / 2;
    const disc = Math.sqrt(half * half - (sxx * syy - sxy * sxy));
    const l1 = half + disc, l2 = half - disc; // eigenvalues, λ1 ≥ λ2
    const norm = Math.hypot(sxy, l1 - sxx);
    const v1 = [sxy / norm, (l1 - sxx) / norm]; // unit eigenvector for λ1
    const v2 = [-v1[1], v1[0]];                 // orthogonal ⇒ eigenvector for λ2
    return { mx, my, sxx, syy, sxy, l1, l2, v1, v2, deg: (Math.atan2(v1[1], v1[0]) * 180) / Math.PI };
}

const F = pca(PTS);
const TOTAL = F.l1 + F.l2;
const VE1 = (F.l1 / TOTAL) * 100;          // % variance kept by PC1  (≈ 98.1)
const VE2 = (F.l2 / TOTAL) * 100;          // % variance on PC2       (≈ 1.9)
const PC1_DEG = F.deg;                      // ≈ 37.6°
const F_SCALED = pca(PTS.map(([x, y]) => [x, y * 3])); // "weight in other units" caveat
const KEEP_X_ONLY = (F.sxx / TOTAL) * 100;  // dropping weight outright keeps ≈ 62%

// Variance of the cloud projected onto a unit axis at angle θ (radians):
// vᵀ Σ v  =  cos²θ·σxx + 2 sinθcosθ·σxy + sin²θ·σyy   — maximised exactly at PC1.
const varAtDeg = (deg) => {
    const t = (deg * Math.PI) / 180;
    return Math.cos(t) ** 2 * F.sxx + 2 * Math.sin(t) * Math.cos(t) * F.sxy + Math.sin(t) ** 2 * F.syy;
};

// Perpendicular projections of every point onto the axis (unit vector) through the mean.
const projectOnto = (vx, vy) => PTS.map(([x, y]) => {
    const t = (x - F.mx) * vx + (y - F.my) * vy;
    return { px: sx(x), py: sy(y), qx: sx(F.mx + t * vx), qy: sy(F.my + t * vy) };
});
const PROJ_PC1 = projectOnto(F.v1[0], F.v1[1]);

// A line through the mean at a given angle, drawn ±halfLen data units.
const axisLine = (deg, halfLen) => {
    const t = (deg * Math.PI) / 180;
    const dx = Math.cos(t) * halfLen, dy = Math.sin(t) * halfLen;
    return { x1: sx(F.mx - dx), y1: sy(F.my - dy), x2: sx(F.mx + dx), y2: sy(F.my + dy) };
};

const PC1_LINE = axisLine(PC1_DEG, 5.3);
const PC2_LINE = axisLine(PC1_DEG + 90, 2.1);
const SCALED_LINE = axisLine(F_SCALED.deg, 3.4);
const CANDIDATE_DEGS = [0, 65, 110, 155]; // deliberately none of them is PC1

const STEP_STATES = [
    { mode: 'cloud' },        // 0 — two correlated measurements
    { mode: 'candidates' },   // 1 — which direction holds the most variance?
    { mode: 'pc1' },          // 2 — PC1: the real top eigenvector
    { mode: 'project' },      // 3 — perpendicular drops: 2D → 1D
    { mode: 'variance' },     // 4 — how much did we keep?
    { mode: 'interactive' },  // 5 — rotate a candidate axis yourself
    { mode: 'full' },         // 6 — PC1 + PC2, the rotated system (index thumbnail)
    { mode: 'caveats' },      // 7 — scaling changes the answer
];

export default function PCAVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const { mode } = STEP_STATES[idx];
    const interactive = mode === 'interactive';

    // Interactive: reader rotates a candidate axis; captured variance is computed
    // for real from the covariance matrix at every angle.
    const [angle, setAngle] = useState(0);
    const { userLine, userProj, userVar, matched } = useMemo(() => {
        const v = varAtDeg(angle);
        const t = (angle * Math.PI) / 180;
        return {
            userLine: axisLine(angle, 5.3),
            userProj: projectOnto(Math.cos(t), Math.sin(t)),
            userVar: v,
            matched: v >= F.l1 - 0.005, // within a whisker of λ1 ⇒ found PC1
        };
    }, [angle]);

    const showPc1 = mode === 'pc1' || mode === 'project' || mode === 'variance' || mode === 'full' || mode === 'caveats';
    const showDrops = mode === 'project' || mode === 'variance' || mode === 'full';
    const drops = interactive ? userProj : PROJ_PC1;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A scatter plot of height versus weight with principal component axes fit through the cloud of points">
                {/* Axes */}
                <line x1="48" y1="272" x2="380" y2="272" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                <line x1="48" y1="272" x2="48" y2="30" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                <text x="214" y="292" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.55">height  →</text>
                <text x="24" y="150" fontSize="11" fill="currentColor" fillOpacity="0.55" transform="rotate(-90 24 150)" textAnchor="middle">weight  →</text>

                {/* Step 0: note that the two columns move together */}
                {mode === 'cloud' && (
                    <text x="372" y="44" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                        correlation ≈ 0.96
                    </text>
                )}

                {/* Step 1: candidate directions through the mean — none is quite right */}
                {mode === 'candidates' && (
                    <g>
                        {CANDIDATE_DEGS.map((d) => {
                            const l = axisLine(d, 4.6);
                            return <line key={d} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                                stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="5 4" />;
                        })}
                        <text x="372" y="44" textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">
                            which direction spreads the cloud most?
                        </text>
                    </g>
                )}

                {/* Perpendicular drop lines onto the active axis */}
                {(showDrops || interactive) && drops.map((d, i) => (
                    <line key={i} x1={d.px} y1={d.py} x2={d.qx} y2={d.qy}
                        stroke="var(--destructive)" strokeOpacity="0.5" strokeWidth="1.3" />
                ))}

                {/* PC1 — the real top eigenvector */}
                {showPc1 && (
                    <g>
                        <line x1={PC1_LINE.x1} y1={PC1_LINE.y1} x2={PC1_LINE.x2} y2={PC1_LINE.y2}
                            stroke="var(--accent-primary)" strokeWidth="2.5" />
                        <text x={PC1_LINE.x2 + 4} y={PC1_LINE.y2 - 6} fontSize="11" fontWeight="bold" fill="var(--accent-primary)">
                            {mode === 'full' ? `PC1 · ${VE1.toFixed(0)}%` : 'PC1'}
                        </text>
                        {mode === 'pc1' && (
                            <text x="372" y="44" textAnchor="end" fontSize="11" fontFamily="monospace" fill="var(--accent-primary)">
                                θ ≈ {PC1_DEG.toFixed(1)}°
                            </text>
                        )}
                    </g>
                )}

                {/* PC2 — the leftover direction (thumbnail step) */}
                {mode === 'full' && (
                    <g>
                        <line x1={PC2_LINE.x1} y1={PC2_LINE.y1} x2={PC2_LINE.x2} y2={PC2_LINE.y2}
                            stroke="var(--secondary)" strokeWidth="2" strokeDasharray="6 4" />
                        <text x={PC2_LINE.x2 - 2} y={PC2_LINE.y2 - 7} fontSize="11" fontWeight="bold" fill="var(--secondary)">
                            PC2 · {VE2.toFixed(0)}%
                        </text>
                    </g>
                )}

                {/* Projected shadows on the axis */}
                {(showDrops || interactive) && drops.map((d, i) => (
                    <circle key={i} cx={d.qx} cy={d.qy} r="3.4"
                        fill={interactive ? 'currentColor' : 'var(--accent-primary)'} fillOpacity="0.9" />
                ))}

                {/* Step 4: the honest bookkeeping — kept vs lost variance */}
                {mode === 'variance' && (
                    <g>
                        <text x="60" y="42" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                            kept on PC1: λ₁ = {F.l1.toFixed(2)}  ({VE1.toFixed(1)}%)
                        </text>
                        <text x="60" y="58" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                            lost: λ₂ = {F.l2.toFixed(2)}  ({VE2.toFixed(1)}%)
                        </text>
                        <rect x="60" y="66" width={200 * (VE1 / 100)} height="7" rx="2" fill="var(--accent-primary)" />
                        <rect x={60 + 200 * (VE1 / 100)} y="66" width={200 * (VE2 / 100)} height="7" rx="2"
                            fill="currentColor" fillOpacity="0.3" />
                    </g>
                )}

                {/* Interactive: the reader's candidate axis */}
                {interactive && (
                    <g>
                        <line x1={userLine.x1} y1={userLine.y1} x2={userLine.x2} y2={userLine.y2}
                            stroke="var(--accent-primary)" strokeWidth="2.5" />
                        <text x={userLine.x2 + 4} y={userLine.y2 - 6} fontSize="10" fill="var(--accent-primary)">your axis</text>
                    </g>
                )}

                {/* Step 7: rescale weight ×3 and PC1 swings — computed, not sketched */}
                {mode === 'caveats' && (
                    <g>
                        <line x1={SCALED_LINE.x1} y1={SCALED_LINE.y1} x2={SCALED_LINE.x2} y2={SCALED_LINE.y2}
                            stroke="var(--destructive)" strokeWidth="2" strokeDasharray="6 4" />
                        <text x={SCALED_LINE.x2 + 5} y={SCALED_LINE.y2 + 2} fontSize="10" fill="var(--destructive)">
                            weight ×3 → θ ≈ {F_SCALED.deg.toFixed(0)}°
                        </text>
                        <text x="372" y="44" textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">
                            same people, different units, different PC1
                        </text>
                    </g>
                )}

                {/* Mean point — every principal axis pivots here */}
                {mode !== 'cloud' && (
                    <circle cx={sx(F.mx)} cy={sy(F.my)} r="4" fill="var(--secondary)" opacity="0.85" />
                )}

                {/* The data */}
                {PTS.map(([x, y], i) => (
                    <circle key={i} cx={sx(x)} cy={sy(y)} r="6"
                        fill="currentColor" fillOpacity={mode === 'cloud' ? 0.55 : 0.4}
                        stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
                ))}
            </svg>

            {/* Interactive controls */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 space-y-2">
                    <div className="flex items-center gap-3">
                        <label htmlFor="pca-angle" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                            axis angle = {angle}°
                        </label>
                        <input id="pca-angle" type="range" min="0" max="180" value={angle}
                            onChange={(e) => setAngle(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer" aria-label="Candidate axis angle in degrees" />
                        <button onClick={() => setAngle(0)}
                            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary px-3 py-2 cursor-pointer">
                            <RotateCcw size={12} /> Reset
                        </button>
                    </div>
                    <p className="text-xs font-mono">
                        <span className="text-text-muted">captured variance: </span>
                        <span className={matched ? 'text-emerald-500 font-bold' : 'text-text-secondary font-bold'}>
                            {userVar.toFixed(2)}
                        </span>
                        <span className="text-text-muted">  ({((userVar / TOTAL) * 100).toFixed(1)}% of {TOTAL.toFixed(2)} total — max {F.l1.toFixed(2)})</span>
                        {matched && <span className="text-emerald-500 font-bold">  — you found PC1!</span>}
                    </p>
                </div>
            )}
        </div>
    );
}
