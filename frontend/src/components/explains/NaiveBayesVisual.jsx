import { useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Naive Bayes visual — a REAL tiny spam filter fit at module load. A hand-set
// corpus of word counts (8 spam / 12 ham emails), Laplace-smoothed per-class
// likelihoods, real priors, and real log-odds scoring. Messages are scored as
// waterfalls of signed per-word evidence bars that stack into a verdict.
// Pure SVG; step states clamp defensively (see pages/Explains.jsx).
// ──────────────────────────────────────────────────────────────────────────────

const WORDS = ['free', 'winner', 'urgent', 'click', 'meeting', 'report', 'lunch', 'project'];

// Hand-set training corpus: total word counts across 8 spam and 12 ham emails.
const SPAM_COUNTS = { free: 14, winner: 9, urgent: 8, click: 11, meeting: 1, report: 2, lunch: 0, project: 1 };
const HAM_COUNTS = { free: 2, winner: 0, urgent: 3, click: 1, meeting: 12, report: 9, lunch: 7, project: 11 };
const N_SPAM = 8;
const N_HAM = 12;

const V = WORDS.length; // vocabulary size, for Laplace smoothing
const SPAM_TOTAL = WORDS.reduce((s, w) => s + SPAM_COUNTS[w], 0); // 46
const HAM_TOTAL = WORDS.reduce((s, w) => s + HAM_COUNTS[w], 0);   // 45

// Laplace-smoothed likelihoods and per-word log-likelihood ratios (the weights).
const P_W_SPAM = {};
const P_W_HAM = {};
const LLR = {};
WORDS.forEach((w) => {
    P_W_SPAM[w] = (SPAM_COUNTS[w] + 1) / (SPAM_TOTAL + V);
    P_W_HAM[w] = (HAM_COUNTS[w] + 1) / (HAM_TOTAL + V);
    LLR[w] = Math.log(P_W_SPAM[w] / P_W_HAM[w]);
});
const PRIOR_LO = Math.log((N_SPAM / (N_SPAM + N_HAM)) / (N_HAM / (N_SPAM + N_HAM))); // ln(8/12) ≈ −0.41

// Real scoring: prior log-odds + sum of per-word log-likelihood ratios.
const scoreMessage = (words) => {
    const rows = [{ label: 'prior 8:12', delta: PRIOR_LO, from: 0, to: PRIOR_LO }];
    let lo = PRIOR_LO;
    words.forEach((w) => {
        rows.push({ label: w, delta: LLR[w], from: lo, to: lo + LLR[w] });
        lo += LLR[w];
    });
    return { rows, total: lo, pSpam: 1 / (1 + Math.exp(-lo)) };
};

const MESSAGES = [
    { id: 'spam', words: ['free', 'winner', 'click', 'urgent'] },
    { id: 'ham', words: ['meeting', 'lunch', 'report', 'project'] },
    { id: 'ambig', words: ['free', 'click', 'meeting', 'report'] },
    { id: 'memo', words: ['urgent', 'project', 'report'] },
].map((m) => ({ ...m, ...scoreMessage(m.words) }));

const WEIGHT_ORDER = [...WORDS].sort((a, b) => LLR[b] - LLR[a]);

const fmtS = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
const fmtPct = (p) => {
    const pct = p * 100;
    return pct >= 0.1 && pct <= 99.9 ? pct.toFixed(1) : pct.toFixed(2);
};

// Scales: weights view zooms into ±2.5 log-units; message waterfalls span ±8.
const xW = (v) => 200 + v * 66;
const xM = (v) => 236 + v * 18;

// Index 6 must stand alone as the Explains-index thumbnail → the ambiguous
// message's evidence tug-of-war.
const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'bayes' },
    { mode: 'table' },
    { mode: 'weights' },
    { mode: 'message', msg: 0 },
    { mode: 'message', msg: 1 },
    { mode: 'message', msg: 2 },
    { mode: 'interactive' },
    { mode: 'smoothing' },
];

function Envelope({ x, y, tone }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <rect width="26" height="17" rx="2" fill="none" stroke={tone} strokeWidth="1.5" />
            <path d="M1 2 L13 10 L25 2" fill="none" stroke={tone} strokeWidth="1.2" />
        </g>
    );
}

function Waterfall({ msg }) {
    const verdictSpam = msg.total > 0;
    return (
        <g>
            <text x="200" y="20" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                “{msg.words.join(' ')}”
            </text>

            {/* Decision boundary: log-odds = 0 */}
            <line x1={xM(0)} y1="44" x2={xM(0)} y2="212" stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" />
            <text x={xM(0)} y="38" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.55">50 / 50</text>

            {msg.rows.map((r, i) => {
                const y = 56 + i * 27;
                const x1 = xM(r.from);
                const x2 = xM(r.to);
                return (
                    <g key={`${r.label}-${i}`}>
                        {i > 0 && (
                            <line x1={x1} y1={y - 14} x2={x1} y2={y + 7} stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                        )}
                        <rect
                            x={Math.min(x1, x2)} y={y - 6.5}
                            width={Math.max(1.5, Math.abs(x2 - x1))} height="13" rx="2"
                            fill={r.delta >= 0 ? 'var(--accent-primary)' : 'var(--secondary)'}
                            opacity={i === 0 ? 0.55 : 0.9}
                        />
                        <text x="6" y={y + 4} fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">{r.label}</text>
                        <text
                            x={r.delta >= 0 ? Math.max(x1, x2) + 4 : Math.min(x1, x2) - 4}
                            y={y + 4} textAnchor={r.delta >= 0 ? 'start' : 'end'}
                            fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.6"
                        >
                            {fmtS(r.delta)}
                        </text>
                    </g>
                );
            })}

            {/* Final position marker */}
            {(() => {
                const yEnd = 56 + msg.rows.length * 27;
                return (
                    <g>
                        <line x1={xM(msg.total)} y1={yEnd - 16} x2={xM(msg.total)} y2={yEnd} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
                        <path
                            d={`M ${xM(msg.total)} ${yEnd} l -5 8 l 5 8 l 5 -8 z`}
                            fill={verdictSpam ? 'var(--destructive)' : 'var(--secondary)'}
                        />
                    </g>
                );
            })()}

            <text x="60" y="236" fontSize="9" fill="currentColor" fillOpacity="0.55">← evidence for ham</text>
            <text x="340" y="236" textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.55">evidence for spam →</text>

            <text x="200" y="262" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                {`log-odds ${fmtS(msg.total)} → P(spam) = ${fmtPct(msg.pSpam)}%  `}
                <tspan fontWeight="bold" fill={verdictSpam ? 'var(--destructive)' : 'var(--secondary)'}>
                    {verdictSpam ? 'SPAM' : 'HAM'}
                </tspan>
            </text>
        </g>
    );
}

export default function NaiveBayesVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';

    const [userMsg, setUserMsg] = useState(2);
    const msg = state.mode === 'message' ? MESSAGES[state.msg] : interactive ? MESSAGES[userMsg] : null;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg
                viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="A tiny spam filter: word counts from spam and ham emails become signed evidence weights, and each message's words stack into a waterfall of evidence bars that ends in a spam-or-ham verdict"
            >
                {state.mode === 'intro' && (
                    <g>
                        <text x="200" y="24" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.85">
                            the training set: 20 emails, already sorted
                        </text>
                        {Array.from({ length: N_SPAM }, (_, i) => (
                            <Envelope key={`s${i}`} x={40 + (i % 4) * 34} y={64 + Math.floor(i / 4) * 27} tone="var(--destructive)" />
                        ))}
                        <text x="103" y="140" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="var(--destructive)">spam — 8</text>
                        {Array.from({ length: N_HAM }, (_, i) => (
                            <Envelope key={`h${i}`} x={224 + (i % 4) * 34} y={64 + Math.floor(i / 4) * 27} tone="var(--secondary)" />
                        ))}
                        <text x="287" y="167" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="var(--secondary)">ham — 12</text>
                        <text x="200" y="212" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                            each email is reduced to nothing but word counts
                        </text>
                        <text x="200" y="240" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">
                            P(spam) = 8/20 = 0.40&#160;&#160;&#160;P(ham) = 12/20 = 0.60
                        </text>
                    </g>
                )}

                {state.mode === 'bayes' && (
                    <g>
                        <text x="200" y="24" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.85">
                            Bayes&#8217; rule: flip the conditional
                        </text>
                        <text x="200" y="76" textAnchor="middle" fontSize="13" fontFamily="monospace" fill="var(--accent-primary)">
                            P(spam | words) ∝ P(words | spam) × P(spam)
                        </text>
                        <text x="94" y="98" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.55">what we want</text>
                        <text x="252" y="98" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.55">countable from the corpus</text>
                        <text x="352" y="98" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.55">the prior</text>

                        <text x="112" y="164" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">P(spam)</text>
                        <rect x="122" y="154" width={0.4 * 220} height="14" rx="2" fill="var(--destructive)" opacity="0.8" />
                        <text x={122 + 0.4 * 220 + 6} y="165" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">8/20 = 0.40</text>

                        <text x="112" y="199" textAnchor="end" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">P(ham)</text>
                        <rect x="122" y="189" width={0.6 * 220} height="14" rx="2" fill="var(--secondary)" opacity="0.8" />
                        <text x={122 + 0.6 * 220 + 6} y="200" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">12/20 = 0.60</text>

                        <text x="200" y="248" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                            score both classes with the same rule — larger score wins
                        </text>
                        <text x="200" y="268" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.65">
                            starting log-odds: ln(0.40/0.60) = {fmtS(PRIOR_LO)}
                        </text>
                    </g>
                )}

                {state.mode === 'table' && (
                    <g fontFamily="monospace">
                        <text x="200" y="20" textAnchor="middle" fontSize="12" fontFamily="inherit" fill="currentColor" fillOpacity="0.85">
                            one lookup per word — nothing more
                        </text>
                        <g fontSize="10" fill="currentColor" fillOpacity="0.55">
                            <text x="48" y="46">word</text>
                            <text x="158" y="46" textAnchor="end">spam ct</text>
                            <text x="218" y="46" textAnchor="end">ham ct</text>
                            <text x="296" y="46" textAnchor="end">P(w|spam)</text>
                            <text x="366" y="46" textAnchor="end">P(w|ham)</text>
                        </g>
                        <line x1="40" y1="54" x2="370" y2="54" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
                        {WORDS.map((w, i) => (
                            <g key={w} fontSize="10" fill="currentColor" fillOpacity="0.8">
                                <text x="48" y={72 + i * 21}>{w}</text>
                                <text x="158" y={72 + i * 21} textAnchor="end">{SPAM_COUNTS[w]}</text>
                                <text x="218" y={72 + i * 21} textAnchor="end">{HAM_COUNTS[w]}</text>
                                <text x="296" y={72 + i * 21} textAnchor="end" fill="var(--accent-primary)">{P_W_SPAM[w].toFixed(3)}</text>
                                <text x="366" y={72 + i * 21} textAnchor="end">{P_W_HAM[w].toFixed(3)}</text>
                            </g>
                        ))}
                        <text x="200" y="264" textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.6">
                            e.g. P(free|spam) = (14+1)/(46+8) = {P_W_SPAM.free.toFixed(3)}&#160;&#160;(Laplace-smoothed)
                        </text>
                    </g>
                )}

                {state.mode === 'weights' && (
                    <g>
                        <text x="200" y="20" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                            weight(w) = ln P(w|spam) / P(w|ham)
                        </text>
                        <line x1={xW(0)} y1="34" x2={xW(0)} y2="242" stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" />
                        {WEIGHT_ORDER.map((w, i) => {
                            const y = 48 + i * 25;
                            const pos = LLR[w] >= 0;
                            return (
                                <g key={w}>
                                    <rect
                                        x={Math.min(xW(0), xW(LLR[w]))} y={y - 6.5}
                                        width={Math.abs(xW(LLR[w]) - xW(0))} height="13" rx="2"
                                        fill={pos ? 'var(--accent-primary)' : 'var(--secondary)'} opacity="0.85"
                                    />
                                    <text
                                        x={pos ? xW(0) - 6 : xW(0) + 6} y={y + 4}
                                        textAnchor={pos ? 'end' : 'start'}
                                        fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.8"
                                    >
                                        {w}
                                    </text>
                                    <text
                                        x={pos ? xW(LLR[w]) + 5 : xW(LLR[w]) - 5} y={y + 4}
                                        textAnchor={pos ? 'start' : 'end'}
                                        fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.6"
                                    >
                                        {fmtS(LLR[w])}
                                    </text>
                                </g>
                            );
                        })}
                        <text x="52" y="266" fontSize="9" fill="currentColor" fillOpacity="0.55">← pushes toward ham</text>
                        <text x="348" y="266" textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.55">pushes toward spam →</text>
                    </g>
                )}

                {msg && <Waterfall msg={msg} />}

                {state.mode === 'smoothing' && (
                    <g>
                        <text x="200" y="24" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.85">
                            the zero-count trap → Laplace smoothing
                        </text>
                        <g fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.85">
                            <text x="40" y="64">&#8220;winner&#8221; in ham emails: count = 0</text>
                            <text x="40" y="92" fill="var(--destructive)">raw:      P(winner|ham) = 0/45 = 0</text>
                            <text x="40" y="112" fontSize="10" fillOpacity="0.65">→ one unseen word would veto ham entirely</text>
                            <text x="40" y="140" fill="var(--accent-primary)">smoothed: (0+1)/(45+8) = {P_W_HAM.winner.toFixed(3)}</text>
                        </g>
                        <text x="150" y="184" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">P(winner|ham)</text>
                        <rect x="158" y="174" width={P_W_HAM.winner * 900} height="13" rx="2" fill="var(--secondary)" opacity="0.85" />
                        <text x={158 + P_W_HAM.winner * 900 + 6} y="185" fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">{P_W_HAM.winner.toFixed(3)}</text>

                        <text x="150" y="212" textAnchor="end" fontSize="10" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">P(winner|spam)</text>
                        <rect x="158" y="202" width={P_W_SPAM.winner * 900} height="13" rx="2" fill="var(--accent-primary)" opacity="0.85" />
                        <text x={158 + P_W_SPAM.winner * 900 + 6} y="213" fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">{P_W_SPAM.winner.toFixed(3)}</text>

                        <text x="200" y="252" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                            add one imaginary sighting of every word to every class —
                        </text>
                        <text x="200" y="268" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.65">
                            no single word can ever veto a class again
                        </text>
                    </g>
                )}
            </svg>

            {/* Interactive controls: pick a message to score */}
            {interactive && (
                <div className="flex-shrink-0 pt-2 flex flex-wrap gap-2" role="group" aria-label="Pick a message to score">
                    {MESSAGES.map((m, i) => (
                        <button
                            key={m.id}
                            onClick={() => setUserMsg(i)}
                            className={`px-3 py-2 cursor-pointer rounded-lg border text-[11px] font-mono transition-colors ${
                                userMsg === i
                                    ? 'border-accent-primary text-accent-primary bg-accent-subtle'
                                    : 'border-border-strong text-text-muted hover:text-text-primary'
                            }`}
                            aria-pressed={userMsg === i}
                        >
                            “{m.words.join(' ')}”
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
