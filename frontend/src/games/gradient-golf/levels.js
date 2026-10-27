// Gradient Golf holes + exact gradient-descent simulation.
// MUST stay in lock-step with backend/games/sims/gradient_golf.py (same table, same
// update order, polynomial gradients only). backend/games/sims/golden/gradient_golf.json
// pins fixed-seed runs; both test suites assert against it.
import { mulberry32 } from '../engine/rng.js'

export const DIVERGE_AT = 1e3

export const HOLES = [
  { id: 'quad_a1', level: 1, name: 'The Bowl', fn: 'quad', params: { a: 1.0, c: 0.0, min: [0.0] },
    start: [3.0], tol: 0.05, max_swings: 6, allow_momentum: false, allow_decay: false },
  { id: 'quad_a2', level: 1, name: 'Wide Bowl', fn: 'quad', params: { a: 0.5, c: 2.0, min: [2.0] },
    start: [-2.0], tol: 0.05, max_swings: 6, allow_momentum: false, allow_decay: false },
  { id: 'quad_a3', level: 2, name: 'Steep Bowl', fn: 'quad', params: { a: 3.0, c: -1.0, min: [-1.0] },
    start: [2.0], tol: 0.05, max_swings: 6, allow_momentum: false, allow_decay: false },
  { id: 'quartic', level: 3, name: 'Flat Bottom', fn: 'quartic', params: { c: 1.0, min: [1.0] },
    start: [3.0], tol: 0.05, max_swings: 6, allow_momentum: false, allow_decay: true },
  { id: 'double_well', level: 3, name: 'Two Valleys', fn: 'double_well',
    params: { min: [-1.035578714089], local: [0.960149555519], hump: [0.07542915857] },
    start: [1.8], tol: 0.05, max_swings: 6, allow_momentum: false, allow_decay: false },
  { id: 'plateau', level: 4, name: 'The Shelf', fn: 'plateau', params: { k: 0.02, c: 0.0, min: [0.0] },
    start: [2.5], tol: 0.05, max_swings: 6, allow_momentum: true, allow_decay: true },
  { id: 'bowl2d', level: 5, name: 'The Canyon', fn: 'bowl2d', params: { a: 1.0, b: 10.0, min: [0.0, 0.0] },
    start: [3.0, 2.0], tol: 0.08, max_swings: 6, allow_momentum: true, allow_decay: false },
  { id: 'noisy', level: 6, name: 'Gravel Green', fn: 'noisy', params: { a: 1.0, c: 0.0, sigma: 0.6, min: [0.0] },
    start: [3.0], tol: 0.08, max_swings: 6, allow_momentum: true, allow_decay: true },
  { id: 'double_well_momentum', level: 6, name: 'Two Valleys, Momentum', fn: 'double_well',
    params: { min: [-1.035578714089], local: [0.960149555519], hump: [0.07542915857] },
    start: [1.5], tol: 0.05, max_swings: 6, allow_momentum: true, allow_decay: false },
]

const BY_ID = Object.fromEntries(HOLES.map((h) => [h.id, h]))
export function holeById(id) { return BY_ID[id] }

/** Loss value, for drawing only (the simulation uses gradients). */
export function loss(hole, x) {
  const p = hole.params
  switch (hole.fn) {
    case 'quad': return p.a * (x[0] - p.c) * (x[0] - p.c)
    case 'quartic': { const d = x[0] - p.c; return d * d * d * d }
    case 'double_well': { const q = x[0] * x[0] - 1; return q * q + 0.3 * x[0] }
    case 'plateau': { const d = x[0] - p.c; return p.k * d * d * d * d * d * d }
    case 'bowl2d': return p.a * x[0] * x[0] + p.b * x[1] * x[1]
    case 'noisy': return p.a * (x[0] - p.c) * (x[0] - p.c)
    default: return 0
  }
}

export function gradient(hole, x, noise) {
  const p = hole.params
  switch (hole.fn) {
    case 'quad': return [2.0 * p.a * (x[0] - p.c)]
    case 'quartic': { const d = x[0] - p.c; return [4.0 * d * d * d] }
    case 'double_well': return [4.0 * x[0] * (x[0] * x[0] - 1.0) + 0.3]
    case 'plateau': { const d = x[0] - p.c; return [6.0 * p.k * d * d * d * d * d] }
    case 'bowl2d': return [2.0 * p.a * x[0], 2.0 * p.b * x[1]]
    case 'noisy': { const u = noise(); return [2.0 * p.a * (x[0] - p.c) + p.sigma * (2.0 * u - 1.0)] }
    default: throw new Error(`unknown fn ${hole.fn}`)
  }
}

function dist(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i])
  return Math.sqrt(s)
}

/**
 * Play `swings` ({lr, steps, momentum?, decay?}) in order from the hole's start.
 * Returns {path, final, converged, diverged, swingsToConverge}.
 */
export function simulate(hole, swings, seed) {
  const noise = mulberry32(seed)
  let x = hole.start.slice()
  const path = [x.slice()]
  let converged = false, diverged = false, swingsToConverge = null
  const played = swings.slice(0, hole.max_swings)
  for (let sIdx = 0; sIdx < played.length; sIdx++) {
    const sw = played[sIdx]
    const lr = Number(sw.lr ?? 0)
    const steps = Math.max(0, Math.min(200, Math.trunc(Number(sw.steps ?? 0))))
    const momentum = hole.allow_momentum ? Number(sw.momentum ?? 0) || 0 : 0
    const decay = hole.allow_decay ? Number(sw.decay ?? 0) || 0 : 0
    let v = x.map(() => 0)
    for (let t = 0; t < steps; t++) {
      const g = gradient(hole, x, noise)
      const lrT = lr / (1.0 + decay * t)
      v = v.map((vi, i) => momentum * vi - lrT * g[i])
      x = x.map((xi, i) => xi + v[i])
      path.push(x.slice())
      if (x.some((xi) => Math.abs(xi) > DIVERGE_AT)) { diverged = true; break }
    }
    if (diverged) break
    if (dist(x, hole.params.min) <= hole.tol) { converged = true; swingsToConverge = sIdx + 1; break }
  }
  return { path, final: x, converged, diverged, swingsToConverge }
}

/** Hole score as the server computes it: fewer swings to sink = more points (max = max_swings). */
export function holeScore(hole, swingsToConverge) {
  const used = swingsToConverge ?? hole.max_swings + 1
  return Math.max(0, hole.max_swings + 1 - used)
}
