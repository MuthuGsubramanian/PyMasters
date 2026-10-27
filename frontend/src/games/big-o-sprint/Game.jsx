import { useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { shortcutsBlocked } from '../engine/keys';

const KEYS = ['1', '2', '3', '4', '5', '6'];

function CodeBlock({ code }) {
  return (
    <pre className="rounded-xl bg-bg-code text-code-foreground text-sm leading-6 p-4 overflow-x-auto font-mono" aria-label="Python snippet">
      {String(code || '').split('\n').map((ln, i) => (
        <div key={i} className="grid grid-cols-[2ch_1fr] gap-3">
          <span className="text-right opacity-50 select-none" aria-hidden="true">{i + 1}</span>
          <code className="whitespace-pre">{ln || ' '}</code>
        </div>
      ))}
    </pre>
  );
}

/** After the answer: measured operation counts for n = 10, 100, 1000 as labelled bars. */
export function CountRace({ counts }) {
  if (!counts) return null;
  const rows = [['10', counts['10']], ['100', counts['100']], ['1000', counts['1000']]].filter(([, v]) => typeof v === 'number' && v >= 0);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <figure className="rounded-xl border border-border-default bg-bg-elevated p-3" aria-label="Measured operations by input size">
      <figcaption className="text-xs text-text-muted mb-2">Lines executed inside the function, measured by actually running it</figcaption>
      <ol className="flex flex-col gap-1.5">
        {rows.map(([n, v]) => (
          <li key={n} className="grid grid-cols-[6ch_1fr_8ch] items-center gap-2 text-xs">
            <span className="font-mono text-text-secondary">n={n}</span>
            <span className="h-3 rounded bg-bg-inset overflow-hidden"><span className="block h-full bg-accent-primary" style={{ width: `${Math.max(2, (Math.log10(v + 1) / Math.log10(max + 1)) * 100)}%` }} /></span>
            <span className="font-mono text-text-primary tabular-nums text-right">{v.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      {counts['1000'] === -1 && <p className="text-[11px] text-text-muted mt-1">n = 1000 was not run: it would not finish in this lifetime.</p>}
      <p className="text-[11px] text-text-muted mt-1">Bars use a log scale so all three fit.</p>
    </figure>
  );
}

/**
 * Big-O Sprint: tag the complexity of the snippet (keys 1–6). Once revealed, the measured
 * operation counts race in `CountRace` (passed via `reveal.counts`).
 */
export default function Game({ item, onAnswer, disabled, reveal }) {
  const answered = useRef(false);
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
      <p className="text-sm text-text-secondary"><Timer size={14} className="inline mr-1" aria-hidden="true" /> How does the running time grow with n?</p>
      <CodeBlock code={item.prompt?.code} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-label="Complexity classes">
        {(item.choices || []).map((c, i) => (
          <button key={c} type="button" data-choice={i} disabled={disabled} onClick={() => pick(i)}
            className="min-h-11 flex items-center gap-2 rounded-xl border border-border-default bg-bg-surface hover:border-accent-primary focus-visible:ring-2 ring-accent-primary px-3 py-2 disabled:opacity-60">
            <kbd className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-bg-inset text-xs font-semibold text-text-muted" aria-hidden="true">{i + 1}</kbd>
            <span className="font-mono text-sm text-text-primary">{c}</span>
          </button>
        ))}
      </div>
      {reveal?.counts && <CountRace counts={reveal.counts} />}
    </div>
  );
}
