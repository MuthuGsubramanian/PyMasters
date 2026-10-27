// Pure rules for Linked Snake: the snake is a linked list of nodes (head first). Eating the right
// answer appends a node (`snake.append(value)`), the wrong one pops the tail (`snake.popleft()`).
export const COLS = 20;
export const ROWS = 14;
export const HEAD = '▶';
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function speedFor(level) {
  return Math.max(70, 160 - 8 * (level - 1));
}

export function newRun({ seed = 1 } = {}) {
  const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
  return {
    seed, cols: COLS, rows: ROWS,
    snake: [{ x: cx, y: cy, value: HEAD }, { x: cx - 1, y: cy, value: '·' }, { x: cx - 2, y: cy, value: '·' }],
    dir: 'right', nextDir: 'right',
    foods: [], prompt: null, pendingEat: null,
    score: 0, level: 1, eaten: 0, correct: 0, wrong: 0, alive: true, ticks: 0, lastOp: 'snake = deque([▶, ·, ·])', started: false,
  };
}

export function turn(state, dir) {
  if (!DELTA[dir] || dir === OPPOSITE[state.dir]) return state;
  return { ...state, nextDir: dir, started: true };
}

function occupied(snake, x, y, skipTail) {
  const n = skipTail ? snake.length - 1 : snake.length;
  for (let i = 0; i < n; i++) if (snake[i].x === x && snake[i].y === y) return true;
  return false;
}

export function step(state) {
  if (!state.alive || state.started === false) return { state, events: [] };
  const events = [];
  const dir = state.nextDir;
  const [dx, dy] = DELTA[dir];
  const head = state.snake[0];
  const nx = head.x + dx, ny = head.y + dy;
  if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows || occupied(state.snake, nx, ny, true)) {
    events.push({ type: 'crash', at: { x: nx, y: ny } });
    return { state: { ...state, dir, alive: false, lastOp: 'IndexError: the snake ran off the list' }, events };
  }
  // Nodes keep their order (and values); only the cells shift forward by one.
  const cells = [{ x: nx, y: ny }, ...state.snake.slice(0, -1).map((n) => ({ x: n.x, y: n.y }))];
  const snake = cells.map((c, i) => ({ ...c, value: i === 0 ? HEAD : state.snake[i].value }));
  let next = { ...state, dir, snake, ticks: state.ticks + 1 };
  const food = state.foods.find((f) => f.x === nx && f.y === ny);
  if (food) {
    events.push({ type: 'eat', choiceIndex: food.choiceIndex, label: food.label, food });
    next = { ...next, foods: [], pendingEat: food };
  }
  return { state: next, events };
}

export function placeFoods(state, item, rng = Math.random) {
  const choices = item?.choices || [];
  const taken = new Set(state.snake.map((n) => `${n.x},${n.y}`));
  const head = state.snake[0];
  const free = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (taken.has(`${x},${y}`)) continue;
      if (Math.abs(x - head.x) + Math.abs(y - head.y) < 3) continue;   // never spawn in the snake's face
      free.push({ x, y });
    }
  }
  const foods = [];
  for (let i = 0; i < choices.length && free.length; i++) {
    const idx = Math.min(free.length - 1, Math.floor(rng() * free.length));
    const cell = free.splice(idx, 1)[0];
    foods.push({ x: cell.x, y: cell.y, choiceIndex: i, label: String(choices[i]) });
  }
  return { ...state, foods, prompt: item, pendingEat: null };
}

export function applyEatResult(state, correct, label) {
  const events = [];
  if (correct) {
    const tail = state.snake[state.snake.length - 1];
    const snake = [...state.snake, { x: tail.x, y: tail.y, value: String(label) }];
    const count = state.correct + 1;
    let level = state.level;
    if (count % 8 === 0) { level += 1; events.push({ type: 'level_up', level }); }
    events.push({ type: 'grow', value: label });
    return { state: { ...state, snake, correct: count, eaten: state.eaten + 1, level, score: state.score + 10 * state.level,
      lastOp: `snake.append(${JSON.stringify(String(label))})`, pendingEat: null, prompt: null }, events };
  }
  if (state.snake.length <= 1) {
    events.push({ type: 'crash', reason: 'empty' });
    return { state: { ...state, alive: false, wrong: state.wrong + 1, lastOp: 'IndexError: pop from an empty deque', pendingEat: null, prompt: null }, events };
  }
  const snake = state.snake.slice(0, -1);
  events.push({ type: 'shrink', value: label });
  return { state: { ...state, snake, wrong: state.wrong + 1, lastOp: `snake.popleft()  # ${JSON.stringify(String(label))} was wrong`, pendingEat: null, prompt: null }, events };
}
