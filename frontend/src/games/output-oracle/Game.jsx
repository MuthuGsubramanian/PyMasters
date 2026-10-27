import { useEffect, useRef, useState } from 'react';
import { Send, TimerIcon } from 'lucide-react';
import { Button } from '../../components/ui';

const DEFAULT_SECONDS = 45;

function CodeBlock({ code }) {
  const lines = String(code || '').split('\n');
  return (
    <pre className="rounded-xl bg-bg-code text-code-foreground text-sm leading-6 p-4 overflow-x-auto font-mono" aria-label="Python snippet">
      {lines.map((ln, i) => (
        <div key={i} className="grid grid-cols-[2ch_1fr] gap-3">
          <span className="text-right opacity-50 select-none" aria-hidden="true">{i + 1}</span>
          <code className="whitespace-pre">{ln || ' '}</code>
        </div>
      ))}
    </pre>
  );
}

function Countdown({ seconds, running, onExpire }) {
  const [left, setLeft] = useState(seconds);
  const expired = useRef(false);
  useEffect(() => { setLeft(seconds); expired.current = false; }, [seconds]);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(id);
          if (!expired.current) { expired.current = true; onExpire(); }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, onExpire]);
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
  const answered = useRef(false);
  const taRef = useRef(null);

  useEffect(() => { answered.current = false; setText(''); taRef.current?.focus(); }, [item?.id]);

  const submit = (value) => {
    if (disabled || answered.current) return;
    answered.current = true;
    onAnswer(value);
  };

  useEffect(() => {
    if (item?.kind !== 'choice') return undefined;
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
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
      <p className="text-sm text-text-secondary">What does this print?</p>
      <CodeBlock code={item.prompt?.code} />
      <Countdown seconds={seconds} running={!disabled} onExpire={() => submit(null)} />

      {item.kind === 'choice' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Possible outputs">
          {(item.choices || []).map((c, i) => (
            <button key={i} type="button" data-choice={i} disabled={disabled} onClick={() => submit(i)}
              className="min-h-11 flex items-start gap-3 text-left rounded-xl border border-border-default bg-bg-surface hover:border-accent-primary focus-visible:ring-2 ring-accent-primary px-3 py-2 disabled:opacity-60">
              <kbd className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md bg-bg-inset text-xs font-semibold text-text-muted" aria-hidden="true">{i + 1}</kbd>
              <code className="font-mono text-sm whitespace-pre-wrap break-words text-text-primary">{c === '' ? '(nothing)' : c}</code>
            </button>
          ))}
        </div>
      ) : (
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); submit(text.trim()); }}>
          <label className="text-xs text-text-muted" htmlFor={`oo-${item.id}`}>Type the exact output (one line per print)</label>
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
