import { useEffect } from 'react';
import { ArrowLeft, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { usePlayT } from './i18n';

/** End-of-round summary from the server result; dispatches pm:xp-earned once. */
export function Results({ result, gameTitle, onAgain, onBack }) {
  const t = usePlayT();
  useEffect(() => {
    if (result?.xp > 0) window.dispatchEvent(new CustomEvent('pm:xp-earned', { detail: { xp: result.xp } }));
  }, [result]);

  if (!result) return null;
  const pct = Math.round((result.accuracy || 0) * 100);
  const levelUp = result.next_level > result.level;
  const levelDown = result.next_level < result.level;
  const tier = pct >= 90 ? { label: 'Python Grandmaster', variant: 'success' }
    : pct >= 70 ? { label: 'Sharp Pythonista', variant: 'primary' }
    : pct >= 50 ? { label: 'Steady Builder', variant: 'default' }
    : { label: 'Warming Up', variant: 'warning' };
  return (
    <section aria-live="polite" className="rounded-2xl border border-border-default bg-bg-surface p-5 sm:p-6 flex flex-col gap-5 max-w-xl mx-auto w-full mb-24 sm:mb-0">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-primary text-white flex items-center justify-center"><Trophy size={22} /></div>
          <div>
            <h2 className="font-display text-xl font-bold text-text-primary">{t('results.complete', '{game} — round complete', { game: gameTitle })}</h2>
            <p className="text-xs text-text-muted">{t('play.level', 'Level')} {result.level}{result.mode === 'daily' ? ` · ${t('play.daily', 'Daily')}` : ''}</p>
          </div>
        </div>
        <Badge variant={tier.variant}>{tier.label}</Badge>
      </header>

      <div className="flex flex-col gap-1.5" aria-hidden="true">
        <div className="flex justify-between text-xs text-text-muted">
          <span>Round Mastery</span>
          <span className="font-mono font-semibold text-text-primary">{pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-bg-inset overflow-hidden">
          <div className={`h-full transition-all duration-500 ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-accent-primary' : 'bg-amber-500'}`} style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-bg-inset p-3"><dt className="text-xs uppercase tracking-wide text-text-muted">{t('results.score', 'Score')}</dt><dd className="text-2xl font-bold text-text-primary tabular-nums">{result.score}<span className="text-sm text-text-muted">/{result.max_score}</span></dd></div>
        <div className="rounded-xl bg-bg-inset p-3"><dt className="text-xs uppercase tracking-wide text-text-muted">{t('results.accuracy', 'Accuracy')}</dt><dd className="text-2xl font-bold text-text-primary tabular-nums">{pct}%</dd></div>
        <div className="rounded-xl bg-bg-inset p-3"><dt className="text-xs uppercase tracking-wide text-text-muted">{t('results.xp', 'XP')}</dt><dd className="text-2xl font-bold text-accent-primary tabular-nums">+{result.xp}</dd></div>
      </dl>
      {result.xp_capped && <p className="text-xs text-text-muted flex items-center gap-1"><Sparkles size={12} /> {t('results.capped', 'Daily game-XP cap reached. Scores still count.')}</p>}

      {(result.topics?.strengthened?.length || result.topics?.revisit?.length) ? (
        <div className="flex flex-col gap-2 text-sm">
          {result.topics.strengthened?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5"><span className="text-text-muted">{t('results.strengthened', 'Strengthened:')}</span>
              {result.topics.strengthened.map((t) => <Badge key={t} variant="success">{t.replace(/_/g, ' ')}</Badge>)}</div>
          )}
          {result.topics.revisit?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5"><span className="text-text-muted">{t('results.revisit', 'Revisit:')}</span>
              {result.topics.revisit.map((t) => <Badge key={t} variant="warning">{t.replace(/_/g, ' ')}</Badge>)}</div>
          )}
        </div>
      ) : null}

      <p className="text-sm text-text-secondary">
        {levelUp ? t('results.level_up', 'Nice — next round starts at level {level}.', { level: result.next_level }) : levelDown ? t('results.level_down', 'Next round eases back to level {level}.', { level: result.next_level }) : t('results.level_same', 'Next round stays at level {level}.', { level: result.next_level })}
      </p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => onAgain(result.next_level)} className="min-h-11"><RotateCcw size={16} /> {t('results.again', 'Play again')}</Button>
        <Button variant="outline" onClick={onBack} className="min-h-11"><ArrowLeft size={16} /> {t('results.back', 'Back to Play')}</Button>
      </div>
    </section>
  );
}

export default Results;
