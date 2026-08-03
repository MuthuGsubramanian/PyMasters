// ──────────────────────────────────────────────────────────────────────────────
// EDA visual — one dataset (houses) examined with more and more variables at
// once: raw table → histogram (univariate) → scatter (bivariate) → colour-coded
// scatter and correlation heatmap (multivariate) → Simpson's paradox warning.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const NEW = 'var(--accent-primary)';   // newer houses
const OLD = 'var(--secondary)';        // older houses

// [size (0-10), price (0-7), old?] — sizes vs prices, older homes cheaper.
const HOUSES = [
    [0.6, 1.7, 1], [1.3, 2.4, 0], [2.0, 1.6, 1], [2.7, 3.0, 0], [3.4, 2.2, 1],
    [4.1, 3.6, 0], [4.8, 2.9, 1], [5.5, 4.4, 0], [6.2, 3.6, 1], [6.9, 5.0, 0],
    [7.6, 4.2, 1], [8.3, 5.7, 0], [9.0, 4.9, 1], [9.5, 6.1, 0],
];
const sx = (x) => 45 + (x / 10) * 320;
const sy = (y) => 262 - (y / 7) * 222;

// Right-skewed price histogram: bin counts + where mean/median land.
const HIST = [3, 5, 8, 6, 3, 2, 1, 1];
const MEDIAN_BIN = 2.4, MEAN_BIN = 3.3; // mean dragged right by the tail

// Correlation matrix for size / price / age / distance-to-centre.
const VARS = ['size', 'price', 'age', 'dist'];
const CORR = [
    [1, 0.86, -0.23, 0.05],
    [0.86, 1, -0.41, -0.62],
    [-0.23, -0.41, 1, 0.18],
    [0.05, -0.62, 0.18, 1],
];

// Simpson's paradox: within each district price rises with size; pooled, it falls.
const DOWNTOWN = [[0.8, 5.1], [1.5, 5.4], [2.2, 5.5], [2.9, 5.9], [3.6, 6.2], [1.9, 5.9]];
const SUBURB = [[5.8, 2.1], [6.5, 2.4], [7.2, 2.6], [7.9, 3.0], [8.6, 3.2], [9.3, 3.5]];

const STEP_STATES = [
    { mode: 'table' },
    { mode: 'hist' },
    { mode: 'hist_stats' },
    { mode: 'scatter' },
    { mode: 'scatter_r' },
    { mode: 'multi' },
    { mode: 'heatmap' },   // thumbnail
    { mode: 'simpson' },
];

const Axes = ({ xLabel, yLabel }) => (
    <g>
        <line x1="40" y1="268" x2="380" y2="268" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        <line x1="40" y1="268" x2="40" y2="30" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        <text x="210" y="290" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.55">{xLabel}</text>
        <text x="16" y="150" fontSize="11" fill="currentColor" fillOpacity="0.55" transform="rotate(-90 16 150)" textAnchor="middle">{yLabel}</text>
    </g>
);

export default function EDAVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const { mode } = STEP_STATES[idx];

    const isHist = mode === 'hist' || mode === 'hist_stats';
    const isScatter = mode === 'scatter' || mode === 'scatter_r' || mode === 'multi';

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="One housing dataset explored as a table, a histogram, scatter plots, and a correlation heatmap">

                {/* ── Raw table: a wall of numbers ── */}
                {mode === 'table' && (
                    <g>
                        {VARS.map((v, c) => (
                            <text key={v} x={92 + c * 60} y="52" textAnchor="middle" fontSize="10" fontWeight="700"
                                fill="currentColor" fillOpacity="0.75">{v}</text>
                        ))}
                        {Array.from({ length: 9 }, (_, r) => (
                            <g key={r}>
                                {VARS.map((_, c) => (
                                    <rect key={c} x={66 + c * 60} y={62 + r * 21} width="52" height="15" rx="3"
                                        fill="currentColor" fillOpacity={0.05 + ((r * 4 + c) % 5) * 0.018} />
                                ))}
                            </g>
                        ))}
                        <text x="200" y="272" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                            500 rows × 12 columns… now what?
                        </text>
                    </g>
                )}

                {/* ── Univariate: histogram of price ── */}
                {isHist && (
                    <g>
                        <Axes xLabel="price  →" yLabel="count  →" />
                        {HIST.map((h, i) => (
                            <rect key={i} x={50 + i * 41} y={262 - h * 26} width="35" height={h * 26} rx="4"
                                fill={NEW} fillOpacity="0.55" />
                        ))}
                        {mode === 'hist_stats' && (
                            <g>
                                <line x1={50 + MEDIAN_BIN * 41} y1="45" x2={50 + MEDIAN_BIN * 41} y2="262"
                                    stroke={NEW} strokeWidth="2" strokeDasharray="5 4" />
                                <text x={50 + MEDIAN_BIN * 41} y="38" textAnchor="middle" fontSize="10" fontWeight="700" fill={NEW}>median</text>
                                <line x1={50 + MEAN_BIN * 41} y1="60" x2={50 + MEAN_BIN * 41} y2="262"
                                    stroke="var(--destructive)" strokeWidth="2" strokeDasharray="5 4" />
                                <text x={50 + MEAN_BIN * 41 + 4} y="56" fontSize="10" fontWeight="700" fill="var(--destructive)">mean ←dragged by the tail</text>
                            </g>
                        )}
                    </g>
                )}

                {/* ── Bivariate / multivariate scatter ── */}
                {isScatter && (
                    <g>
                        <Axes xLabel="size  →" yLabel="price  →" />
                        {mode === 'scatter_r' && (
                            <g>
                                <line x1={sx(0.3)} y1={sy(1.5)} x2={sx(9.7)} y2={sy(6.0)}
                                    stroke={NEW} strokeWidth="2" strokeOpacity="0.7" />
                                <text x="372" y="40" textAnchor="end" fontSize="13" fontFamily="monospace" fill={NEW}>r = 0.86</text>
                            </g>
                        )}
                        {/* Older houses are squares in multivariate mode — group ≠ colour alone */}
                        {HOUSES.map(([x, y, old], i) => (
                            mode === 'multi' && old ? (
                                <rect key={i} x={sx(x) - 6} y={sy(y) - 6} width="12" height="12" rx="2.5"
                                    fill={OLD} fillOpacity="0.85" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                            ) : (
                                <circle key={i} cx={sx(x)} cy={sy(y)} r="6.5"
                                    fill={mode === 'multi' ? NEW : 'currentColor'}
                                    fillOpacity={mode === 'multi' ? 0.85 : 0.45}
                                    stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                            )
                        ))}
                        {mode === 'multi' && (
                            <g fontSize="10">
                                <circle cx="70" cy="42" r="5" fill={NEW} fillOpacity="0.85" />
                                <text x="80" y="46" fill="currentColor" fillOpacity="0.7">built after 2000</text>
                                <rect x="185" y="37" width="10" height="10" rx="2" fill={OLD} fillOpacity="0.85" />
                                <text x="200" y="46" fill="currentColor" fillOpacity="0.7">built before 2000</text>
                            </g>
                        )}
                    </g>
                )}

                {/* ── Correlation heatmap: every pair at once ── */}
                {mode === 'heatmap' && (
                    <g>
                        <text x="200" y="40" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" fillOpacity="0.8">
                            correlation, every pair at once
                        </text>
                        {VARS.map((v, i) => (
                            <g key={v} fontSize="10" fill="currentColor" fillOpacity="0.7">
                                <text x={135 + i * 50} y="66" textAnchor="middle">{v}</text>
                                <text x="102" y={95 + i * 50} textAnchor="end">{v}</text>
                            </g>
                        ))}
                        {CORR.map((row, r) => row.map((c, cIdx) => (
                            <g key={`${r}-${cIdx}`}>
                                <rect x={112 + cIdx * 50} y={74 + r * 50} width="46" height="46" rx="6"
                                    fill={c >= 0 ? NEW : 'var(--destructive)'} fillOpacity={0.08 + Math.abs(c) * 0.55} />
                                <text x={135 + cIdx * 50} y={101 + r * 50} textAnchor="middle" fontSize="10.5"
                                    fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                                    {c.toFixed(2).replace('0.', '.')}
                                </text>
                            </g>
                        )))}
                    </g>
                )}

                {/* ── Simpson's paradox ── */}
                {mode === 'simpson' && (
                    <g>
                        <Axes xLabel="size  →" yLabel="price  →" />
                        <line x1={sx(0.8)} y1={sy(5.8)} x2={sx(9.3)} y2={sy(2.6)}
                            stroke="var(--destructive)" strokeWidth="2" strokeDasharray="6 4" strokeOpacity="0.8" />
                        <text x={sx(5.2)} y={sy(4.7)} fontSize="10" fontWeight="700" fill="var(--destructive)">pooled: bigger = cheaper?!</text>
                        <line x1={sx(0.7)} y1={sy(5.0)} x2={sx(3.8)} y2={sy(6.3)} stroke={NEW} strokeWidth="2" strokeOpacity="0.8" />
                        <line x1={sx(5.7)} y1={sy(2.0)} x2={sx(9.4)} y2={sy(3.6)} stroke={OLD} strokeWidth="2" strokeOpacity="0.8" />
                        {DOWNTOWN.map(([x, y], i) => (
                            <circle key={`d${i}`} cx={sx(x)} cy={sy(y)} r="6" fill={NEW} fillOpacity="0.85" />
                        ))}
                        {SUBURB.map(([x, y], i) => (
                            <rect key={`s${i}`} x={sx(x) - 5.5} y={sy(y) - 5.5} width="11" height="11" rx="2.5"
                                fill={OLD} fillOpacity="0.85" />
                        ))}
                        <text x={sx(2.2)} y={sy(6.6)} textAnchor="middle" fontSize="10" fill={NEW}>downtown</text>
                        <text x={sx(7.6)} y={sy(1.6)} textAnchor="middle" fontSize="10" fill={OLD}>suburbs</text>
                    </g>
                )}
            </svg>
        </div>
    );
}
