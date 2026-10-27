import { describe, it, expect } from 'vitest'
import golden from '../../../../backend/games/sims/golden/gradient_golf.json'
import { HOLES, holeById, simulate } from '../gradient-golf/levels.js'

describe('Gradient Golf simulation (must match backend/games/sims/gradient_golf.py)', () => {
  it('has the same nine holes as the Python table', () => {
    expect(HOLES.map((h) => h.id)).toEqual(golden.cases.map((c) => c.hole_id))
    HOLES.forEach((h) => { expect(h.tol).toBeGreaterThan(0); expect(h.params.min).toBeDefined() })
  })

  it('converges on the bowl with a sane learning rate and diverges above 2/a', () => {
    const hole = holeById('quad_a1')
    const ok = simulate(hole, [{ lr: 0.5, steps: 10 }], 7)
    expect(ok.converged).toBe(true)
    expect(ok.path.length).toBe(11)
    const bad = simulate(hole, [{ lr: 2.2, steps: 30 }], 7)
    expect(bad.diverged).toBe(true)
  })

  it('momentum can carry the ball over the hump into the deeper valley', () => {
    const hole = holeById('double_well_momentum')
    const plain = simulate(hole, [{ lr: 0.1, steps: 40 }], 7)
    expect(plain.converged).toBe(false)
    const out = simulate(hole, [{ lr: 0.1, steps: 40, momentum: 0.8 }], 7)
    expect(out.converged).toBe(true)
  })

  it('reproduces every golden case within 1e-9 (positions) and exactly (flags)', () => {
    for (const c of golden.cases) {
      const out = simulate(holeById(c.hole_id), c.swings, c.seed)
      expect(out.converged, c.hole_id).toBe(c.converged)
      expect(out.diverged, c.hole_id).toBe(c.diverged)
      expect(out.swingsToConverge, c.hole_id).toBe(c.swings_to_converge)
      expect(out.path.length, c.hole_id).toBe(c.path_len)
      out.final.forEach((v, i) => {
        const want = c.final[i]
        const tol = Math.max(1e-12, Math.abs(want) * 1e-9)
        expect(Math.abs(v - want), `${c.hole_id}[${i}]`).toBeLessThanOrEqual(tol)
      })
    }
  })
})
