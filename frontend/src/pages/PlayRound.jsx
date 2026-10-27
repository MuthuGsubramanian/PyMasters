import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui';
import { GAME_COMPONENTS } from '../games';
import { GameShell } from '../games/engine/GameShell';
import { Reveal } from '../games/engine/Reveal';
import { Results } from '../games/engine/Results';
import { useGameSession } from '../games/engine/useGameSession';
import useReducedMotion from '../hooks/useReducedMotion';
import { getPlayCatalog } from '../api';

const TITLES = {
  output_oracle: 'Output Oracle', bug_hunt: 'Bug Hunt', shape_sorter: 'Shape Sorter',
  big_o_sprint: 'Big-O Sprint', gradient_golf: 'Gradient Golf', overfit_detective: 'Overfit Detective',
};

export default function PlayRound() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setVaathiyaarHidden } = useOutletContext() || {};
  const reducedMotion = useReducedMotion();
  const [level, setLevel] = useState(() => Number(params.get('level')) || undefined);
  const mode = params.get('mode') === 'daily' ? 'daily' : 'practice';
  const [title, setTitle] = useState(TITLES[gameId] || gameId);
  const simPayload = useRef({ holes: [] });

  const Game = GAME_COMPONENTS[gameId];
  const getSimPayload = useCallback(() => (simPayload.current.holes.length ? simPayload.current : undefined), []);
  const session = useGameSession({ gameId, level, mode, getSimPayload });

  useEffect(() => { setVaathiyaarHidden?.(false); }, [setVaathiyaarHidden]);
  useEffect(() => {
    // title from the catalog when available (keeps UI copy in one place server-side)
    getPlayCatalog().then((r) => {
      const g = (r.data?.games || []).find((x) => x.id === gameId);
      if (g?.title) setTitle(g.title);
    }).catch(() => {});
  }, [gameId]);

  // Reset per-round client state when a new round loads.
  useEffect(() => {
    if (session.state === 'loading') simPayload.current = { holes: [] };
  }, [session.state]);

  const onAnswer = useCallback((response) => {
    const item = session.item;
    if (!item) return;
    if (item.kind === 'sim' && response && typeof response === 'object') {
      simPayload.current = { holes: [...simPayload.current.holes.filter((h) => h.hole_id !== response.hole_id), response] };
    }
    session.answer(item.id, response);
  }, [session]);

  const score = Object.values(session.reveals).reduce((acc, r) => acc + (r?.score || 0), 0);

  if (!Game) {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        <p className="text-text-secondary">This game is not available yet.</p>
        <Button as={Link} to="/dashboard/play" variant="outline"><ArrowLeft size={16} /> Back to Play</Button>
      </div>
    );
  }

  if (session.state === 'done') {
    return (
      <Results result={session.result} gameTitle={title}
        onAgain={(nextLevel) => { setLevel(nextLevel); navigate(`/dashboard/play/${gameId}?level=${nextLevel}`, { replace: true }); session.retry(); }}
        onBack={() => navigate('/dashboard/play')} />
    );
  }

  if (session.state === 'error') {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        <p className="text-text-secondary" role="alert">{session.error}</p>
        <div className="flex gap-3">
          <Button onClick={session.retry}>Try again</Button>
          <Button as={Link} to="/dashboard/play" variant="outline"><ArrowLeft size={16} /> Back to Play</Button>
        </div>
      </div>
    );
  }

  const total = session.items.length || Number(params.get('n')) || 0;
  const header = session.round?.level || level || 1;
  return (
    <GameShell title={title} level={header} index={session.index} total={total} score={score} onQuit={() => navigate('/dashboard/play')}
      footer={mode === 'daily' ? 'Daily challenge: the same items for everyone today, one scored attempt.' : 'Practice round. Items you have seen recently are skipped.'}>
      {({ paused }) => (
        <div className="flex flex-col gap-4">
          {session.state === 'loading' && <p className="text-sm text-text-muted" role="status">Setting up your round…</p>}
          {session.item && (session.state === 'playing' || session.state === 'answering' || session.state === 'revealing') && (
            <Suspense fallback={<p className="text-sm text-text-muted">Loading game…</p>}>
              <Game key={session.item.id} item={session.item} onAnswer={onAnswer} disabled={paused || session.state !== 'playing'} reducedMotion={reducedMotion} />
            </Suspense>
          )}
          {session.state === 'revealing' && session.item && (
            <Reveal item={session.item} revealItem={session.reveals[session.item.id]} learnerResponse={session.responses[session.item.id]}
              gameTitle={title} onNext={session.next} />
          )}
          {session.state === 'answering' && <p className="text-sm text-text-muted" role="status">Checking…</p>}
          {session.state === 'finishing' && <p className="text-sm text-text-muted" role="status">Scoring your round…</p>}
        </div>
      )}
    </GameShell>
  );
}
