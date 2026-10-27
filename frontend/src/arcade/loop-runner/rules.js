// Pure rules for Loop Runner: an auto-running robot, gate pairs that carry two labels (the
// server dealt a two-choice variant: the truth and one distractor). Jump = upper gate,
// slide = lower gate. Verdicts come from the server through the game component.
export const STAGE = { w: 960, h: 420 };
export const GROUND_Y = STAGE.h - 70;
export const ROBOT_X = 100;
export const LIVES = 3;
export const LANE = { GROUND: 'ground', UPPER: 'upper', LOWER: 'lower' };
export const LANE_MS = 620;
export const CHECKPOINT_EVERY = 10;

export function speedAt(passes) {
  return Math.min(520, 240 + (280 * passes) / 60);
}

export function gateEveryMs(passes) {
  return Math.max(1300, 2400 - passes * 18);
}

export function newRun({ lives = LIVES } = {}) {
  return { lives, alive: true, score: 0, coins: 0, combo: 0, passes: 0, stumbles: 0, correct: 0, wrong: 0,
    gates: [], lane: LANE.GROUND, laneT: 0, distance: 0, scene: 0, time: 0, stumbleT: 0, boostT: 0, nextGateId: 1 };
}

export function spawnPair(item, rng = Math.random) {
  const [a, b] = item.choices;
  const flip = rng() < 0.5;
  const upperIdx = flip ? 1 : 0;
  const lowerIdx = flip ? 0 : 1;
  return { itemId: item.id, x: STAGE.w + 80, resolved: false, outcome: null,
    upper: { lane: LANE.UPPER, label: String(flip ? b : a), choiceIndex: upperIdx },
    lower: { lane: LANE.LOWER, label: String(flip ? a : b), choiceIndex: lowerIdx } };
}

export function addGate(state, pair) {
  const id = pair.id || `g${state.nextGateId}`;
  return { ...state, gates: [...state.gates, { ...pair, id }], nextGateId: state.nextGateId + 1 };
}

function applyVerdict(state, gateId, correct, events) {
  const gates = state.gates.map((g) => (g.id === gateId ? { ...g, resolved: true, outcome: correct ? 'pass' : 'stumble' } : g));
  if (correct) {
    const combo = state.combo + 1;
    const passes = state.passes + 1;
    const points = Math.round(100 * (1 + 0.5 * (combo - 1))) + 10;
    let scene = state.scene;
    events.push({ type: 'pass', gateId, combo, points });
    if (passes % CHECKPOINT_EVERY === 0) { scene += 1; events.push({ type: 'checkpoint', passes, scene }); }
    return { ...state, gates, combo, passes, scene, score: state.score + points, coins: state.coins + 1, correct: state.correct + 1, boostT: 700 };
  }
  const lives = state.lives - 1;
  events.push({ type: 'stumble', gateId, lives });
  let next = { ...state, gates, combo: 0, lives, stumbles: state.stumbles + 1, wrong: state.wrong + 1, stumbleT: 900 };
  if (lives <= 0) { events.push({ type: 'game_over' }); next = { ...next, alive: false }; }
  return next;
}

/**
 * @param {object} state
 * @param {number} dtMs
 * @param {{jump?: boolean, slide?: boolean, verdict?: {gateId: string, correct: boolean}}} input
 */
export function step(state, dtMs, input = {}) {
  if (!state.alive) return { state, events: [] };
  const events = [];
  let s = { ...state, time: state.time + dtMs };
  if (input.verdict) s = applyVerdict(s, input.verdict.gateId, input.verdict.correct, events);
  if (!s.alive) return { state: s, events };
  // lanes
  if (input.jump && s.lane === LANE.GROUND) { s = { ...s, lane: LANE.UPPER, laneT: LANE_MS }; events.push({ type: 'jump' }); }
  else if (input.slide && s.lane === LANE.GROUND) { s = { ...s, lane: LANE.LOWER, laneT: LANE_MS }; events.push({ type: 'slide' }); }
  if (s.lane !== LANE.GROUND) {
    const laneT = s.laneT - dtMs;
    s = laneT <= 0 ? { ...s, lane: LANE.GROUND, laneT: 0 } : { ...s, laneT };
  }
  // scroll
  const speed = speedAt(s.passes) * (s.stumbleT > 0 ? 0.45 : s.boostT > 0 ? 1.25 : 1);
  const dx = (speed * dtMs) / 1000;
  s = { ...s, distance: s.distance + dx, stumbleT: Math.max(0, s.stumbleT - dtMs), boostT: Math.max(0, s.boostT - dtMs) };
  const gates = [];
  for (const g of s.gates) {
    const moved = { ...g, x: g.x - dx };
    if (!moved.resolved && moved.x <= ROBOT_X && g.x > ROBOT_X) {
      const choice = s.lane === LANE.UPPER ? moved.upper : s.lane === LANE.LOWER ? moved.lower : null;
      events.push({ type: 'gate', gateId: moved.id, itemId: moved.itemId, choiceIndex: choice ? choice.choiceIndex : null, lane: s.lane });
      if (!choice) {
        // ran into the divider: a stumble without a graded answer
        moved.resolved = true; moved.outcome = 'stumble';
        const lives = s.lives - 1;
        events.push({ type: 'stumble', gateId: moved.id, lives });
        s = { ...s, combo: 0, lives, stumbles: s.stumbles + 1, stumbleT: 900 };
        if (lives <= 0) { events.push({ type: 'game_over' }); s = { ...s, alive: false }; }
      } else {
        moved.pending = true;
      }
    }
    if (moved.x > -120) gates.push(moved);
  }
  return { state: { ...s, gates }, events };
}
