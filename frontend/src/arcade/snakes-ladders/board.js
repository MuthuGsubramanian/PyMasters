// Board geometry and the fixed layouts (ladders/snakes) per themed board.
// Squares 1..100 run boustrophedon from the bottom-left; row 0 is the bottom row.

export const SIZE = 10;

export function squareToCell(n) {
  const i = Math.max(1, Math.min(100, n)) - 1;
  const row = Math.floor(i / SIZE);
  const inRow = i % SIZE;
  const col = row % 2 === 0 ? inRow : SIZE - 1 - inRow;
  return { col, row };
}

export function cellToSquare(col, row) {
  const inRow = row % 2 === 0 ? col : SIZE - 1 - col;
  return row * SIZE + inRow + 1;
}

/** Centre of a square in SVG units (origin top-left), `cell` units per square. */
export function squareToXY(n, cell = 10) {
  const { col, row } = squareToCell(n);
  return { x: (col + 0.5) * cell, y: (SIZE - 1 - row + 0.5) * cell };
}

export function pathBetween(a, b) {
  const out = [];
  const step = b >= a ? 1 : -1;
  for (let s = a + step; step > 0 ? s <= b : s >= b; s += step) out.push(s);
  return out;
}

function mirror(n) {
  const { col, row } = squareToCell(n);
  return cellToSquare(SIZE - 1 - col, row);
}

function mirrorLayout(layout) {
  const m = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [mirror(Number(k)), mirror(v)]));
  return { ladders: m(layout.ladders), snakes: m(layout.snakes) };
}

const A = { ladders: { 3: 22, 8: 30, 28: 84, 36: 57, 58: 77, 72: 91, 75: 86, 80: 99 },
            snakes: { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 76, 98: 79 } };
const B = { ladders: { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92, 89: 97 },
            snakes: { 26: 10, 39: 5, 51: 11, 67: 47, 76: 55, 85: 36, 94: 72, 99: 78 } };
const C = { ladders: { 2: 23, 9: 34, 20: 38, 37: 65, 45: 71, 56: 78, 68: 90, 83: 96 },
            snakes: { 16: 6, 29: 12, 47: 26, 59: 41, 73: 52, 86: 58, 92: 69, 97: 80 } };
const D = { ladders: { 5: 27, 11: 40, 21: 43, 31: 66, 44: 70, 53: 82, 61: 88, 79: 98 },
            snakes: { 18: 3, 35: 14, 48: 30, 57: 22, 71: 50, 84: 63, 90: 74, 96: 67 } };

export const BOARD_ORDER = ['variables', 'lists', 'dicts', 'loops', 'conditionals', 'functions', 'containers', 'big_o'];

export const BOARD_LAYOUTS = {
  variables: A, lists: mirrorLayout(A),
  dicts: B, loops: mirrorLayout(B),
  conditionals: C, functions: mirrorLayout(C),
  containers: D, big_o: mirrorLayout(D),
};

export const BOARD_THEMES = {
  variables: { title: 'Variables', subtitle: 'The bazaar of labelled jars', accent: '#b45309', paper: '#fdf6e3', ink: '#3b2f1e' },
  lists: { title: 'Lists', subtitle: 'The railway yard', accent: '#0e7490', paper: '#eef9fb', ink: '#163a44' },
  dicts: { title: 'Dicts', subtitle: 'The post office', accent: '#7c3aed', paper: '#f5f1fd', ink: '#2e1d55' },
  loops: { title: 'Loops', subtitle: 'The postman’s route', accent: '#15803d', paper: '#eefaf0', ink: '#163d22' },
  conditionals: { title: 'Conditionals', subtitle: 'The traffic signals', accent: '#b91c1c', paper: '#fdf1f1', ink: '#4a1818' },
  functions: { title: 'Functions', subtitle: 'The recipe kitchen', accent: '#c2410c', paper: '#fff4ec', ink: '#4a2410' },
  containers: { title: 'Containers', subtitle: 'The warehouse', accent: '#4d7c0f', paper: '#f4fae9', ink: '#243a0b' },
  big_o: { title: 'Big-O & Sorting', subtitle: 'The racetrack', accent: '#1d4ed8', paper: '#eef3ff', ink: '#182a5c' },
};

/** Returns a list of problems (empty when the layout is sound). */
export function validateLayout(layout) {
  const problems = [];
  const feet = Object.keys(layout.ladders).map(Number);
  const heads = Object.values(layout.ladders);
  const sheads = Object.keys(layout.snakes).map(Number);
  const tails = Object.values(layout.snakes);
  for (const f of feet) if (!(layout.ladders[f] > f)) problems.push(`ladder ${f} does not go up`);
  for (const h of sheads) if (!(layout.snakes[h] < h)) problems.push(`snake ${h} does not go down`);
  const specials = [...feet, ...heads, ...sheads, ...tails];
  const seen = new Set();
  for (const s of specials) {
    if (s < 1 || s > 100) problems.push(`square ${s} off board`);
    if (seen.has(s)) problems.push(`square ${s} used twice`);
    seen.add(s);
  }
  if (feet.includes(100) || sheads.includes(100) || heads.includes(1)) problems.push('endpoints on 1/100');
  return problems;
}
