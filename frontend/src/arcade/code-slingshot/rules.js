// Pure rules for Code Slingshot: pigs hold the answers; hit the right one.
import { addTower, createWorld } from './physics.js';

export const BIRDS_PER_QUESTION = 3;
export const LIVES = 3;
export const TOWER_X = [520, 640, 760, 880];
export const SCENE_EVERY = 5;

export function newRound({ lives = LIVES, birds = BIRDS_PER_QUESTION } = {}) {
  return { lives, birdsPerQuestion: birds, birdsLeft: birds, question: null, world: createWorld(), locked: {},
    combo: 0, score: 0, questionsDone: 0, scene: 0, alive: true, shotsThisQuestion: 0, correct: 0, wrong: 0 };
}

function shuffled(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function newQuestion(state, item, rng = Math.random) {
  const choices = item?.choices || [];
  const world = createWorld();
  const order = shuffled(choices.length, rng);
  const xs = TOWER_X.slice(0, choices.length);
  order.forEach((choiceIndex, k) => {
    const crates = 2 + Math.floor(rng() * 3) + Math.min(2, Math.floor(state.scene / 2));
    addTower(world, { x: xs[k], crates: Math.min(5, crates), pig: { id: `pig${k}`, label: String(choices[choiceIndex]), choiceIndex } });
  });
  return { ...state, question: item, world, locked: {}, birdsLeft: state.birdsPerQuestion, shotsThisQuestion: 0 };
}

export function applyHitResult(state, pigId, correct) {
  const pig = state.world.pigs.find((p) => p.id === pigId);
  if (!state.question || !pig || !pig.alive) return { state, events: [] };
  const events = [];
  if (correct) {
    pig.alive = false;
    const first = state.shotsThisQuestion <= 1;
    const combo = first ? state.combo + 1 : 0;
    const questionsDone = state.questionsDone + 1;
    let scene = state.scene;
    events.push({ type: 'pop', pigId, combo, points: 100 * Math.max(1, combo) });
    if (questionsDone % SCENE_EVERY === 0) { scene += 1; events.push({ type: 'scene_change', scene }); }
    return { state: { ...state, question: null, combo, score: state.score + 100 * Math.max(1, combo), questionsDone, scene, correct: state.correct + 1 }, events };
  }
  pig.locked = true;
  pig.hit = false;             // can be hit again after the lock lifts
  events.push({ type: 'raspberry', pigId });
  return { state: { ...state, locked: { ...state.locked, [pigId]: 1 }, combo: 0, wrong: state.wrong + 1 }, events };
}

/** A bird finished its flight without popping a pig. */
export function onBirdSpent(state) {
  const events = [];
  const birdsLeft = state.birdsLeft - 1;
  // locks last one shot
  const locked = {};
  for (const p of state.world.pigs) { if (p.locked) { p.locked = false; } p.hit = false; }
  if (birdsLeft > 0) return { state: { ...state, birdsLeft, locked }, events };
  const lives = state.lives - 1;
  events.push({ type: 'out_of_birds', lives });
  if (lives <= 0) {
    events.push({ type: 'game_over' });
    return { state: { ...state, birdsLeft: 0, lives: 0, alive: false, locked }, events };
  }
  return { state: { ...state, birdsLeft: state.birdsPerQuestion, lives, locked, combo: 0 }, events };
}

export function noteShot(state) {
  return { ...state, shotsThisQuestion: state.shotsThisQuestion + 1 };
}
