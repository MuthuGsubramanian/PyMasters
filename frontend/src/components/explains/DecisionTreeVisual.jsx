// ──────────────────────────────────────────────────────────────────────────────
// Decision Tree visual — left panel is a 2-D feature space (apples vs lemons),
// right panel is the flowchart the tree is learning. As the essay progresses,
// splits partition the space and the flowchart grows a node at a time.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
//
// Feature panel: x ∈ [15, 230] ("weight"), y ∈ [45, 265] ("roundness", screen-down).
// Split 1: x = 125. Split 2 (left region only): y = 185.
// ──────────────────────────────────────────────────────────────────────────────

const APPLE = 'var(--accent-primary)';
const LEMON = 'var(--secondary)';

const LEMONS = [[45, 90], [70, 70], [62, 122], [92, 95], [108, 62], [82, 142], [50, 165]];
const APPLES = [[150, 200], [175, 232], [202, 182], [160, 162], [212, 222], [142, 244], [60, 225], [95, 205], [75, 250]];
// Two noisy points on the wrong side — the bait for overfitting.
const NOISE_APPLE = [85, 105];  // an apple deep in lemon territory
const NOISE_LEMON = [185, 205]; // a lemon deep in apple territory

const SPLIT_X = 125;
const SPLIT_Y = 185;

const STEP_STATES = [
    { mode: 'flow' },     // 0 an everyday flowchart
    { mode: 'data' },     // 1 the labelled points
    { mode: 'split1' },   // 2 first question
    { mode: 'split2' },   // 3 recurse
    { mode: 'regions' },  // 4 the tree IS the model
    { mode: 'overfit' },  // 5 grown too deep
    { mode: 'regions' },  // 6 pruned back (thumbnail)
    { mode: 'regions' },  // 7 takeaway
];

const Diamond = ({ cx, cy, w = 74, h = 40, text, sub, color = 'currentColor' }) => (
    <g>
        <polygon points={`${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`}
            fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="1.5" />
        <text x={cx} y={sub ? cy - 2 : cy + 3} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.85">{text}</text>
        {sub && <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.85">{sub}</text>}
    </g>
);

const Leaf = ({ cx, cy, text, color }) => (
    <g>
        <rect x={cx - 27} y={cy - 11} width="54" height="22" rx="7"
            fill={color} fillOpacity="0.12" stroke={color} strokeOpacity="0.6" strokeWidth="1.5" />
        <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>{text}</text>
    </g>
);

const Edge = ({ x1, y1, x2, y2, label }) => (
    <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.2" />
        {label && (
            <text x={(x1 + x2) / 2 + (x2 < x1 ? -10 : 10)} y={(y1 + y2) / 2} textAnchor="middle"
                fontSize="8" fill="currentColor" fillOpacity="0.55">{label}</text>
        )}
    </g>
);

export default function DecisionTreeVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const { mode } = STEP_STATES[idx];

    const showSplit1 = mode === 'split1' || mode === 'split2' || mode === 'regions' || mode === 'overfit';
    const showSplit2 = mode === 'split2' || mode === 'regions' || mode === 'overfit';
    const showRegions = mode === 'regions' || mode === 'overfit';
    const overfit = mode === 'overfit';

    const dot = ([x, y], color, key) => (
        <circle key={key} cx={x} cy={y} r="6" fill={color} fillOpacity="0.85" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    );

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A scatter of apples and lemons being partitioned by a decision tree, alongside the flowchart the tree learns">

                {mode === 'flow' ? (
                    /* An everyday flowchart — the shape a tree will learn */
                    <g>
                        <Diamond cx={200} cy={80} w={110} h={52} text="Is it raining?" />
                        <Edge x1={165} y1={95} x2={120} y2={165} label="yes" />
                        <Edge x1={235} y1={95} x2={280} y2={165} label="no" />
                        <Leaf cx={120} cy={180} text="umbrella" color={APPLE} />
                        <Leaf cx={280} cy={180} text="sunglasses" color={LEMON} />
                        <text x="200" y="248" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">
                            one question → one decision
                        </text>
                    </g>
                ) : (
                    <g>
                        {/* ── Feature-space panel ── */}
                        <rect x="15" y="45" width="215" height="220" rx="8" fill="none" stroke="currentColor" strokeOpacity="0.15" />
                        <text x="122" y="285" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.55">weight  →</text>
                        <text x="7" y="155" fontSize="10" fill="currentColor" fillOpacity="0.55" transform="rotate(-90 7 155)" textAnchor="middle">roundness  →</text>

                        {/* Region fills = the model's predictions */}
                        {showRegions && (
                            <g>
                                <rect x={SPLIT_X} y="45" width={230 - SPLIT_X} height="220" fill={APPLE} fillOpacity="0.07" />
                                <rect x="15" y={SPLIT_Y} width={SPLIT_X - 15} height={265 - SPLIT_Y} fill={APPLE} fillOpacity="0.07" />
                                <rect x="15" y="45" width={SPLIT_X - 15} height={SPLIT_Y - 45} fill={LEMON} fillOpacity="0.08" />
                            </g>
                        )}

                        {/* Splits */}
                        {showSplit1 && (
                            <line x1={SPLIT_X} y1="45" x2={SPLIT_X} y2="265" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="5 4" />
                        )}
                        {showSplit2 && (
                            <line x1="15" y1={SPLIT_Y} x2={SPLIT_X} y2={SPLIT_Y} stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="5 4" />
                        )}

                        {/* Overfit: absurd micro-boxes carved around the two noisy points */}
                        {overfit && (
                            <g stroke="var(--destructive)" strokeOpacity="0.7" strokeWidth="1.3" fill="var(--destructive)" fillOpacity="0.08">
                                <rect x={NOISE_APPLE[0] - 13} y={NOISE_APPLE[1] - 13} width="26" height="26" strokeDasharray="3 2" />
                                <rect x={NOISE_LEMON[0] - 13} y={NOISE_LEMON[1] - 13} width="26" height="26" strokeDasharray="3 2" />
                            </g>
                        )}

                        {/* The fruit */}
                        {LEMONS.map((p, i) => dot(p, LEMON, `l${i}`))}
                        {APPLES.map((p, i) => dot(p, APPLE, `a${i}`))}
                        {dot(NOISE_APPLE, APPLE, 'na')}
                        {dot(NOISE_LEMON, LEMON, 'nl')}

                        {/* ── Flowchart panel ── */}
                        {mode === 'data' ? (
                            <text x="318" y="155" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">
                                no flowchart yet…
                            </text>
                        ) : (
                            <g>
                                <Diamond cx={318} cy={70} w={92} h={44} text="weight" sub="> 120 ?" />
                                <Edge x1={342} y1={82} x2={365} y2={139} label="yes" />
                                <Leaf cx={368} cy={152} text="apple" color={APPLE} />
                                {showSplit2 ? (
                                    <g>
                                        <Edge x1={294} y1={82} x2={272} y2={139} label="no" />
                                        <Diamond cx={270} cy={155} w={88} h={42} text="round" sub="> 60 ?" />
                                        <Edge x1={248} y1={166} x2={248} y2={214} label="no" />
                                        <Edge x1={292} y1={166} x2={318} y2={214} label="yes" />
                                        <Leaf cx={244} cy={228} text="lemon" color={LEMON} />
                                        <Leaf cx={324} cy={228} text="apple" color={APPLE} />
                                    </g>
                                ) : (
                                    <g>
                                        <Edge x1={294} y1={82} x2={272} y2={139} label="no" />
                                        <text x={270} y={158} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.5">?</text>
                                    </g>
                                )}
                                {overfit && (
                                    <g fill="var(--destructive)">
                                        <text x={318} y={262} textAnchor="middle" fontSize="9" fillOpacity="0.9">
                                            …7 more levels of questions…
                                        </text>
                                        <text x={318} y={276} textAnchor="middle" fontSize="9" fontWeight="700">
                                            one leaf per data point = memorising
                                        </text>
                                    </g>
                                )}
                            </g>
                        )}
                    </g>
                )}
            </svg>
        </div>
    );
}
