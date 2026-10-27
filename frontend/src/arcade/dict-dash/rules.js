// Pure rules for Dict Dash: a pellet maze where the four corner power pellets carry the
// candidate answers. The right one frightens the error ghosts; the wrong one hurries them.
import { parseMap, moveFrom, neighbors, bfsNext, OPPOSITE } from '../engine/tilemap.js';
import { MAZE } from './maze.js';

export const LIVES = 3;
export const PLAYER_STEP_MS = 140;
export const GHOST_STEP_MS = 170;
export const FRIGHT_MS = 6000;
export const HURRY_MS = 6000;
export const RELEASE_GAP_MS = 1500;
const GHOSTS = [
  { name: 'KeyError', color: '#f87171', brain: 'chase' },
  { name: 'None', color: '#f472b6', brain: 'ahead' },
  { name: 'IndexError', color: '#22d3ee', brain: 'scatter' },
  { name: 'TypeError', color: '#fb923c', brain: 'random' },
];

function key(c) { return `${c.x},${c.y}`; }

function freshGhosts(map, now = 0) {
  return GHOSTS.map((g, i) => ({ id: `g${i}`, ...g, x: map.ghost.x, y: map.ghost.y, dir: 'up', mode: 'chase', acc: 0, releaseAt: now + i * RELEASE_GAP_MS, scatterT: 0 }));
}

export function newGame({ lives = LIVES } = {}) {
  const map = parseMap(MAZE);
  return { lives, alive: true, score: 0, level: 1, map, pellets: new Set(map.pellets.map(key)), powers: [], prompt: null,
    player: { x: map.player.x, y: map.player.y, dir: 'left', next: 'left', acc: 0, mouth: 0 },
    ghosts: freshGhosts(map), frightenedT: 0, hurriedT: 0, chain: 0, time: 0, correct: 0, wrong: 0, pelletsEaten: 0, deathT: 0 };
}

export function setPrompt(state, item, rng = Math.random) {
  const choices = item?.choices || [];
  const order = choices.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const powers = state.map.powers.slice(0, choices.length).map((c, k) => ({ x: c.x, y: c.y, choiceIndex: order[k], label: String(choices[order[k]]) }));
  return { ...state, powers, prompt: item };
}

export function applyPowerResult(state, correct) {
  const events = [];
  if (correct) {
    events.push({ type: 'power_right' });
    return { state: { ...state, frightenedT: FRIGHT_MS, hurriedT: 0, chain: 0, score: state.score + 100, correct: state.correct + 1, prompt: null, powers: [],
      ghosts: state.ghosts.map((g) => (g.mode === 'eaten' ? g : { ...g, mode: 'frightened', dir: OPPOSITE[g.dir] || g.dir })) }, events };
  }
  events.push({ type: 'power_wrong' });
  return { state: { ...state, hurriedT: HURRY_MS, wrong: state.wrong + 1, prompt: null, powers: [] }, events };
}

function resetPositions(state) {
  const map = state.map;
  return { ...state, player: { ...state.player, x: map.player.x, y: map.player.y, dir: 'left', next: 'left', acc: 0 }, ghosts: freshGhosts(map, state.time), frightenedT: 0, hurriedT: 0 };
}

function ghostTarget(state, g, idx) {
  const p = state.player;
  if (g.mode === 'eaten') return state.map.ghost;
  const corners = [{ x: 1, y: 1 }, { x: state.map.cols - 2, y: 1 }, { x: 1, y: state.map.rows - 2 }, { x: state.map.cols - 2, y: state.map.rows - 2 }];
  if (g.brain === 'chase') return { x: p.x, y: p.y };
  if (g.brain === 'ahead') { const ahead = moveFrom(state.map, p.x, p.y, p.dir) || p; return { x: ahead.x, y: ahead.y }; }
  if (g.brain === 'scatter') return Math.floor(state.time / 7000) % 2 === 0 ? corners[idx % 4] : { x: p.x, y: p.y };
  return null;   // random
}

function ghostStep(state, g, idx, rng) {
  const opts = neighbors(state.map, g.x, g.y);
  if (!opts.length) return g;
  const noReverse = opts.filter((o) => o.dir !== OPPOSITE[g.dir]);
  const pool = noReverse.length ? noReverse : opts;
  let pick = null;
  const target = g.mode === 'frightened' ? null : ghostTarget(state, g, idx);
  if (target) {
    const nxt = bfsNext(state.map, { x: g.x, y: g.y }, target);
    if (nxt) pick = pool.find((o) => o.x === nxt.x && o.y === nxt.y) || opts.find((o) => o.x === nxt.x && o.y === nxt.y);
  }
  if (!pick) pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  let mode = g.mode;
  if (mode === 'eaten' && pick.x === state.map.ghost.x && pick.y === state.map.ghost.y) mode = 'chase';
  return { ...g, x: pick.x, y: pick.y, dir: pick.dir, mode };
}

/**
 * @param {object} state
 * @param {number} dtMs
 * @param {{dir?: 'up'|'down'|'left'|'right', rng?: () => number}} input
 */
export function step(state, dtMs, input = {}) {
  if (!state.alive) return { state, events: [] };
  const rng = input.rng || Math.random;
  const events = [];
  let s = { ...state, time: state.time + dtMs, frightenedT: Math.max(0, state.frightenedT - dtMs), hurriedT: Math.max(0, state.hurriedT - dtMs) };
  if (state.frightenedT > 0 && s.frightenedT === 0) s = { ...s, ghosts: s.ghosts.map((g) => (g.mode === 'frightened' ? { ...g, mode: 'chase' } : g)) };
  if (s.deathT > 0) { s = { ...s, deathT: Math.max(0, s.deathT - dtMs) }; return { state: s, events }; }
  // player
  let player = { ...s.player, acc: s.player.acc + dtMs, mouth: (s.player.mouth + dtMs / 90) % (Math.PI * 2) };
  if (input.dir) player.next = input.dir;
  let pellets = s.pellets, powers = s.powers, score = s.score, pelletsEaten = s.pelletsEaten;
  while (player.acc >= PLAYER_STEP_MS) {
    player.acc -= PLAYER_STEP_MS;
    const turn = moveFrom(s.map, player.x, player.y, player.next);
    let dest = turn;
    if (turn) player.dir = player.next; else dest = moveFrom(s.map, player.x, player.y, player.dir);
    if (!dest) break;
    player.x = dest.x; player.y = dest.y;
    const k = key(player);
    if (pellets.has(k)) { pellets = new Set(pellets); pellets.delete(k); score += 10; pelletsEaten++; events.push({ type: 'pellet' }); }
    const pw = powers.find((p) => p.x === player.x && p.y === player.y);
    if (pw) { events.push({ type: 'power', choiceIndex: pw.choiceIndex, label: pw.label }); powers = []; }
  }
  s = { ...s, player, pellets, powers, score, pelletsEaten };
  // ghosts
  const mul = s.frightenedT > 0 ? 1.6 : s.hurriedT > 0 ? 0.6 : 1;
  const levelMul = Math.max(0.7, 1 - 0.05 * (s.level - 1));
  const ghosts = s.ghosts.map((g, idx) => {
    if (s.time < g.releaseAt) return g;
    const stepMs = GHOST_STEP_MS * (g.mode === 'eaten' ? 0.5 : mul) * levelMul;
    let gg = { ...g, acc: g.acc + dtMs };
    let guard = 0;
    while (gg.acc >= stepMs && guard++ < 4) { gg.acc -= stepMs; gg = ghostStep(s, gg, idx, rng); }
    return gg;
  });
  s = { ...s, ghosts };
  // collisions
  for (let i = 0; i < s.ghosts.length; i++) {
    const g = s.ghosts[i];
    if (g.x !== s.player.x || g.y !== s.player.y) continue;
    if (g.mode === 'eaten') continue;
    if (g.mode === 'frightened') {
      const chain = s.chain + 1;
      const points = 200 * chain;
      s = { ...s, chain, score: s.score + points, ghosts: s.ghosts.map((x, k) => (k === i ? { ...x, mode: 'eaten' } : x)) };
      events.push({ type: 'ghost_eaten', name: g.name, points });
      continue;
    }
    const lives = s.lives - 1;
    events.push({ type: 'death', by: g.name, lives });
    if (lives <= 0) { events.push({ type: 'game_over' }); return { state: { ...s, lives: 0, alive: false }, events }; }
    s = { ...resetPositions(s), lives, deathT: 900 };
    return { state: s, events };
  }
  // level clear
  if (s.pellets.size === 0) {
    const level = s.level + 1;
    events.push({ type: 'level_clear', level });
    s = { ...resetPositions(s), level, pellets: new Set(s.map.pellets.map(key)), score: s.score + 500, powers: [], prompt: null };
  }
  return { state: s, events };
}
