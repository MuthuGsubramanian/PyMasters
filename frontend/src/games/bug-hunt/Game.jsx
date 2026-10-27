import { useEffect, useRef, useState } from 'react';
import { Bug, Wrench } from 'lucide-react';

/**
 * Bug Hunt: step 1 pick the guilty line (click, or arrows + Enter); step 2 pick the fix
 * (click, or keys 1–3). Answers [lineIndex, fixIndex]. The failing test is always visible.
 */
export default function Game({ item, onAnswer, disabled }) {
  const lines = String(item?.prompt?.code || '').split('\n');
  const [cursor, setCursor] = useState(0);
  const [line, setLine] = useState(null);
  const answered = useRef(false);

  useEffect(() => { answered.current = false; setLine(null); setCursor(0); }, [item?.id]);

  const pickFix = (fixIdx) => {
    if (disabled || answered.current || line === null) return;
    answered.current = true;
    onAnswer([line, fixIdx]);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (disabled || answered.current) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (line === null) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(lines.length - 1, c + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLine(cursor); }
      } else {
        const n = Number(e.key);
        if (n >= 1 && n <= (item.choices?.length || 0)) { e.preventDefault(); pickFix(n - 1); }
        else if (e.key === 'Escape') { setLine(null); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // pickFix closes over props read at call time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, line, cursor, lines.length, item]);

  if (!item) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        <Bug size={14} className="inline mr-1 text-red-600 dark:text-red-300" aria-hidden="true" />
        {line === null ? 'This code fails its test. Tap the line with the bug.' : 'Now pick the fix for that line.'}
      </p>

      <div role="radiogroup" aria-label="Code lines — choose the buggy one"
        className="rounded-xl bg-bg-code text-code-foreground text-sm leading-6 p-2 overflow-x-auto font-mono">
        {lines.map((ln, i) => {
          const chosen = line === i, focused = line === null && cursor === i;
          return (
            <button key={i} type="button" role="radio" aria-checked={chosen} data-line={i} disabled={disabled || line !== null}
              onClick={() => { setCursor(i); setLine(i); }}
              className={`w-full min-h-8 grid grid-cols-[2ch_1fr] gap-3 text-left rounded-md px-2 ${chosen ? 'bg-red-500/25 outline outline-2 outline-red-400' : focused ? 'bg-white/10 outline outline-1 outline-accent-primary' : 'hover:bg-white/10'}`}>
              <span className="text-right opacity-50 select-none" aria-hidden="true">{i + 1}</span>
              <code className="whitespace-pre">{ln || ' '}</code>
            </button>
          );
        })}
      </div>

      <details className="text-xs text-text-muted" open>
        <summary className="cursor-pointer select-none">Failing test</summary>
        <pre className="mt-1 rounded-lg bg-bg-inset p-2 font-mono whitespace-pre-wrap text-text-secondary">{item.prompt?.test}</pre>
      </details>

      {line !== null && (
        <div className="flex flex-col gap-2" role="group" aria-label="Candidate fixes">
          <p className="text-xs text-text-muted flex items-center gap-1"><Wrench size={12} /> Replace line {line + 1} with:</p>
          {(item.choices || []).map((fix, i) => (
            <button key={i} type="button" data-fix={i} disabled={disabled} onClick={() => pickFix(i)}
              className="min-h-11 flex items-start gap-3 text-left rounded-xl border border-border-default bg-bg-surface hover:border-accent-primary focus-visible:ring-2 ring-accent-primary px-3 py-2 disabled:opacity-60">
              <kbd className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md bg-bg-inset text-xs font-semibold text-text-muted" aria-hidden="true">{i + 1}</kbd>
              <code className="font-mono text-sm whitespace-pre text-text-primary">{fix}</code>
            </button>
          ))}
          <button type="button" onClick={() => setLine(null)} disabled={disabled} className="self-start text-xs text-text-muted underline underline-offset-2 min-h-8">Pick a different line</button>
        </div>
      )}
    </div>
  );
}
