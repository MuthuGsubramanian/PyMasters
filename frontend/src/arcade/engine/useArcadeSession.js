// One arcade session: start → queue of questions (prefetched) → answer (server-graded) → finish.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { startArcadeSession, moreArcadeQuestions, answerArcadeItem, finishArcadeSession } from '../../api';

export const PREFETCH_AT = 5;

export const initialArcadeSession = {
  state: 'idle', // idle | loading | ready | finishing | done | error
  sessionId: null,
  gameId: null,
  board: null,
  queue: [],
  dealt: [],
  item: null,
  reveals: {},
  answered: 0,
  correct: 0,
  prefetching: false,
  result: null,
  error: null,
};

export function sessionReducer(s, a) {
  switch (a.type) {
    case 'LOAD':
      return { ...initialArcadeSession, state: 'loading' };
    case 'STARTED': {
      const items = a.session.items || [];
      return { ...s, state: 'ready', sessionId: a.session.session_id, gameId: a.session.game_id, board: a.session.board || null,
        queue: items, dealt: items.map((i) => i.id), current: null, reveals: {}, answered: 0, correct: 0, result: null, error: null };
    }
    case 'TAKE': {
      if (!s.queue.length) return { ...s, item: null };
      const [item, ...queue] = s.queue;
      return { ...s, item, queue };
    }
    case 'PREFETCHING':
      return { ...s, prefetching: true };
    case 'MORE': {
      const seen = new Set(s.dealt);
      const fresh = (a.items || []).filter((i) => !seen.has(i.id));
      return { ...s, prefetching: false, queue: [...s.queue, ...fresh], dealt: [...s.dealt, ...fresh.map((i) => i.id)] };
    }
    case 'REVEALED': {
      if (s.reveals[a.itemId]) return s;
      const reveal = a.reveal || { correct: false };
      return { ...s, reveals: { ...s.reveals, [a.itemId]: reveal }, answered: s.answered + 1, correct: s.correct + (reveal.correct ? 1 : 0) };
    }
    case 'FINISHING':
      return s.state === 'done' ? s : { ...s, state: 'finishing' };
    case 'FINISHED':
      return { ...s, state: 'done', result: a.result };
    case 'ERROR':
      return { ...s, state: 'error', error: a.error, prefetching: false };
    default:
      return s;
  }
}

export function shouldPrefetch(s) {
  return s.state === 'ready' && !s.prefetching && s.queue.length <= PREFETCH_AT;
}

function errorMessage(err) {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && d.message) return d.message;
  return err?.message || 'Something went wrong';
}

/**
 * @param {{gameId: string, board?: string|null, autoStart?: boolean}} opts
 */
export function useArcadeSession({ gameId, board = null, autoStart = true }) {
  const [s, dispatch] = useReducer(sessionReducer, initialArcadeSession);
  const finishing = useRef(false);

  const start = useCallback(async () => {
    dispatch({ type: 'LOAD' });
    try {
      const { data } = await startArcadeSession(gameId, board);
      dispatch({ type: 'STARTED', session: data });
    } catch (err) {
      const d = err?.response?.data?.detail;
      dispatch({ type: 'ERROR', error: errorMessage(err), code: d?.code });
    }
  }, [gameId, board]);

  useEffect(() => { if (autoStart) start(); }, [start, autoStart]);

  // Prefetch the next batch before the queue runs dry (Snake and Slingshot eat questions fast).
  useEffect(() => {
    if (!shouldPrefetch(s) || !s.sessionId) return;
    dispatch({ type: 'PREFETCHING' });
    moreArcadeQuestions(s.sessionId)
      .then(({ data }) => dispatch({ type: 'MORE', items: data.items || [] }))
      .catch(() => dispatch({ type: 'MORE', items: [] }));
  }, [s]);

  const take = useCallback(() => dispatch({ type: 'TAKE' }), []);

  const answer = useCallback(async (itemId, response, ms) => {
    try {
      const { data } = await answerArcadeItem(s.sessionId, itemId, response, ms);
      dispatch({ type: 'REVEALED', itemId, reveal: data });
      return data;
    } catch {
      dispatch({ type: 'REVEALED', itemId, reveal: null });
      return null;
    }
  }, [s.sessionId]);

  const finish = useCallback(async (score, stats) => {
    if (finishing.current || !s.sessionId) return s.result;
    finishing.current = true;
    dispatch({ type: 'FINISHING' });
    try {
      const { data } = await finishArcadeSession(s.sessionId, score, stats);
      dispatch({ type: 'FINISHED', result: data });
      return data;
    } catch (err) {
      dispatch({ type: 'ERROR', error: errorMessage(err) });
      return null;
    } finally {
      finishing.current = false;
    }
  }, [s.sessionId, s.result]);

  return { ...s, start, take, answer, finish };
}

export default useArcadeSession;
