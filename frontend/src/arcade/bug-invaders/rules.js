// Pure rules for Bug Invaders. A wave = one Bug Hunt item: the program's lines descend as
// invaders; shoot the guilty line (phase "line"), then the fix ship (phase "fix"); the server
// grades [line, fix] once per wave (phase "grading"). Shields absorb failed waves.
export const STAGE = { w: 960, h: 540 };
export const CANNON_Y = 480;
export const SHIELDS = 3;
export const CANNON_SPEED = 340;
export const LASER_SPEED = 700;
export const FIRE_COOLDOWN_MS = 350;
export const COLS = 4;
export const CELL_W = 210;
export const ROW_H = 70;
export const TOP_Y = 120;
export const MAX_DESCENT = 28;
export const SWAY = 60;

export function newGame({ shields = SHIELDS } = {}) {
  return { shields, alive: true, score: 0, wave: 0, phase: 'idle', invaders: [], ships: [], lasers: [], cannonX: STAGE.w / 2,
    time: 0, lineHit: null, item: null, correct: 0, wrong: 0, boss: false, descentSpeed: 0, fireCooldown: 0, waveStart: 0, explosions: [] };
}

export function newWave(state, item, rng = Math.random) {
  const lines = String(item?.prompt?.code || '').split('\n');
  const cols = Math.min(COLS, Math.max(1, lines.length));
  const baseX = (STAGE.w - cols * CELL_W) / 2 + CELL_W / 2;
  const invaders = lines.map((text, i) => ({ id: `inv${i}`, lineIndex: i, text, col: i % cols, row: Math.floor(i / cols),
    baseX: baseX + (i % cols) * CELL_W, x: baseX + (i % cols) * CELL_W, y: TOP_Y + Math.floor(i / cols) * ROW_H, alive: true, wobble: rng() * Math.PI * 2 }));
  const boss = state.wave % 3 === 2;
  const descentSpeed = Math.min(MAX_DESCENT, (8 + 3 * state.wave) * (boss ? 1.6 : 1));
  return { ...state, item, invaders, ships: [], lasers: [], phase: 'line', lineHit: null, boss, descentSpeed, waveStart: state.time, explosions: [] };
}

export function hitLine(state, lineIndex) {
  if (state.phase !== 'line') return { state, events: [] };
  const invaders = state.invaders.map((i) => (i.lineIndex === lineIndex ? { ...i, alive: false, hitAt: state.time } : i));
  const fixes = state.item?.choices || [];
  const ships = fixes.map((label, k) => ({ id: `sh${k}`, fixIndex: k, label: String(label), x: 120 + k * 300, y: 40 + (k % 2) * 34, vx: 150 + 20 * k, alive: true }));
  return { state: { ...state, invaders, phase: 'fix', lineHit: lineIndex, ships, explosions: [...state.explosions, { x: invaders[lineIndex]?.x || 0, y: invaders[lineIndex]?.y || 0, at: state.time }] },
    events: [{ type: 'line_hit', lineIndex }] };
}

export function hitFix(state, fixIndex) {
  if (state.phase !== 'fix') return { state, events: [] };
  const ships = state.ships.map((s) => (s.fixIndex === fixIndex ? { ...s, alive: false } : s));
  const answer = [state.lineHit, fixIndex];
  return { state: { ...state, ships, phase: 'grading', pendingAnswer: answer }, events: [{ type: 'submit', answer, itemId: state.item?.id }] };
}

function failWave(state, events, reason, extra = {}) {
  const shields = state.shields - 1;
  events.push({ type: 'wave_fail', reason, shields, ...extra });
  let next = { ...state, shields, phase: 'idle', invaders: [], ships: [], lasers: [], wrong: state.wrong + 1, pendingAnswer: null };
  if (shields <= 0) { events.push({ type: 'game_over' }); next = { ...next, alive: false }; }
  return next;
}

export function applyVerdict(state, verdict) {
  const events = [];
  if (verdict?.neutral) {                                    // no verdict (network): the wave simply ends
    return { state: { ...state, phase: 'idle', invaders: [], ships: [], lasers: [], pendingAnswer: null }, events: [{ type: 'wave_neutral' }] };
  }
  const score = Number(verdict?.score ?? 0), max = Number(verdict?.max ?? 3);
  const lineRight = score === 1 || score === 3;
  const fixRight = score === 2 || score === 3;
  if (score >= max && max > 0) {
    const bonus = 300 + 100 * state.shields + (state.boss ? 300 : 0);
    events.push({ type: 'wave_clear', wave: state.wave + 1, points: bonus });
    return { state: { ...state, score: state.score + bonus, wave: state.wave + 1, phase: 'idle', invaders: [], ships: [], lasers: [], correct: state.correct + 1, pendingAnswer: null }, events };
  }
  return { state: failWave(state, events, 'wrong', { lineRight, fixRight, score }), events };
}

/**
 * @param {object} state
 * @param {number} dtMs
 * @param {{move?: -1|0|1, fire?: boolean, verdict?: {score:number, max:number}}} input
 */
export function step(state, dtMs, input = {}) {
  if (!state.alive) return { state, events: [] };
  const events = [];
  const dt = dtMs / 1000;
  let s = { ...state, time: state.time + dtMs, fireCooldown: Math.max(0, state.fireCooldown - dtMs) };
  if (s.phase === 'grading' && input.verdict) {
    const r = applyVerdict(s, input.verdict);
    s = r.state; events.push(...r.events);
  }
  // cannon
  if (input.move) s = { ...s, cannonX: Math.max(30, Math.min(STAGE.w - 30, s.cannonX + input.move * CANNON_SPEED * dt)) };
  if (s.phase === 'idle' || s.phase === 'grading') return { state: s, events };
  if (input.fire && s.fireCooldown <= 0) {
    s = { ...s, fireCooldown: FIRE_COOLDOWN_MS, lasers: [...s.lasers, { x: s.cannonX, y: CANNON_Y - 24 }] };
    events.push({ type: 'fire' });
  }
  // formation sway + descent
  const sway = Math.sin((s.time - s.waveStart) / 480) * SWAY;
  const falling = s.phase === 'line' ? s.descentSpeed : 0;      // the formation holds still while you pick the fix
  const invaders = s.invaders.map((i) => ({ ...i, x: i.baseX + sway, y: i.y + falling * dt }));
  // ships cross the top and wrap
  const ships = s.ships.map((sh) => { const x = sh.x + sh.vx * dt; return { ...sh, x: x > STAGE.w + 200 ? -200 : x }; });
  // lasers
  let lasers = s.lasers.map((l) => ({ ...l, y: l.y - LASER_SPEED * dt })).filter((l) => l.y > -20);
  s = { ...s, invaders, ships, lasers };
  // collisions
  for (const l of lasers) {
    if (s.phase === 'line') {
      const hit = s.invaders.find((i) => i.alive && Math.abs(i.x - l.x) < 90 && Math.abs(i.y - l.y) < 26);
      if (hit) {
        const r = hitLine(s, hit.lineIndex);
        s = { ...r.state, lasers: s.lasers.filter((x) => x !== l) };
        events.push(...r.events);
        break;
      }
    } else if (s.phase === 'fix') {
      const hit = s.ships.find((sh) => sh.alive && Math.abs(sh.x - l.x) < 70 && Math.abs(sh.y - l.y) < 24);
      if (hit) {
        const r = hitFix(s, hit.fixIndex);
        s = { ...r.state, lasers: [] };
        events.push(...r.events);
        break;
      }
    }
  }
  // invasion
  if (s.phase === 'line' || s.phase === 'fix') {
    if (s.invaders.some((i) => i.alive && i.y >= CANNON_Y - 30)) {
      events.push({ type: 'invaded' });
      s = failWave(s, events, 'invaded');
    }
  }
  return { state: s, events };
}
