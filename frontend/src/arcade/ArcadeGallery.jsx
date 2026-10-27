import { Link } from 'react-router-dom';
import { BookOpen, Gamepad2, Lock, Sparkles } from 'lucide-react';
import { Badge, Button, GlassCard } from '../components/ui';
import { usePlayT } from '../games/engine/i18n';
import { ARCADE_ICONS, ARCADE_TITLES } from './index';

function firstUnlockedBoard(game) {
  return (game.boards || []).find((b) => b.unlocked && b.pool >= 12) || (game.boards || []).find((b) => b.unlocked) || null;
}

function playHref(game) {
  if (game.id === 'snakes_ladders') {
    const b = firstUnlockedBoard(game);
    return b ? `/dashboard/play/arcade/${game.id}?board=${b.key}` : null;
  }
  return `/dashboard/play/arcade/${game.id}`;
}

function GameCard({ game, index, t }) {
  const Icon = ARCADE_ICONS[game.id] || Gamepad2;
  const href = game.unlocked && !game.needs_content ? playHref(game) : null;
  return (
    <GlassCard index={index} className="flex flex-col gap-3 p-5" data-arcade-card={game.id}>
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${game.unlocked ? 'bg-gradient-primary text-white' : 'bg-bg-inset text-text-muted'}`} aria-hidden="true">
          {game.unlocked ? <Icon size={22} /> : <Lock size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text-primary leading-tight">{game.title}</h3>
          <p className="text-xs text-text-muted mt-0.5">{game.blurb}</p>
        </div>
        <Badge variant={game.unlocked ? 'success' : 'default'}>{game.unlocked ? t('arcade.unlocked', 'Unlocked') : t('arcade.locked', 'Locked')}</Badge>
      </div>

      {!game.unlocked && <p className="text-sm text-text-secondary">{game.milestone}</p>}

      {game.unlocked && game.best && (
        <dl className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-lg bg-bg-inset py-1.5"><dt className="text-text-muted">{t('arcade.best', 'Best')}</dt><dd className="font-semibold text-text-primary tabular-nums">{game.best.best}</dd></div>
          <div className="rounded-lg bg-bg-inset py-1.5"><dt className="text-text-muted">{t('arcade.plays', 'Plays')}</dt><dd className="font-semibold text-text-primary tabular-nums">{game.best.plays}</dd></div>
        </dl>
      )}

      {game.unlocked && game.boards && (
        <div>
          <p className="text-xs text-text-muted mb-1.5">{t('arcade.boards', 'Boards')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {game.boards.map((b) => (
              <li key={b.key}>
                {b.unlocked && b.pool >= 12 ? (
                  <Link data-board={b.key} to={`/dashboard/play/arcade/${game.id}?board=${b.key}`}
                    className="inline-flex items-center min-h-9 rounded-full border border-accent-primary/60 bg-accent-subtle px-3 text-xs font-medium text-text-primary hover:border-accent-primary">
                    {b.title}
                  </Link>
                ) : (
                  <span data-board={b.key} className="inline-flex items-center gap-1 min-h-9 rounded-full border border-border-default px-3 text-xs text-text-muted" title={b.unlocked ? t('arcade.needs_content', 'Finish one more Python lesson to stock this game with questions') : t('arcade.locked', 'Locked')}>
                    <Lock size={10} aria-hidden="true" /> {b.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {game.unlocked && game.needs_content && (
        <p className="text-sm text-text-secondary">{t('arcade.needs_content', 'Finish one more Python lesson to stock this game with questions')}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-auto">
        {href ? (
          <Button as={Link} to={href} size="sm" className="min-h-11 flex-1">{t('arcade.play', 'Play')}</Button>
        ) : game.next_lesson ? (
          <Button as={Link} to={`/dashboard/classroom/${game.next_lesson}`} size="sm" variant="outline" className="min-h-11 flex-1">
            <BookOpen size={14} /> {t('arcade.next_lesson', 'Open the next lesson')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled className="min-h-11 flex-1"><Lock size={14} /> {t('arcade.locked', 'Locked')}</Button>
        )}
      </div>
    </GlassCard>
  );
}

/**
 * The Arcade section of the Play page: stage line + one card per game (locked cards show the
 * milestone, unlocked cards show boards / best / Play).
 */
export function ArcadeGallery({ catalog }) {
  const t = usePlayT();
  if (!catalog) return null;
  const nxt = catalog.stage?.next;
  return (
    <section id="arcade" aria-label={t('arcade.title', 'Arcade')} className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-bold text-text-primary flex items-center gap-2"><Sparkles size={18} className="text-accent-primary" /> {t('arcade.title', 'Arcade')}</h2>
          <p className="text-sm text-text-muted">{t('arcade.tagline', 'Real games where the question is a move. Every lesson you finish unlocks more to play.')}</p>
        </div>
        <p className="text-xs text-text-muted" aria-live="polite">
          {t('arcade.stage', '{completed} lessons done', { completed: catalog.stage?.completed ?? 0 })}
          {nxt && <> · {t('arcade.stage_next', '{needed} more to unlock {game}', { needed: nxt.needed, game: ARCADE_TITLES[nxt.game] || nxt.game })}</>}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {catalog.games.map((g, i) => <GameCard key={g.id} game={g} index={i} t={t} />)}
      </div>
    </section>
  );
}

export default ArcadeGallery;
