import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Fuzzy Logic visual — a temperature axis whose "hot" membership evolves from a
// crisp on/off step into overlapping fuzzy sets, then a working fuzzy fan
// controller: memberships fire rules, a weighted average defuzzifies the output.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
//
// Temperature t ∈ [0, 45] °C. Membership μ ∈ [0, 1].
// ──────────────────────────────────────────────────────────────────────────────

const COLD = 'var(--accent-primary)';
const WARM = '#f59e0b';
const HOT = 'var(--destructive)';

const cold = (t) => (t <= 8 ? 1 : t >= 18 ? 0 : (18 - t) / 10);
const warm = (t) => (t <= 12 || t >= 30 ? 0 : t < 22 ? (t - 12) / 10 : (30 - t) / 8);
const hot = (t) => (t <= 24 ? 0 : t >= 34 ? 1 : (t - 24) / 10);
// Rule outputs (fan %): cold→8, warm→45, hot→92. Weighted-average defuzzification.
const fanSpeed = (t) => {
    const c = cold(t), w = warm(t), h = hot(t);
    const s = c + w + h;
    return s === 0 ? 0 : (c * 8 + w * 45 + h * 92) / s;
};

const sx = (t) => 40 + (t / 45) * 330;
const my = (mu) => 205 - mu * 125; // μ=0 → y205, μ=1 → y80

const curve = (fn) => {
    const pts = [];
    for (let t = 0; t <= 45.001; t += 0.5) pts.push(`${sx(t)},${my(fn(t))}`);
    return pts.join(' ');
};

const STEP_STATES = [
    { mode: 'crisp' },
    { mode: 'crisp_problem' },
    { mode: 'fuzzy_one', t: 29 },
    { mode: 'fuzzy_three', t: 26 },
    { mode: 'rules', t: 26 },
    { mode: 'output', t: 26 },
    { mode: 'interactive' },   // thumbnail shows the full controller at 26°
    { mode: 'final', t: 26 },
];

const SETS = [
    { name: 'cold', fn: cold, color: COLD, out: 'fan slow' },
    { name: 'warm', fn: warm, color: WARM, out: 'fan medium' },
    { name: 'hot', fn: hot, color: HOT, out: 'fan fast' },
];

export default function FuzzyLogicVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';

    const [userT, setUserT] = useState(26);
    const t = interactive ? userT : (state.t ?? 26);

    const crisp = state.mode === 'crisp' || state.mode === 'crisp_problem';
    const oneSet = state.mode === 'fuzzy_one';
    const showRules = state.mode === 'rules' || state.mode === 'output' || interactive || state.mode === 'final';
    const showOutput = state.mode === 'output' || interactive;
    const showMarker = !crisp && state.mode !== 'final';
    const fan = fanSpeed(t);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Temperature membership functions evolving from a crisp threshold into overlapping fuzzy sets driving a fan controller">
                {/* μ axis + temperature axis */}
                <line x1="40" y1="205" x2="375" y2="205" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                <line x1="40" y1="205" x2="40" y2="70" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                <text x="30" y="84" textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.55">μ=1</text>
                <text x="30" y="208" textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.55">μ=0</text>
                {[0, 10, 20, 30, 40].map((d) => (
                    <text key={d} x={sx(d)} y="220" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.5">{d}°</text>
                ))}

                {/* Crisp step: hot is all-or-nothing at 30° */}
                {crisp && (
                    <g>
                        <polyline points={`${sx(0)},${my(0)} ${sx(30)},${my(0)} ${sx(30)},${my(1)} ${sx(45)},${my(1)}`}
                            fill="none" stroke={HOT} strokeWidth="2.5" />
                        <text x={sx(35)} y={my(1) - 8} fontSize="11" fontWeight="700" fill={HOT}>"hot"</text>
                        <text x={sx(12)} y={my(0) - 8} fontSize="11" fill="currentColor" fillOpacity="0.6">"not hot"</text>
                        {state.mode === 'crisp_problem' && (
                            <g fontSize="10" fontWeight="700">
                                <circle cx={sx(29.9)} cy={my(0)} r="5" fill="currentColor" fillOpacity="0.7" />
                                <text x={sx(29.9) - 8} y={my(0) + 24} textAnchor="end" fill="currentColor" fillOpacity="0.8">29.9° → cold?!</text>
                                <circle cx={sx(30.1)} cy={my(1)} r="5" fill={HOT} />
                                <text x={sx(30.1) + 8} y={my(1) - 10} fill={HOT}>30.1° → hot!</text>
                            </g>
                        )}
                    </g>
                )}

                {/* Fuzzy membership curves */}
                {!crisp && (
                    <g>
                        {oneSet ? (
                            <polyline points={curve(hot)} fill="none" stroke={HOT} strokeWidth="2.5" />
                        ) : (
                            SETS.map(({ name, fn, color }) => (
                                <g key={name}>
                                    <polyline points={curve(fn)} fill="none" stroke={color} strokeWidth="2.5" strokeOpacity="0.85" />
                                </g>
                            ))
                        )}
                        {!oneSet && (
                            <g fontSize="10" fontWeight="700">
                                <text x={sx(3)} y={my(1) - 8} fill={COLD}>cold</text>
                                <text x={sx(21)} y={my(1) + 14} textAnchor="middle" fill={WARM}>warm</text>
                                <text x={sx(41)} y={my(1) - 8} textAnchor="end" fill={HOT}>hot</text>
                            </g>
                        )}

                        {/* Current-temperature marker + membership levels */}
                        {showMarker && (
                            <g>
                                <line x1={sx(t)} y1="205" x2={sx(t)} y2="70" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 3" />
                                <text x={sx(t)} y="62" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fillOpacity="0.85">
                                    {t.toFixed(oneSet ? 0 : 0)}°C
                                </text>
                                {(oneSet ? [SETS[2]] : SETS).map(({ name, fn, color }) => {
                                    const mu = fn(t);
                                    if (mu <= 0.02) return null;
                                    return (
                                        <g key={name}>
                                            <circle cx={sx(t)} cy={my(mu)} r="4.5" fill={color} />
                                            <text x={sx(t) + 9} y={my(mu) - 6} fontSize="10" fontFamily="monospace" fill={color}>
                                                {name} {mu.toFixed(2)}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>
                        )}
                    </g>
                )}

                {/* Rule strip: rules fire in proportion to membership */}
                {showRules && (
                    <g>
                        {SETS.map(({ name, fn, color, out }, i) => {
                            const mu = fn(t);
                            const x0 = 40 + i * 115;
                            return (
                                <g key={name} fontSize="9">
                                    <text x={x0} y="245" fill="currentColor" fillOpacity="0.7">
                                        IF {name} → {out}
                                    </text>
                                    <rect x={x0} y="251" width="92" height="7" rx="3.5" fill="currentColor" fillOpacity="0.08" />
                                    <rect x={x0} y="251" width={Math.max(1, mu * 92)} height="7" rx="3.5" fill={color} fillOpacity="0.85" />
                                    <text x={x0 + 96} y="258" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">{Math.round(mu * 100)}%</text>
                                </g>
                            );
                        })}
                        {showOutput && (
                            <g>
                                <rect x="40" y="270" width="330" height="10" rx="5" fill="currentColor" fillOpacity="0.08" />
                                <rect x="40" y="270" width={Math.max(2, (fan / 100) * 330)} height="10" rx="5" fill="var(--accent-primary)" fillOpacity="0.9" />
                                <text x="205" y="296" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--accent-primary)">
                                    fan speed = {Math.round(fan)}%  (weighted blend of all firing rules)
                                </text>
                            </g>
                        )}
                    </g>
                )}

                {/* Finale caption */}
                {state.mode === 'final' && (
                    <text x="205" y="290" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                        rice cookers · camera autofocus · ABS brakes · HVAC — all fuzzy controllers
                    </text>
                )}
            </svg>

            {/* Interactive controls */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="fz-temp" className="text-[11px] font-mono text-text-muted flex-shrink-0">
                        room = {userT}°C
                    </label>
                    <input id="fz-temp" type="range" min="0" max="45" value={userT}
                        onChange={(e) => setUserT(Number(e.target.value))}
                        className="flex-1 accent-[var(--accent-primary)] cursor-pointer" aria-label="Room temperature" />
                </div>
            )}
        </div>
    );
}
