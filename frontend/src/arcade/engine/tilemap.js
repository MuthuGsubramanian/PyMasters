// Grid tilemap helpers for maze games: parse an ASCII map, neighbours with side tunnels,
// junction detection and breadth-first pathing. Pure functions.
export function parseMap(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const walls = rows.map((r) => Array.from({ length: w }, (_, x) => (r[x] ?? ' ') === '#'));
  const pellets = [], powers = [];
  let player = null, ghost = null;
  rows.forEach((r, y) => {
    for (let x = 0; x < w; x++) {
      const c = r[x] ?? ' ';
      if (c === '.') pellets.push({ x, y });
      else if (c === 'o') powers.push({ x, y });
      else if (c === 'P') player = { x, y };
      else if (c === 'G') ghost = { x, y };
    }
  });
  return { cols: w, rows: h, walls, pellets, powers, player, ghost };
}

export function isWall(map, x, y) {
  if (y < 0 || y >= map.rows) return true;
  if (x < 0 || x >= map.cols) return true;
  return map.walls[y][x];
}

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** The cell reached by moving `dir` from (x, y), wrapping through open side tunnels; null if a wall. */
export function moveFrom(map, x, y, dir) {
  const [dx, dy] = DIRS[dir];
  let nx = x + dx, ny = y + dy;
  if (nx < 0) nx = map.cols - 1;
  if (nx >= map.cols) nx = 0;
  if (ny < 0 || ny >= map.rows || isWall(map, nx, ny)) return null;
  return { x: nx, y: ny };
}

export function neighbors(map, x, y) {
  const out = [];
  for (const dir of Object.keys(DIRS)) {
    const c = moveFrom(map, x, y, dir);
    if (c) out.push({ ...c, dir });
  }
  return out;
}

export function isJunction(map, x, y) {
  return neighbors(map, x, y).length >= 3;
}

function bfs(map, from, to) {
  const key = (c) => `${c.x},${c.y}`;
  if (isWall(map, to.x, to.y)) return null;
  const prev = new Map([[key(from), null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      let k = key(cur), c = cur;
      while (k && prev.get(k)) { path.unshift(c); c = prev.get(k); k = key(c); }
      return path;
    }
    for (const n of neighbors(map, cur.x, cur.y)) {
      const nk = key(n);
      if (!prev.has(nk)) { prev.set(nk, cur); queue.push({ x: n.x, y: n.y }); }
    }
  }
  return null;
}

export function bfsNext(map, from, to) {
  const path = bfs(map, from, to);
  if (!path || !path.length) return null;
  return { x: path[0].x, y: path[0].y };
}

export function bfsDist(map, from, to) {
  const path = bfs(map, from, to);
  return path ? path.length : Infinity;
}
