/**
 * The prompt strip the real-time games keep on screen: the current question (code or
 * expression), topic badge, and a one-line reveal (why) that fades after a miss.
 */
export function Hud({ item, reveal, children }) {
  const code = item?.prompt?.code || item?.prompt?.text || '';
  const topic = item?.topic ? String(item.topic).replace(/^ds_|^adv_|^oop_/, '').replace(/_/g, ' ') : null;
  return (
    <div data-hud className="rounded-xl border border-border-default bg-bg-elevated/95 backdrop-blur px-3.5 py-2.5 flex flex-col gap-1.5 shadow-sm">
      {item && (
        <div className="flex items-start justify-between gap-2">
          <pre aria-live="polite" className="font-mono text-sm text-text-primary whitespace-pre-wrap break-words m-0 flex-1">{code}</pre>
          {topic && (
            <span className="shrink-0 rounded-md bg-accent-primary/10 border border-accent-primary/30 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent-primary">
              {topic}
            </span>
          )}
        </div>
      )}
      {reveal && (
        <p role="status" className={`text-xs font-medium rounded-lg px-2.5 py-1 ${reveal.correct ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30'}`}>
          {reveal.correct ? '✓' : '✗'} {reveal.why}
        </p>
      )}
      {children}
    </div>
  );
}

export default Hud;
