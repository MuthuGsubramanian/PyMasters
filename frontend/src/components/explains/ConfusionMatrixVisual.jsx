import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Confusion Matrix visual — 24 screening patients on a score strip (circle =
// healthy, square = sick), a movable decision threshold, the resulting 2×2
// confusion matrix, and precision / recall / F1 bars. All metrics are computed
// for real from the hand-set scores below. Pure SVG; step states clamp
// defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const ACCENT = 'var(--accent-primary)';   // predicted-sick side / precision
const SECOND = 'var(--secondary)';        // truly-sick shapes / recall
const BAD = 'var(--destructive)';         // error cells (FP, FN)

// Hand-set cohort: 4 truly sick, 20 truly healthy. Scores are deterministic
// classifier outputs with realistic overlap (one sick patient scores low,
// a couple of healthy ones score high).
const SICK_SCORES = [0.91, 0.78, 0.66, 0.28];
const HEALTHY_SCORES = [
    0.05, 0.08, 0.10, 0.12, 0.14, 0.17, 0.19, 0.22, 0.24, 0.27,
    0.30, 0.33, 0.36, 0.38, 0.41, 0.44, 0.47, 0.52, 0.58, 0.72,
];
const PATIENTS = [
    ...SICK_SCORES.map((score) => ({ score, sick: true })),
    ...HEALTHY_SCORES.map((score) => ({ score, sick: false })),
].sort((a, b) => a.score - b.score);

const metricsAt = (t) => {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const p of PATIENTS) {
        const pos = p.score >= t;
        if (p.sick && pos) tp += 1;
        else if (!p.sick && pos) fp += 1;
        else if (p.sick) fn += 1;
        else tn += 1;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const accuracy = (tp + tn) / PATIENTS.length;
    return { tp, fp, fn, tn, precision, recall, f1, accuracy };
};

const BASELINE = metricsAt(1.01);          // "predict healthy for everyone"
const DEFAULT_T = 0.5;
const LOW_T = 0.25;
const HIGH_T = 0.75;
const LOW = metricsAt(LOW_T);
const HIGH = metricsAt(HIGH_T);

const pct = (v) => `${Math.round(v * 100)}%`;
const sx = (score) => 30 + score * 340;    // score 0..1 → x 30..370

const STEP_STATES = [
    { mode: 'trap' },                       // 0: 83% accurate by doing nothing
    { mode: 'matrix', t: DEFAULT_T },       // 1: four kinds of right and wrong
    { mode: 'precision', t: DEFAULT_T },    // 2: precision
    { mode: 'recall', t: DEFAULT_T },       // 3: recall
    { mode: 'tradeoff' },                   // 4: two thresholds side by side
    { mode: 'full', t: DEFAULT_T },         // 5: matrix + all metrics
    { mode: 'interactive' },                // 6: slider (also the index thumbnail)
    { mode: 'final', t: DEFAULT_T },        // 7: choosing by cost
];

// 2×2 matrix geometry: rows = actual (sick, healthy), cols = predicted (sick, healthy)
const CELLS = [
    { key: 'tp', col: 0, row: 0, tag: 'TP · caught', good: true },
    { key: 'fn', col: 1, row: 0, tag: 'FN · missed', good: false },
    { key: 'fp', col: 0, row: 1, tag: 'FP · false alarm', good: false },
    { key: 'tn', col: 1, row: 1, tag: 'TN · cleared', good: true },
];
const cellX = (col) => 78 + col * 56;
const cellY = (row) => 128 + row * 48;

// focus: 'col' spotlights the predicted-sick column (precision),
// 'row' spotlights the actually-sick row (recall), null shows all cells evenly.
function Matrix({ m, focus }) {
    const dimmed = ({ col, row }) =>
        (focus === 'col' && col !== 0) || (focus === 'row' && row !== 0);
    return (
        <g>
            <text x="134" y="114" textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.6">predicted</text>
            <text x="106" y="124" textAnchor="middle" fontSize="8" fontWeight="700" fill={ACCENT}>sick</text>
            <text x="162" y="124" textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.7">healthy</text>
            <text x="72" y="152" textAnchor="end" fontSize="8" fontWeight="700" fill={SECOND}>■ sick</text>
            <text x="72" y="200" textAnchor="end" fontSize="8" fill="currentColor" fillOpacity="0.7">● healthy</text>
            {CELLS.map(({ key, col, row, tag, good }) => (
                <g key={key} opacity={dimmed({ col, row }) ? 0.3 : 1}>
                    <rect x={cellX(col)} y={cellY(row)} width="52" height="44" rx="6"
                        fill={good ? (key === 'tp' ? ACCENT : 'currentColor') : BAD}
                        fillOpacity={good ? (key === 'tp' ? 0.18 : 0.06) : 0.14}
                        stroke={good ? (key === 'tp' ? ACCENT : 'currentColor') : BAD}
                        strokeOpacity={good ? (key === 'tp' ? 0.7 : 0.2) : 0.55} strokeWidth="1" />
                    <text x={cellX(col) + 26} y={cellY(row) + 24} textAnchor="middle" fontSize="16" fontWeight="700"
                        fill="currentColor" fillOpacity="0.9">{m[key]}</text>
                    <text x={cellX(col) + 26} y={cellY(row) + 37} textAnchor="middle" fontSize="6.5"
                        fill="currentColor" fillOpacity="0.65">{tag}</text>
                </g>
            ))}
        </g>
    );
}

function Bars({ m, show }) {
    const rows = [
        { key: 'precision', label: 'precision', color: ACCENT, value: m.precision, text: pct(m.precision), y: 138 },
        { key: 'recall', label: 'recall', color: SECOND, value: m.recall, text: pct(m.recall), y: 172 },
        { key: 'f1', label: 'F1', color: 'currentColor', value: m.f1, text: m.f1.toFixed(2), y: 206 },
    ].filter((r) => show.includes(r.key));
    return (
        <g>
            {rows.map(({ key, label, color, value, text, y }) => (
                <g key={key} fontSize="9">
                    <text x="214" y={y - 4} fontWeight="700" fill={color} fillOpacity="0.9">{label}</text>
                    <rect x="214" y={y} width="126" height="8" rx="4" fill="currentColor" fillOpacity="0.08" />
                    <rect x="214" y={y} width={Math.max(2, value * 126)} height="8" rx="4" fill={color} fillOpacity="0.85" />
                    <text x="346" y={y + 8} fontFamily="monospace" fill="currentColor" fillOpacity="0.85">{text}</text>
                </g>
            ))}
            {show.includes('accuracy') && (
                <text x="214" y="232" fontSize="9" fill="currentColor" fillOpacity="0.6">
                    accuracy {pct(m.accuracy)} — same as doing nothing
                </text>
            )}
        </g>
    );
}

export default function ConfusionMatrixVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';

    const [userT, setUserT] = useState(DEFAULT_T);
    const t = interactive ? userT : (state.t ?? DEFAULT_T);
    const m = metricsAt(t);

    const trap = state.mode === 'trap';
    const tradeoff = state.mode === 'tradeoff';
    const showThreshold = !trap && !tradeoff;
    const showMatrix = state.mode === 'matrix' || state.mode === 'full' || interactive || state.mode === 'final';
    const highlightPositives = state.mode === 'recall';
    const barsFor = {
        precision: ['precision'],
        recall: ['recall'],
        full: ['precision', 'recall', 'f1', 'accuracy'],
        interactive: ['precision', 'recall', 'f1'],
        final: ['precision', 'recall', 'f1'],
    }[state.mode] || [];

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="24 screening patients ordered by classifier score, with a decision threshold producing a 2 by 2 confusion matrix and precision, recall and F1 bars">
                {/* Legend: shape encodes the true label */}
                <g fontSize="8" fill="currentColor" fillOpacity="0.65">
                    <circle cx="34" cy="18" r="3.5" fill="currentColor" fillOpacity="0.45" />
                    <text x="42" y="21">healthy ({HEALTHY_SCORES.length})</text>
                    <rect x="102" y="14" width="8" height="8" rx="1.5" fill={SECOND} fillOpacity="0.9" />
                    <text x="114" y="21">sick ({SICK_SCORES.length})</text>
                    <text x="370" y="21" textAnchor="end">classifier score →</text>
                </g>

                {/* Predicted-sick shading right of the threshold */}
                {showThreshold && (
                    <rect x={sx(t)} y="46" width={Math.max(0, 370 - sx(t))} height="46" fill={ACCENT} fillOpacity="0.08" />
                )}

                {/* Score axis + patient dots (two alternating rows to declutter) */}
                <line x1="30" y1="92" x2="370" y2="92" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                {[0, 0.5, 1].map((v) => (
                    <text key={v} x={sx(v)} y="103" textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.5">
                        {v.toFixed(1)}
                    </text>
                ))}
                {PATIENTS.map((p, i) => {
                    const y = i % 2 === 0 ? 62 : 78;
                    const dimHealthy = highlightPositives && !p.sick;
                    return p.sick ? (
                        <rect key={i} x={sx(p.score) - 5} y={y - 5} width="10" height="10" rx="2"
                            fill={SECOND} fillOpacity="0.95" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.5" />
                    ) : (
                        <circle key={i} cx={sx(p.score)} cy={y} r="4.5"
                            fill="currentColor" fillOpacity={dimHealthy ? 0.12 : 0.4} />
                    );
                })}

                {/* Decision threshold */}
                {showThreshold && (
                    <g>
                        <line x1={sx(t)} y1="34" x2={sx(t)} y2="96" stroke={ACCENT} strokeWidth="1.8" strokeDasharray="5 3" />
                        <text x={sx(t)} y="30" textAnchor="middle" fontSize="9" fontWeight="700" fill={ACCENT}>
                            t = {t.toFixed(2)}
                        </text>
                        <text x={sx(t) + 5} y="42" fontSize="7.5" fill={ACCENT} fillOpacity="0.85">→ call sick</text>
                    </g>
                )}

                {/* Step 0: the accuracy trap — predict healthy for everyone */}
                {trap && (
                    <g textAnchor="middle">
                        <text x="200" y="150" fontSize="17" fontWeight="700" fill="currentColor" fillOpacity="0.9">
                            accuracy = {BASELINE.tn}/{PATIENTS.length} = {pct(BASELINE.accuracy)}
                        </text>
                        <text x="200" y="172" fontSize="10" fill="currentColor" fillOpacity="0.7">
                            …by predicting “healthy” for every single patient
                        </text>
                        <text x="200" y="192" fontSize="10" fontWeight="700" fill={BAD}>
                            all {BASELINE.fn} sick patients (squares) missed — recall {pct(BASELINE.recall)}
                        </text>
                    </g>
                )}

                {/* Step 4: two thresholds side by side */}
                {tradeoff && (
                    <g>
                        {[{ tt: LOW_T, tag: 'A' }, { tt: HIGH_T, tag: 'B' }].map(({ tt, tag }) => (
                            <g key={tag}>
                                <line x1={sx(tt)} y1="34" x2={sx(tt)} y2="96" stroke={ACCENT} strokeWidth="1.8" strokeDasharray="5 3" />
                                <text x={sx(tt)} y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill={ACCENT}>
                                    {tag} · t={tt}
                                </text>
                            </g>
                        ))}
                        <g fontSize="9.5">
                            <text x="82" y="136" fontWeight="700" fill="currentColor" fillOpacity="0.9">A — call sick early (t = {LOW_T})</text>
                            <text x="82" y="154" fill={SECOND} fontWeight="700">recall {pct(LOW.recall)} — every square caught</text>
                            <text x="82" y="170" fill={ACCENT}>precision {pct(LOW.precision)} — {LOW.fp} false alarms</text>
                            <text x="82" y="186" fill="currentColor" fillOpacity="0.6">accuracy drops to {pct(LOW.accuracy)}</text>
                            <text x="82" y="214" fontWeight="700" fill="currentColor" fillOpacity="0.9">B — call sick late (t = {HIGH_T})</text>
                            <text x="82" y="232" fill={ACCENT}>precision {pct(HIGH.precision)} — zero false alarms</text>
                            <text x="82" y="248" fill={SECOND} fontWeight="700">recall {pct(HIGH.recall)} — {HIGH.fn} of {HIGH.tp + HIGH.fn} squares missed</text>
                            <text x="82" y="264" fill="currentColor" fillOpacity="0.6">accuracy {pct(HIGH.accuracy)} — highest yet, still misses half the sick</text>
                        </g>
                    </g>
                )}

                {showMatrix && <Matrix m={m} focus={null} />}
                {barsFor.length > 0 && !showMatrix && (
                    <Matrix m={m} focus={state.mode === 'precision' ? 'col' : 'row'} />
                )}
                {barsFor.length > 0 && <Bars m={m} show={barsFor} />}

                {/* Formula captions */}
                {state.mode === 'precision' && (
                    <text x="200" y="262" textAnchor="middle" fontSize="10" fontFamily="monospace" fill={ACCENT}>
                        precision = TP/(TP+FP) = {m.tp}/{m.tp + m.fp} = {pct(m.precision)}
                    </text>
                )}
                {state.mode === 'recall' && (
                    <text x="200" y="262" textAnchor="middle" fontSize="10" fontFamily="monospace" fill={SECOND}>
                        recall = TP/(TP+FN) = {m.tp}/{m.tp + m.fn} = {pct(m.recall)}
                    </text>
                )}
                {(state.mode === 'full' || interactive) && (
                    <text x="200" y="262" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.6">
                        left of the line → predicted healthy · right → predicted sick
                    </text>
                )}
                {state.mode === 'final' && (
                    <text x="200" y="262" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" fillOpacity="0.75">
                        disease screening → favour recall · spam filtering → favour precision
                    </text>
                )}
            </svg>

            {/* Interactive control */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="cm-threshold" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                        threshold t = {userT.toFixed(2)}
                    </label>
                    <input id="cm-threshold" type="range" min="0" max="1" step="0.05" value={userT}
                        onChange={(e) => setUserT(Number(e.target.value))}
                        className="flex-1 accent-[var(--accent-primary)] cursor-pointer" aria-label="Decision threshold" />
                </div>
            )}
        </div>
    );
}
