import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Gamepad2, Lock, Sparkles, Target } from 'lucide-react';
import { getArcadeCatalog, getPlayCatalog } from '../api';
import { Badge, Button, GlassCard, SectionHeading } from '../components/ui';
import { GAME_ICONS, hasComponent } from '../games';
import { usePlayT } from '../games/engine/i18n';
import { ArcadeGallery } from '../arcade/ArcadeGallery';
import { UNLOCK_EVENT } from '../arcade/unlocks';

const topicLabel = (t) => String(t || '').replace(/_/g, ' ');

function GameCard({ game, index, t }) {
  const Icon = GAME_ICONS[game.id] || Gamepad2;
  const playable = hasComponent(game.id);
  return (
    <GlassCard index={index} className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-primary text-white flex items-center justify-center"><Icon size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text-primary leading-tight">{game.title}</h3>
          <p className="text-xs text-text-muted mt-0.5">{game.blurb}</p>
        </div>
        {game.daily_done && <Badge variant="success"><CalendarCheck size={10} /> {t('play.daily', 'Daily')} ✓</Badge>}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-bg-inset py-1.5"><dt className="text-text-muted">{t('play.best', 'Best')}</dt><dd className="font-semibold text-text-primary tabular-nums">{game.best_score ?? '—'}</dd></div>
        <div className="rounded-lg bg-bg-inset py-1.5"><dt className="text-text-muted">{t('play.level', 'Level')}</dt><dd className="font-semibold text-text-primary tabular-nums">{game.best_level ?? game.suggested_level}</dd></div>
        <div className="rounded-lg bg-bg-inset py-1.5"><dt className="text-text-muted">{t('play.rounds', 'Rounds')}</dt><dd className="font-semibold text-text-primary tabular-nums">{game.rounds}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2 mt-auto">
        {playable ? (
          <>
            <Button as={Link} to={`/dashboard/play/${game.id}?level=${game.suggested_level}`} size="sm" className="min-h-11 flex-1">{t('play.play', 'Play')}</Button>
            <Button as={Link} to={`/dashboard/play/${game.id}?mode=daily`} size="sm" variant="outline" className="min-h-11"
              aria-disabled={game.daily_done} onClick={(e) => { if (game.daily_done) e.preventDefault(); }}>
              <CalendarCheck size={14} /> {t('play.daily', 'Daily')}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled className="min-h-11 flex-1"><Lock size={14} /> {t('play.coming_soon', 'Coming soon')}</Button>
        )}
      </div>
    </GlassCard>
  );
}

export default function Play() {
  const [data, setData] = useState(null);
  const [arcade, setArcade] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const t = usePlayT();

  // Arcade catalog: evaluates unlocks server-side; newly earned keys get the toast.
  useEffect(() => {
    getArcadeCatalog().then((r) => {
      setArcade(r.data);
      if (r.data?.newly_unlocked?.length) window.dispatchEvent(new CustomEvent(UNLOCK_EVENT, { detail: r.data.newly_unlocked }));
    }).catch(() => setArcade(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getPlayCatalog();
      setData(res.data);
    } catch (err) {
      setError(err?.response?.status === 503 ? 'paused' : (err?.response?.data?.detail || 'Could not load games'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const gamesById = Object.fromEntries((data?.games || []).map((g) => [g.id, g]));

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary flex items-center gap-2"><Gamepad2 className="text-accent-primary" /> {t('play.title', 'Play')}</h1>
          <p className="text-sm text-text-muted mt-1">{t('play.tagline', 'Two to five minute games where the mechanic is the idea. Losing shows you exactly which idea you are missing.')}</p>
        </div>
        {data && (
          <p className="text-xs text-text-muted" aria-live="polite">
            {t('play.xp_today', 'Game XP today')} <span className="font-semibold text-text-primary tabular-nums">{data.today_xp}</span> / {data.xp_cap}
          </p>
        )}
      </header>

      {loading && <p className="text-sm text-text-muted" role="status">Loading games…</p>}
      {error === 'paused' && (
        <GlassCard className="p-5"><p className="text-sm text-text-secondary">{t('play.paused', 'Play is taking a short break. Lessons and the Playground are open as usual.')}</p></GlassCard>
      )}
      {error && error !== 'paused' && (
        <GlassCard className="p-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-text-secondary">{String(error)}</p>
          <Button size="sm" variant="outline" onClick={load}>{t('play.retry', 'Retry')}</Button>
        </GlassCard>
      )}

      {arcade && <ArcadeGallery catalog={arcade} />}

      {data && (
        <div className="pt-2">
          <h2 className="font-display text-xl font-bold text-text-primary">{t('arcade.quick_drills', 'Quick drills')}</h2>
          <p className="text-sm text-text-muted">{t('arcade.quick_drills_sub', 'Two-minute rounds that sharpen one idea at a time')}</p>
        </div>
      )}

      {data?.recommendations?.length > 0 && (
        <GlassCard index={0} className="p-5">
          <SectionHeading icon={Target} title={t('play.review_title', 'Play to review')} subtitle={t('play.review_subtitle', 'Picked from what Classroom and your review queue say you should revisit')} />
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.recommendations.map((r) => {
              const g = gamesById[r.game_id];
              const Icon = GAME_ICONS[r.game_id] || Gamepad2;
              return (
                <li key={`${r.game_id}-${r.topic}`} className="rounded-xl border border-border-default bg-bg-surface p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Icon size={16} className="text-accent-primary" /> {g?.title || r.game_id}</div>
                  <p className="text-xs text-text-muted"><span className="font-medium text-text-secondary">{topicLabel(r.topic)}</span> · {r.reason}</p>
                  {hasComponent(r.game_id) ? (
                    <Button as={Link} to={`/dashboard/play/${r.game_id}?level=${r.level}`} size="sm" className="min-h-11 mt-auto">{t('play.play_level', 'Play level {level}', { level: r.level })}</Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled className="min-h-11 mt-auto">{t('play.coming_soon', 'Coming soon')}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </GlassCard>
      )}

      {data && (
        <section aria-label="All games" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.games.map((g, i) => <GameCard key={g.id} game={g} index={i + 1} t={t} />)}
        </section>
      )}

      {data && (
        <p className="text-xs text-text-muted flex items-center gap-1"><Sparkles size={12} /> Every round feeds Vaathiyaar's picture of what you know, so the tutor adapts to how you play.</p>
      )}
    </div>
  );
}
