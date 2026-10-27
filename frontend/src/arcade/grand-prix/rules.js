// Pure rules for Big-O Grand Prix: four karts, three laps, four fork checkpoints per lap. At a
// fork the lanes carry the answers (a three-choice variant from the server); the right lane
// boosts, a wrong lane is oil. AI karts "answer" by probability and drive clean lines.
import { buildTrack, whichCheckpoint } from '../engine/track.js';

export const STAGE = { w: 960, h: 540 };
export const LAPS = 3;
export const FORKS_PER_LAP = 4;
export const MAX_SPEED = 360;
export const BOOST_SPEED = 480;
export const ACCEL = 260;
export const BRAKE = 400;
export const DRAG = 0.6;
export const STEER_RATE = 2.2;
export const BOOST_MS = 1800;
export const SPIN_MS = 1500;
export const CONTROL = [[200, 120], [480, 90], [760, 120], [880, 270], [760, 440], [480, 470], [200, 440], [80, 270]];
const AI = [
  { id: 'ai1', name: 'Quicksort Quinn', color: '#f472b6', target: 332 },
  { id: 'ai2', name: 'Bubble Bob', color: '#22d3ee', target: 318 },
  { id: 'ai3', name: 'Hash Hana', color: '#a3e635', target: 346 },
];

export function newRace({ seed = 1, laps = LAPS } = {}) {
  const track = buildTrack(CONTROL, { checkpoints: FORKS_PER_LAP });
  const karts = [{ id: 'you', name: 'You', color: '#facc15', target: 0 }, ...AI].map((k, i) => ({
    ...k, s: ((track.length - 26 * i) % track.length), lane: ((i % 3) - 1) * 0.8, speed: 0, lap: 0, boostT: 0, spinT: 0,
    forksDone: 0, finished: false, finishTime: null, answered: {}, skid: 0,
  }));
  return { seed, laps, track, karts, fork: null, nextCheckpoint: 1, score: 0, time: 0, finished: false, positions: [], correct: 0, wrong: 0, bestLap: null, lapStart: 0 };
}

export function setFork(state, item, rng = Math.random) {
  const choices = item?.choices || [];
  const order = choices.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const laneSlots = choices.length === 3 ? [-1, 0, 1] : choices.length === 2 ? [-0.6, 0.6] : [-1.2, -0.4, 0.4, 1.2];
  const lanes = order.map((choiceIndex, k) => ({ lane: laneSlots[k], choiceIndex, label: String(choices[choiceIndex]) }));
  return { ...state, fork: { itemId: item.id, checkpoint: state.nextCheckpoint, lanes, answered: false, askedAt: state.time } };
}

export function applyForkResult(state, kartId, correct) {
  const events = [];
  const karts = state.karts.map((k) => {
    if (k.id !== kartId) return k;
    if (correct) return { ...k, boostT: BOOST_MS, spinT: 0, speed: Math.max(k.speed, MAX_SPEED * 0.8) };
    return { ...k, spinT: SPIN_MS, boostT: 0, speed: 0 };
  });
  events.push({ type: correct ? 'boost' : 'oil', kartId });
  const you = kartId === 'you';
  const next = { ...state, karts, score: state.score + (you && correct ? 100 : 0), correct: state.correct + (you && correct ? 1 : 0), wrong: state.wrong + (you && !correct ? 1 : 0) };
  if (you) next.fork = null, next.nextCheckpoint = (state.fork ? state.fork.checkpoint + 1 : state.nextCheckpoint + 1) % FORKS_PER_LAP;
  return { state: next, events };
}

function laneFor(fork, lane) {
  let best = fork.lanes[0];
  for (const l of fork.lanes) if (Math.abs(l.lane - lane) < Math.abs(best.lane - lane)) best = l;
  return best;
}

function positionsFrom(state) {
  const progress = (k) => (k.finished ? 1e9 - (k.finishTime || 0) : k.lap * state.track.length + k.s);
  return [...state.karts].sort((a, b) => progress(b) - progress(a)).map((k) => k.id);
}

/**
 * @param {object} state
 * @param {number} dtMs
 * @param {{throttle?: boolean, brake?: boolean, steer?: number, rng?: () => number}} input
 */
export function step(state, dtMs, input = {}) {
  if (state.finished) return { state, events: [] };
  const dt = dtMs / 1000;
  const rng = input.rng || Math.random;
  const events = [];
  let s = { ...state, time: state.time + dtMs };
  let fork = s.fork;
  const karts = s.karts.map((k) => {
    if (k.finished) return k;
    let { speed, lane, boostT, spinT, lap, s: pos } = k;
    boostT = Math.max(0, boostT - dtMs); spinT = Math.max(0, spinT - dtMs);
    const isYou = k.id === 'you';
    const max = boostT > 0 ? BOOST_SPEED : MAX_SPEED;
    if (spinT > 0) {
      speed = Math.max(0, speed - BRAKE * 1.5 * dt);
    } else if (isYou) {
      if (input.throttle) speed += ACCEL * dt;
      if (input.brake) speed -= BRAKE * dt;
      speed -= speed * DRAG * dt;
      if (input.steer) lane = Math.max(-1, Math.min(1, lane + input.steer * STEER_RATE * dt));
    } else {
      const target = (boostT > 0 ? BOOST_SPEED : k.target) * (0.97 + 0.06 * rng());
      speed += (target - speed) * Math.min(1, 1.6 * dt);
      // racing line: drift to the inside, pick a lane at forks (AI choose by chance; the lane itself is decorative)
      const want = fork && !k.answered[fork.itemId] && fork.checkpoint === s.nextCheckpoint ? (k.aiLane ?? 0) : 0;
      lane += (want - lane) * Math.min(1, 2 * dt);
    }
    speed = Math.max(isYou ? -80 : 0, Math.min(max, speed));
    const prev = pos;
    pos = ((pos + speed * dt) % s.track.length + s.track.length) % s.track.length;
    const cp = whichCheckpoint(s.track, prev, pos);
    if (cp === 0 && speed > 0) {
      lap += 1;
      const lapTime = s.time - (k.lapStart || 0);
      if (isYou) { events.push({ type: 'lap', lap, lapTime }); s = { ...s, bestLap: s.bestLap === null ? lapTime : Math.min(s.bestLap, lapTime), lapStart: s.time }; }
      if (lap >= s.laps) {
        const fin = { ...k, speed, lane, boostT, spinT, lap, s: pos, finished: true, finishTime: s.time };
        if (isYou) events.push({ type: 'finish' });
        return fin;
      }
    }
    if (cp >= 0 && fork && cp === fork.checkpoint && !k.answered[fork.itemId]) {
      const answered = { ...k.answered, [fork.itemId]: true };
      if (isYou) {
        const chosen = laneFor(fork, lane);
        events.push({ type: 'fork', itemId: fork.itemId, choiceIndex: chosen.choiceIndex, lane: chosen.lane });
        fork = { ...fork, answered: true };
        return { ...k, speed, lane, boostT, spinT, lap, s: pos, answered };
      }
      const p = 0.65 + 0.25 * Math.min(1, (lap * FORKS_PER_LAP + fork.checkpoint) / (FORKS_PER_LAP * LAPS));
      const correct = rng() < p;
      events.push({ type: 'ai_fork', kartId: k.id, correct });
      return correct ? { ...k, speed: Math.max(speed, MAX_SPEED * 0.8), lane, boostT: BOOST_MS, spinT: 0, lap, s: pos, answered }
        : { ...k, speed: 0, lane, boostT: 0, spinT: SPIN_MS, lap, s: pos, answered };
    }
    return { ...k, speed, lane, boostT, spinT, lap, s: pos, lapStart: k.lapStart };
  });
  s = { ...s, karts, fork };
  const you = karts.find((k) => k.id === 'you');
  if (you.finished && !s.finished) {
    const positions = positionsFrom(s);
    const place = positions.indexOf('you') + 1;
    const bonus = [500, 300, 150, 50][place - 1] || 0;
    s = { ...s, finished: true, positions, score: s.score + bonus + (s.bestLap ? Math.max(0, 200 - Math.floor(s.bestLap / 500)) : 0), place };
  }
  return { state: s, events };
}

export { positionsFrom };
