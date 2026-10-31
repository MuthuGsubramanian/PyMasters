import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap visual — one small sample of 12 delivery times, resampled with
// replacement 1,000 times. Every resample is drawn by a seeded generator
// (mulberry32 — deterministic, no Math.random) and every median, histogram
// bar and percentile below is computed at module load. Nothing is faked.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const ACCENT = 'var(--accent-primary)';
const SECOND = 'var(--secondary)';
const BAD = 'var(--destructive)';
const NEUTRAL = 'currentColor';

// BOOTSTRAP-CORE-START
const SAMPLE = [12, 14, 15, 16, 17, 18, 21, 22, 26, 31, 45, 68]; // minutes
const N = SAMPLE.length;
const B_MAX = 1000;

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const medianOf = (arr) => {
    const s = [...arr].sort((p, q) => p - q);
    const m = s.length / 2;
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[m - 1] + s[m]) / 2;
};

const SAMPLE_MEDIAN = medianOf(SAMPLE);

// Draw B resamples (N draws each, WITH replacement). Keep the index counts of
// the first one so the visual can show who was drawn twice and who was left out.
const rng = mulberry32(42);
const BOOT = [];
let FIRST_COUNTS = null;
for (let b = 0; b < B_MAX; b++) {
    const counts = new Array(N).fill(0);
    const draw = [];
    for (let k = 0; k < N; k++) {
        const i = Math.floor(rng() * N);
        counts[i] += 1;
        draw.push(SAMPLE[i]);
    }
    if (b === 0) FIRST_COUNTS = counts;
    BOOT.push(medianOf(draw));
}

const percentileInterval = (vals) => {
    const s = [...vals].sort((p, q) => p - q);
    const lo = s[Math.floor(0.025 * s.length)];
    const hi = s[Math.ceil(0.975 * s.length) - 1];
    return { lo, hi };
};
// BOOTSTRAP-CORE-END

const FULL_CI = percentileInterval(BOOT);

// ── Histogram geometry: medians 10..50 in 20 bins of width 2 ──────────────────
const H_MIN = 10, H_MAX = 50, BIN_W = 2;
const NBINS = (H_MAX - H_MIN) / BIN_W;
const HX0 = 30, HX1 = 370;
const hx = (v) => HX0 + ((Math.max(H_MIN, Math.min(H_MAX, v)) - H_MIN) / (H_MAX - H_MIN)) * (HX1 - HX0);
const BASE_Y = 232, MAX_H = 120;

const histogram = (vals) => {
    const bins = new Array(NBINS).fill(0);
    vals.forEach((v) => {
        const b = Math.max(0, Math.min(NBINS - 1, Math.floor((v - H_MIN) / BIN_W)));
        bins[b] += 1;
    });
    return bins;
};
const FULL_BINS = histogram(BOOT);
const FULL_PEAK = Math.max(...FULL_BINS);

// Number line for the raw sample: 10..70 minutes.
const lx = (v) => 30 + ((v - 10) / 60) * 340;

const STEP_STATES = [
    { mode: 'sample' },                         // 0 one sample, one median
    { mode: 'question' },                       // 1 how stable is that median?
    { mode: 'resample' },                       // 2 one resample with replacement
    { mode: 'few' },                            // 3 first eight resampled medians
    { mode: 'hist', b: 100 },                   // 4 100 resamples
    { mode: 'hist', b: 1000 },                  // 5 1,000 resamples
    { mode: 'ci', b: 1000 },                    // 6 the 95% interval (thumbnail)
    { mode: 'interactive' },                    // 7 slide B yourself
    { mode: 'ci', b: 1000, caveats: true },     // 8 fine print
];

const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function Axis({ ticks, scale, y }) {
    return (
        <g>
            <line x1={scale(ticks[0])} y1={y} x2={scale(ticks[ticks.length - 1])} y2={y}
                stroke={NEUTRAL} strokeOpacity="0.35" strokeWidth="1" />
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={scale(t)} y1={y} x2={scale(t)} y2={y + 4} stroke={NEUTRAL} strokeOpacity="0.35" />
                    <text x={scale(t)} y={y + 15} textAnchor="middle" fontSize="9"
                        fill={NEUTRAL} fillOpacity="0.6">{t}</text>
                </g>
            ))}
        </g>
    );
}

function Hist({ bins, peak, ci }) {
    const inside = (b) => {
        if (!ci) return true;
        const lo = H_MIN + b * BIN_W, hi = lo + BIN_W;
        return hi > ci.lo && lo <= ci.hi;
    };
    return (
        <g>
            {bins.map((c, b) => {
                const h = peak ? (c / peak) * MAX_H : 0;
                const x = hx(H_MIN + b * BIN_W) + 0.75;
                const inb = inside(b);
                return h > 0 ? (
                    <rect key={b} x={x} y={BASE_Y - h} width={(HX1 - HX0) / NBINS - 1.5} height={h} rx="1.5"
                        fill={ACCENT} fillOpacity={inb ? 0.8 : 0.18}
                        stroke={ACCENT} strokeOpacity={inb ? 0.9 : 0.6}
                        strokeDasharray={inb ? undefined : '2 2'} strokeWidth="1" />
                ) : null;
            })}
            <Axis ticks={[10, 20, 30, 40, 50]} scale={hx} y={BASE_Y} />
            <line x1={hx(SAMPLE_MEDIAN)} y1="64" x2={hx(SAMPLE_MEDIAN)} y2={BASE_Y} stroke={NEUTRAL}
                strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4 3" />
        </g>
    );
}

export default function BootstrapVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';

    const [b, setB] = useState(10);
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setB(10);
    }

    const showB = interactive ? b : state.b;
    const isHist = state.mode === 'hist' || state.mode === 'ci' || interactive;
    let bins = null, peak = 1, ci = null;
    if (isHist) {
        const vals = BOOT.slice(0, showB);
        bins = histogram(vals);
        // Fixed vertical scale from the full run so bars visibly grow with B.
        peak = Math.max(FULL_PEAK * (showB / B_MAX), ...bins, 1);
        if (state.mode === 'ci' || (interactive && showB >= 40)) ci = percentileInterval(vals);
    }

    const rowY = (i) => 66 + i * 22;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Twelve delivery times are resampled with replacement a thousand times; the medians of the resamples pile up into a histogram whose middle 95% is the confidence interval">

                {(state.mode === 'sample' || state.mode === 'question') && (
                    <g>
                        <text x="200" y="44" textAnchor="middle" fontSize="12" fontWeight="700"
                            fill={NEUTRAL} fillOpacity="0.85">12 delivery times (minutes)</text>
                        {SAMPLE.map((v) => (
                            <circle key={v} cx={lx(v)} cy="140" r="7" fill={ACCENT} fillOpacity="0.8"
                                stroke={ACCENT} strokeOpacity="0.9" strokeWidth="1.5" />
                        ))}
                        <Axis ticks={[10, 20, 30, 40, 50, 60, 70]} scale={lx} y="160" />
                        <line x1={lx(SAMPLE_MEDIAN)} y1="108" x2={lx(SAMPLE_MEDIAN)} y2="160" stroke={NEUTRAL}
                            strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4 3" />
                        <text x={lx(SAMPLE_MEDIAN)} y="102" textAnchor="middle" fontSize="11" fontWeight="700"
                            fontFamily="monospace" fill={NEUTRAL}>median {fmt(SAMPLE_MEDIAN)}</text>
                        <text x="200" y="225" textAnchor="middle" fontSize="12" fill={NEUTRAL} fillOpacity="0.75">
                            {state.mode === 'sample'
                                ? 'one sample → one median'
                                : 'another 12 orders would give another median — but by how much?'}
                        </text>
                        {state.mode === 'question' && (
                            <text x="200" y="250" textAnchor="middle" fontSize="12" fontWeight="700" fill={BAD}>
                                we only get to see this one sample
                            </text>
                        )}
                    </g>
                )}

                {state.mode === 'resample' && (
                    <g>
                        <text x="200" y="40" textAnchor="middle" fontSize="12" fontWeight="700"
                            fill={NEUTRAL} fillOpacity="0.85">resample #1: draw 12 times, putting each back</text>
                        {SAMPLE.map((v, i) => {
                            const c = FIRST_COUNTS[i];
                            return (
                                <g key={v}>
                                    {c === 0 && (
                                        <circle cx={lx(v)} cy="190" r="7" fill="none" stroke={NEUTRAL}
                                            strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 3" />
                                    )}
                                    {Array.from({ length: c }, (_, k) => (
                                        <circle key={k} cx={lx(v)} cy={190 - k * 17} r="7" fill={ACCENT}
                                            fillOpacity="0.8" stroke={ACCENT} strokeOpacity="0.9" strokeWidth="1.5" />
                                    ))}
                                    {c > 1 && (
                                        <text x={lx(v)} y={190 - c * 17 + 4} textAnchor="middle" fontSize="10"
                                            fontWeight="700" fill={NEUTRAL}>×{c}</text>
                                    )}
                                </g>
                            );
                        })}
                        <Axis ticks={[10, 20, 30, 40, 50, 60, 70]} scale={lx} y="206" />
                        <text x="200" y="244" textAnchor="middle" fontSize="11" fontFamily="monospace" fill={NEUTRAL}>
                            {FIRST_COUNTS.filter((c) => c === 0).length} left out (dashed) ·{' '}
                            {FIRST_COUNTS.filter((c) => c > 1).length} drawn more than once
                        </text>
                        <text x="200" y="266" textAnchor="middle" fontSize="12" fontWeight="700" fontFamily="monospace"
                            fill={ACCENT}>resample median = {fmt(BOOT[0])}</text>
                    </g>
                )}

                {state.mode === 'few' && (
                    <g>
                        <text x="200" y="34" textAnchor="middle" fontSize="12" fontWeight="700"
                            fill={NEUTRAL} fillOpacity="0.85">first 8 resampled medians</text>
                        {BOOT.slice(0, 8).map((m, i) => (
                            <g key={i}>
                                <text x="14" y={rowY(i) + 4} fontSize="9" fill={NEUTRAL} fillOpacity="0.55">#{i + 1}</text>
                                <path d={`M${hx(m)} ${rowY(i) - 7} l7 7 l-7 7 l-7 -7 z`} fill={SECOND}
                                    fillOpacity="0.85" stroke={SECOND} strokeWidth="1.2" />
                                <text x={hx(m) + 12} y={rowY(i) + 4} fontSize="10" fontFamily="monospace"
                                    fill={NEUTRAL} fillOpacity="0.8">{fmt(m)}</text>
                            </g>
                        ))}
                        <line x1={hx(SAMPLE_MEDIAN)} y1="52" x2={hx(SAMPLE_MEDIAN)} y2="236" stroke={NEUTRAL}
                            strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4 3" />
                        <Axis ticks={[10, 20, 30, 40, 50]} scale={hx} y="240" />
                        <text x="200" y="278" textAnchor="middle" fontSize="11" fill={NEUTRAL} fillOpacity="0.7">
                            dashed line = original median {fmt(SAMPLE_MEDIAN)}
                        </text>
                    </g>
                )}

                {isHist && (
                    <g>
                        <text x="200" y="34" textAnchor="middle" fontSize="12" fontWeight="700"
                            fill={NEUTRAL} fillOpacity="0.85">
                            {showB.toLocaleString('en-US')} resampled medians
                        </text>
                        <Hist bins={bins} peak={peak} ci={ci} />
                        {ci && (
                            <g>
                                <line x1={hx(ci.lo)} y1="72" x2={hx(ci.hi)} y2="72" stroke={SECOND} strokeWidth="2" />
                                <line x1={hx(ci.lo)} y1="66" x2={hx(ci.lo)} y2="78" stroke={SECOND} strokeWidth="2" />
                                <line x1={hx(ci.hi)} y1="66" x2={hx(ci.hi)} y2="78" stroke={SECOND} strokeWidth="2" />
                                <text x={(hx(ci.lo) + hx(ci.hi)) / 2} y="58" textAnchor="middle" fontSize="12"
                                    fontWeight="700" fontFamily="monospace" fill={SECOND}>
                                    95% interval [{fmt(ci.lo)}, {fmt(ci.hi)}]
                                </text>
                            </g>
                        )}
                        <text x={hx(SAMPLE_MEDIAN) - 4} y="96" textAnchor="end" fontSize="9" fill={NEUTRAL} fillOpacity="0.65">
                            sample median {fmt(SAMPLE_MEDIAN)}
                        </text>
                        <text x="200" y="274" textAnchor="middle" fontSize="10.5" fill={NEUTRAL} fillOpacity="0.7">
                            {state.caveats
                                ? 'tiny sample → the pile is lumpy and the interval is wide'
                                : ci
                                    ? 'solid bars = middle 95% · dashed outlines = the 2.5% tails'
                                    : 'each bar counts how many resamples landed in that 2-minute bin'}
                        </text>
                    </g>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                        Resamples
                        <input type="range" min="10" max={B_MAX} step="10" value={b}
                            onChange={(e) => setB(Number(e.target.value))}
                            aria-label="Number of bootstrap resamples" className="cursor-pointer" />
                    </label>
                    <span className="text-xs font-mono text-text-muted">B = {b}</span>
                    <button onClick={() => setB(10)}
                        className="flex items-center gap-1.5 text-xs font-medium text-text-muted bg-bg-elevated border border-border-default rounded-lg px-3 py-2 hover:text-text-secondary transition-colors cursor-pointer">
                        <RotateCcw size={12} /> Reset
                    </button>
                </div>
            )}
        </div>
    );
}
