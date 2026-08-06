import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Anomaly detection visual — twenty real "API response time" readings (ms),
// two of which are genuinely unusual. Mean, standard deviation, z-scores,
// quartiles and Tukey IQR fences are all computed for real at module load
// (and again live while the z-threshold slider is dragged) — nothing here is
// a canned number. Pure SVG. Step states clamp defensively (see Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const DATA = [42, 45, 41, 47, 44, 43, 46, 40, 48, 45, 85, 43, 44, 46, 42, 45, 41, 47, 210, 44];
const N = DATA.length;
const SPIKE_VALUE = 210; // the one obviously-wrong reading
const MODERATE_VALUE = 85; // the one that only stands out once the spike is set aside

const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
const pstd = (arr) => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
};
// Linear-interpolation percentile — the same convention pandas/numpy default to.
const percentile = (sortedArr, p) => {
    const idx = p * (sortedArr.length - 1);
    const lo = Math.floor(idx);
    const frac = idx - lo;
    return lo + 1 < sortedArr.length ? sortedArr[lo] + (sortedArr[lo + 1] - sortedArr[lo]) * frac : sortedArr[lo];
};

const STATS_FULL = { mean: mean(DATA), std: pstd(DATA) };
const WITHOUT_SPIKE = DATA.filter((v) => v !== SPIKE_VALUE);
const STATS_MASK = { mean: mean(WITHOUT_SPIKE), std: pstd(WITHOUT_SPIKE) };

const SORTED = [...DATA].sort((a, b) => a - b);
const Q1 = percentile(SORTED, 0.25);
const Q3 = percentile(SORTED, 0.75);
const IQR = Q3 - Q1;
const FENCE_LO = Q1 - 1.5 * IQR;
const FENCE_HI = Q3 + 1.5 * IQR;

const Z_FULL = DATA.map((v) => (v - STATS_FULL.mean) / STATS_FULL.std);
const Z_MASK = DATA.map((v) => (v - STATS_MASK.mean) / STATS_MASK.std);
const IQR_FLAGGED = DATA.map((v) => v < FENCE_LO || v > FENCE_HI);
const Z_SPIKE = Z_FULL[DATA.indexOf(SPIKE_VALUE)];
const Z_MODERATE_FULL = Z_FULL[DATA.indexOf(MODERATE_VALUE)];
const Z_MODERATE_MASK = Z_MASK[DATA.indexOf(MODERATE_VALUE)];

// ── scales ──────────────────────────────────────────────────────────────────
const PLOT_X0 = 46, PLOT_X1 = 374;
const xPos = (i) => PLOT_X0 + (i / (N - 1)) * (PLOT_X1 - PLOT_X0);
const V_MIN = 30, V_MAX = 220, PLOT_Y0 = 234, PLOT_Y1 = 42;
const yPos = (v) => PLOT_Y0 - ((v - V_MIN) / (V_MAX - V_MIN)) * (PLOT_Y0 - PLOT_Y1);

const TICKS = [50, 100, 150, 200];
const IDX_LABELS = [0, 9, 19];

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'meanband', stats: STATS_FULL, k: 2 },
    { mode: 'zscore', stats: STATS_FULL, k: 2, flags: Z_FULL.map((z) => Math.abs(z) > 2) },
    { mode: 'masking' },
    { mode: 'iqrfences' },
    { mode: 'interactive' },
    { mode: 'iqrflag' },
    { mode: 'caveats' },
];

// Flagged = diamond (shape, not just colour); normal = circle. Both also
// change colour, so the distinction survives colour-blindness either way.
const NormalMark = ({ x, y, dim }) => (
    <circle cx={x} cy={y} r="4.5" fill="currentColor" fillOpacity={dim ? 0.2 : 0.55} />
);
const FlagMark = ({ x, y, dim }) => (
    <polygon points={`${x},${y - 7.5} ${x + 7.5},${y} ${x},${y + 7.5} ${x - 7.5},${y}`}
        fill={dim ? 'currentColor' : 'var(--destructive)'} fillOpacity={dim ? 0.25 : 0.85}
        stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
);

function Axes() {
    return (
        <g>
            <line x1={PLOT_X0} y1={PLOT_Y0} x2={PLOT_X1} y2={PLOT_Y0} stroke="currentColor" strokeOpacity="0.15" />
            {TICKS.map((t) => (
                <g key={t}>
                    <line x1={PLOT_X0} y1={yPos(t)} x2={PLOT_X1} y2={yPos(t)} stroke="currentColor" strokeOpacity="0.06" />
                    <text x={PLOT_X0 - 4} y={yPos(t) + 3} textAnchor="end" fontSize="7.5" fill="currentColor" fillOpacity="0.4">{t}</text>
                </g>
            ))}
            {IDX_LABELS.map((i) => (
                <text key={i} x={xPos(i)} y={PLOT_Y0 + 14} textAnchor="middle" fontSize="7.5" fill="currentColor" fillOpacity="0.4">
                    {i + 1}
                </text>
            ))}
            <text x={PLOT_X0 - 4} y={22} textAnchor="end" fontSize="8" fill="currentColor" fillOpacity="0.4">ms</text>
            <text x={PLOT_X1} y={PLOT_Y0 + 24} textAnchor="end" fontSize="8" fill="currentColor" fillOpacity="0.4">request #</text>
        </g>
    );
}

function Trail() {
    const pts = DATA.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
    return <polyline points={pts} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />;
}

function Band({ statsObj, k, color }) {
    const yHi = yPos(statsObj.mean + k * statsObj.std);
    const yLo = yPos(statsObj.mean - k * statsObj.std);
    const yMean = yPos(statsObj.mean);
    return (
        <g>
            <rect x={PLOT_X0} y={yHi} width={PLOT_X1 - PLOT_X0} height={Math.max(0, yLo - yHi)} fill={color} fillOpacity="0.08" />
            <line x1={PLOT_X0} y1={yMean} x2={PLOT_X1} y2={yMean} stroke={color} strokeOpacity="0.6" strokeDasharray="4 3" />
            <text x={PLOT_X1} y={yMean - 4} textAnchor="end" fontSize="8" fill={color} fillOpacity="0.8">mean</text>
        </g>
    );
}

function IQRFences() {
    const yHi = yPos(FENCE_HI), yLo = yPos(FENCE_LO), yQ1 = yPos(Q1), yQ3 = yPos(Q3);
    return (
        <g>
            <rect x={PLOT_X0} y={yQ3} width={PLOT_X1 - PLOT_X0} height={Math.max(0, yQ1 - yQ3)} fill="var(--secondary)" fillOpacity="0.1" />
            <line x1={PLOT_X0} y1={yHi} x2={PLOT_X1} y2={yHi} stroke="var(--secondary)" strokeOpacity="0.7" strokeDasharray="2 3" />
            <line x1={PLOT_X0} y1={yLo} x2={PLOT_X1} y2={yLo} stroke="var(--secondary)" strokeOpacity="0.7" strokeDasharray="2 3" />
            <text x={PLOT_X1} y={yHi - 4} textAnchor="end" fontSize="8" fill="var(--secondary)" fillOpacity="0.85">upper fence</text>
            <text x={PLOT_X1} y={yLo + 11} textAnchor="end" fontSize="8" fill="var(--secondary)" fillOpacity="0.85">lower fence</text>
        </g>
    );
}

export default function AnomalyDetectionVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    useReducedMotion(); // no motion here, but keeps prefs applied consistently

    const [zThresh, setZThresh] = useState(2);
    const liveFlags = interactive ? Z_FULL.map((z) => Math.abs(z) > zThresh) : null;
    const liveCount = liveFlags ? liveFlags.filter(Boolean).length : 0;

    const showBand = ['meanband', 'zscore'].includes(state.mode);
    const showMaskBand = state.mode === 'masking';
    const showIQR = ['iqrfences', 'iqrflag', 'caveats'].includes(state.mode);

    const flagsFor = (i) => {
        if (state.mode === 'zscore') return state.flags[i];
        if (state.mode === 'masking') return DATA[i] !== SPIKE_VALUE && Math.abs(Z_MASK[i]) > 2;
        if (state.mode === 'iqrflag' || state.mode === 'caveats') return IQR_FLAGGED[i];
        if (interactive) return liveFlags[i];
        return false;
    };

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Twenty API response times plotted in order, with a shaded normal band and two unusual readings marked by diamonds instead of circles">
                <Axes />
                <Trail />

                {showBand && <Band statsObj={STATS_FULL} k={2} color="var(--accent-primary)" />}
                {showMaskBand && <Band statsObj={STATS_MASK} k={2} color="var(--accent-primary)" />}
                {interactive && <Band statsObj={STATS_FULL} k={zThresh} color="var(--accent-primary)" />}
                {showIQR && <IQRFences />}

                {DATA.map((v, i) => {
                    const x = xPos(i), y = yPos(v);
                    if (state.mode === 'masking' && v === SPIKE_VALUE) {
                        return (
                            <g key={i}>
                                <circle cx={x} cy={y} r="6" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 2" />
                                <text x={x - 10} y={y - 8} textAnchor="end" fontSize="7.5" fill="currentColor" fillOpacity="0.55">excluded from this calc</text>
                            </g>
                        );
                    }
                    const flagged = flagsFor(i);
                    return flagged ? <FlagMark key={i} x={x} y={y} /> : <NormalMark key={i} x={x} y={y} />;
                })}

                {state.mode === 'intro' && (
                    <text x="210" y="18" textAnchor="middle" fontSize="10.5" fill="currentColor" fillOpacity="0.6">
                        20 consecutive response times — two already look off
                    </text>
                )}
                {state.mode === 'meanband' && (
                    <text x="210" y="18" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                        mean ≈ {STATS_FULL.mean.toFixed(1)}ms · σ ≈ {STATS_FULL.std.toFixed(1)}ms
                    </text>
                )}
                {state.mode === 'zscore' && (
                    <text x="210" y="18" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                        z({SPIKE_VALUE}) = {Z_SPIKE.toFixed(2)} → flagged · z({MODERATE_VALUE}) = {Z_MODERATE_FULL.toFixed(2)} → not flagged
                    </text>
                )}
                {state.mode === 'masking' && (
                    <text x="210" y="18" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                        mean {STATS_FULL.mean.toFixed(1)}→{STATS_MASK.mean.toFixed(1)} · σ {STATS_FULL.std.toFixed(1)}→{STATS_MASK.std.toFixed(1)} · z({MODERATE_VALUE}) {Z_MODERATE_FULL.toFixed(2)}→{Z_MODERATE_MASK.toFixed(2)}
                    </text>
                )}
                {state.mode === 'iqrfences' && (
                    <text x="210" y="18" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                        Q1={Q1.toFixed(2)} Q3={Q3.toFixed(2)} IQR={IQR.toFixed(2)} → fences {FENCE_LO.toFixed(1)} / {FENCE_HI.toFixed(1)}
                    </text>
                )}
                {(state.mode === 'iqrflag' || state.mode === 'caveats') && (
                    <text x="210" y="18" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                        both {MODERATE_VALUE}ms and {SPIKE_VALUE}ms flagged — fences barely moved
                    </text>
                )}
                {interactive && (
                    <text x="210" y="18" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                        threshold |z| &gt; {zThresh.toFixed(1)} → {liveCount} of {N} flagged
                    </text>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="anomaly-z-slider" className="text-xs font-medium text-text-muted whitespace-nowrap">
                        z threshold: <span className="font-mono font-bold text-text-primary">{zThresh.toFixed(1)}</span>
                    </label>
                    <input id="anomaly-z-slider" type="range" min="0.5" max="3" step="0.1" value={zThresh}
                        onChange={(e) => setZThresh(Number(e.target.value))}
                        aria-label="z-score threshold used to flag a reading as anomalous"
                        className="flex-1 cursor-pointer" style={{ accentColor: 'var(--accent-primary)' }} />
                </div>
            )}
        </div>
    );
}
