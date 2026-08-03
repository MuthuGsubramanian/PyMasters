import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Cross-Validation visual — the sequel to TrainTestSplitVisual's row of data
// dots. 20 points on a real line (y = 2x + 5 + hand-set noise) are cut into
// 5 folds; every fold takes one turn as the held-out test set. Each fold's
// score is a REAL ordinary-least-squares fit on the other 16 points, scored
// by MSE on the 4 held-out points — computed at module load, nothing faked.
// The spread of the five scores (lucky 0.17 vs unlucky 18.7) is the essay's
// whole point. Pure SVG; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const TRAIN = 'var(--accent-primary)';
const TEST = 'var(--secondary)';
const BAD = 'var(--destructive)';
const NEUTRAL = 'currentColor';

// ── The dataset: y = 2x + 5 + fixed noise. Fold 2 (indices 4–7) is nearly
// clean (lucky); fold 4 (indices 12–15) carries the wild noise (unlucky).
const NOISE = [
    1.2, -0.8, 0.6, -1.4,   // fold 1 — mild
    0.3, -0.5, 0.4, -0.2,   // fold 2 — nearly clean (the lucky fold)
    1.8, -2.2, 1.5, -1.0,   // fold 3 — moderate
    4.6, -3.9, 5.1, -3.4,   // fold 4 — wild (the unlucky fold)
    2.4, -1.6, 1.1, -2.8,   // fold 5 — moderate
];
const N = NOISE.length;      // 20 points
const K = 5;                 // folds
const FOLD = N / K;          // 4 points per fold
const X = NOISE.map((_, i) => i);
const Y = NOISE.map((n, i) => 2 * i + 5 + n);
const ALL = X.map((_, i) => i);

// Ordinary least squares on a subset of indices → { a, b } for ŷ = a·x + b.
function olsFit(idx) {
    const mx = idx.reduce((s, i) => s + X[i], 0) / idx.length;
    const my = idx.reduce((s, i) => s + Y[i], 0) / idx.length;
    let num = 0, den = 0;
    idx.forEach((i) => { num += (X[i] - mx) * (Y[i] - my); den += (X[i] - mx) ** 2; });
    const a = num / den;
    return { a, b: my - a * mx };
}
const mseOn = (idx, m) => idx.reduce((s, i) => s + (Y[i] - (m.a * X[i] + m.b)) ** 2, 0) / idx.length;

// The five real fold scores: for each fold, fit on the other 16, score the 4.
const foldIndices = (f) => ALL.slice(f * FOLD, (f + 1) * FOLD);
const FOLD_SCORES = Array.from({ length: K }, (_, f) =>
    mseOn(foldIndices(f), olsFit(ALL.filter((i) => i < f * FOLD || i >= (f + 1) * FOLD))));

const MEAN = FOLD_SCORES.reduce((s, v) => s + v, 0) / K;
const STD = Math.sqrt(FOLD_SCORES.reduce((s, v) => s + (v - MEAN) ** 2, 0) / K);
const LUCKY = FOLD_SCORES.indexOf(Math.min(...FOLD_SCORES));     // fold index 1
const UNLUCKY = FOLD_SCORES.indexOf(Math.max(...FOLD_SCORES));   // fold index 3
const RATIO = Math.round(FOLD_SCORES[UNLUCKY] / FOLD_SCORES[LUCKY]);
const SINGLE = FOLD_SCORES[K - 1]; // the classic "hold out the last 20%" split

const fmt = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

// mode per step: what to draw. Extra indices clamp to the last state.
const STEP_STATES = [
    { mode: 'recap' },                                  // 0 one split, one score
    { mode: 'two_splits' },                             // 1 which 20%? two real scores
    { mode: 'folds' },                                  // 2 cut into 5 folds
    { mode: 'grid' },                                   // 3 rotate: every fold a turn
    { mode: 'grid', scores: true },                     // 4 five real scores
    { mode: 'grid', scores: true, spread: true },       // 5 lucky vs unlucky
    { mode: 'report' },                                 // 6 mean ± std (thumbnail)
    { mode: 'interactive' },                            // 7 step through it live
    { mode: 'report', caveats: true },                  // 8 costs and fine print
];

// ── Geometry ──────────────────────────────────────────────────────────────────
const sx = (i) => 25 + i * 18;        // single-row dot x: 25..367
const gx = (i) => 52 + i * 14.5;      // grid-row dot x: 52..327.5
const GRID_Y = [60, 99, 138, 177, 216];

// One full-width row of the 20 dots; the test fold sits inside a labelled band
// (position + outline mark the held-out points — never colour alone).
function DataRow({ y, testFold, coloured }) {
    const isTest = (i) => testFold != null && Math.floor(i / FOLD) === testFold;
    return (
        <g>
            {testFold != null && (
                <g>
                    <rect x={sx(testFold * FOLD) - 11} y={y - 14} width={3 * 18 + 22} height={28} rx="9"
                        fill={TEST} fillOpacity="0.1" stroke={TEST} strokeOpacity="0.55"
                        strokeWidth="1.5" strokeDasharray="4 3" />
                    <text x={sx(testFold * FOLD) + (3 * 18) / 2} y={y - 21} textAnchor="middle"
                        fontSize="10" fontWeight="700" fill={TEST}>TEST</text>
                </g>
            )}
            {ALL.map((i) => (
                <circle key={i} cx={sx(i)} cy={y} r="7"
                    fill={coloured ? (isTest(i) ? TEST : TRAIN) : NEUTRAL}
                    fillOpacity={coloured ? 0.85 : 0.35}
                    stroke={coloured ? (isTest(i) ? TEST : TRAIN) : NEUTRAL}
                    strokeOpacity={coloured ? 0.5 : 0.25} strokeWidth="1.5" />
            ))}
        </g>
    );
}

// One compact row of the 5-fold diagram: round label, 20 small dots, the test
// band stepping one fold right per row (the staircase IS the rotation), score.
function GridRow({ y, fold, score, tag, tagColor, evaluated }) {
    const bx = gx(fold * FOLD) - 7;
    return (
        <g>
            <text x="30" y={y + 4} textAnchor="middle" fontSize="10" fontWeight="700"
                fill={NEUTRAL} fillOpacity="0.55">F{fold + 1}</text>
            {evaluated && (
                <rect x={bx} y={y - 10} width={3 * 14.5 + 14} height="20" rx="7"
                    fill={TEST} fillOpacity="0.1" stroke={TEST} strokeOpacity="0.55"
                    strokeWidth="1.2" strokeDasharray="3 3" />
            )}
            {ALL.map((i) => {
                const test = Math.floor(i / FOLD) === fold;
                const c = evaluated ? (test ? TEST : TRAIN) : NEUTRAL;
                return (
                    <circle key={i} cx={gx(i)} cy={y} r={test && evaluated ? 5 : 4}
                        fill={c} fillOpacity={evaluated ? 0.85 : 0.3}
                        stroke={c} strokeOpacity={evaluated ? 0.5 : 0.2} strokeWidth="1" />
                );
            })}
            {score != null && (
                <text x="396" y={y + 4} textAnchor="end" fontSize="11" fontFamily="monospace"
                    fontWeight={tag ? 700 : 400} fill={tagColor || NEUTRAL}
                    fillOpacity={tagColor ? 1 : 0.75}>{fmt(score)}</text>
            )}
            {tag && (
                <text x="396" y={y + 16} textAnchor="end" fontSize="8.5" fontWeight="700"
                    fill={tagColor}>{tag}</text>
            )}
        </g>
    );
}

export default function CrossValidationVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';

    // Interactive: evaluate folds one at a time. Reset when leaving the step.
    const [evalCount, setEvalCount] = useState(0);
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setEvalCount(0);
    }
    const done = evalCount >= K;

    const isGrid = state.mode === 'grid' || state.mode === 'report' || interactive;
    const showScores = state.scores || state.mode === 'report';
    const showBanner = state.mode === 'report' || (interactive && done);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Twenty data points cut into five folds; each fold takes one turn as the held-out test set, giving five scores that are summarised as a mean and spread">

                {/* 0 · recap: one split, one score */}
                {state.mode === 'recap' && (
                    <g>
                        <text x={sx(7)} y="85" textAnchor="middle" fontSize="12" fontWeight="700" fill={TRAIN}>
                            TRAIN · 80%
                        </text>
                        <DataRow y={140} testFold={K - 1} coloured />
                        <text x="200" y="205" textAnchor="middle" fontSize="12" fill={NEUTRAL} fillOpacity="0.7">
                            fit a line on 16 points, score the held-out 4
                        </text>
                        <text x="200" y="232" textAnchor="middle" fontSize="14" fontWeight="700"
                            fontFamily="monospace" fill={TEST}>test MSE = {fmt(SINGLE)}</text>
                    </g>
                )}

                {/* 1 · two different single splits, two different real scores */}
                {state.mode === 'two_splits' && (
                    <g>
                        <text x="200" y="38" textAnchor="middle" fontSize="12" fontWeight="700"
                            fill={NEUTRAL} fillOpacity="0.85">same data · same model · different holdout</text>
                        <DataRow y={95} testFold={LUCKY} coloured />
                        <text x="200" y="132" textAnchor="middle" fontSize="11" fontFamily="monospace"
                            fill={NEUTRAL} fillOpacity="0.75">split A → MSE {fmt(FOLD_SCORES[LUCKY])}</text>
                        <DataRow y={190} testFold={UNLUCKY} coloured />
                        <text x="200" y="227" textAnchor="middle" fontSize="11" fontFamily="monospace"
                            fill={NEUTRAL} fillOpacity="0.75">split B → MSE {fmt(FOLD_SCORES[UNLUCKY])}</text>
                        <text x="200" y="262" textAnchor="middle" fontSize="12" fontWeight="700" fill={BAD}>
                            {RATIO}× apart — and neither score is "the" score
                        </text>
                    </g>
                )}

                {/* 2 · cut into k = 5 folds */}
                {state.mode === 'folds' && (
                    <g>
                        <DataRow y={140} coloured={false} />
                        {[1, 2, 3, 4].map((f) => {
                            const cx = (sx(f * FOLD - 1) + sx(f * FOLD)) / 2;
                            return <line key={f} x1={cx} y1="112" x2={cx} y2="168" stroke={NEUTRAL}
                                strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 4" />;
                        })}
                        {[0, 1, 2, 3, 4].map((f) => (
                            <text key={f} x={(sx(f * FOLD) + sx(f * FOLD + 3)) / 2} y="192"
                                textAnchor="middle" fontSize="11" fontWeight="700"
                                fill={NEUTRAL} fillOpacity="0.6">F{f + 1}</text>
                        ))}
                        <text x="200" y="235" textAnchor="middle" fontSize="12" fill={NEUTRAL} fillOpacity="0.7">
                            k = 5 folds × 4 points each — no fold is special yet
                        </text>
                    </g>
                )}

                {/* 3–6 & interactive · the 5-fold staircase */}
                {isGrid && (
                    <g>
                        <text x="200" y="36" textAnchor="middle" fontSize="12" fontWeight="700"
                            fill={NEUTRAL} fillOpacity="0.85">
                            {interactive && !done
                                ? `each round: fit on 16, score the band — ${evalCount}/${K} done`
                                : state.mode === 'grid' && !state.scores
                                    ? 'the held-out band slides — every fold gets one turn'
                                    : '5-fold cross-validation · five real MSE scores'}
                        </text>
                        {GRID_Y.map((y, f) => {
                            const evaluated = interactive ? f < evalCount : true;
                            const spreadTag = state.spread && f === LUCKY ? 'lucky'
                                : state.spread && f === UNLUCKY ? 'unlucky' : null;
                            return (
                                <GridRow key={f} y={y} fold={f} evaluated={evaluated}
                                    score={(interactive ? evaluated : showScores) ? FOLD_SCORES[f] : null}
                                    tag={spreadTag}
                                    tagColor={spreadTag === 'lucky' ? TRAIN : spreadTag === 'unlucky' ? BAD : null} />
                            );
                        })}

                        {/* The report line: the number you actually publish */}
                        {showBanner && (
                            <g>
                                <line x1="45" y1="240" x2="396" y2="240" stroke={NEUTRAL}
                                    strokeOpacity="0.2" strokeWidth="1" />
                                <text x="200" y="266" textAnchor="middle" fontSize="16" fontWeight="700"
                                    fontFamily="monospace" fill={TRAIN}>
                                    CV MSE = {fmt(MEAN)} ± {fmt(STD)}
                                </text>
                                <text x="200" y="286" textAnchor="middle" fontSize="10"
                                    fill={NEUTRAL} fillOpacity="0.6">
                                    {state.caveats
                                        ? '5 scores = 5 full training runs · fit scalers inside each fold'
                                        : 'mean of the five folds ± their spread'}
                                </text>
                            </g>
                        )}
                        {isGrid && !showBanner && !interactive && state.spread && (
                            <text x="200" y="266" textAnchor="middle" fontSize="11" fill={NEUTRAL} fillOpacity="0.7">
                                one lucky draw and one unlucky draw — both are real
                            </text>
                        )}
                    </g>
                )}
            </svg>

            {/* Interactive controls: evaluate the folds one by one, then reveal the mean */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-2">
                    <button onClick={() => setEvalCount((c) => Math.min(c + 1, K))} disabled={done}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-primary rounded-lg px-3 py-2 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer">
                        <Play size={12} />
                        {done ? 'All folds scored' : `Evaluate fold ${evalCount + 1}`}
                    </button>
                    <button onClick={() => setEvalCount(0)}
                        className="flex items-center gap-1.5 text-xs font-medium text-text-muted bg-bg-elevated border border-border-default rounded-lg px-3 py-2 hover:text-text-secondary transition-colors cursor-pointer">
                        <RotateCcw size={12} /> Reset
                    </button>
                    <span className="text-xs font-mono text-text-muted">
                        {evalCount === 0 ? 'no folds scored yet'
                            : done ? `mean ${fmt(MEAN)} ± ${fmt(STD)}`
                                : `F${evalCount}: MSE ${fmt(FOLD_SCORES[evalCount - 1])}`}
                    </span>
                </div>
            )}
        </div>
    );
}
