import { useState } from 'react';
import { motion } from 'framer-motion';
import useReducedMotion from '../../hooks/useReducedMotion';

// ──────────────────────────────────────────────────────────────────────────────
// Byte-pair encoding visual — a tiny word-frequency corpus is split into
// characters, then the most frequent adjacent pair is merged, again and again.
// The merges are computed for real at module load (ties: highest count, then
// alphabetical), and the unseen words are tokenized by replaying those merges.
// ──────────────────────────────────────────────────────────────────────────────

const CORPUS = [['low', 5], ['lower', 2], ['newest', 6], ['widest', 3]];
const MAX_MERGES = 12;

const mergeSeq = (seq, a, b) => {
    const out = [];
    for (let i = 0; i < seq.length; i++) {
        if (i < seq.length - 1 && seq[i] === a && seq[i + 1] === b) { out.push(a + b); i++; }
        else out.push(seq[i]);
    }
    return out;
};

const countPairs = (seqs) => {
    const m = new Map();
    seqs.forEach((seq, w) => {
        for (let i = 0; i < seq.length - 1; i++) {
            const key = `${seq[i]}\u0000${seq[i + 1]}`;
            m.set(key, (m.get(key) || 0) + CORPUS[w][1]);
        }
    });
    return [...m.entries()]
        .map(([k, n]) => { const [a, b] = k.split('\u0000'); return { a, b, n }; })
        .sort((x, y) => y.n - x.n || (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
};

// STATES[m] = corpus after m merges, with the top pairs still available.
const MERGES = [];
const STATES = [];
(() => {
    let seqs = CORPUS.map(([w]) => w.split(''));
    for (let m = 0; m <= MAX_MERGES; m++) {
        const pairs = countPairs(seqs);
        STATES.push({ seqs, top: pairs.slice(0, 4), made: m > 0 ? MERGES[m - 1] : null });
        if (m === MAX_MERGES || !pairs.length) break;
        MERGES.push({ a: pairs[0].a, b: pairs[0].b, n: pairs[0].n });
        seqs = seqs.map((s) => mergeSeq(s, pairs[0].a, pairs[0].b));
    }
})();
const LAST = STATES.length - 1;

const tokenize = (word) => MERGES.reduce((s, { a, b }) => mergeSeq(s, a, b), word.split(''));
const VOCAB_SIZE = new Set([
    ...CORPUS.flatMap(([w]) => w.split('')),
    ...MERGES.map(({ a, b }) => a + b),
]).size;

const STEP_STATES = [
    { mode: 'corpus', m: 0 },
    { mode: 'pairs', m: 0 },
    { mode: 'pairs', m: 1 },
    { mode: 'pairs', m: 4 },
    { mode: 'interactive' },
    { mode: 'pairs', m: LAST },
    { mode: 'unseen', m: LAST, words: ['lowest', 'newer'] },
    { mode: 'unseen', m: LAST, words: ['wide', 'slow'] },
];

const CW = 7.9; // monospace advance at 13px
const tokW = (t) => Math.round(t.length * CW + 12);

function TokenRow({ tokens, x0, y, newest, animate, dim }) {
    let x = x0;
    return tokens.map((t, i) => {
        const w = tokW(t);
        const merged = t.length > 1;
        const isNew = merged && newest === t;
        const el = (
            <g key={`${i}-${t}`} opacity={dim ? 0.55 : 1}>
                <rect x={x} y={y - 11} width={w} height="22" rx="5"
                    fill={isNew ? 'var(--secondary)' : merged ? 'var(--accent-primary)' : 'none'}
                    fillOpacity={isNew ? 0.3 : 0.2}
                    stroke={isNew ? 'var(--secondary)' : merged ? 'var(--accent-primary)' : 'currentColor'}
                    strokeOpacity={merged ? 1 : 0.45}
                    strokeWidth={isNew ? 2.5 : 1.2}
                    strokeDasharray={merged ? undefined : '3 2'} />
                <text x={x + w / 2} y={y + 4.5} textAnchor="middle" fontSize="13" fontFamily="monospace"
                    fill="currentColor">{t}</text>
            </g>
        );
        x += w + 3;
        if (isNew && animate) {
            return (
                <motion.g key={`${i}-${t}-m`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}>{el.props.children}</motion.g>
            );
        }
        return el;
    });
}

export default function BPEVisual({ stepIndex = 0 }) {
    const idx = Math.max(0, Math.min(stepIndex, STEP_STATES.length - 1));
    const state = STEP_STATES[idx];
    const interactive = state.mode === 'interactive';
    const reducedMotion = useReducedMotion();

    const [merges, setMerges] = useState(0);
    const [wasInteractive, setWasInteractive] = useState(interactive);
    if (interactive !== wasInteractive) {
        setWasInteractive(interactive);
        if (!interactive) setMerges(0);
    }

    const m = interactive ? Math.max(0, Math.min(merges, LAST)) : Math.max(0, Math.min(state.m, LAST));
    const S = STATES[m];
    const newest = S.made ? S.made.a + S.made.b : null;
    const showPairs = state.mode === 'pairs' || interactive;
    const maxN = Math.max(...S.top.map((p) => p.n), 1);

    return (
        <div className="h-full flex flex-col text-text-secondary">
            <svg viewBox="0 0 400 300" className="flex-1 min-h-0 w-full" role="img"
                aria-label="Four words split into tokens; dashed boxes are single characters and solid boxes are merged pieces. Bars below count the most frequent neighbouring pairs.">
                <text x="16" y="24" fontSize="12" fill="currentColor" fillOpacity="0.75">
                    {m === 0 ? 'corpus as single characters' : `after ${m} merge${m > 1 ? 's' : ''}`}
                    {S.made ? ` · last: ${S.made.a} + ${S.made.b}` : ''}
                </text>
                {CORPUS.map(([w, n], r) => (
                    <g key={w}>
                        <text x="16" y={56 + r * 29 + 4} fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">
                            {w} ×{n}
                        </text>
                        <TokenRow tokens={S.seqs[r]} x0={104} y={56 + r * 29} newest={newest}
                            animate={!reducedMotion} dim={state.mode === 'unseen'} />
                    </g>
                ))}
                <line x1="16" y1="170" x2="384" y2="170" stroke="currentColor" strokeOpacity="0.15" />

                {showPairs && (
                    <g>
                        <text x="16" y="188" fontSize="12" fill="currentColor" fillOpacity="0.75">
                            neighbouring pairs, weighted by word count
                        </text>
                        {S.top.map((p, i) => (
                            <g key={`${p.a}|${p.b}`}>
                                <text x="16" y={212 + i * 23} fontSize="13" fontFamily="monospace" fill="currentColor">
                                    {p.a} {p.b}
                                </text>
                                <rect x="80" y={199 + i * 23} width={Math.max(4, (p.n / maxN) * 220)} height="18" rx="3"
                                    fill={i === 0 ? 'var(--accent-primary)' : 'currentColor'}
                                    fillOpacity={i === 0 ? 0.85 : 0.2} />
                                <text x={80 + Math.max(4, (p.n / maxN) * 220) + 6} y={212 + i * 23}
                                    fontSize="12" fontFamily="monospace" fill="currentColor">
                                    {p.n}{i === 0 ? ' ◀ merge next' : ''}
                                </text>
                            </g>
                        ))}
                        {m === LAST && (
                            <text x="16" y="292" fontSize="12" fill="currentColor" fillOpacity="0.75">
                                vocabulary: {VOCAB_SIZE} pieces ({VOCAB_SIZE - MERGES.length} characters + {MERGES.length} merges)
                            </text>
                        )}
                    </g>
                )}

                {state.mode === 'corpus' && (
                    <text x="200" y="230" textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.7">
                        dashed box = one character · 10 distinct characters in all
                    </text>
                )}

                {state.mode === 'unseen' && (
                    <g>
                        <text x="16" y="188" fontSize="12" fill="currentColor" fillOpacity="0.75">
                            new words, never seen in training — replay the {MERGES.length} merges in order
                        </text>
                        {state.words.map((w, i) => {
                            const toks = tokenize(w);
                            const frag = toks.every((t) => t.length === 1);
                            return (
                                <g key={w}>
                                    <text x="16" y={226 + i * 38 + 4} fontSize="12" fontFamily="monospace" fill="currentColor" fillOpacity="0.7">{w}</text>
                                    <TokenRow tokens={toks} x0={104} y={226 + i * 38} animate={false} />
                                    <text x="104" y={226 + i * 38 + 22} fontSize="12"
                                        fill={frag ? 'var(--destructive)' : 'currentColor'} fillOpacity={frag ? 1 : 0.7}>
                                        {toks.length} token{toks.length > 1 ? 's' : ''}{frag ? ' — no merge applies, all single characters' : ''}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                )}
            </svg>

            {interactive && (
                <div className="flex-shrink-0 pt-2 flex items-center gap-3 min-h-[44px]">
                    <label htmlFor="bpe-merges" className="text-xs font-bold text-text-secondary whitespace-nowrap">
                        Merges: <span className="font-mono">{m}</span> / {LAST}
                    </label>
                    <input id="bpe-merges" type="range" min="0" max={LAST} step="1" value={m}
                        aria-label="Number of merges applied"
                        onChange={(e) => setMerges(Number(e.target.value))}
                        className="flex-1 h-11 cursor-pointer accent-[var(--accent-primary)]" />
                </div>
            )}
        </div>
    );
}
