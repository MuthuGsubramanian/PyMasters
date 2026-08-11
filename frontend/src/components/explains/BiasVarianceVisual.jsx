import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Bias-variance visual — 18 points sampled from a hidden curve plus noise, split
// 12 train / 6 test. Polynomials of increasing degree are fit to the train set
// with real least squares (Vandermonde + Gaussian elimination), computed once at
// module load. Nothing here is faked: every curve and every RMSE number on
// screen comes from the same fit the essay describes.
// ──────────────────────────────────────────────────────────────────────────────

const N_POINTS = 18;
const DEGREES = [1, 2, 3, 4, 5, 6, 7, 8];

// Small deterministic LCG (not Math.random) so the "noisy" data is reproducible
// on every load while still looking irregular.
function lcgSeeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        return s / 4294967296;
    };
}

function vanderRow(x, degree) {
    const row = [];
    let p = 1;
    for (let d = 0; d <= degree; d++) { row.push(p); p *= x; }
    return row;
}

// Solve a small linear system by Gaussian elimination with partial pivoting.
function solveLinearSystem(A, b) {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        [M[col], M[piv]] = [M[piv], M[col]];
        const pv = M[col][col];
        if (Math.abs(pv) < 1e-12) continue;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const factor = M[r][col] / pv;
            for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
        }
    }
    return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

// Ordinary least squares polynomial fit via the normal equations.
function fitPolynomial(xs, ys, degree) {
    const k = degree + 1;
    const XtX = Array.from({ length: k }, () => Array(k).fill(0));
    const Xty = Array(k).fill(0);
    xs.forEach((x, i) => {
        const row = vanderRow(x, degree);
        for (let a = 0; a < k; a++) {
            Xty[a] += row[a] * ys[i];
            for (let bIdx = 0; bIdx < k; bIdx++) XtX[a][bIdx] += row[a] * row[bIdx];
        }
    });
    return solveLinearSystem(XtX, Xty);
}

function evalPolynomial(coefs, x) {
    let p = 1, sum = 0;
    for (let d = 0; d < coefs.length; d++) { sum += coefs[d] * p; p *= x; }
    return sum;
}

function rmse(coefs, xs, ys) {
    let sq = 0;
    xs.forEach((x, i) => { const e = evalPolynomial(coefs, x) - ys[i]; sq += e * e; });
    return Math.sqrt(sq / xs.length);
}

// ── The dataset: 18 points from cos(1.5*pi*x) plus noise, held out every 3rd. ──
const rand = lcgSeeded(42);
const XS = [], YS = [], IS_TEST = [];
for (let i = 0; i < N_POINTS; i++) {
    const x = i / (N_POINTS - 1);
    const noise = (rand() - 0.5) * 0.5;
    XS.push(x);
    YS.push(Math.cos(1.5 * Math.PI * x) + noise);
    IS_TEST.push(i % 3 === 2);
}
const TRAIN_X = XS.filter((_, i) => !IS_TEST[i]);
const TRAIN_Y = YS.filter((_, i) => !IS_TEST[i]);
const TEST_X = XS.filter((_, i) => IS_TEST[i]);
const TEST_Y = YS.filter((_, i) => IS_TEST[i]);

// Real fit + real RMSE for every candidate degree.
const RESULTS = DEGREES.map((degree) => {
    const coefs = fitPolynomial(TRAIN_X, TRAIN_Y, degree);
    return {
        degree,
        coefs,
        trainRmse: rmse(coefs, TRAIN_X, TRAIN_Y),
        testRmse: rmse(coefs, TEST_X, TEST_Y),
    };
});
const BEST = RESULTS.reduce((a, b) => (b.testRmse < a.testRmse ? b : a));
const byDegree = (d) => RESULTS.find((r) => r.degree === d);

// ── Plot geometry (shared by the data/fit views) ──
const PLOT = { x0: 46, x1: 378, y0: 244, y1: 40 };
const XDOM = [0, 1];
const YDOM = [-1.5, 3.1];
const px = (x) => PLOT.x0 + ((x - XDOM[0]) / (XDOM[1] - XDOM[0])) * (PLOT.x1 - PLOT.x0);
const py = (y) => PLOT.y0 - ((y - YDOM[0]) / (YDOM[1] - YDOM[0])) * (PLOT.y0 - PLOT.y1);

function curvePath(coefs, samples = 60) {
    let d = '';
    for (let i = 0; i <= samples; i++) {
        const x = i / samples;
        const y = evalPolynomial(coefs, x);
        d += `${i === 0 ? 'M' : 'L'}${px(x).toFixed(1)},${py(y).toFixed(1)} `;
    }
    return d.trim();
}

// Error-curve plot geometry (degree on x, RMSE on y).
const EDOM_X = [1, 8];
const EDOM_Y = [0, 1.25];
const epx = (d) => PLOT.x0 + ((d - EDOM_X[0]) / (EDOM_X[1] - EDOM_X[0])) * (PLOT.x1 - PLOT.x0);
const epy = (v) => PLOT.y0 - ((Math.min(v, EDOM_Y[1]) - EDOM_Y[0]) / (EDOM_Y[1] - EDOM_Y[0])) * (PLOT.y0 - PLOT.y1);
const trainErrPath = RESULTS.map((r, i) => `${i === 0 ? 'M' : 'L'}${epx(r.degree).toFixed(1)},${epy(r.trainRmse).toFixed(1)} `).join('');
const testErrPath = RESULTS.map((r, i) => `${i === 0 ? 'M' : 'L'}${epx(r.degree).toFixed(1)},${epy(r.testRmse).toFixed(1)} `).join('');

// Points are shaped as well as coloured: train = circle, test = square.
const DataPoint = ({ x, y, isTest }) => {
    const cx = px(x), cy = py(y);
    const color = isTest ? 'var(--secondary)' : 'var(--accent-primary)';
    if (isTest) return <rect x={cx - 5} y={cy - 5} width="10" height="10" rx="2" fill={color} fillOpacity="0.85" stroke="currentColor" strokeOpacity="0.2" />;
    return <circle cx={cx} cy={cy} r="5.5" fill={color} fillOpacity="0.85" stroke="currentColor" strokeOpacity="0.2" />;
};

const PlotFrame = () => (
    <>
        <rect x={PLOT.x0} y={PLOT.y1} width={PLOT.x1 - PLOT.x0} height={PLOT.y0 - PLOT.y1} fill="none" stroke="currentColor" strokeOpacity="0.12" />
        <line x1={PLOT.x0} y1={py(0)} x2={PLOT.x1} y2={py(0)} stroke="currentColor" strokeOpacity="0.08" />
    </>
);

const fitStyle = (degree) => {
    if (degree === 1) return { stroke: 'var(--secondary)', dash: '7 4' };
    if (degree === 8) return { stroke: 'var(--destructive)', dash: '1.5 3' };
    return { stroke: 'var(--accent-primary)', dash: 'none' };
};

const verdictFor = (degree) => {
    if (degree <= 2) return { text: 'underfitting — too simple', color: 'var(--secondary)' };
    if (degree >= 6) return { text: 'overfitting — too wiggly', color: 'var(--destructive)' };
    if (degree === BEST.degree) return { text: 'sweet spot', color: 'var(--accent-primary)' };
    return { text: 'close to the sweet spot', color: 'var(--accent-primary)' };
};

const STEP_STATES = [
    { mode: 'points' },
    { mode: 'fit', degree: 1 },
    { mode: 'fit', degree: 8 },
    { mode: 'compareFit' },
    { mode: 'fit', degree: BEST.degree },
    { mode: 'interactive' },
    { mode: 'errorCurve' },
    { mode: 'errorCurve', annotate: true },
];

export default function BiasVarianceVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];

    const [degree, setDegree] = useState(BEST.degree);
    const interactive = state.mode === 'interactive';
    const activeDegree = interactive ? degree : state.degree;
    const activeResult = activeDegree ? byDegree(activeDegree) : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Scatter of train and test points with polynomial curves of varying complexity fit to the train points">

                {state.mode !== 'errorCurve' && <PlotFrame />}

                {/* Data/fit views */}
                {state.mode !== 'errorCurve' && XS.map((x, i) => (
                    <DataPoint key={i} x={x} y={YS[i]} isTest={IS_TEST[i]} />
                ))}

                {state.mode === 'fit' && activeResult && (
                    <path d={curvePath(activeResult.coefs)} fill="none"
                        stroke={fitStyle(activeDegree).stroke} strokeWidth="2.25"
                        strokeDasharray={fitStyle(activeDegree).dash === 'none' ? undefined : fitStyle(activeDegree).dash} />
                )}

                {state.mode === 'compareFit' && (
                    <>
                        <path d={curvePath(byDegree(1).coefs)} fill="none" stroke="var(--secondary)" strokeWidth="2" strokeDasharray="7 4" />
                        <path d={curvePath(byDegree(8).coefs)} fill="none" stroke="var(--destructive)" strokeWidth="2" strokeDasharray="1.5 3" />
                    </>
                )}

                {(state.mode === 'fit' || state.mode === 'interactive') && activeResult && (
                    <text x="368" y="58" textAnchor="end" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                        degree {activeDegree} · train {activeResult.trainRmse.toFixed(3)} · test {activeResult.testRmse.toFixed(3)}
                    </text>
                )}

                {state.mode === 'points' && (
                    <text x="212" y="272" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                        18 points — 12 to learn from (circles), 6 held back to test (squares)
                    </text>
                )}
                {state.mode === 'compareFit' && (
                    <>
                        <text x="52" y="270" fontSize="10.5" fill="var(--secondary)" fontWeight="700">dashed = degree 1 (underfit)</text>
                        <text x="52" y="284" fontSize="10.5" fill="var(--destructive)" fontWeight="700">dotted = degree 8 (overfit)</text>
                    </>
                )}
                {state.mode === 'fit' && activeDegree === BEST.degree && (
                    <text x="212" y="272" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent-primary)">
                        lowest test error of all eight degrees tried
                    </text>
                )}

                {/* Error-curve view */}
                {state.mode === 'errorCurve' && (
                    <>
                        <rect x={PLOT.x0} y={PLOT.y1} width={PLOT.x1 - PLOT.x0} height={PLOT.y0 - PLOT.y1} fill="none" stroke="currentColor" strokeOpacity="0.12" />
                        <rect x={epx(1)} y={PLOT.y1} width={epx(2.5) - epx(1)} height={PLOT.y0 - PLOT.y1} fill="var(--secondary)" fillOpacity="0.06" />
                        <rect x={epx(5.5)} y={PLOT.y1} width={epx(8) - epx(5.5)} height={PLOT.y0 - PLOT.y1} fill="var(--destructive)" fillOpacity="0.06" />
                        <path d={trainErrPath} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="5 3" />
                        <path d={testErrPath} fill="none" stroke="var(--secondary)" strokeWidth="2.25" />
                        {RESULTS.map((r) => (
                            <circle key={r.degree} cx={epx(r.degree)} cy={epy(r.testRmse)} r={r.degree === BEST.degree ? 5 : 2.5}
                                fill={r.degree === BEST.degree ? 'var(--accent-primary)' : 'var(--secondary)'}
                                stroke={r.degree === BEST.degree ? 'currentColor' : 'none'} strokeOpacity="0.3" />
                        ))}
                        <text x="52" y="52" fontSize="10.5" fill="currentColor" fillOpacity="0.65">dashed = train error</text>
                        <text x="52" y="66" fontSize="10.5" fill="var(--secondary)" fontWeight="700">solid = test error</text>
                        <text x={epx(BEST.degree)} y={epy(BEST.testRmse) - 12} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--accent-primary)">
                            sweet spot: degree {BEST.degree}
                        </text>
                        <text x="212" y="266" textAnchor="middle" fontSize="10.5" fill="currentColor" fillOpacity="0.6">polynomial degree (model complexity) →</text>
                        {state.annotate && (
                            <text x="212" y="34" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                                in practice, cross-validation finds this point without ever looking at the real test set
                            </text>
                        )}
                    </>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 space-y-1.5">
                    <div className="flex items-center gap-3">
                        <label htmlFor="bv-degree" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                            degree = {degree}
                        </label>
                        <input
                            id="bv-degree" type="range" min="1" max="8" step="1" value={degree}
                            onChange={(e) => setDegree(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer"
                            aria-label="Polynomial degree"
                        />
                    </div>
                    <span className="text-xs font-bold" style={{ color: verdictFor(degree).color }}>
                        {verdictFor(degree).text}
                    </span>
                </div>
            )}
        </div>
    );
}
