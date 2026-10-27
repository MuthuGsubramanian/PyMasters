import { describe, it, expect } from 'vitest'
import golden from '../../../../backend/games/sims/golden/overfit_detective.json'
import { DATASETS, datasetById, makeDataset, fit, mse, evaluate } from '../overfit-detective/levels.js'

describe('Overfit Detective simulation (must match backend/games/sims/overfit_detective.py)', () => {
  it('has the same datasets as the Python table', () => {
    expect(DATASETS.map((d) => d.id)).toEqual(golden.cases.map((c) => c.dataset_id))
  })

  it('fits a clean line exactly', () => {
    const xs = [-1, -0.5, 0, 0.5, 1], ys = xs.map((x) => 2 * x + 1)
    const w = fit(xs, ys, 1, 0)
    expect(w[0]).toBeCloseTo(1, 9)
    expect(w[1]).toBeCloseTo(2, 9)
    expect(mse(xs, ys, w)).toBeLessThan(1e-18)
  })

  it('is seeded and splits train/test', () => {
    const ds = datasetById('gentle_cubic')
    expect(makeDataset(ds, 7)).toEqual(makeDataset(ds, 7))
    expect(makeDataset(ds, 7).train_x.length).toBe(ds.n_train)
  })

  it('reproduces every golden case within 1e-9', () => {
    for (const c of golden.cases) {
      const ev = evaluate(datasetById(c.dataset_id), c.seed, c.degree, c.lam)
      for (const key of ['train_mse', 'test_mse']) {
        const tol = Math.max(1e-12, Math.abs(c[key]) * 1e-9)
        expect(Math.abs(ev[key] - c[key]), `${c.dataset_id}.${key}`).toBeLessThanOrEqual(tol)
      }
      expect(ev.best_degree, c.dataset_id).toBe(c.best_degree)
      expect(ev.rank, c.dataset_id).toBe(c.rank)
    }
  })
})
