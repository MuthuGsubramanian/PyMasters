import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Dices, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui';
import { usePlayT } from '../../games/engine/i18n';
import { ArcadeShell } from '../engine/ArcadeShell';
import { QuestionCard } from '../engine/QuestionCard';
import { useArcadeSession } from '../engine/useArcadeSession';
import { play as sfx } from '../engine/sfx';
import { Board } from './BoardView';
import { Die } from './Die';
import { BOARD_THEMES } from './board.js';
import { YOU, RIVAL, applyRoll, newGame, resolveQuestion, rivalTurn, scoreFor } from './rules.js';

const HOP_MS = 110;
const ROLL_MS = 720;
const RIVAL_DELAY_MS = 900;
const REVEAL_MS = 2600;

const defaultDice = () => 1 + Math.floor(Math.random() * 6);

/**
 * Snakes & Ladders: Python Quest. Roll, hop, and answer at ladders and snakes. Every question
 * is graded by the server through the arcade session; the game rules are pure (rules.js).
 */
export default function Game({ board = 'variables', reducedMotion = false, onQuit, dice = defaultDice, rival = true, rng = Math.random, startPos = 0 }) {
  const t = usePlayT();
  const session = useArcadeSession({ gameId: 'snakes_ladders', board });
  const [game, setGame] = useState(() => { const g = newGame({ board, rival }); if (startPos) g.players[0].pos = startPos; return g; });
  const [phase, setPhase] = useState('idle');          // idle | rolling | moving | question | rival | done
  const [die, setDie] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState({ [YOU]: startPos, [RIVAL]: 0 }); // displayed positions (hop animation)
  const [question, setQuestion] = useState(null);     // {item, kind, square}
  const [reveal, setReveal] = useState(null);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [message, setMessage] = useState('');
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const timers = useRef([]);
  const askedAt = useRef(0);
  const theme = BOARD_THEMES[board] || BOARD_THEMES.variables;

  const later = useCallback((fn, ms) => { const id = setTimeout(fn, reducedMotion ? 0 : ms); timers.current.push(id); return id; }, [reducedMotion]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Animate a token hop-by-hop along `path`, then call done.
  const hopAlong = useCallback((player, path, done) => {
    if (!path.length) return done();
    if (reducedMotion) { setShown((s) => ({ ...s, [player]: path[path.length - 1] })); return done(); }
    path.forEach((sq, i) => later(() => { setShown((s) => ({ ...s, [player]: sq })); sfx('hop'); }, (i + 1) * HOP_MS));
    later(done, (path.length + 1) * HOP_MS);
  }, [later, reducedMotion]);

  const settle = useCallback((next, events) => {
    // After a move (or a resolved question): a win ends the game; a question pauses for the card;
    // otherwise hand the turn over (rival plays itself).
    setGame(next);
    if (next.winner) {
      sfx(next.winner === YOU ? 'win' : 'lose');
      setPhase('done');
      return;
    }
    if (next.pending && next.players[next.turn].id === YOU) {
      const kind = next.pending.type;
      setMessage(kind === 'ladder' ? t('arcade.ladder', 'A ladder! Answer to climb.') : t('arcade.snake', 'A snake! Answer to escape.'));
      sfx(kind === 'ladder' ? 'chime' : 'hiss');
      session.take();
      setPhase('question');
      return;
    }
    const extra = events.some((e) => e.type === 'extra_turn');
    if (extra) setMessage(next.players[next.turn].id === YOU ? t('arcade.your_turn', 'Your turn') + ' · 6!' : '');
    setPhase(next.players[next.turn].id === RIVAL ? 'rival' : 'idle');
  }, [session, t]);

  // The question card shows whatever item the session handed us; with the deck empty the ladder or snake is a free pass.
  useEffect(() => {
    if (phase !== 'question') return;
    if (session.item && (!question || question.item.id !== session.item.id)) {
      setQuestion({ item: session.item, kind: game.pending?.type, square: game.pending?.square });
      askedAt.current = Date.now();
    } else if (!session.item && !session.queue.length && session.exhausted && game.pending) {
      setMessage(t('arcade.free_pass', 'No questions left in this deck: free pass!'));
      const { state, events } = resolveQuestion(game, true);
      setPhase('moving');
      const moveEvt = events.find((e) => e.type === 'climb');
      later(() => { if (moveEvt) setShown((s) => ({ ...s, [YOU]: moveEvt.to })); later(() => settle(state, events), 400); }, 200);
    }
  }, [phase, session.item, session.queue.length, session.exhausted, question, game, later, settle, t]);

  const roll = useCallback(() => {
    if (phase !== 'idle' || game.winner) return;
    const value = Math.max(1, Math.min(6, Number(dice()) || 1));
    setPhase('rolling');
    setRolling(true);
    setDie(value);
    sfx('dice');
    later(() => {
      setRolling(false);
      const { state, events } = applyRoll(game, value);
      const move = events.find((e) => e.type === 'move');
      setPhase('moving');
      hopAlong(YOU, move?.path || [], () => settle(state, events));
    }, ROLL_MS);
  }, [phase, game, dice, later, hopAlong, settle]);

  const onAnswer = useCallback(async (response) => {
    if (!question) return;
    const ms = Date.now() - askedAt.current;
    const result = await session.answer(question.item.id, response, ms);
    if (!result) {
      setMessage(t('arcade.retry_answer', 'Connection hiccup. Answer once more.'));
      setAttempt((a) => a + 1);
      return;
    }
    const correct = Boolean(result.correct);
    setReveal({ ...result, correct });
    setTally((x) => ({ correct: x.correct + (correct ? 1 : 0), wrong: x.wrong + (correct ? 0 : 1) }));
    const { state, events } = resolveQuestion(game, correct);
    const kind = question.kind;
    setMessage(kind === 'ladder' ? (correct ? t('arcade.climbed', 'Correct — up you go!') : t('arcade.slid', 'Not quite — the ladder turned into a snake.'))
      : (correct ? t('arcade.escaped', 'Correct — the snake backs off.') : t('arcade.bitten', 'Not quite — down the snake.')));
    sfx(correct ? 'chime' : 'hiss');
    setQuestion(null);
    setPhase('moving');
    const moveEvt = events.find((e) => e.type === 'climb' || e.type === 'slide' || e.type === 'bite');
    later(() => {
      if (moveEvt) setShown((s) => ({ ...s, [YOU]: moveEvt.to }));
      // Reading time for the why text is not motion: keep it even with reduced motion.
      timers.current.push(setTimeout(() => { setReveal(null); settle(state, events); }, REVEAL_MS));
    }, 300);
  }, [question, session, game, later, settle, t]);

  // Bugsy plays by itself.
  useEffect(() => {
    if (phase !== 'rival' || !rival) return undefined;
    setMessage(t('arcade.rival_turn', 'Bugsy is rolling…'));
    const id = later(() => {
      const { state, events, roll: r } = rivalTurn(game, rng, dice);
      setDie(r || 1);
      const move = events.find((e) => e.type === 'move');
      const after = events.find((e) => e.type === 'climb' || e.type === 'slide' || e.type === 'bite');
      hopAlong(RIVAL, move?.path || [], () => {
        if (after) setShown((s) => ({ ...s, [RIVAL]: after.to }));
        later(() => settle(state, events), after ? 500 : 0);
      });
    }, RIVAL_DELAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, game.turns]);

  // Game over: report the score once.
  const finished = useRef(false);
  useEffect(() => {
    if (phase !== 'done' || finished.current) return;
    finished.current = true;
    session.finish(scoreFor({ won: game.winner === YOU, ...tally }), { turns: game.turns, winner: game.winner, board });
  }, [phase, session, game, tally, board]);

  useEffect(() => {
    const onKey = (e) => {
      if (paused || e.target?.tagName === 'BUTTON') return;
      if ((e.key === 'Enter' || e.key === ' ') && phase === 'idle' && !question) { e.preventDefault(); roll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, question, roll, paused]);

  const restart = () => {
    timers.current.forEach(clearTimeout);
    finished.current = false;
    setGame(newGame({ board, rival }));
    setShown({ [YOU]: 0, [RIVAL]: 0 });
    setTally({ correct: 0, wrong: 0 });
    setQuestion(null); setReveal(null); setMessage(''); setDie(1);
    setPhase('idle');
    session.start();
  };

  if (session.state === 'error') {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        <p className="text-text-secondary" role="alert">{session.error}</p>
        <div className="flex gap-3">
          <Button onClick={restart}>{t('play.retry', 'Retry')}</Button>
          <Button as={Link} to="/dashboard/play#arcade" variant="outline"><ArrowLeft size={16} /> {t('arcade.back', 'Back to Arcade')}</Button>
        </div>
      </div>
    );
  }

  if (phase === 'done' && session.state === 'done') {
    const won = game.winner === YOU;
    const res = session.result || {};
    return (
      <div data-end-screen className="max-w-xl mx-auto flex flex-col gap-4 rounded-2xl border border-border-default bg-bg-elevated p-6">
        <h2 className="font-display text-2xl font-bold text-text-primary">{won ? t('arcade.you_won', 'You won!') : t('arcade.game_over', 'Game over')}</h2>
        <p className="text-sm text-text-secondary">{theme.title} · {won ? 'You beat Bugsy to square 100.' : 'Bugsy got there first. Rematch?'}</p>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-bg-inset py-2"><dt className="text-xs text-text-muted">{t('arcade.correct', 'Correct')}</dt><dd className="font-semibold text-text-primary tabular-nums">{tally.correct} / {tally.correct + tally.wrong}</dd></div>
          <div className="rounded-xl bg-bg-inset py-2"><dt className="text-xs text-text-muted">Score</dt><dd className="font-semibold text-text-primary tabular-nums">{res.score ?? 0}</dd></div>
          <div className="rounded-xl bg-bg-inset py-2"><dt className="text-xs text-text-muted">{t('arcade.xp_earned', 'XP earned')}</dt><dd className="font-semibold text-text-primary tabular-nums">+{res.xp ?? 0}</dd></div>
        </dl>
        {res.xp_capped && <p className="text-xs text-text-muted">{t('arcade.capped', 'Daily game XP cap reached')}</p>}
        {res.best && <p className="text-sm font-medium text-accent-primary">{t('arcade.new_best', 'New personal best!')}</p>}
        {Array.isArray(res.reveal) && res.reveal.some((r) => !r.correct) && (
          <ul className="flex flex-col gap-2 text-sm">
            {res.reveal.filter((r) => !r.correct).slice(0, 4).map((r) => (
              <li key={r.id} className="rounded-xl border border-border-default p-3">
                <p className="text-text-secondary">{r.why}</p>
                {r.lesson_id && <Link className="text-accent-primary text-xs underline-offset-2 hover:underline" to={`/dashboard/classroom/${r.lesson_id}`}>{t('reveal.open_lesson', 'Open lesson')}</Link>}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          <Button onClick={restart} className="min-h-11"><RotateCcw size={16} /> {t('arcade.rematch', 'Play again')}</Button>
          <Button as={Link} to="/dashboard/play#arcade" variant="outline" className="min-h-11"><ArrowLeft size={16} /> {t('arcade.back', 'Back to Arcade')}</Button>
        </div>
      </div>
    );
  }

  const yourTurn = phase === 'idle' && game.players[game.turn]?.id === YOU && session.state === 'ready';
  const shownPlayers = game.players.map((p) => ({ ...p, pos: shown[p.id] ?? p.pos }));
  return (
    <ArcadeShell title={`Snakes & Ladders · ${theme.title}`} subtitle={theme.subtitle} score={tally.correct * 100} onQuit={onQuit} paused={paused} onPauseChange={setPaused}
      footer={t('round.footer_practice', 'Practice round. Items you have seen recently are skipped.')}>
      {() => (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start" data-turn={game.players[game.turn]?.id} data-paused={paused ? '1' : '0'}>
          <Board boardKey={board} layout={game.layout} players={shownPlayers} turned={game.turned} highlight={question?.square} reducedMotion={reducedMotion} />
          <aside className="flex flex-col gap-3">
            <div className="rounded-2xl border border-border-default bg-bg-elevated p-4 flex items-center gap-4">
              <Die value={die} rolling={rolling} reducedMotion={reducedMotion} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">{yourTurn ? t('arcade.your_turn', 'Your turn') : (phase === 'rival' ? t('arcade.rival_turn', 'Bugsy is rolling…') : ' ')}</p>
                <Button data-roll onClick={roll} disabled={!yourTurn || paused} className="min-h-11 mt-2 w-full"><Dices size={16} /> {t('arcade.roll', 'Roll the die')}</Button>
              </div>
            </div>
            <div className="rounded-2xl border border-border-default bg-bg-surface p-3 text-sm flex flex-col gap-1" aria-live="polite">
              <p className="text-text-secondary min-h-5">{message}</p>
              {reveal && <p className={reveal.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>{reveal.why}</p>}
              <p className="text-xs text-text-muted">You: {game.players[0].pos}{rival && game.players[1] ? ` · Bugsy: ${game.players[1].pos}` : ''} · {t('arcade.correct', 'Correct')} {tally.correct}/{tally.correct + tally.wrong}</p>
            </div>
            {session.state === 'loading' && <p className="text-xs text-text-muted" role="status">{t('round.loading', 'Setting up your round…')}</p>}
          </aside>
          {phase === 'question' && question && (
            <div className="lg:col-span-2">
              <QuestionCard key={`${question.item.id}:${attempt}`} item={question.item} onAnswer={onAnswer} disabled={paused} paused={paused} timerMs={20000}
                title={question.kind === 'ladder' ? t('arcade.ladder', 'A ladder! Answer to climb.') : t('arcade.snake', 'A snake! Answer to escape.')} />
            </div>
          )}
        </div>
      )}
    </ArcadeShell>
  );
}
