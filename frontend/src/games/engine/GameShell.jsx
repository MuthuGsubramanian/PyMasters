import { useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { Button } from '../../components/ui';

/**
 * Frame for one round: header (title, level, progress dots), body, footer.
 * Pause shows an overlay with Resume/Quit; children decide what "paused" means
 * for them via the `paused` render-prop argument.
 */
export function GameShell({ title, level, index, total, score, onQuit, children, footer }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-text-primary truncate">{title}</h1>
          <p className="text-xs text-text-muted">Level {level}</p>
        </div>
        <div className="flex items-center gap-3">
          <ol className="flex items-center gap-1.5" aria-label={`item ${Math.min(index + 1, total)} of ${total}`}>
            {Array.from({ length: total }).map((_, i) => (
              <li key={i} aria-hidden="true"
                className={`h-2 rounded-full transition-all ${i < index ? 'w-2 bg-accent-primary' : i === index ? 'w-5 bg-accent-primary' : 'w-2 bg-border-strong'}`} />
            ))}
          </ol>
          <span className="text-sm font-semibold text-text-secondary tabular-nums" aria-live="polite">{score}</span>
          <Button variant="ghost" size="icon" aria-label={paused ? 'Resume' : 'Pause'} onClick={() => setPaused((p) => !p)}
            className="min-w-11 min-h-11">
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </Button>
        </div>
      </header>

      <div className="relative min-h-[320px]">
        {typeof children === 'function' ? children({ paused }) : children}
        {paused && (
          <div role="dialog" aria-modal="true" aria-label="Paused"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl bg-bg-surface/95 backdrop-blur-sm border border-border-default">
            <p className="text-lg font-semibold text-text-primary">Paused</p>
            <div className="flex gap-3">
              <Button onClick={() => setPaused(false)} className="min-h-11"><Play size={16} /> Resume</Button>
              <Button variant="outline" onClick={onQuit} className="min-h-11"><X size={16} /> Quit</Button>
            </div>
          </div>
        )}
      </div>

      {footer && <footer className="text-xs text-text-muted">{footer}</footer>}
    </div>
  );
}

export default GameShell;
