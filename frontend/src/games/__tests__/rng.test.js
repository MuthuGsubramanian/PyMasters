import { describe, it, expect } from 'vitest'
import { mulberry32, shuffle, seedFromString } from '../engine/rng.js'

describe('mulberry32', () => {
  it('is deterministic for a seed and stays in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42)
    const xs = [a(), a(), a()]
    expect(xs).toEqual([b(), b(), b()])
    xs.forEach((x) => { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1) })
    expect(mulberry32(43)()).not.toBe(mulberry32(42)())
  })
  it('matches the reference sequence for seed 7 (shared with the Python re-simulator)', () => {
    const r = mulberry32(7)
    // First three outputs of the canonical mulberry32 for seed 7; pinned so JS and Python agree.
    const got = [r(), r(), r()]
    expect(got[0]).toBeCloseTo(0.011704753153026104, 12)
    expect(got[1]).toBeCloseTo(0.06195825757458806, 12)
    expect(got[2]).toBeCloseTo(0.97690763277933, 12)
  })
})

describe('shuffle', () => {
  it('returns a deterministic permutation without mutating the input', () => {
    const src = [1, 2, 3, 4, 5, 6]
    const a = shuffle(src, mulberry32(1)), b = shuffle(src, mulberry32(1))
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6])
    expect(src).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('seedFromString', () => {
  it('is a stable 32-bit FNV-1a hash', () => {
    expect(seedFromString('output_oracle')).toBe(seedFromString('output_oracle'))
    expect(seedFromString('a')).not.toBe(seedFromString('b'))
    expect(seedFromString('')).toBe(0x811c9dc5)
  })
})
