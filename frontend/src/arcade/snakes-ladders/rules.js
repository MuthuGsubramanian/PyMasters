// Pure game rules for Snakes & Ladders: Python Quest. No React, no timers.
import { BOARD_LAYOUTS, BOARD_ORDER, pathBetween } from './board.js';

export const YOU = 'you';
export const RIVAL = 'bugsy';

export function newGame({ board, seed = 1, rival = true }) {
  const players = [{ id: YOU, pos: 0 }];
  if (rival) players.push({ id: RIVAL, pos: 0 });
  return { board, layout: BOARD_LAYOUTS[board] || BOARD_LAYOUTS.variables, seed, players, turn: 0, pending: null,
    winner: null, turned: {}, lastRoll: 0, turns: 0 };
}

/** Where a ladder-turned-snake drops you: halfway back down its own length, never below 1. */
export function snakeTailFor(foot, head) {
  return Math.max(1, foot - Math.round((head - foot) / 2));
}

function advanceTurn(state, roll, events) {
  if (state.winner) return state;
  if (roll === 6) { events.push({ type: 'extra_turn', player: state.players[state.turn].id }); return state; }
  return { ...state, turn: (state.turn + 1) % state.players.length };
}

export function applyRoll(state, roll) {
  if (state.winner || state.pending) return { state, events: [] };
  const events = [];
  const idx = state.turn;
  const mover = state.players[idx];
  const target = Math.min(100, mover.pos + roll);
  const players = state.players.map((p, i) => (i === idx ? { ...p, pos: target } : p));
  let next = { ...state, players, lastRoll: roll, turns: state.turns + 1 };
  events.push({ type: 'move', player: mover.id, from: mover.pos, to: target, path: pathBetween(mover.pos, target), roll });
  if (target >= 100) {
    next = { ...next, winner: mover.id };
    events.push({ type: 'win', player: mover.id });
    return { state: next, events };
  }
  const { ladders, snakes } = state.layout;
  if (ladders[target] && !state.turned[target]) {
    next = { ...next, pending: { type: 'ladder', square: target } };
    events.push({ type: 'ladder_question', player: mover.id, square: target, head: ladders[target] });
    return { state: next, events };
  }
  if (snakes[target] || state.turned[target]) {
    next = { ...next, pending: { type: 'snake', square: target } };
    events.push({ type: 'snake_question', player: mover.id, square: target, tail: snakes[target] ?? snakeTailFor(target, ladders[target]) });
    return { state: next, events };
  }
  return { state: advanceTurn(next, roll, events), events };
}

export function resolveQuestion(state, correct) {
  if (!state.pending) return { state, events: [] };
  const events = [];
  const idx = state.turn;
  const mover = state.players[idx];
  const { ladders, snakes } = state.layout;
  const { type, square } = state.pending;
  let pos = mover.pos;
  let turned = state.turned;
  if (type === 'ladder') {
    if (correct) { pos = ladders[square]; events.push({ type: 'climb', player: mover.id, from: square, to: pos }); }
    else { turned = { ...turned, [square]: true }; pos = snakeTailFor(square, ladders[square]); events.push({ type: 'slide', player: mover.id, from: square, to: pos }); }
  } else if (correct) {
    events.push({ type: 'escape', player: mover.id, square });
  } else {
    pos = snakes[square] ?? snakeTailFor(square, ladders[square]);
    events.push({ type: 'bite', player: mover.id, from: square, to: pos });
  }
  const players = state.players.map((p, i) => (i === idx ? { ...p, pos } : p));
  let next = { ...state, players, pending: null, turned };
  if (pos >= 100) {
    next = { ...next, winner: mover.id };
    events.push({ type: 'win', player: mover.id });
    return { state: next, events };
  }
  return { state: advanceTurn(next, state.lastRoll, events), events };
}

/** Bugsy's chance to answer: 60 % on the first board rising to 85 % on the last. */
export function rivalAnswers(rng, board) {
  const i = Math.max(0, BOARD_ORDER.indexOf(board));
  const p = 0.6 + 0.25 * (i / (BOARD_ORDER.length - 1));
  return rng() < p;
}

/** One rival roll (and its question, answered by probability). Call again while `turn` stays on the rival. */
export function rivalTurn(state, rng = Math.random, dice = () => 1 + Math.floor(Math.random() * 6)) {
  if (state.winner || state.players[state.turn]?.id !== RIVAL) return { state, events: [], roll: 0 };
  const roll = dice();
  const r = applyRoll(state, roll);
  let { state: next, events } = r;
  if (next.pending) {
    const correct = rivalAnswers(rng, state.board);
    events = [...events, { type: 'rival_answer', correct }];
    const q = resolveQuestion(next, correct);
    next = q.state;
    events = [...events, ...q.events];
  }
  return { state: next, events, roll };
}

export function scoreFor({ won, correct, wrong }) {
  return Math.max(0, (won ? 500 : 0) + correct * 100 - wrong * 25);
}
