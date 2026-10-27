// Overfit Detective datasets + polynomial ridge least squares.
// MUST stay in lock-step with backend/games/sims/overfit_detective.py (same table, same
// random draw order, same elimination). backend/games/sims/golden/overfit_detective.json
// pins fixed runs for both test suites.
import { mulberry32 } from '../engine/rng.js'

export const MAX_DEGREE = 12

export const TRUE_FNS = {
  poly3: (x) => 1.2 * x * x * x - 0.8 * x + 0.3,
  poly5: (x) => 2.0 * x ** 5 - 3.0 * x ** 3 + 1.0 * x,
  bump: (x) => 1.0 - 3.0 * x * x + 2.0 * x ** 4,
}

export const DATASETS = [
  { id: 'gentle_cubic', level: 1, name: 'Gentle Curve', fn: 'poly3', noise: 0.10, n_train: 20, n_test: 20, allow_lambda: false },
  { id: 'bump_low', level: 1, name: 'Soft Bump', fn: 'bump', noise: 0.10, n_train: 20, n_test: 20, allow_lambda: false },
  { id: 'cubic_noisy', level: 2, name: 'Noisy Curve', fn: 'poly3', noise: 0.25, n_train: 14, n_test: 20, allow_lambda: false },
  { id: 'bump_mid', level: 2, name: 'Rough Bump', fn: 'bump', noise: 0.20, n_train: 14, n_test: 20, allow_lambda: false },
  { id: 'quintic', level: 3, name: 'Five Turns', fn: 'poly5', noise: 0.15, n_train: 18, n_test: 24, allow_lambda: true },
  { id: 'bump_noisy', level: 3, name: 'Rough Bump II', fn: 'bump', noise: 0.30, n_train: 14, n_test: 20, allow_lambda: true },
  { id: 'quintic_noisy', level: 4, name: 'Five Turns, Fog', fn: 'poly5', noise: 0.30, n_train: 18, n_test: 24, allow_lambda: true },
  { id: 'tiny_train', level: 5, name: 'Ten Points', fn: 'poly3', noise: 0.20, n_train: 10, n_test: 20, allow_lambda: true },
  { id: 'wild', level: 6, name: 'Wild Data', fn: 'poly5', noise: 0.40, n_train: 12, n_test: 24, allow_lambda: true },
  { id: 'bump_tiny', level: 6, name: 'Tiny Bump', fn: 'bump', noise: 0.30, n_train: 10, n_test: 20, allow_lambda: true },
]
const BY_ID = Object.fromEntries(DATASETS.map((d) => [d.id, d]))
export function datasetById(id) { return BY_ID[id] }

export function makeDataset(ds, seed) {
  const rnd = mulberry32(seed)
  const f = TRUE_FNS[ds.fn]
  const out = {}
  for (const [part, n] of [['train', ds.n_train], ['test', ds.n_test]]) {
    const xs = [], ys = []
    for (let i = 0; i < n; i++) {
      const x = 2.0 * rnd() - 1.0
      const y = f(x) + ds.noise * (2.0 * rnd() - 1.0)
      xs.push(x); ys.push(y)
    }
    out[`${part}_x`] = xs; out[`${part}_y`] = ys
  }
  return out
}

function solve(a, b) {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r
    ;[m[col], m[piv]] = [m[piv], m[col]]
    let p = m[col][col]
    if (p === 0) p = 1e-300
    for (let r = col + 1; r < n; r++) {
      const factor = m[r][col] / p
      if (factor !== 0) for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i][n]
    for (let j = i + 1; j < n; j++) s -= m[i][j] * x[j]
    const d = m[i][i] !== 0 ? m[i][i] : 1e-300
    x[i] = s / d
  }
  return x
}

export function fit(xs, ys, degree, lam = 0) {
  const k = degree + 1
  const ata = Array.from({ length: k }, () => new Array(k).fill(0))
  const aty = new Array(k).fill(0)
  for (let t = 0; t < xs.length; t++) {
    const x = xs[t], y = ys[t]
    const pw = [1.0]
    for (let d = 0; d < degree; d++) pw.push(pw[pw.length - 1] * x)
    for (let i = 0; i < k; i++) {
      aty[i] += pw[i] * y
      const row = ata[i]
      for (let j = 0; j < k; j++) row[j] += pw[i] * pw[j]
    }
  }
  for (let i = 1; i < k; i++) ata[i][i] += Number(lam)
  return solve(ata, aty)
}

export function predict(w, x) {
  let acc = 0, pw = 1
  for (const wi of w) { acc += wi * pw; pw *= x }
  return acc
}

export function mse(xs, ys, w) {
  if (!xs.length) return 0
  let s = 0
  for (let i = 0; i < xs.length; i++) { const d = predict(w, xs[i]) - ys[i]; s += d * d }
  return s / xs.length
}

export function evaluate(ds, seed, degree, lam = 0) {
  const data = makeDataset(ds, seed)
  const deg = Math.max(1, Math.min(MAX_DEGREE, Math.trunc(Number(degree))))
  const l = ds.allow_lambda ? Number(lam || 0) : 0
  const w = fit(data.train_x, data.train_y, deg, l)
  const train_mse = mse(data.train_x, data.train_y, w)
  const test_mse = mse(data.test_x, data.test_y, w)
  const ladder = []
  for (let d = 1; d <= MAX_DEGREE; d++) {
    const wd = fit(data.train_x, data.train_y, d, 0)
    ladder.push([mse(data.test_x, data.test_y, wd), d])
  }
  let best_degree = 1, best_test_mse = Infinity
  for (const [m, d] of ladder) if (m < best_test_mse || (m === best_test_mse && d < best_degree)) { best_test_mse = m; best_degree = d }
  const rank = ladder.filter(([m]) => m < test_mse).length
  return { train_mse, test_mse, best_degree, best_test_mse, rank, weights: w, data }
}

/** Score as the server computes it: 5 − (number of degrees that beat you on the test set). */
export function datasetScore(rank) { return Math.max(0, 5 - rank) }
