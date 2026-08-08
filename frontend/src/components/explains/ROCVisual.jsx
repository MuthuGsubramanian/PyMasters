import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// ROC / AUC visual — 20 spam-filter emails (square = spam, circle = ham),
// swept across every achievable threshold to build a real ROC curve, plus a
// second, weaker classifier's curve for comparison. TPR/FPR at every
// threshold and the AUC itself are computed for real at module load (no
// fitted library, no faked numbers) via a plain trapezoid-rule sum.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const ACCENT = 'var(--accent-primary)';   // trained classifier / spam shape
const SECOND = 'var(--secondary)';        // weak baseline classifier

// Hand-set cohort: 20 emails, 6 spam and 14 ham. Scores are deterministic,
// chosen so each classifier has exactly one spam/ham overlap — neither is
// drawn as an implausibly perfect separator.
const SPAM_STRONG = [0.92, 0.85, 0.80, 0.72, 0.60, 0.52];
const HAM_STRONG = [0.05, 0.08, 0.10, 0.13, 0.16, 0.19, 0.22, 0.25, 0.29, 0.33, 0.38, 0.44, 0.58, 0.65];
const SPAM_WEAK = [0.75, 0.62, 0.55, 0.48, 0.40, 0.30];
const HAM_WEAK = [0.15, 0.20, 0.25, 0.28, 0.32, 0.35, 0.38, 0.42, 0.45, 0.50, 0.53, 0.58, 0.63, 0.70];

const EMAILS_STRONG = [
    ...SPAM_STRONG.map((score) => ({ score, spam: true })),
    ...HAM_STRONG.map((score) => ({ score, spam: false })),
].sort((a, b) => a.score - b.score);

// Sweep every achievable threshold (each observed score, plus both ends) and
// compute the true/false positive rate at each — the literal definition of
// an ROC curve. Thresholds descend, so fpr and tpr are non-decreasing.
function rocPoints(pos, neg) {
    const thresholds = Array.from(new Set([...pos, ...neg])).sort((a, b) => b - a);
    const ts = [1.01, ...thresholds, -0.01];
    return ts.map((t) => ({
        t,
        fpr: neg.filter((s) => s >= t).length / neg.length,
        tpr: pos.filter((s) => s >= t).length / pos.length,
    }));
}

// Area under the step-function curve via the trapezoid rule — a plain sum,
// not an approximation.
function aucOf(points) {
    let area = 0;
    for (let i = 1; i < points.length; i++) {
        area += (points[i].fpr - points[i - 1].fpr) * (points[i].tpr + points[i - 1].tpr) / 2;
    }
    return area;
}

const metricsAt = (pos, neg, t) => {
    const tp = pos.filter((s) => s >= t).length;
    const fp = neg.filter((s) => s >= t).length;
    return { tp, fn: pos.length - tp, fp, tn: neg.length - fp, tpr: tp / pos.length, fpr: fp / neg.length };
};

const ROC_STRONG = rocPoints(SPAM_STRONG, HAM_STRONG);
const AUC_STRONG = aucOf(ROC_STRONG);
const ROC_WEAK = rocPoints(SPAM_WEAK, HAM_WEAK);
const AUC_WEAK = aucOf(ROC_WEAK);

const T_DEMO = 0.5;
const RATES_DEMO = metricsAt(SPAM_STRONG, HAM_STRONG, T_DEMO);
const REVEAL_COUNT = 9; // how many of ROC_STRONG's points the "sweep" step has reached
const SWEEP_PTS = ROC_STRONG.slice(0, REVEAL_COUNT);
const SWEEP_T = SWEEP_PTS[SWEEP_PTS.length - 1].t;

// Geometry
const sx = (score) => 30 + score * 340;             // score-strip x, score 0..1 → 30..370
const fx = (fpr) => 55 + fpr * 250;                 // ROC-plot x, FPR 0..1 → 55..305
const fy = (tpr) => 278 - tpr * 148;                // ROC-plot y, TPR 0..1 → 278..130 (svg y grows down)
const pathOf = (pts) => pts.map((p) => `${fx(p.fpr)},${fy(p.tpr)}`).join(' ');
const fmt = (v) => v.toFixed(2);

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'rates' },
    { mode: 'sweep' },
    { mode: 'fullcurve' },
    { mode: 'auc' },
    { mode: 'interactive' },
    { mode: 'compare' },
    { mode: 'catches' },
];

function Axes() {
    return (
        <g stroke="currentColor" fill="currentColor">
            <line x1={fx(0)} y1={fy(0)} x2={fx(1)} y2={fy(0)} strokeOpacity="0.3" strokeWidth="1" />
            <line x1={fx(0)} y1={fy(0)} x2={fx(0)} y2={fy(1)} strokeOpacity="0.3" strokeWidth="1" />
            {[0, 0.5, 1].map((v) => (
                <g key={v} fontSize="8" fillOpacity="0.55" stroke="none">
                    <text x={fx(v)} y={fy(0) + 12} textAnchor="middle">{v}</text>
                    <text x={fx(0) - 8} y={fy(v) + 3} textAnchor="end">{v}</text>
                </g>
            ))}
            <text x={(fx(0) + fx(1)) / 2} y="294" textAnchor="middle" fontSize="9" fillOpacity="0.6" stroke="none">
                false positive rate →
            </text>
            <text x="16" y={(fy(0) + fy(1)) / 2} textAnchor="middle" fontSize="9" fillOpacity="0.6" stroke="none"
                transform={`rotate(-90 16 ${(fy(0) + fy(1)) / 2})`}>
                true positive rate →
            </text>
        </g>
    );
}

function Diagonal() {
    return (
        <line x1={fx(0)} y1={fy(0)} x2={fx(1)} y2={fy(1)} stroke="currentColor" strokeOpacity="0.35"
            strokeWidth="1.3" strokeDasharray="4 3" />
    );
}

function Strip({ t }) {
    return (
        <g>
            <g fontSize="8" fill="currentColor" fillOpacity="0.65">
                <circle cx="34" cy="16" r="3.5" fillOpacity="0.45" />
                <text x="42" y="19">ham ({HAM_STRONG.length})</text>
                <rect x="98" y="12" width="8" height="8" rx="1.5" fill={SECOND} fillOpacity="0.9" />
                <text x="110" y="19">spam ({SPAM_STRONG.length})</text>
                <text x="370" y="19" textAnchor="end">classifier score →</text>
            </g>
            {t != null && (
                <rect x={sx(t)} y="26" width={Math.max(0, 370 - sx(t))} height="46" fill={ACCENT} fillOpacity="0.08" />
            )}
            <line x1="30" y1="72" x2="370" y2="72" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
            {EMAILS_STRONG.map((e, i) => {
                const y = i % 2 === 0 ? 44 : 58;
                return e.spam ? (
                    <rect key={i} x={sx(e.score) - 5} y={y - 5} width="10" height="10" rx="2"
                        fill={SECOND} fillOpacity="0.95" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.5" />
                ) : (
                    <circle key={i} cx={sx(e.score)} cy={y} r="4.5" fill="currentColor" fillOpacity="0.4" />
                );
            })}
            {t != null && (
                <g>
                    <line x1={sx(t)} y1="20" x2={sx(t)} y2="76" stroke={ACCENT} strokeWidth="1.8" strokeDasharray="5 3" />
                    <text x={sx(t)} y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill={ACCENT}>
                        t = {t.toFixed(2)}
                    </text>
                </g>
            )}
        </g>
    );
}

export default function ROCVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const { mode } = STEP_STATES[idx];
    const interactive = mode === 'interactive';

    const [userT, setUserT] = useState(T_DEMO);
    const liveT = interactive ? userT : T_DEMO;
    const live = metricsAt(SPAM_STRONG, HAM_STRONG, liveT);

    const stripModes = ['intro', 'rates', 'sweep', 'interactive'];
    const showStrip = stripModes.includes(mode);
    const showDiagonal = mode !== 'intro' && mode !== 'rates';
    const showFullStrong = ['fullcurve', 'auc', 'interactive', 'compare', 'catches'].includes(mode);
    const showSweepPartial = mode === 'sweep';
    const showShade = mode === 'auc';
    const showCompare = mode === 'compare';
    const stripT = mode === 'rates' ? T_DEMO : mode === 'sweep' ? SWEEP_T : interactive ? liveT : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="20 emails ranked by spam score swept across every threshold to build an ROC curve of true positive rate versus false positive rate, with the area under the curve computed as AUC">
                {showStrip && <Strip t={stripT} />}

                {mode === 'intro' && (
                    <text x="200" y="180" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                        20 emails, already scored by a spam classifier
                    </text>
                )}

                {mode === 'rates' && (
                    <g textAnchor="middle" fontFamily="monospace">
                        <text x="200" y="150" fontSize="14" fontWeight="700" fill={ACCENT}>
                            TPR = TP/(TP+FN) = {RATES_DEMO.tp}/{RATES_DEMO.tp + RATES_DEMO.fn} = {fmt(RATES_DEMO.tpr)}
                        </text>
                        <text x="200" y="178" fontSize="14" fontWeight="700" fill={SECOND}>
                            FPR = FP/(FP+TN) = {RATES_DEMO.fp}/{RATES_DEMO.fp + RATES_DEMO.tn} = {fmt(RATES_DEMO.fpr)}
                        </text>
                        <text x="200" y="206" fontSize="10" fill="currentColor" fillOpacity="0.6" fontFamily="inherit">
                            at threshold t = {T_DEMO}
                        </text>
                    </g>
                )}

                {mode !== 'rates' && mode !== 'intro' && <Axes />}
                {showDiagonal && <Diagonal />}

                {showSweepPartial && (
                    <g>
                        <polyline points={pathOf(SWEEP_PTS)} fill="none" stroke={ACCENT} strokeWidth="2" />
                        {SWEEP_PTS.map((p, i) => (
                            <circle key={i} cx={fx(p.fpr)} cy={fy(p.tpr)} r="3" fill={ACCENT} />
                        ))}
                        <text x={fx(1) - 2} y={fy(1) + 14} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.6">
                            {REVEAL_COUNT} of {ROC_STRONG.length} thresholds swept
                        </text>
                    </g>
                )}

                {showFullStrong && (
                    <polyline points={pathOf(ROC_STRONG)} fill="none" stroke={ACCENT}
                        strokeWidth={interactive || mode === 'catches' ? 1.6 : 2}
                        strokeOpacity={interactive || mode === 'catches' ? 0.55 : 1} />
                )}

                {showShade && (
                    <polygon points={`${fx(0)},${fy(0)} ${pathOf(ROC_STRONG)} ${fx(1)},${fy(0)}`}
                        fill={ACCENT} fillOpacity="0.15" stroke="none" />
                )}

                {interactive && (
                    <g>
                        <circle cx={fx(live.fpr)} cy={fy(live.tpr)} r="6" fill={ACCENT} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                        <text x={fx(live.fpr) + 10} y={fy(live.tpr) - 6} fontSize="9" fontFamily="monospace" fill={ACCENT}>
                            ({fmt(live.fpr)}, {fmt(live.tpr)})
                        </text>
                    </g>
                )}

                {showCompare && (
                    <g>
                        <polyline points={pathOf(ROC_WEAK)} fill="none" stroke={SECOND} strokeWidth="2" strokeDasharray="5 3" />
                        <g fontSize="9.5" fontFamily="monospace">
                            <line x1="60" y1="16" x2="82" y2="16" stroke={ACCENT} strokeWidth="2.5" />
                            <text x="88" y="19" fill="currentColor" fillOpacity="0.85">trained model · AUC {AUC_STRONG.toFixed(3)}</text>
                            <line x1="60" y1="30" x2="82" y2="30" stroke={SECOND} strokeWidth="2.5" strokeDasharray="4 2" />
                            <text x="88" y="33" fill="currentColor" fillOpacity="0.85">keyword-count rule · AUC {AUC_WEAK.toFixed(3)}</text>
                        </g>
                    </g>
                )}

                {mode === 'fullcurve' && (
                    <text x="200" y="19" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                        (0,0) flag nothing → (1,1) flag everything · dashed = random guessing
                    </text>
                )}

                {mode === 'auc' && (
                    <g textAnchor="middle">
                        <text x="200" y="18" fontSize="16" fontWeight="700" fill={ACCENT}>AUC = {AUC_STRONG.toFixed(3)}</text>
                        <text x="200" y="32" fontSize="9" fill="currentColor" fillOpacity="0.6">
                            shaded area under the curve, summed by the trapezoid rule
                        </text>
                    </g>
                )}

                {mode === 'catches' && (
                    <g textAnchor="middle" fontSize="9.5">
                        <text x="200" y="16" fontWeight="700" fill="currentColor" fillOpacity="0.85">
                            AUC picks the model — it doesn't pick the threshold
                        </text>
                        <text x="200" y="30" fill="currentColor" fillOpacity="0.6">
                            with rare positives, prefer a precision-recall curve instead
                        </text>
                    </g>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="roc-threshold" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                        threshold t = {userT.toFixed(2)}
                    </label>
                    <input id="roc-threshold" type="range" min="0" max="1" step="0.01" value={userT}
                        onChange={(e) => setUserT(Number(e.target.value))}
                        className="flex-1 accent-[var(--accent-primary)] cursor-pointer" aria-label="Decision threshold" />
                </div>
            )}
        </div>
    );
}
