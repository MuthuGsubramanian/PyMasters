import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bug, GitCompare, Wrench } from 'lucide-react';
import { shortcutsBlocked } from '../engine/keys';

/**
 * Bug Hunt: step 1 pick the guilty line (click, or arrows + Enter); step 2 pick the fix
 * (click, or keys 1–3) with live inline diff preview. Answers [lineIndex, fixIndex].
 */
export default function Game({ item, onAnswer, disabled }) {
  const lines = String(item?.prompt?.code || '').split('\n');
  const [cursor, setCursor] = useState(0);
  const [line, setLine] = useState(null);
  const [previewFix, setPreviewFix] = useState(0);
  const answered = useRef(false);

  useEffect(() => { answered.current = false; setLine(null); setCursor(0); setPreviewFix(0); }, [item?.id]);

  const pickFix = (fixIdx) => {
    if (disabled || answered.current || line === null) return;
    answered.current = true;
    onAnswer([line, fixIdx]);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (disabled || answered.current) return;
      if (shortcutsBlocked(e)) return;
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
  const candidatePatch = line !== null ? item.choices?.[previewFix] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-secondary font-medium">
          <Bug size={14} className="inline mr-1.5 text-red-600 dark:text-red-300" aria-hidden="true" />
          {line === null ? 'Step 1 of 2: This code fails its test. Tap the line with the bug.' : `Step 2 of 2: Line ${line + 1} selected. Pick the patch that fixes the bug.`}
        </p>
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`px-2 py-0.5 rounded-full font-semibold ${line === null ? 'bg-accent-primary text-white' : 'bg-emerald-500/20 text-emerald-500'}`}>1. Locate Bug</span>
          <span className="text-text-muted">→</span>
          <span className={`px-2 py-0.5 rounded-full font-semibold ${line !== null ? 'bg-accent-primary text-white' : 'bg-bg-inset text-text-muted'}`}>2. Apply Patch</span>
        </div>
      </div>

      <details className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-text-muted" open>
        <summary className="cursor-pointer select-none font-semibold text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
          <AlertTriangle size={13} aria-hidden="true" /> Failing test assertion
        </summary>
        <pre className="mt-1.5 rounded-lg bg-bg-inset p-2.5 font-mono whitespace-pre-wrap text-text-primary border border-border-default">{item.prompt?.test}</pre>
      </details>

      <div role="radiogroup" aria-label="Code lines — choose the buggy one"
        className="rounded-xl bg-bg-code text-code-foreground text-sm leading-6 p-2.5 overflow-x-auto font-mono border border-border-default shadow-sm">
        {lines.map((ln, i) => {
          const chosen = line === i, focused = line === null && cursor === i;
          return (
            <button key={i} type="button" role="radio" aria-checked={chosen} data-line={i} disabled={disabled || line !== null}
              onClick={() => { setCursor(i); setLine(i); }}
              className={`w-full min-h-8 grid grid-cols-[3ch_1fr] gap-3 text-left rounded-md px-2 transition-colors ${chosen ? 'bg-red-500/25 outline outline-2 outline-red-400' : focused ? 'bg-white/10 outline outline-1 outline-accent-primary' : 'hover:bg-white/10'}`}>
              <span className="text-right opacity-60 select-none tabular-nums" aria-hidden="true">{chosen ? '🐞' : i + 1}</span>
              <code className="whitespace-pre">{ln || ' '}</code>
            </button>
          );
        })}
      </div>

      {line !== null && (
        <div className="flex flex-col gap-2.5" role="group" aria-label="Candidate fixes">
          {candidatePatch !== undefined && candidatePatch !== null && (
            <div data-diff-preview className="rounded-xl border border-border-default bg-bg-code p-3 font-mono text-xs flex flex-col gap-1">
              <span className="text-[11px] text-text-muted flex items-center gap-1 font-sans mb-0.5">
                <GitCompare size={12} className="text-accent-primary" aria-hidden="true" /> Live Patch Diff Preview (Line {line + 1})
              </span>
              <div className="rounded px-2 py-0.5 bg-red-500/15 text-red-400 whitespace-pre overflow-x-auto">- {lines[line]}</div>
              <div className="rounded px-2 py-0.5 bg-emerald-500/15 text-emerald-400 whitespace-pre overflow-x-auto">+ {candidatePatch}</div>
            </div>
          )}

          <p className="text-xs text-text-muted flex items-center gap-1"><Wrench size={12} /> Replace line {line + 1} with:</p>
          {(item.choices || []).map((fix, i) => (
            <button key={i} type="button" data-fix={i} disabled={disabled}
              onMouseEnter={() => setPreviewFix(i)} onFocus={() => setPreviewFix(i)} onClick={() => pickFix(i)}
              className="min-h-11 flex items-start gap-3 text-left rounded-xl border border-border-default bg-bg-surface hover:border-accent-primary focus-visible:ring-2 ring-accent-primary px-3 py-2 transition-all disabled:opacity-60">
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
