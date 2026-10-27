import { Suspense, useEffect } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui';
import { ARCADE_COMPONENTS, ARCADE_TITLES } from '../arcade';
import { usePlayT } from '../games/engine/i18n';
import useReducedMotion from '../hooks/useReducedMotion';

/** Route /dashboard/play/arcade/:gameId — mounts one arcade game (lazy chunk per game). */
export default function ArcadeGame() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setVaathiyaarHidden } = useOutletContext() || {};
  const reducedMotion = useReducedMotion();
  const t = usePlayT();
  const Game = ARCADE_COMPONENTS[gameId];
  const board = params.get('board') || null;

  // The floating tutor launcher would sit on the canvas controls; hide it for the run.
  useEffect(() => {
    setVaathiyaarHidden?.(true);
    return () => setVaathiyaarHidden?.(false);
  }, [setVaathiyaarHidden]);

  if (!Game) {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        <p className="text-text-secondary">{t('play.coming_soon', 'Coming soon')}</p>
        <Button as={Link} to="/dashboard/play#arcade" variant="outline"><ArrowLeft size={16} /> {t('arcade.back', 'Back to Arcade')}</Button>
      </div>
    );
  }
  return (
    <Suspense fallback={<p className="text-sm text-text-muted" role="status">Loading {ARCADE_TITLES[gameId] || 'game'}…</p>}>
      <Game key={`${gameId}:${board || ''}`} gameId={gameId} board={board || undefined} reducedMotion={reducedMotion}
        onQuit={() => navigate('/dashboard/play#arcade')} />
    </Suspense>
  );
}
