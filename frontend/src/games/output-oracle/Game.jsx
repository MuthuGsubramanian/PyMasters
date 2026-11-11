import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Eye, NotebookPen, Send, Sparkles, Terminal, TimerIcon } from 'lucide-react';
import { Button } from '../../components/ui';
import { shortcutsBlocked } from '../engine/keys';

const DEFAULT_SECONDS = 45;

function detectClues(code) {
  const s = String(code || '');
  const clues = [];
  if (s.includes('//') || s.includes('%')) clues.push({ tag: 'Integer Math', hint: '// floors toward −∞; % returns the remainder.' });
  if (/\[[^\]]*:[^\]]*\]/.test(s)) clues.push({ tag: 'Slicing', hint: 'seq[start:stop:step] stops before stop; negative step reverses.' });
  if (/\[-\d+\]/.test(s)) clues.push({ tag: 'Negative Index', hint: 'seq[-1] is the last item, seq[-2] is second from last.' });
  if (/\.(append|extend|pop|sort|reverse)\(/.test(s)) clues.push({ tag: 'In-Place Mutation', hint: 'List methods like .append() or .sort() mutate the list in place.' });
  if (/\b(and|or)\b/.test(s)) clues.push({ tag: 'Short-Circuit Logic', hint: '`a and b` returns `a` if falsy else `b`; `a or b` returns `a` if truthy else `b`.' });
  if (/\[.+for .+ in .+\]/.test(s)) clues.push({ tag: 'Comprehension', hint: 'Evaluate the iterable first, filter with `if`, then transform each element.' });
  if (/\bdef \w+\([^)]*=\s*(\[\]|\{\})/.test(s)) clues.push({ tag: 'Mutable Default', hint: 'Default list/dict arguments are created once at function definition time!' });
  if (/\byield\b/.test(s)) clues.push({ tag: 'Generator', hint: '`yield` pauses the function and produces values lazily one by one.' });
  if (clues.length === 0) clues.push({ tag: 'Step-by-Step Trace', hint: 'Track each variable top-to-bottom; click any line below to mark your trace point.' });
  return clues.slice(0, 2);
}

function CodeBlock({ code, activeLine, onSelectLine }) {
  const lines = String(code || '').split('\n');
  return (
    <div className="rounded-xl overflow-hidden border border-border-default bg-bg-code shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-inset/60 border-b border-border-default text-[11px] text-text-muted font-mono">
        <span className="flex items-center gap-1.5"><Terminal size={12} className="text-accent-primary" aria-hidden="true" /> python3 snippet.py</span>
        <span>{lines.length} {lines.length === 1 ? 'line' : 'lines'} · click line to trace</span>
      </div>
      <pre className="text-code-foreground text-sm leading-6 p-3 overflow-x-auto font-mono m-0" aria-label="Python snippet">
        {lines.map((ln, i) => {
          const isPinned = activeLine === i;
          return (
            <div key={i} onClick={() => onSelectLine?.(isPinned ? null : i)}
              className={`grid grid-cols-[3ch_1fr] gap-3 px-2 rounded cursor-pointer transition-colors ${isPinned ? 'bg-accent-primary/20 outline outline-1 outline-accent-primary/50' : 'hover:bg-white/5'}`}>
              <span className="text-right opacity-60 select-none tabular-nums" aria-hidden="true">
                {isPinned ? '▶' : i + 1}
              </span>
              <code className="whitespace-pre">{ln || ' '}</code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function Countdown({ seconds, running, onExpire }) {
  // Remounted per item via `key`, so no reset effect is needed.
  const [left, setLeft] = useState(seconds);
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; });   // latest handler without restarting the interval
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(id);
          if (!expired.current) { expired.current = true; onExpireRef.current?.(); }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  const pct = seconds ? Math.max(0, (left / seconds) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-text-muted" role="timer" aria-live="off" aria-label={`${left} seconds left`}>
      <TimerIcon size={14} aria-hidden="true" />
      <span className="tabular-nums font-semibold">{mm}:{ss}</span>
      <span className="flex-1 h-1.5 rounded-full bg-border-default overflow-hidden" aria-hidden="true">
        <span className="block h-full bg-accent-primary transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/**
 * Output Oracle: predict the exact stdout. `choice` items show four options (keys
 * 1–4 answer); `text` items take a typed answer (Ctrl/Cmd+Enter submits). The soft
 * timer never blocks input: expiry simply answers null (a miss).
 */
export default function Game({ item, onAnswer, disabled, seconds = DEFAULT_SECONDS }) {
  const [text, setText] = useState('');
  const [activeLine, setActiveLine] = useState(null);
  const [showScratch, setShowScratch] = useState(false);
  const [scratch, setScratch] = useState('');
  const answered = useRef(false);
  const taRef = useRef(null);
  const clues = useMemo(() => detectClues(item?.prompt?.code), [item?.prompt?.code]);

  useEffect(() => {
    answered.current = false;
    setText('');
    setActiveLine(null);
    setScratch('');
    taRef.current?.focus();
  }, [item?.id]);

  const submit = (value) => {
    if (disabled || answered.current) return;
    answered.current = true;
    onAnswer(value);
  };

  useEffect(() => {
    if (item?.kind !== 'choice') return undefined;
    const onKey = (e) => {
      if (shortcutsBlocked(e)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= (item.choices?.length || 0)) { e.preventDefault(); submit(n - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // submit reads refs/props at call time; item + disabled are the inputs that matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, disabled]);

  if (!item) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
          <Code2 size={15} className="text-accent-primary" aria-hidden="true" /> What does this print to stdout?
        </p>
        <button type="button" onClick={() => setShowScratch((s) => !s)}
          className="inline-flex items-center gap-1 text-xs text-accent-primary hover:underline">
          <NotebookPen size={13} aria-hidden="true" /> {showScratch ? 'Hide trace pad' : 'Mental trace pad'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Python concept clues">
        {clues.map((c, idx) => (
          <div key={idx} className="rounded-lg border border-border-default bg-bg-surface/90 px-2.5 py-1 text-xs flex items-center gap-1.5 text-text-secondary">
            <Sparkles size={12} className="text-amber-500 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-text-primary">{c.tag}:</span>
            <span className="text-text-muted">{c.hint}</span>
          </div>
        ))}
      </div>

      <CodeBlock code={item.prompt?.code} activeLine={activeLine} onSelectLine={setActiveLine} />

      {showScratch && (
        <div className="rounded-xl border border-dashed border-accent-primary/50 bg-bg-inset/50 p-2.5 flex flex-col gap-1">
          <label htmlFor={`scratch-${item.id}`} className="text-[11px] font-medium text-text-muted flex items-center gap-1">
            <Eye size={11} aria-hidden="true" /> Scratchpad (jot variable values as you trace — not graded)
          </label>
          <input id={`scratch-${item.id}`} type="text" value={scratch} onChange={(e) => setScratch(e.target.value)}
            placeholder="e.g. i=0 -> x=3, i=1 -> x=6..."
            className="font-mono text-xs rounded-lg border border-border-default bg-bg-surface text-text-primary px-2.5 py-1.5 focus:outline-none focus:ring-1 ring-accent-primary" />
        </div>
      )}

      <Countdown key={item.id} seconds={seconds} running={!disabled} onExpire={() => submit(null)} />

      {item.kind === 'choice' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="group" aria-label="Possible outputs">
          {(item.choices || []).map((c, i) => (
            <button key={i} type="button" data-choice={i} disabled={disabled} onClick={() => submit(i)}
              className="min-h-12 flex items-start gap-3 text-left rounded-xl border border-border-default bg-bg-surface hover:border-accent-primary hover:bg-bg-elevated focus-visible:ring-2 ring-accent-primary px-3.5 py-2.5 transition-all disabled:opacity-60">
              <kbd className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md bg-bg-inset text-xs font-semibold text-text-muted shrink-0" aria-hidden="true">{i + 1}</kbd>
              <code className="font-mono text-sm whitespace-pre-wrap break-words text-text-primary">{c === '' ? '(nothing)' : c}</code>
            </button>
          ))}
        </div>
      ) : (
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); submit(text.trim()); }}>
          <label className="text-xs text-text-muted" htmlFor={`oo-${item.id}`}>Type the exact stdout output (one line per print)</label>
          <textarea id={`oo-${item.id}`} ref={taRef} value={text} disabled={disabled} rows={Math.min(6, Math.max(2, text.split('\n').length))}
            onChange={(e) => setText(e.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off"
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(text.trim()); } }}
            className="font-mono text-sm rounded-xl border border-border-default bg-bg-surface text-text-primary p-3 focus:outline-none focus:ring-2 ring-accent-primary" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Ctrl/⌘ + Enter to submit</span>
            <Button type="submit" disabled={disabled} className="min-h-11"><Send size={14} /> Submit</Button>
          </div>
        </form>
      )}
    </div>
  );
}
