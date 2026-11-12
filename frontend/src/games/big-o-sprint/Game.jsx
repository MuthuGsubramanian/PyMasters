import { useEffect, useMemo, useRef } from 'react';
import { Gauge, Sparkles, Timer } from 'lucide-react';
import { shortcutsBlocked } from '../engine/keys';

const KEYS = ['1', '2', '3', '4', '5', '6'];

const BIG_O_META = {
  'O(1)': { desc: 'Constant · Instant at any N', bar: 'w-2 bg-emerald-500' },
  'O(log n)': { desc: 'Logarithmic · Halves search space', bar: 'w-4 bg-teal-500' },
  'O(n)': { desc: 'Linear · Single pass over N', bar: 'w-7 bg-cyan-500' },
  'O(n log n)': { desc: 'Linearithmic · Efficient sorting', bar: 'w-10 bg-amber-500' },
  'O(n²)': { desc: 'Quadratic · Nested N×N loops', bar: 'w-14 bg-orange-500' },
  'O(2ⁿ)': { desc: 'Exponential · Doubles every +1', bar: 'w-20 bg-red-500' },
};

function analyzeStructure(code) {
  const s = String(code || '');
  const forMatches = s.match(/^\s*(for|while)\b/gm) || [];
  const hints = [];
  if (s.includes('// 2') || s.includes('//= 2') || s.includes('>> 1') || s.includes('bisect')) {
    hints.push('Halving pattern (`//= 2`) shrinks the problem by half each step');
  }
  if (forMatches.length >= 2) {
    hints.push(`${forMatches.length} loop headers detected — check if one loop is nested inside another`);
  } else if (forMatches.length === 1) {
    hints.push('Single loop header — check how many steps the loop body runs');
  }
  if (/\.sort\(|sorted\(/.test(s)) {
    hints.push('Built-in Timsort (`sorted` / `.sort`) runs in O(n log n)');
  }
  if (hints.length === 0) {
    hints.push('Inspect how the number of executed lines scales when `n` grows 10×');
  }
  return hints[0];
}

function CodeBlock({ code }) {
  return (
    <pre className="rounded-xl border border-border-default bg-bg-code text-code-foreground text-sm leading-6 p-4 overflow-x-auto font-mono" aria-label="Python snippet">
      {String(code || '').split('\n').map((ln, i) => {
        const isLoop = /^\s*(for|while)\b/.test(ln);
        return (
          <div key={i} className={`grid grid-cols-[2ch_1fr] gap-3 rounded px-1 ${isLoop ? 'bg-accent-primary/15' : ''}`}>
            <span className="text-right opacity-50 select-none" aria-hidden="true">{i + 1}</span>
            <code className="whitespace-pre">{ln || ' '}</code>
          </div>
        );
      })}
    </pre>
  );
}

/** After the answer: measured operation counts for n = 10, 100, 1000 as labelled bars. */
export function CountRace({ counts }) {
  if (!counts) return null;
  const rows = [['10', counts['10']], ['100', counts['100']], ['1000', counts['1000']]].filter(([, v]) => typeof v === 'number' && v >= 0);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  const ratio10to100 = counts['10'] > 0 && counts['100'] > 0 ? (counts['100'] / counts['10']).toFixed(1) : null;
  return (
    <figure className="rounded-xl border border-border-default bg-bg-elevated p-3.5 flex flex-col gap-2" aria-label="Measured operations by input size">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <figcaption className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
          <Gauge size={13} className="text-accent-primary" aria-hidden="true" />
          Lines executed inside the function, measured by actually running it
        </figcaption>
        {ratio10to100 && (
          <span className="text-xs font-mono rounded-full bg-accent-primary/10 text-accent-primary px-2 py-0.5">
            10× input → {ratio10to100}× ops
          </span>
        )}
      </div>
      <ol className="flex flex-col gap-1.5">
        {rows.map(([n, v]) => (
          <li key={n} className="grid grid-cols-[6ch_1fr_9ch] items-center gap-2 text-xs">
            <span className="font-mono text-text-secondary">n={n}</span>
            <span className="h-3 rounded bg-bg-inset overflow-hidden"><span className="block h-full bg-accent-primary transition-all duration-500" style={{ width: `${Math.max(2, (Math.log10(v + 1) / Math.log10(max + 1)) * 100)}%` }} /></span>
            <span className="font-mono text-text-primary tabular-nums text-right">{v.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      {counts['1000'] === -1 && <p className="text-xs text-amber-500 mt-0.5">n = 1000 was not run: it would not finish in this lifetime.</p>}
      <p className="text-xs text-text-muted">Bars use a log scale so all three fit.</p>
    </figure>
  );
}

/**
 * Big-O Sprint: tag the complexity of the snippet (keys 1–6). Once revealed, the measured
 * operation counts race in `CountRace` (passed via `reveal.counts`).
 */
export default function Game({ item, onAnswer, disabled, reveal }) {
  const answered = useRef(false);
  const structureHint = useMemo(() => analyzeStructure(item?.prompt?.code), [item?.prompt?.code]);
  useEffect(() => { answered.current = false; }, [item?.id]);

  const pick = (i) => {
    if (disabled || answered.current) return;
    answered.current = true;
    onAnswer(i);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (shortcutsBlocked(e)) return;
      const idx = KEYS.indexOf(e.key);
      if (idx >= 0 && idx < (item?.choices?.length || 0)) { e.preventDefault(); pick(idx); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // pick reads refs/props at call time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, disabled]);

  if (!item) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-secondary"><Timer size={14} className="inline mr-1 text-accent-primary" aria-hidden="true" /> How does the running time grow with n?</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-bg-inset px-2.5 py-0.5 text-xs text-text-muted">
          <Sparkles size={11} className="text-amber-500" aria-hidden="true" /> {structureHint}
        </span>
      </div>
      <CodeBlock code={item.prompt?.code} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" role="group" aria-label="Complexity classes">
        {(item.choices || []).map((c, i) => {
          const meta = BIG_O_META[c];
          return (
            <button key={c} type="button" data-choice={i} disabled={disabled} onClick={() => pick(i)}
              className="min-h-14 flex flex-col items-start justify-between gap-1 rounded-xl border border-border-default bg-bg-surface hover:border-accent-primary focus-visible:ring-2 ring-accent-primary px-3 py-2 text-left transition-all disabled:opacity-60">
              <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2">
                  <kbd className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-bg-inset text-xs font-semibold text-text-muted" aria-hidden="true">{i + 1}</kbd>
                  <span className="font-mono text-sm font-bold text-text-primary">{c}</span>
                </div>
                {meta && <span className={`h-1.5 rounded-full ${meta.bar}`} aria-hidden="true" />}
              </div>
              {meta && <span className="text-xs text-text-muted leading-tight">{meta.desc}</span>}
            </button>
          );
        })}
      </div>
      {reveal?.counts && <CountRace counts={reveal.counts} />}
    </div>
  );
}
