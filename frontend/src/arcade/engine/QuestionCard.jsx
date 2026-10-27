import { useEffect, useRef, useState } from 'react';
import { shortcutsBlocked } from '../../games/engine/keys';
import { usePlayT } from '../../games/engine/i18n';

/**
 * The question as a move: choice (4 buttons, keys 1–4), bin (labels), line_then_choice
 * (pick the line, then the fix). A soft timer bar; expiry answers null. Answers once.
 */
export function QuestionCard({ item, onAnswer, timerMs = 20000, disabled = false, title }) {
  const t = usePlayT();
  const [line, setLine] = useState(null);
  const [left, setLeft] = useState(timerMs);
  const answered = useRef(false);

  useEffect(() => { answered.current = false; setLine(null); setLeft(timerMs); }, [item?.id, timerMs]);

  const submit = (value) => {
    if (disabled || answered.current) return;
    answered.current = true;
    onAnswer?.(value);
  };

  useEffect(() => {
    if (!timerMs) return undefined;
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, timerMs - (Date.now() - started));
      setLeft(remaining);
      if (remaining <= 0) { clearInterval(id); submit(null); }
    }, 100);
    return () => clearInterval(id);
    // submit reads refs/props at call time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, timerMs]);

  const isLtc = item?.kind === 'line_then_choice';
  const choices = item?.choices || [];
  const lines = isLtc ? String(item?.prompt?.code || '').split('\n') : [];

  useEffect(() => {
    const onKey = (e) => {
      if (disabled || shortcutsBlocked(e)) return;
      const n = Number(e.key);
      if (!(n >= 1 && n <= 9)) return;
      if (isLtc && line === null) { if (n <= lines.length) { e.preventDefault(); setLine(n - 1); } return; }
      if (n <= choices.length) { e.preventDefault(); pick(n - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, isLtc, line, lines.length, choices.length, item?.id]);

  const pick = (index) => {
    if (item?.kind === 'bin') return submit(choices[index]);
    if (isLtc) return submit([line, index]);
    return submit(index);
  };

  if (!item) return null;
  const code = item.prompt?.code;
  const text = item.prompt?.text;
  const question = isLtc && line === null ? t('arcade.q_line', 'Which line is the bug?')
    : isLtc ? t('arcade.q_fix', 'Pick the fix for line {n}', { n: line + 1 })
    : item.kind === 'bin' ? t('arcade.q_bin', 'Which container fits?')
    : item.prompt?.expr ? t('arcade.q_value', 'What is the value?')
    : t('arcade.q_output', 'What does this print?');

  return (
    <section data-question-card aria-live="polite" className="rounded-2xl border border-border-strong bg-bg-elevated shadow-lg p-4 sm:p-5 flex flex-col gap-3 w-full max-w-xl mx-auto">
      {title && <p className="text-xs font-semibold text-accent-primary">{title}</p>}
      {timerMs > 0 && (
        <div data-timer className="h-1.5 rounded-full bg-bg-inset overflow-hidden" aria-hidden="true">
          <div className="h-full bg-accent-primary transition-[width] duration-100" style={{ width: `${Math.max(0, (left / timerMs) * 100)}%` }} />
        </div>
      )}
      <p className="text-sm font-semibold text-text-primary">{question}</p>
      {code && !isLtc && <pre className="font-mono text-sm bg-bg-code text-text-primary rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">{code}</pre>}
      {text && <p className="text-base font-medium text-text-primary">{text}</p>}
      {isLtc && (
        <ol className="font-mono text-sm rounded-xl overflow-hidden border border-border-default" aria-label={t('arcade.lines', 'Program lines')}>
          {lines.map((ln, i) => (
            <li key={i}>
              <button type="button" data-line={i} disabled={disabled || line !== null} onClick={() => setLine(i)} aria-pressed={line === i}
                className={`w-full text-left px-3 py-2 min-h-11 flex gap-3 ${line === i ? 'bg-accent-subtle text-text-primary' : 'bg-bg-code text-text-primary hover:bg-bg-inset'} disabled:opacity-80`}>
                <span className="text-text-muted w-5 shrink-0 tabular-nums" aria-hidden="true">{i + 1}</span>
                <span className="whitespace-pre-wrap break-words">{ln}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {(!isLtc || line !== null) && (
        <div role="group" aria-label={t('arcade.choices', 'Answers')} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {choices.map((c, i) => (
            <button key={i} type="button" data-choice={i} disabled={disabled} onClick={() => pick(i)}
              className="min-h-12 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-left flex items-center gap-2 hover:border-accent-primary focus-visible:ring-2 ring-accent-primary disabled:opacity-60">
              <kbd className="text-[10px] text-text-muted border border-border-default rounded px-1" aria-hidden="true">{i + 1}</kbd>
              <code className="font-mono text-sm text-text-primary whitespace-pre-wrap break-words">{c}</code>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default QuestionCard;
