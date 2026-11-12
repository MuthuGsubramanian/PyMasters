import { useState } from 'react';
import { Flame, Pause, Play, Sparkles, X } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { usePlayT } from './i18n';

/**
 * Frame for one round: header (title, level, topic badge, streak, progress dots), body, footer.
 * Pause shows an overlay with Resume/Quit; children decide what "paused" means
 * for them via the `paused` render-prop argument.
 */
export function GameShell({ title, level, topic, streak = 0, index, total, score, onQuit, children, footer }) {
  const [paused, setPaused] = useState(false);
  const t = usePlayT();
  const topicLabel = topic ? String(topic).replace(/^ds_|^adv_|^oop_/, '').replace(/_/g, ' ') : null;
  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-24 sm:pb-0">{/* bottom padding clears the floating tutor launcher on phones */}
      <header className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-border-default bg-bg-surface/80 px-4 py-3 shadow-sm">
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-text-primary truncate">{title}</h1>
            <Badge variant="primary">{t('play.level', 'Level')} {level}</Badge>
            {topicLabel && (
              <span data-topic-badge className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 border border-accent-primary/30 px-2.5 py-0.5 text-xs font-medium text-accent-primary capitalize">
                <Sparkles size={11} aria-hidden="true" /> {topicLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted">Question {Math.min(index + 1, total)} of {total}</p>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <span data-streak={streak} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${streak >= 3 ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40 animate-pulse' : 'bg-bg-inset text-amber-500'}`}
              aria-label={`streak ${streak}`}>
              <Flame size={13} aria-hidden="true" /> {streak}x
            </span>
          )}
          <ol className="flex items-center gap-1.5" aria-label={`item ${Math.min(index + 1, total)} of ${total}`}>
            {Array.from({ length: total }).map((_, i) => (
              <li key={i} aria-hidden="true"
                className={`h-2 rounded-full transition-all ${i < index ? 'w-2.5 bg-emerald-500' : i === index ? 'w-6 bg-accent-primary' : 'w-2 bg-border-strong'}`} />
            ))}
          </ol>
          {score !== null && score !== undefined && (
            <span className="text-sm font-semibold text-text-secondary tabular-nums rounded-lg bg-bg-inset px-2.5 py-1" aria-live="polite" aria-label={`score ${score}`}>{score} pts</span>
          )}
          <Button variant="ghost" size="icon" aria-label={paused ? t('round.resume', 'Resume') : t('round.pause', 'Pause')} onClick={() => setPaused((p) => !p)}
            className="min-w-11 min-h-11">
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </Button>
        </div>
      </header>

      <div className="relative min-h-[320px]">
        {typeof children === 'function' ? children({ paused }) : children}
        {paused && (
          <div role="dialog" aria-modal="true" aria-label={t('round.paused', 'Paused')}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl bg-bg-surface/95 backdrop-blur-sm border border-border-default">
            <p className="text-lg font-semibold text-text-primary">{t('round.paused', 'Paused')}</p>
            <div className="flex gap-3">
              <Button onClick={() => setPaused(false)} className="min-h-11"><Play size={16} /> {t('round.resume', 'Resume')}</Button>
              <Button variant="outline" onClick={onQuit} className="min-h-11"><X size={16} /> {t('round.quit', 'Quit')}</Button>
            </div>
          </div>
        )}
      </div>

      {footer && <footer className="text-xs text-text-muted">{footer}</footer>}
    </div>
  );
}

export default GameShell;
