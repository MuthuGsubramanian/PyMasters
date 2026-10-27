// One round of any game: load items → answer each (timing them) → reveal → finish.
// The reducer is pure and exported for tests; the hook wires it to the API.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { startPlayRound, finishPlayRound, answerPlayItem } from '../../api';

export const initialSession = {
  state: 'idle', // idle | loading | playing | answering | revealing | finishing | done | error
  round: null,
  items: [],
  index: 0,
  shownAt: 0,
  responses: {},
  itemMs: {},
  reveals: {},
  result: null,
  error: null,
};

export function sessionReducer(s, a) {
  switch (a.type) {
    case 'LOAD':
      return { ...initialSession, state: 'loading' };
    case 'ROUND_LOADED': {
      const items = a.round.items || [];
      const answered = new Set(a.round.answered || []);
      let index = items.findIndex((it) => !answered.has(it.id));
      if (index < 0) index = items.length;            // resumed round with everything answered → finish
      return { ...s, state: index >= items.length ? 'finishing' : 'playing', round: a.round, items, index, shownAt: a.now,
        responses: Object.fromEntries([...answered].map((id) => [id, null])), itemMs: {}, reveals: {}, result: null, error: null };
    }
    case 'REFINISH': {
      if (s.state !== 'error' || !s.round || !s.items.length) return s;
      const allAnswered = s.items.every((it) => it.id in s.responses);
      return allAnswered ? { ...s, state: 'finishing', error: null } : s;
    }
    case 'ANSWER': {
      if (s.state !== 'playing') return s;
      const item = s.items[s.index];
      if (!item || item.id !== a.itemId) return s;
      return { ...s, state: 'answering',
        responses: { ...s.responses, [a.itemId]: a.response },
        itemMs: { ...s.itemMs, [a.itemId]: Math.max(0, a.now - s.shownAt) } };
    }
    case 'REVEALED': {
      if (s.state !== 'answering') return s;
      const reveals = a.reveal ? { ...s.reveals, [a.itemId]: a.reveal } : s.reveals;
      return { ...s, state: 'revealing', reveals };
    }
    case 'NEXT': {
      if (s.state !== 'revealing') return s;
      const next = s.index + 1;
      if (next >= s.items.length) return { ...s, state: 'finishing' };
      return { ...s, state: 'playing', index: next, shownAt: a.now };
    }
    case 'FINISHED':
      return { ...s, state: 'done', result: a.result };
    case 'ERROR':
      return { ...s, state: 'error', error: a.error };
    default:
      return s;
  }
}

function errorMessage(err) {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return err?.message || 'Something went wrong';
}

/**
 * @param {{gameId: string, level?: number, mode?: 'practice'|'daily', getSimPayload?: () => object}} opts
 */
export function useGameSession({ gameId, level, mode, getSimPayload }) {
  const [s, dispatch] = useReducer(sessionReducer, initialSession);
  const finishing = useRef(false);

  const load = useCallback(async () => {
    dispatch({ type: 'LOAD' });
    try {
      const { data } = await startPlayRound(gameId, level, mode);
      dispatch({ type: 'ROUND_LOADED', round: data, now: Date.now() });
    } catch (err) {
      dispatch({ type: 'ERROR', error: errorMessage(err) });
    }
  }, [gameId, level, mode]);

  useEffect(() => { load(); }, [load]);

  const answer = useCallback((itemId, response) => {
    const now = Date.now();
    dispatch({ type: 'ANSWER', itemId, response, now });
    const roundId = s.round?.round_id;
    const ms = Math.max(0, now - s.shownAt);
    const isSim = response && typeof response === 'object' && (response.hole_id || response.dataset_id);
    answerPlayItem(roundId, itemId, isSim ? null : response, ms, isSim ? response : undefined)
      .then(({ data }) => dispatch({ type: 'REVEALED', itemId, reveal: data }))
      .catch(() => dispatch({ type: 'REVEALED', itemId, reveal: null }));
  }, [s.round, s.shownAt]);
  const next = useCallback(() => dispatch({ type: 'NEXT', now: Date.now() }), []);

  useEffect(() => {
    if (s.state !== 'finishing' || finishing.current) return;
    finishing.current = true;
    (async () => {
      try {
        const sim = getSimPayload ? getSimPayload() : undefined;
        const { data } = await finishPlayRound(s.round.round_id, s.responses, s.itemMs, sim);
        dispatch({ type: 'FINISHED', result: data });
      } catch (err) {
        dispatch({ type: 'ERROR', error: errorMessage(err) });
      } finally {
        finishing.current = false;
      }
    })();
  }, [s.state, s.round, s.responses, s.itemMs, getSimPayload]);

  const retry = useCallback(() => {
    // A finish that failed on the wire may have succeeded server-side: re-post it (the server
    // returns the stored result) instead of dealing a fresh round.
    const allAnswered = s.round && s.items.length > 0 && s.items.every((it) => it.id in s.responses);
    if (s.state === 'error' && allAnswered) dispatch({ type: 'REFINISH' });
    else load();
  }, [s.state, s.round, s.items, s.responses, load]);

  return {
    state: s.state, round: s.round, items: s.items, index: s.index, item: s.items[s.index] || null,
    responses: s.responses, itemMs: s.itemMs, reveals: s.reveals, result: s.result, error: s.error,
    answer, next, retry, reload: load,
  };
}
