import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// BM25 visual — seven tiny help-centre pages, the query "reset password".
// Every number (term counts, IDF, raw TF-IDF, BM25 at any k1) is computed for
// real at module load from the DOCS text below. Pure SVG; step states clamp
// defensively (see pages/Explains.jsx). Query terms are told apart by SHAPE:
// circle = "reset", square = "password".
// ──────────────────────────────────────────────────────────────────────────────

const DOCS = [
    'reset your password from the settings page then confirm the new password by email',
    'password password password password tips for choosing a strong password',
    'how to reset a forgotten password in three steps',
    'billing and invoices for your team plan',
    'recover account access when you lose your login credentials',
    'welcome to the help centre here you will find guides about accounts teams billing exports integrations notifications privacy security devices storage sharing and also how to replace a device',
    'password rules use twelve characters or more',
];
const QUERY = ['reset', 'password'];
const B = 0.75;

const TOKENS = DOCS.map((d) => d.split(' '));
const N = TOKENS.length;
const AVG_LEN = TOKENS.reduce((s, d) => s + d.length, 0) / N;
const LENS = TOKENS.map((d) => d.length);
const TF = TOKENS.map((d) => QUERY.map((t) => d.filter((w) => w === t).length));
const DF = QUERY.map((t) => TOKENS.filter((d) => d.includes(t)).length);
const IDF = DF.map((df) => Math.log(1 + (N - df + 0.5) / (df + 0.5)));

const RAW = TF.map((row) => row.reduce((s, tf, q) => s + tf * IDF[q], 0));
const bm25 = (k1) => TF.map((row, i) =>
    row.reduce((s, tf, q) => s + IDF[q] * (tf * (k1 + 1)) / (tf + k1 * (1 - B + B * LENS[i] / AVG_LEN)), 0));
const BM_DEFAULT = bm25(1.2);

const STEP_STATES = [
    { mode: 'intro' },
    { mode: 'counts' },
    { mode: 'idf' },
    { mode: 'raw' },
    { mode: 'saturation' },
    { mode: 'interactive' },
    { mode: 'final' },
    { mode: 'synonym' },
];

const X0 = 62;
const BAR_W = 250;
const rowY = (i) => 52 + i * 30;

const Mark = ({ x, y, kind }) => (kind === 0
    ? <circle cx={x} cy={y} r="5" fill="var(--accent-primary)" fillOpacity="0.85" stroke="currentColor" strokeOpacity="0.25" />
    : <rect x={x - 5} y={y - 5} width="10" height="10" rx="2" fill="var(--secondary)" fillOpacity="0.85" stroke="currentColor" strokeOpacity="0.25" />);

function Bars({ values, max, highlight, lengths, labels }) {
    const top = values.reduce((b, v, i) => (v > values[b] ? i : b), 0);
    return (
        <g>
            {values.map((v, i) => {
                const w = Math.max(0, (v / max) * BAR_W);
                const hot = highlight != null ? highlight === i : v > 0 && i === top;
                return (
                    <g key={i}>
                        <text x="20" y={rowY(i) + 4} fontSize="11" fill="currentColor" fillOpacity="0.75">Doc {i + 1}</text>
                        <rect x={X0} y={rowY(i) - 8} width={BAR_W} height="16" rx="3" fill="currentColor" fillOpacity="0.06" />
                        <rect x={X0} y={rowY(i) - 8} width={w} height="16" rx="3"
                            fill={lengths ? 'currentColor' : 'var(--accent-primary)'}
                            fillOpacity={lengths ? 0.3 : hot ? 0.95 : 0.55}
                            stroke={hot && !lengths ? 'currentColor' : 'none'} strokeOpacity="0.5" />
                        <text x={X0 + BAR_W + 8} y={rowY(i) + 4} fontSize="11" fontFamily="monospace" fill="currentColor" fillOpacity="0.8">
                            {labels ? labels[i] : v.toFixed(2)}{hot && !lengths ? ' ◄' : ''}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}

// tf saturation curve: linear tf vs BM25's tf*(k1+1)/(tf+k1)
function Saturation() {
    const k1 = 1.2;
    const px = (tf) => 50 + (tf / 10) * 310;
    const py = (v) => 250 - (v / 10) * 200;
    const sat = (tf) => (tf * (k1 + 1)) / (tf + k1);
    const pts = Array.from({ length: 41 }, (_, i) => i / 4);
    const lin = pts.map((t) => `${px(t)},${py(t)}`).join(' ');
    const cur = pts.map((t) => `${px(t)},${py(sat(t))}`).join(' ');
    return (
        <g>
            <line x1="50" y1="250" x2="360" y2="250" stroke="currentColor" strokeOpacity="0.4" />
            <line x1="50" y1="50" x2="50" y2="250" stroke="currentColor" strokeOpacity="0.4" />
            <polyline points={lin} fill="none" stroke="var(--destructive)" strokeWidth="2" strokeDasharray="5 4" />
            <polyline points={cur} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" />
            {[1, 2, 5].map((t) => (
                <g key={t}>
                    <circle cx={px(t)} cy={py(sat(t))} r="4.5" fill="var(--accent-primary)" />
                    <text x={px(t) + 6} y={py(sat(t)) + 14} fontSize="11" fontFamily="monospace" fill="currentColor">
                        {t}→{sat(t).toFixed(2)}
                    </text>
                </g>
            ))}
            <text x="205" y="274" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">times the word appears (tf)</text>
            <text x="360" y="62" textAnchor="end" fontSize="11" fill="var(--destructive)">dashed: raw count</text>
            <text x="360" y="78" textAnchor="end" fontSize="11" fill="var(--accent-primary)">solid: BM25 (k1 = 1.2), caps at {(k1 + 1).toFixed(1)}</text>
        </g>
    );
}

export default function BM25Visual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    useReducedMotion(); // no animation here; hook kept so future motion stays gated

    const [k1, setK1] = useState(1.2);
    const scores = interactive ? bm25(k1) : BM_DEFAULT;
    const max = Math.max(...RAW, 1);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Seven help pages scored against the search query reset password, shown as horizontal bars">
                {state.mode === 'intro' && (
                    <g>
                        <Bars values={LENS} max={Math.max(...LENS)} lengths labels={LENS.map((l) => `${l} words`)} />
                        <text x="200" y="278" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">
                            7 pages (bar = length) · query: “reset password”
                        </text>
                    </g>
                )}
                {state.mode === 'counts' && (
                    <g>
                        {TF.map((row, i) => (
                            <g key={i}>
                                <text x="20" y={rowY(i) + 4} fontSize="11" fill="currentColor" fillOpacity="0.75">Doc {i + 1}</text>
                                <rect x={X0} y={rowY(i) - 12} width={BAR_W + 40} height="24" rx="3" fill="currentColor" fillOpacity="0.06" />
                                {row.flatMap((n, q) => Array.from({ length: n }, (_, k) => (
                                    <Mark key={`${q}-${k}`} kind={q} x={X0 + 14 + (q === 0 ? 0 : 36) + k * 14} y={rowY(i)} />
                                )))}
                                {row.every((n) => n === 0) && (
                                    <text x={X0 + 10} y={rowY(i) + 4} fontSize="11" fill="currentColor" fillOpacity="0.5">no query words</text>
                                )}
                            </g>
                        ))}
                        <circle cx="130" cy="270" r="5" fill="var(--accent-primary)" />
                        <text x="140" y="274" fontSize="11" fill="currentColor">= “reset”</text>
                        <rect x="215" y="265" width="10" height="10" rx="2" fill="var(--secondary)" />
                        <text x="231" y="274" fontSize="11" fill="currentColor">= “password”</text>
                    </g>
                )}
                {state.mode === 'idf' && (
                    <g>
                        {IDF.map((v, q) => (
                            <g key={q}>
                                <Mark kind={q} x={34} y={100 + q * 60} />
                                <text x="46" y={104 + q * 60} fontSize="11" fill="currentColor">{QUERY[q]}</text>
                                <rect x="110" y={88 + q * 60} width={(v / IDF[0]) * 230} height="24" rx="4"
                                    fill={q === 0 ? 'var(--accent-primary)' : 'var(--secondary)'} fillOpacity="0.8" />
                                <text x="116" y={104 + q * 60} fontSize="11" fontFamily="monospace" fill="#fff" fontWeight="700">
                                    idf {v.toFixed(2)}
                                </text>
                                <text x="110" y={128 + q * 60} fontSize="11" fill="currentColor" fillOpacity="0.7">
                                    in {DF[q]} of {N} pages
                                </text>
                            </g>
                        ))}
                        <text x="200" y="250" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">
                            rarer word → heavier weight
                        </text>
                    </g>
                )}
                {state.mode === 'raw' && (
                    <g>
                        <Bars values={RAW} max={max} />
                        <text x="200" y="272" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--destructive)">
                            raw tf × idf: the page stuffed with “password” wins
                        </text>
                    </g>
                )}
                {state.mode === 'saturation' && <Saturation />}
                {(interactive || state.mode === 'final') && (
                    <g>
                        <Bars values={scores} max={Math.max(...bm25(3), 1)} />
                        <text x="200" y="272" textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.75">
                            BM25 · k1 = {(interactive ? k1 : 1.2).toFixed(1)} · b = {B}
                        </text>
                    </g>
                )}
                {state.mode === 'synonym' && (
                    <g>
                        <Bars values={BM_DEFAULT} max={Math.max(...bm25(3), 1)} highlight={4} />
                        <text x="200" y="272" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--destructive)">
                            Doc 5 answers the question but scores exactly 0
                        </text>
                    </g>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="bm25-k1" className="text-xs font-bold text-text-secondary">k1 (saturation)</label>
                    <input id="bm25-k1" aria-label="k1 saturation parameter" type="range" min="0.2" max="3" step="0.1"
                        value={k1} onChange={(e) => setK1(Number(e.target.value))} className="flex-1 cursor-pointer" />
                    <span className="text-xs font-mono text-text-muted w-12">{k1.toFixed(1)}</span>
                </div>
            )}
        </div>
    );
}
