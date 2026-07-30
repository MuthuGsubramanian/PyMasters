// ──────────────────────────────────────────────────────────────────────────────
// Train/Test Split visual — one persistent SVG "row of data points" that evolves
// with the essay's steps (see pages/Explains.jsx). Pure SVG; defensive clamping.
//
// 10 data points in a row. As you scroll: the set appears, a cut line drops at
// 80%, points colour into train (left) vs test (right), the model "learns", and
// two accuracy bars reveal the honest gap that exposes overfitting.
// ──────────────────────────────────────────────────────────────────────────────

const N = 10;
const DOTS = Array.from({ length: N }, (_, i) => ({ x: 42 + i * 34, i })); // x: 42..348
const CUT_INDEX = 8; // first 8 train, last 2 test (80/20)
const CUT_X = (DOTS[CUT_INDEX - 1].x + DOTS[CUT_INDEX].x) / 2;

const TRAIN = 'var(--accent-primary)';
const TEST = 'var(--secondary)';
const NEUTRAL = 'currentColor';

// mode per step: what to draw. Extra indices clamp to the last state.
const STEP_STATES = [
    { mode: 'intro' },      // 0 the dataset
    { mode: 'intro' },      // 1 the trap
    { mode: 'cut' },        // 2 hold some back
    { mode: 'split' },      // 3 train vs test
    { mode: 'train' },      // 4 the model learns from train
    { mode: 'bars_good' },  // 5 the moment of truth (honest model)
    { mode: 'bars_bad' },   // 6 overfitting
    { mode: 'bars_good' },  // 7 takeaway / thumbnail
];

// Accuracy bars: [trainAcc, testAcc] per mode.
const BARS = { bars_good: [0.95, 0.9], bars_bad: [0.99, 0.55] };

function Bar({ x, label, acc, color }) {
    const H = 120; // full bar height
    const h = Math.round(acc * H);
    const top = 250 - h;
    return (
        <g>
            <rect x={x} y={130} width="70" height={H} rx="6" fill={NEUTRAL} opacity="0.06" />
            <rect x={x} y={top} width="70" height={h} rx="6" fill={color} opacity="0.85" />
            <text x={x + 35} y={top - 8} textAnchor="middle" fontSize="15" fontWeight="700" fill={color}>
                {Math.round(acc * 100)}%
            </text>
            <text x={x + 35} y="268" textAnchor="middle" fontSize="11" fill={NEUTRAL} fillOpacity="0.6">{label}</text>
        </g>
    );
}

export default function TrainTestSplitVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const mode = STEP_STATES[idx].mode;
    const showCut = mode === 'cut' || mode === 'split' || mode === 'train';
    const coloured = mode === 'split' || mode === 'train';
    const showBars = mode === 'bars_good' || mode === 'bars_bad';
    const bars = BARS[mode];
    const gap = bars ? Math.round((bars[0] - bars[1]) * 100) : 0;

    const dotColor = (i) => {
        if (!coloured) return NEUTRAL;
        return i < CUT_INDEX ? TRAIN : TEST;
    };
    const dotOpacity = (i) => {
        if (mode === 'train' && i >= CUT_INDEX) return 0.25; // test set "in the vault" while training
        return coloured ? 0.9 : 0.35;
    };

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Ten data points split into a training set and a held-out test set, then accuracy bars comparing them">

                {!showBars && (
                    <>
                        {/* Section labels once coloured */}
                        {coloured && (
                            <g fontSize="12" fontWeight="700">
                                <text x={CUT_X / 2 + 10} y="55" textAnchor="middle" fill={TRAIN}>TRAIN · 80%</text>
                                <text x={(CUT_X + 400) / 2 - 30} y="55" textAnchor="middle" fill={TEST}>TEST · 20%</text>
                            </g>
                        )}

                        {/* The data points */}
                        {DOTS.map(({ x, i }) => (
                            <circle key={i} cx={x} cy="150" r="11"
                                fill={dotColor(i)} fillOpacity={dotOpacity(i)}
                                stroke={dotColor(i)} strokeOpacity={coloured ? 0.6 : 0.3} strokeWidth="1.5" />
                        ))}

                        {/* Fitted trend line through the training points (model "learns") */}
                        {mode === 'train' && (
                            <line x1={DOTS[0].x} y1="150" x2={DOTS[CUT_INDEX - 1].x} y2="150"
                                stroke={TRAIN} strokeWidth="2.5" strokeOpacity="0.7" strokeDasharray="1 0" />
                        )}

                        {/* The 80/20 cut */}
                        {showCut && (
                            <g>
                                <line x1={CUT_X} y1="90" x2={CUT_X} y2="215" stroke={NEUTRAL} strokeOpacity="0.45"
                                    strokeWidth="1.5" strokeDasharray="4 4" />
                                <text x={CUT_X} y="235" textAnchor="middle" fontSize="10" fill={NEUTRAL} fillOpacity="0.55">
                                    held-out cut
                                </text>
                            </g>
                        )}

                        {/* Caption for the earliest steps */}
                        {!coloured && (
                            <text x="200" y="215" textAnchor="middle" fontSize="12" fill={NEUTRAL} fillOpacity="0.6">
                                {mode === 'cut' ? 'keep the right slice in a vault' : 'your dataset'}
                            </text>
                        )}
                    </>
                )}

                {/* Accuracy bars: the honest comparison */}
                {showBars && (
                    <>
                        <text x="200" y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill={NEUTRAL} fillOpacity="0.85">
                            Accuracy: what it memorised vs what it learned
                        </text>
                        <Bar x="70" label="TRAIN (seen)" acc={bars[0]} color={TRAIN} />
                        <Bar x="260" label="TEST (unseen)" acc={bars[1]} color={TEST} />
                        {/* Gap callout */}
                        <text x="200" y="110" textAnchor="middle" fontSize="12" fontWeight="700"
                            fill={mode === 'bars_bad' ? 'var(--destructive)' : 'var(--accent-primary)'}>
                            {mode === 'bars_bad' ? `overfit: ${gap}-point gap` : `healthy: only ${gap}-point gap`}
                        </text>
                    </>
                )}
            </svg>
        </div>
    );
}
