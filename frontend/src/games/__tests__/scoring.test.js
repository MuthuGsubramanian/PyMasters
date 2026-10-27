import { describe, it, expect } from 'vitest'
import { accuracy, nextLevel, medianMs } from '../engine/scoring.js'

describe('scoring primitives (mirror backend/games/engine.py)', () => {
  it('accuracy handles zero totals', () => {
    expect(accuracy(0, 0)).toBe(0)
    expect(accuracy(3, 6)).toBe(0.5)
  })
  it('nextLevel uses the 0.8 / 0.4 thresholds and clamps to 1..6', () => {
    expect(nextLevel(3, 0.8)).toBe(4)
    expect(nextLevel(3, 0.79)).toBe(3)
    expect(nextLevel(3, 0.39)).toBe(2)
    expect(nextLevel(6, 1)).toBe(6)
    expect(nextLevel(1, 0)).toBe(1)
  })
  it('medianMs ignores non-numeric values', () => {
    expect(medianMs({ a: 1000, b: 3000, c: 2000 })).toBe(2000)
    expect(medianMs({ a: 1000, b: 3000 })).toBe(2000)
    expect(medianMs({ a: 'x' })).toBeNull()
    expect(medianMs({})).toBeNull()
  })
})
