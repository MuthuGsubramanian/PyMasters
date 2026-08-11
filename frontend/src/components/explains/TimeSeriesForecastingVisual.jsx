import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Time-series forecasting visual — a 36-month synthetic series (real trend +
// real multiplicative seasonality + deterministic noise, generated once at
// module load with a seeded LCG, never Math.random). Three forecasters are
// then run against the same held-out 12 months and scored with real MAE:
// naive persistence, seasonal naive, and a two-pass classical decomposition
// (trend + seasonal index) fit with closed-form OLS. Nothing on screen is
// precomputed by hand — every line, bar and number comes from this module's
// arithmetic, same as the bias-variance essay's polynomial fits.
// ──────────────────────────────────────────────────────────────────────────────

function lcgSeeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        return s / 4294967296;
    };
}

const N = 36;
const TRAIN_END = 24; // months 0..23 train, 24..35 test
const SEASONAL_TRUE = [0.85, 0.80, 0.95, 1.00, 1.05, 1.08, 1.10, 1.05, 0.98, 0.95, 1.05, 1.14];
const trueTrend = (t) => 100 + 2.5 * t;

const rand = lcgSeeded(7);
const Y = [];
for (let t = 0; t < N; t++) {
    const noise = (rand() - 0.5) * 6;
    Y.push(trueTrend(t) * SEASONAL_TRUE[t % 12] + noise);
}

function ols(xs, ys) {
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - meanX) * (ys[i] - meanY); den += (xs[i] - meanX) ** 2; }
    const slope = num / den;
    return { slope, intercept: meanY - slope * meanX };
}

const trainT = Array.from({ length: TRAIN_END }, (_, t) => t);
const trainY = trainT.map((t) => Y[t]);
const testT = Array.from({ length: N - TRAIN_END }, (_, i) => TRAIN_END + i);

// Pass 1: naive trend on raw train data, used only to estimate the seasonal index.
const fit1 = ols(trainT, trainY);
const ratios = trainT.map((t, i) => trainY[i] / (fit1.intercept + fit1.slope * t));
const seasonalEst = Array(12).fill(0);
const seasonalCount = Array(12).fill(0);
trainT.forEach((t, i) => { seasonalEst[t % 12] += ratios[i]; seasonalCount[t % 12]++; });
for (let m = 0; m < 12; m++) seasonalEst[m] /= seasonalCount[m];

// Pass 2: deseasonalize with the estimated index, refit the trend on that.
const deseason = trainT.map((t, i) => trainY[i] / seasonalEst[t % 12]);
const fit2 = ols(trainT, deseason);

const trendLine = Array.from({ length: N }, (_, t) => fit2.intercept + fit2.slope * t);

const forecastNaive = (t) => Y[t - 1];
const forecastSeasonalNaive = (t) => Y[t - 12];
const forecastDecomp = (t) => (fit2.intercept + fit2.slope * t) * seasonalEst[t % 12];

function scoreTest(forecastFn) {
    let sum = 0, n = 0;
    for (let t = TRAIN_END; t < N; t++) { sum += Math.abs(Y[t] - forecastFn(t)); n++; }
    return sum / n;
}
const MAE_NAIVE = scoreTest(forecastNaive);
const MAE_SEASONAL_NAIVE = scoreTest(forecastSeasonalNaive);
const MAE_DECOMP = scoreTest(forecastDecomp);

function movingAvg(arr, w) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        const slice = arr.slice(Math.max(0, i - w + 1), i + 1);
        out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return out;
}

// ── Time-axis plot geometry ──
const PLOT = { x0: 46, x1: 378, y0: 244, y1: 40 };
const TDOM = [0, N - 1];
const YDOM = [70, 226];
const px = (t) => PLOT.x0 + ((t - TDOM[0]) / (TDOM[1] - TDOM[0])) * (PLOT.x1 - PLOT.x0);
const py = (v) => PLOT.y0 - ((v - YDOM[0]) / (YDOM[1] - YDOM[0])) * (PLOT.y0 - PLOT.y1);
const linePath = (values, from, to) => {
    let d = '';
    for (let t = from; t <= to; t++) d += `${t === from ? 'M' : 'L'}${px(t).toFixed(1)},${py(values[t]).toFixed(1)} `;
    return d.trim();
};

const PlotFrame = () => (
    <>
        <rect x={PLOT.x0} y={PLOT.y1} width={PLOT.x1 - PLOT.x0} height={PLOT.y0 - PLOT.y1} fill="none" stroke="currentColor" strokeOpacity="0.12" />
        <line x1={px(TRAIN_END - 0.5)} y1={PLOT.y1} x2={px(TRAIN_END - 0.5)} y2={PLOT.y0} stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 3" />
        <text x={px(TRAIN_END - 0.5) - 6} y={PLOT.y1 + 12} textAnchor="end" fontSize="9.5" fill="currentColor" fillOpacity="0.55">train</text>
        <text x={px(TRAIN_END - 0.5) + 6} y={PLOT.y1 + 12} fontSize="9.5" fill="currentColor" fillOpacity="0.55">test</text>
    </>
);

// Actual values: train = circle, test = square — shape carries the split, not just position.
const ActualPoint = ({ t, isTest }) => {
    const cx = px(t), cy = py(Y[t]);
    if (isTest) return <rect x={cx - 4.5} y={cy - 4.5} width="9" height="9" rx="1.5" fill="var(--secondary)" fillOpacity="0.9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />;
    return <circle cx={cx} cy={cy} r="4" fill="var(--accent-primary)" fillOpacity="0.55" />;
};

// Forecast markers: outlined diamond, distinct from the filled actual shapes.
const ForecastDiamond = ({ t, value }) => {
    const cx = px(t), cy = py(value);
    return <polygon points={`${cx},${cy - 6.5} ${cx + 6.5},${cy} ${cx},${cy + 6.5} ${cx - 6.5},${cy}`}
        fill="none" stroke="var(--destructive)" strokeWidth="2" />;
};

const ErrorStem = ({ t, forecastValue }) => (
    <line x1={px(t)} y1={py(Y[t])} x2={px(t)} y2={py(forecastValue)} stroke="var(--destructive)" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
);

// ── Bar-chart geometry, reused for both the seasonal-index and MAE-comparison views ──
const barGeom = (n, gap = 10) => {
    const w = (PLOT.x1 - PLOT.x0 - gap * (n - 1)) / n;
    return { w, xAt: (i) => PLOT.x0 + i * (w + gap) };
};

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const STEP_STATES = [
    { mode: 'series' },
    { mode: 'naive' },
    { mode: 'trend' },
    { mode: 'seasonalIndex' },
    { mode: 'smoothing' },
    { mode: 'seasonalNaive' },
    { mode: 'compare' },
    { mode: 'decompForecast' },
];

export default function TimeSeriesForecastingVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'smoothing';

    const [maWindow, setMaWindow] = useState(3);
    const smoothed = movingAvg(Y, interactive ? maWindow : 3);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Monthly time series with trend and seasonality, alongside forecasts and their errors against held-out months">

                {(state.mode !== 'seasonalIndex' && state.mode !== 'compare') && <PlotFrame />}

                {/* Base series — shown under every time-axis view */}
                {state.mode !== 'seasonalIndex' && state.mode !== 'compare' && (
                    <>
                        <path d={linePath(Y, 0, TRAIN_END - 1)} fill="none" stroke="var(--accent-primary)" strokeOpacity="0.45" strokeWidth="1.5" />
                        <path d={linePath(Y, TRAIN_END - 1, N - 1)} fill="none" stroke="var(--secondary)" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 3" />
                        {Y.map((_, t) => <ActualPoint key={t} t={t} isTest={t >= TRAIN_END} />)}
                    </>
                )}

                {state.mode === 'series' && (
                    <text x="212" y="272" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                        36 months — 24 to learn from, 12 held back to test forecasts
                    </text>
                )}

                {/* Naive persistence forecast on the test window */}
                {state.mode === 'naive' && (
                    <>
                        {testT.map((t) => (
                            <g key={t}>
                                <ErrorStem t={t} forecastValue={forecastNaive(t)} />
                                <ForecastDiamond t={t} value={forecastNaive(t)} />
                            </g>
                        ))}
                        <text x="368" y="52" textAnchor="end" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                            naive MAE {MAE_NAIVE.toFixed(2)}
                        </text>
                    </>
                )}

                {/* Trend line, first pass, extended across the whole range */}
                {state.mode === 'trend' && (
                    <path d={linePath(trendLine, 0, N - 1)}
                        fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeDasharray="6 3" opacity="0.9" />
                )}
                {state.mode === 'trend' && (
                    <text x="368" y="52" textAnchor="end" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                        fitted slope ≈ {fit2.slope.toFixed(2)}/mo
                    </text>
                )}

                {/* Seasonal index bar chart */}
                {state.mode === 'seasonalIndex' && (() => {
                    const { w, xAt } = barGeom(12, 6);
                    const base = 150;
                    const scale = 400;
                    return (
                        <>
                            <line x1={PLOT.x0} y1={base} x2={PLOT.x1} y2={base} stroke="currentColor" strokeOpacity="0.25" />
                            {seasonalEst.map((v, m) => {
                                const h = Math.abs(v - 1) * scale;
                                const y = v >= 1 ? base - h : base;
                                const above = v >= 1;
                                return (
                                    <g key={m}>
                                        <rect x={xAt(m)} y={y} width={w} height={h}
                                            fill={above ? 'var(--accent-primary)' : 'var(--secondary)'} fillOpacity="0.8" rx="1.5" />
                                        <text x={xAt(m) + w / 2} y={base + 16} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                                            {MONTH_LABELS[m]}
                                        </text>
                                    </g>
                                );
                            })}
                            <text x="212" y="266" textAnchor="middle" fontSize="10.5" fill="currentColor" fillOpacity="0.6">
                                estimated seasonal index by month (1.0 = average)
                            </text>
                        </>
                    );
                })()}

                {/* Smoothing overlay (interactive) */}
                {state.mode === 'smoothing' && (
                    <path d={linePath(smoothed, 0, N - 1)} fill="none" stroke="var(--accent-primary)" strokeWidth="2.25" />
                )}

                {/* Seasonal-naive forecast on the test window */}
                {state.mode === 'seasonalNaive' && (
                    <>
                        {testT.map((t) => (
                            <g key={t}>
                                <ErrorStem t={t} forecastValue={forecastSeasonalNaive(t)} />
                                <ForecastDiamond t={t} value={forecastSeasonalNaive(t)} />
                            </g>
                        ))}
                        <text x="368" y="52" textAnchor="end" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                            seasonal-naive MAE {MAE_SEASONAL_NAIVE.toFixed(2)}
                        </text>
                    </>
                )}

                {/* MAE comparison bar chart (also the thumbnail, stepIndex 6) */}
                {state.mode === 'compare' && (() => {
                    const rows = [
                        { label: 'naive', value: MAE_NAIVE, color: 'var(--secondary)' },
                        { label: 'seasonal naive', value: MAE_SEASONAL_NAIVE, color: 'var(--destructive)' },
                        { label: 'trend + season', value: MAE_DECOMP, color: 'var(--accent-primary)' },
                    ];
                    const maxV = Math.max(...rows.map((r) => r.value));
                    const rowH = 56, x0 = 130, xMax = 358;
                    return (
                        <>
                            {rows.map((r, i) => {
                                const y = 56 + i * rowH;
                                const w = (r.value / maxV) * (xMax - x0);
                                return (
                                    <g key={r.label}>
                                        <text x={x0 - 10} y={y + 18} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.75">{r.label}</text>
                                        <rect x={x0} y={y} width={w} height="26" rx="4" fill={r.color} fillOpacity="0.85" />
                                        <text x={x0 + w + 8} y={y + 18} fontSize="11" fontFamily="monospace" fontWeight="700" fill="currentColor">
                                            {r.value.toFixed(1)}
                                        </text>
                                    </g>
                                );
                            })}
                            <text x="212" y="278" textAnchor="middle" fontSize="10.5" fill="currentColor" fillOpacity="0.6">
                                mean absolute error on the 12 held-out months (lower is better)
                            </text>
                        </>
                    );
                })()}

                {/* Final decomposition forecast overlay */}
                {state.mode === 'decompForecast' && (
                    <>
                        {testT.map((t) => (
                            <g key={t}>
                                <ErrorStem t={t} forecastValue={forecastDecomp(t)} />
                                <ForecastDiamond t={t} value={forecastDecomp(t)} />
                            </g>
                        ))}
                        <text x="368" y="52" textAnchor="end" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                            trend+season MAE {MAE_DECOMP.toFixed(2)}
                        </text>
                    </>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 space-y-1.5">
                    <div className="flex items-center gap-3">
                        <label htmlFor="ts-window" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                            window = {maWindow} mo
                        </label>
                        <input
                            id="ts-window" type="range" min="1" max="12" step="1" value={maWindow}
                            onChange={(e) => setMaWindow(Number(e.target.value))}
                            className="flex-1 accent-[var(--accent-primary)] cursor-pointer"
                            aria-label="Moving-average window size in months"
                        />
                    </div>
                    <span className="text-xs text-text-muted">
                        {maWindow <= 2 ? 'barely smoothed — still jagged' : maWindow >= 11 ? 'averages a full year — flattest, most lag' : 'smoother, but starting to lag turns'}
                    </span>
                </div>
            )}
        </div>
    );
}
