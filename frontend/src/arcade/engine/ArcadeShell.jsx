import { useState } from 'react';
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '../../components/ui';
import { usePlayT } from '../../games/engine/i18n';
import { useSoundPref } from './sfx';

/**
 * Frame for one arcade run: title, score / lives / extra HUD slots, pause (overlay dialog),
 * mute toggle, quit. Children get `{ paused }` so the game loop can stop.
 */
export function ArcadeShell({ title, subtitle, score, lives, hud, onQuit, children, footer, paused: pausedProp, onPauseChange }) {
  const [pausedState, setPausedState] = useState(false);
  const paused = pausedProp ?? pausedState;
  const setPaused = (next) => { const v = typeof next === 'function' ? next(paused) : next; setPausedState(v); onPauseChange?.(v); };
  const [soundOn, toggleSound] = useSoundPref();
  const t = usePlayT();
  return (
    <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full pb-24 sm:pb-0">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-text-primary truncate">{title}</h1>
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {lives !== undefined && lives !== null && (
            <span className="text-sm text-text-secondary flex items-center gap-1" aria-label={t('arcade.lives', '{n} lives left', { n: lives })}>
              {Array.from({ length: Math.max(0, lives) }).map((_, i) => <span key={i} aria-hidden="true" className="inline-block w-3 h-3 rounded-full bg-accent-primary" />)}
              <span className="sr-only">{t('arcade.lives', '{n} lives left', { n: lives })}</span>
            </span>
          )}
          {score !== undefined && score !== null && (
            <span className="text-sm font-semibold text-text-secondary tabular-nums" aria-live="polite" aria-label={`score ${score}`}>{score}</span>
          )}
          {hud}
          <Button variant="ghost" size="icon" aria-pressed={soundOn} aria-label={soundOn ? t('arcade.sound_off', 'Mute sounds') : t('arcade.sound_on', 'Unmute sounds')}
            onClick={toggleSound} className="min-w-11 min-h-11" data-sound-toggle>
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </Button>
          <Button variant="ghost" size="icon" aria-label={paused ? t('round.resume', 'Resume') : t('round.pause', 'Pause')} onClick={() => setPaused((p) => !p)}
            className="min-w-11 min-h-11" data-pause>
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </Button>
        </div>
      </header>

      <div className="relative min-h-[360px]">
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

export default ArcadeShell;
