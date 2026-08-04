import { useState, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Regularization visual — a degree-8 polynomial fit through 10 noisy points
// (9 coefficients, barely more than the data can pin down), so unregularized
// least squares overfits dramatically. Ridge (L2) and Lasso (L1) are both
// computed for real: ridge via closed-form linear solve, lasso via coordinate
// descent with soft-thresholding. No numbers are hardcoded — every fit, every
// SSE, every "best lambda" is derived from TRAIN/HELDOUT at module load.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const DEGREE = 8;
const CX = 5.2, SX = 5.2; // normalize x onto roughly [-1, 1]
const XMIN = -0.8, XMAX = 10.8;
const YMIN = -3, YMAX = 13;

// Fixed data — 10 points to fit 9 coefficients, deliberately tight so a
// flexible curve can chase every wiggle instead of the trend.
const TRAIN = [
    [0.5, 2.1], [1.6, 2.0], [2.6, 3.0], [3.6, 2.7], [4.6, 3.8],
    [5.6, 3.9], [6.6, 5.1], [7.6, 4.5], [8.6, 5.7], [9.9, 5.4],
];
// Held back before any fitting — never touched during training.
const HELDOUT = [
    [1.1, 1.9], [3.1, 2.9], [5.1, 3.6], [7.1, 4.4], [9.1, 5.5],
];

const xNorm = (x) => (x - CX) / SX;
function polyFeatures(x) {
    const c = xNorm(x);
    const f = [1];
    for (let i = 1; i <= DEGREE; i++) f.push(f[i - 1] * c);
    return f;
}

// Gaussian elimination with partial pivoting — solves A·beta = b for beta.
function solveLinear(Ain, bin) {
    const n = bin.length;
    const A = Ain.map((row) => row.slice());
    const b = bin.slice();
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
        [A[col], A[piv]] = [A[piv], A[col]];
        [b[col], b[piv]] = [b[piv], b[col]];
        const d = A[col][col];
        for (let c = col; c < n; c++) A[col][c] /= d;
        b[col] /= d;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const factor = A[r][col];
            if (factor === 0) continue;
            for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c];
            b[r] -= factor * b[col];
        }
    }
    return b;
}

// Ridge regression, closed form: beta = (Phi'Phi + lambda*P)^-1 Phi'y — the
// intercept (index 0) is never penalized, matching real implementations.
function ridgeFit(points, lambda) {
    const n = DEGREE + 1;
    const M = Array.from({ length: n }, () => new Array(n).fill(0));
    const c = new Array(n).fill(0);
    points.forEach(([x, y]) => {
        const f = polyFeatures(x);
        for (let i = 0; i < n; i++) {
            c[i] += f[i] * y;
            for (let j = 0; j < n; j++) M[i][j] += f[i] * f[j];
        }
    });
    for (let i = 1; i < n; i++) M[i][i] += lambda;
    return solveLinear(M, c);
}

// Lasso via coordinate descent with soft-thresholding — the mechanism that
// can push a coefficient to exactly zero, which ridge's smooth penalty can't.
function lassoFit(points, lambda, iters = 300) {
    const n = DEGREE + 1;
    const F = points.map(([x]) => polyFeatures(x));
    const Y = points.map(([, y]) => y);
    let beta = new Array(n).fill(0);
    const colNormSq = new Array(n).fill(0).map((_, j) => F.reduce((s, f) => s + f[j] * f[j], 0));
    for (let it = 0; it < iters; it++) {
        for (let j = 0; j < n; j++) {
            let rho = 0;
            for (let i = 0; i < F.length; i++) {
                let pred = 0;
                for (let k = 0; k < n; k++) if (k !== j) pred += F[i][k] * beta[k];
                rho += F[i][j] * (Y[i] - pred);
            }
            if (j === 0) beta[j] = rho / colNormSq[j];
            else if (rho > lambda / 2) beta[j] = (rho - lambda / 2) / colNormSq[j];
            else if (rho < -lambda / 2) beta[j] = (rho + lambda / 2) / colNormSq[j];
            else beta[j] = 0;
        }
    }
    return beta;
}

const predict = (beta, x) => polyFeatures(x).reduce((s, v, i) => s + v * beta[i], 0);
const sseOf = (points, beta) => points.reduce((s, [x, y]) => s + (y - predict(beta, x)) ** 2, 0);

// Nearly-unregularized fit — this is what plain least squares produces here.
const OLS = ridgeFit(TRAIN, 1e-6);

// Search a lambda grid for the value that minimizes held-out error — the
// only honest way to pick it (never look at the test set's answer, just its score).
const LAMBDA_GRID = [];
for (let e = -3; e <= 2; e += 0.5) LAMBDA_GRID.push(Math.pow(10, e));
const GRID_RESULTS = LAMBDA_GRID.map((lambda) => {
    const beta = ridgeFit(TRAIN, lambda);
    return { lambda, beta, train: sseOf(TRAIN, beta), heldout: sseOf(HELDOUT, beta) };
});
const BEST = GRID_RESULTS.reduce((a, b) => (b.heldout < a.heldout ? b : a));
const RIDGE_STAR = BEST.beta;
const LAMBDA_STAR = BEST.lambda;

const LASSO_LAMBDA = 0.5;
const LASSO = lassoFit(TRAIN, LASSO_LAMBDA);

const DIAL_LAMBDAS = [1e-6, 0.1, 10];
const DIAL_FITS = DIAL_LAMBDAS.map((lambda) => ridgeFit(TRAIN, lambda));

const sx = (x) => 45 + ((x - XMIN) / (XMAX - XMIN)) * 320;
const clampY = (y) => Math.max(YMIN, Math.min(YMAX, y));
const sy = (y) => 262 - ((clampY(y) - YMIN) / (YMAX - YMIN)) * 232;

// Sample a fitted curve into an SVG path (piecewise-linear, dense enough to read as smooth).
function curvePath(beta) {
    const steps = 90;
    let d = '';
    for (let i = 0; i <= steps; i++) {
        const x = XMIN + (i / steps) * (XMAX - XMIN);
        const y = predict(beta, x);
        d += `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)} `;
    }
    return d;
}
const OLS_PATH = curvePath(OLS);
const RIDGE_STAR_PATH = curvePath(RIDGE_STAR);
const DIAL_PATHS = DIAL_FITS.map(curvePath);

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'overfit' },
    { mode: 'formula' },
    { mode: 'dial' },
    { mode: 'interactive' },
    { mode: 'errorcurve' },
    { mode: 'sweetspot' },
    { mode: 'compare' },
];

const TrainPoint = ({ x, y }) => (
    <circle cx={sx(x)} cy={sy(y)} r="5.5" fill="currentColor" fillOpacity="0.55"
        stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
);
// Held-out points render as diamonds — a shape difference, not just a color/opacity one.
const HeldoutPoint = ({ x, y }) => {
    const px = sx(x), py = sy(y);
    return (
        <polygon points={`${px},${py - 6.5} ${px + 6.5},${py} ${px},${py + 6.5} ${px - 6.5},${py}`}
            fill="var(--secondary)" fillOpacity="0.85" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
    );
};

export default function RegularizationVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const { mode } = STEP_STATES[idx];

    // Interactive: reader drags a log-scale lambda slider; ridge is refit live.
    const [raw, setRaw] = useState(0); // 0..500 -> log10(lambda) in [-4, 2]
    const log10Lambda = -4 + (raw / 500) * 6;
    const lambda = Math.pow(10, log10Lambda);
    const { trainErr, heldoutErr, path: livePath } = useMemo(() => {
        const b = ridgeFit(TRAIN, lambda);
        return { trainErr: sseOf(TRAIN, b), heldoutErr: sseOf(HELDOUT, b), path: curvePath(b) };
    }, [lambda]);

    const showHeldout = mode === 'interactive' || mode === 'sweetspot';

    // Error-curve scene uses its own little chart, independent of the scatter axes.
    const chartX = (log10l) => 50 + ((log10l - (-3)) / 5) * 310;
    const maxErr = Math.max(...GRID_RESULTS.map((g) => Math.max(g.train, g.heldout)));
    const chartY = (err) => 258 - (Math.min(err, maxErr) / maxErr) * 200;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label={
                    mode === 'errorcurve'
                        ? 'Line chart of training error rising and held-out error dipping then rising as the penalty strength increases'
                        : mode === 'compare'
                            ? 'Bar chart comparing coefficient sizes for unregularized, ridge, and lasso fits'
                            : 'A scatter plot of points with a curve fit through them, showing how a penalty tames an overly wiggly fit'
                }>

                {(mode === 'errorcurve') && (
                    <g>
                        <line x1="50" y1="258" x2="360" y2="258" stroke="currentColor" strokeOpacity="0.25" />
                        <line x1="50" y1="258" x2="50" y2="40" stroke="currentColor" strokeOpacity="0.25" />
                        <text x="205" y="284" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.55">
                            penalty strength (log scale) →
                        </text>
                        <text x="20" y="150" fontSize="11" fill="currentColor" fillOpacity="0.55" transform="rotate(-90 20 150)" textAnchor="middle">error →</text>
                        <path d={GRID_RESULTS.map((g, i) => `${i === 0 ? 'M' : 'L'}${chartX(Math.log10(g.lambda)).toFixed(1)},${chartY(g.train).toFixed(1)}`).join(' ')}
                            fill="none" stroke="var(--destructive)" strokeWidth="2" />
                        <path d={GRID_RESULTS.map((g, i) => `${i === 0 ? 'M' : 'L'}${chartX(Math.log10(g.lambda)).toFixed(1)},${chartY(g.heldout).toFixed(1)}`).join(' ')}
                            fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" />
                        <circle cx={chartX(Math.log10(LAMBDA_STAR))} cy={chartY(BEST.heldout)} r="5" fill="none" stroke="var(--accent-primary)" strokeWidth="2" />
                        <line x1={chartX(Math.log10(LAMBDA_STAR))} y1={chartY(BEST.heldout)} x2={chartX(Math.log10(LAMBDA_STAR))} y2="258"
                            stroke="var(--accent-primary)" strokeOpacity="0.4" strokeDasharray="3 3" />
                        <text x="358" y="44" textAnchor="end" fontSize="10" fontFamily="monospace" fill="var(--destructive)">training error</text>
                        <text x="358" y="58" textAnchor="end" fontSize="10" fontFamily="monospace" fill="var(--accent-primary)">held-out error</text>
                        <text x={chartX(Math.log10(LAMBDA_STAR))} y={chartY(BEST.heldout) - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--accent-primary)">
                            lowest held-out error here
                        </text>
                    </g>
                )}

                {(mode === 'compare') && (() => {
                    const groups = [
                        { name: 'OLS', beta: OLS, color: 'var(--destructive)' },
                        { name: 'Ridge', beta: RIDGE_STAR, color: 'var(--accent-primary)' },
                        { name: 'Lasso', beta: LASSO, color: 'var(--secondary)' },
                    ];
                    const nCoef = DEGREE; // exclude intercept
                    const groupW = 320 / nCoef;
                    const barW = groupW / 3.6;
                    const baseline = 172;
                    const scaleLog = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v)) * 42;
                    return (
                        <g>
                            <line x1="35" y1={baseline} x2="380" y2={baseline} stroke="currentColor" strokeOpacity="0.3" />
                            {groups.map((g, gi) => (
                                <g key={g.name}>
                                    <rect x={40 + gi * 90} y="16" width="10" height="10" fill={g.color} rx="2" />
                                    <text x={54 + gi * 90} y="25" fontSize="11" fontWeight="700" fill={g.color}>{g.name}</text>
                                </g>
                            ))}
                            {Array.from({ length: nCoef }, (_, ci) => {
                                const gx = 50 + ci * groupW;
                                return (
                                    <g key={ci}>
                                        {groups.map((g, gi) => {
                                            const val = g.beta[ci + 1];
                                            const h = scaleLog(val);
                                            const bx = gx + gi * (barW + 2);
                                            const isZero = Math.abs(val) < 0.02;
                                            return isZero ? (
                                                <circle key={g.name} cx={bx + barW / 2} cy={baseline} r="2.5" fill={g.color} fillOpacity="0.7" />
                                            ) : (
                                                <rect key={g.name} x={bx} y={h >= 0 ? baseline - h : baseline} width={barW}
                                                    height={Math.abs(h)} fill={g.color} fillOpacity="0.85" rx="1" />
                                            );
                                        })}
                                        <text x={gx + groupW / 2 - 3} y="266" textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.55">
                                            β{ci + 1}
                                        </text>
                                    </g>
                                );
                            })}
                            <text x="200" y="292" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.55">
                                log-scaled coefficient size (dot = exactly zero)
                            </text>
                        </g>
                    );
                })()}

                {mode !== 'errorcurve' && mode !== 'compare' && (
                    <g>
                        <rect x="30" y="30" width="350" height="232" fill="none" stroke="currentColor" strokeOpacity="0.1" />

                        {mode === 'overfit' && <path d={OLS_PATH} fill="none" stroke="var(--destructive)" strokeWidth="2.5" />}

                        {mode === 'formula' && (
                            <>
                                <path d={OLS_PATH} fill="none" stroke="var(--destructive)" strokeWidth="1.5" strokeOpacity="0.35" strokeDasharray="4 3" />
                                <path d={RIDGE_STAR_PATH} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" />
                                <text x="200" y="46" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                                    loss + λ · Σ β²
                                </text>
                            </>
                        )}

                        {mode === 'dial' && DIAL_PATHS.map((p, i) => (
                            <path key={i} d={p} fill="none"
                                stroke={i === 0 ? 'var(--destructive)' : i === 1 ? 'var(--accent-primary)' : 'var(--secondary)'}
                                strokeWidth={i === 1 ? 2.5 : 2} strokeOpacity={i === 1 ? 1 : 0.75}
                                strokeDasharray={i === 0 ? '4 3' : i === 2 ? '2 4' : undefined} />
                        ))}

                        {(mode === 'interactive') && <path d={livePath} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" />}

                        {mode === 'sweetspot' && (
                            <>
                                <path d={OLS_PATH} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1.5" strokeDasharray="4 3" />
                                <path d={RIDGE_STAR_PATH} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" />
                            </>
                        )}

                        {TRAIN.map(([x, y], i) => <TrainPoint key={i} x={x} y={y} />)}
                        {showHeldout && HELDOUT.map(([x, y], i) => <HeldoutPoint key={i} x={x} y={y} />)}

                        {mode === 'intro' && (
                            <text x="205" y="278" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                                10 points, 9 coefficients to fit — not much slack
                            </text>
                        )}
                        {mode === 'overfit' && (
                            <text x="368" y="46" textAnchor="end" fontSize="10" fontFamily="monospace" fill="var(--destructive)">
                                β₅≈{OLS[5].toFixed(0)}  β₇≈{OLS[7].toFixed(0)}
                            </text>
                        )}
                        {mode === 'dial' && (
                            <text x="368" y="46" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                                λ = {DIAL_LAMBDAS.map((l) => (l < 0.001 ? '~0' : l >= 1 ? l.toFixed(0) : l.toFixed(2))).join(' · ')}
                            </text>
                        )}
                        {mode === 'sweetspot' && (
                            <text x="205" y="278" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent-primary)">
                                λ* ≈ {LAMBDA_STAR.toFixed(2)} — chosen from held-out error alone
                            </text>
                        )}
                    </g>
                )}
            </svg>

            {mode === 'interactive' && (
                <div className="flex-shrink-0 pt-2 space-y-2">
                    <div className="flex items-center gap-3">
                        <label htmlFor="reg-lambda" className="text-[11px] font-mono text-text-muted flex-shrink-0 w-20">
                            λ = {lambda < 0.01 ? lambda.toExponential(1) : lambda.toFixed(2)}
                        </label>
                        <input id="reg-lambda" type="range" min="0" max="500" value={raw}
                            onChange={(e) => setRaw(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer" aria-label="Ridge penalty strength, lambda, on a log scale" />
                        <button onClick={() => setRaw(0)}
                            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary cursor-pointer">
                            <RotateCcw size={12} /> Reset
                        </button>
                    </div>
                    <p className="text-xs font-mono">
                        <span className="text-text-muted">train error: </span>
                        <span className="text-text-secondary font-bold">{trainErr.toFixed(2)}</span>
                        <span className="text-text-muted">   held-out error: </span>
                        <span className={heldoutErr <= BEST.heldout * 1.15 ? 'text-emerald-500 font-bold' : 'text-text-secondary font-bold'}>
                            {heldoutErr.toFixed(2)}
                        </span>
                    </p>
                </div>
            )}
        </div>
    );
}
