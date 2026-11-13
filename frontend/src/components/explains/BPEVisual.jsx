import { useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Byte-Pair Encoding visual — a tiny corpus (low ×5, lower ×2, newest ×6,
// widest ×3) is split into characters and the most frequent adjacent pair is
// merged, over and over. Every pair count, merge and token list below is
// computed for real at module load (no random, no clock).
// Single characters = thin outlined tiles; merged tokens = filled, bold tiles.
// ──────────────────────────────────────────────────────────────────────────────

const CORPUS = [['low', 5], ['lower', 2], ['newest', 6], ['widest', 3]];
const END = '_'; // end-of-word marker, so "est_" (a word ending) differs from "est" inside a word
const MAX_MERGES = 10;

const applyMerge = (syms, [a, b]) => {
    const out = [];
    for (let i = 0; i < syms.length; i++) {
        if (i < syms.length - 1 && syms[i] === a && syms[i + 1] === b) { out.push(a + b); i++; } else out.push(syms[i]);
    }
    return out;
};

// Count adjacent pairs weighted by word frequency; ties broken alphabetically.
const countPairs = (words) => {
    const c = {};
    words.forEach(({ s, f }) => {
        for (let i = 0; i < s.length - 1; i++) {
            const k = `${s[i]}|${s[i + 1]}`;
            c[k] = (c[k] || 0) + f;
        }
    });
    return Object.entries(c).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
};

// SNAPSHOTS[k] = corpus segmentation after k merges.
const MERGES = [];
const SNAPSHOTS = [];
{
    let words = CORPUS.map(([w, f]) => ({ s: [...w, END], f }));
    SNAPSHOTS.push(words);
    for (let m = 0; m < MAX_MERGES; m++) {
        const top = countPairs(words)[0][0].split('|');
        MERGES.push(top);
        words = words.map(({ s, f }) => ({ s: applyMerge(s, top), f }));
        SNAPSHOTS.push(words);
    }
}
const PAIRS0 = countPairs(SNAPSHOTS[0]).slice(0, 5);
const BASE_VOCAB = new Set(SNAPSHOTS[0].flatMap(({ s }) => s)).size;
const totalTokens = (k) => SNAPSHOTS[k].reduce((t, { s, f }) => t + s.length * f, 0);

// Encode a new word by replaying the learned merges in order.
const encode = (word, k = MAX_MERGES) => {
    let s = [...word, END];
    for (let m = 0; m < k; m++) s = applyMerge(s, MERGES[m]);
    return s;
};
const UNSEEN = ['lowest', 'slowest', 'wider'].map((w) => ({ w, s: encode(w) }));

const STEP_STATES = [
    { mode: 'words', k: 0 },
    { mode: 'pairs', k: 0 },
    { mode: 'words', k: 1 },
    { mode: 'words', k: 3 },
    { mode: 'interactive' },
    { mode: 'words', k: 5 },
    { mode: 'words', k: 8, thumb: true },
    { mode: 'unseen' },
];

const TILE_H = 24, GAP = 3, X0 = 18;
const tileW = (t) => 9 * t.length + 10;

function Row({ tokens, y, highlight }) {
    let x = X0;
    return tokens.map((t, i) => {
        const w = tileW(t);
        const merged = t.length > 1;
        const hot = highlight && t === highlight;
        const el = (
            <g key={i}>
                <rect x={x} y={y} width={w} height={TILE_H} rx={merged ? 4 : 2}
                    fill={merged ? 'var(--accent-primary)' : 'none'} fillOpacity={hot ? 0.45 : merged ? 0.2 : 0}
                    stroke={merged ? 'var(--accent-primary)' : 'currentColor'}
                    strokeOpacity={merged ? 1 : 0.35} strokeWidth={merged ? (hot ? 2.6 : 1.6) : 1} />
                <text x={x + w / 2} y={y + 16} textAnchor="middle" fontSize="13" fontFamily="monospace"
                    fontWeight={merged ? 700 : 400} fill="currentColor">{t}</text>
            </g>
        );
        x += w + GAP;
        return el;
    });
}

export default function BPEVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    useReducedMotion(); // static drawing — no animation to gate, hook kept for consistency
    const [kSel, setKSel] = useState(6);
    const interactive = state.mode === 'interactive';
    const k = interactive ? Math.max(0, Math.min(MAX_MERGES, kSel)) : state.k || 0;
    const words = SNAPSHOTS[k];
    const lastMerge = k > 0 ? MERGES[k - 1].join('') : null;
    const rowY = (i) => 44 + i * 34;

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Four training words drawn as rows of tiles. Thin outlined tiles are single characters; bold filled tiles are tokens made by merging the most frequent neighbouring pair, so rows get shorter as merges accumulate">
                {state.mode !== 'unseen' && (
                    <>
                        <text x={X0} y="26" fontSize="12" fill="currentColor" fillOpacity="0.75">
                            {k === 0 ? 'Start: every character is its own token' : `After ${k} merge${k > 1 ? 's' : ''}`}
                        </text>
                        {words.map(({ s, f }, i) => (
                            <g key={i}>
                                <Row tokens={s} y={rowY(i)} highlight={lastMerge} />
                                <text x="388" y={rowY(i) + 16} textAnchor="end" fontSize="12" fontFamily="monospace"
                                    fill="currentColor" fillOpacity="0.7">×{f}</text>
                            </g>
                        ))}
                    </>
                )}

                {state.mode === 'pairs' && (
                    <g>
                        <text x={X0} y="196" fontSize="12" fill="currentColor" fillOpacity="0.75">
                            Neighbouring pairs, counted with word frequency
                        </text>
                        {PAIRS0.map(([pair, n], i) => {
                            const [a, b] = pair.split('|');
                            const top = n === PAIRS0[0][1];
                            return (
                                <g key={pair}>
                                    <text x={X0} y={218 + i * 17} fontSize="12" fontFamily="monospace" fill="currentColor">{a} {b}</text>
                                    <rect x="64" y={207 + i * 17} width={n * 24} height="12" rx="2"
                                        fill={top ? 'var(--accent-primary)' : 'var(--secondary)'} fillOpacity={top ? 0.8 : 0.4} />
                                    <text x={70 + n * 24} y={218 + i * 17} fontSize="12" fontFamily="monospace" fill="currentColor">
                                        {n}{top ? ' ◀ tied for most' : ''}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                )}

                {(state.mode === 'words' || interactive) && (
                    <g fontSize="12" fontFamily="monospace" fill="currentColor">
                        <text x={X0} y="210" fillOpacity="0.85">
                            {k === 0 ? 'merges learned: none yet' : `merge ${k}: ${MERGES[k - 1][0]} + ${MERGES[k - 1][1]} → ${lastMerge}`}
                        </text>
                        <text x={X0} y="232" fillOpacity="0.85">tokens to write the corpus: {totalTokens(k)}</text>
                        <text x={X0} y="254" fillOpacity="0.85">vocabulary size: {BASE_VOCAB} + {k} = {BASE_VOCAB + k}</text>
                        <text x={X0} y="276" fillOpacity="0.6" fontSize="12" fontFamily="sans-serif">
                            _ marks the end of a word
                        </text>
                    </g>
                )}

                {state.mode === 'unseen' && (
                    <g>
                        <text x={X0} y="26" fontSize="12" fill="currentColor" fillOpacity="0.75">
                            Words never seen in training, after all {MAX_MERGES} merges
                        </text>
                        {UNSEEN.map(({ w, s }, i) => (
                            <g key={w}>
                                <text x={X0} y={60 + i * 62} fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.75">
                                    "{w}" → {s.length} token{s.length > 1 ? 's' : ''}
                                </text>
                                <Row tokens={s} y={68 + i * 62} />
                            </g>
                        ))}
                    </g>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3">
                    <label htmlFor="bpe-merges" className="text-xs font-bold text-text-secondary">Merges applied</label>
                    <input id="bpe-merges" aria-label="Number of merges applied" type="range" min="0" max={MAX_MERGES}
                        step="1" value={k} onChange={(e) => setKSel(Number(e.target.value))}
                        className="flex-1 cursor-pointer" />
                    <span className="text-xs font-mono text-text-muted w-16 text-right">{k} / {MAX_MERGES}</span>
                </div>
            )}
        </div>
    );
}
