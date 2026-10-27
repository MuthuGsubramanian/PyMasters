/**
 * The prompt strip the real-time games keep on screen: the current question (code or
 * expression) and a one-line reveal (why) that fades after a miss.
 */
export function Hud({ item, reveal, children }) {
  const code = item?.prompt?.code || item?.prompt?.text || '';
  return (
    <div data-hud className="rounded-xl border border-border-default bg-bg-elevated/95 backdrop-blur px-3 py-2 flex flex-col gap-1">
      {item && (
        <pre aria-live="polite" className="font-mono text-sm text-text-primary whitespace-pre-wrap break-words m-0">{code}</pre>
      )}
      {reveal && (
        <p role="status" className={`text-xs ${reveal.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
          {reveal.correct ? '✓' : '✗'} {reveal.why}
        </p>
      )}
      {children}
    </div>
  );
}

export default Hud;
