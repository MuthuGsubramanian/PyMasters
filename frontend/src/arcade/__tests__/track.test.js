import { describe, it, expect } from 'vitest'
import { buildTrack, pointAt, nearestS, laneOffset, crossedCheckpoint, LANES } from '../engine/track.js'

const CONTROL = [[200, 120], [760, 120], [860, 300], [760, 480], [200, 480], [100, 300]]

describe('track', () => {
  it('builds a closed looped spline with arc-length samples and checkpoints', () => {
    const t = buildTrack(CONTROL, { checkpoints: 4 })
    expect(t.length).toBeGreaterThan(1500)
    expect(t.samples.length).toBeGreaterThan(100)
    expect(t.checkpoints.length).toBe(4)
    const p0 = pointAt(t, 0), pL = pointAt(t, t.length)
    expect(Math.hypot(p0.x - pL.x, p0.y - pL.y)).toBeLessThan(2)       // closed loop
    const mid = pointAt(t, t.length / 2)
    expect(mid.x).toBeGreaterThan(0)
    expect(Number.isFinite(mid.angle)).toBe(true)
  })

  it('maps a world point back to the nearest arc length and a signed lane offset', () => {
    const t = buildTrack(CONTROL, { checkpoints: 4 })
    const s = 400
    const p = pointAt(t, s)
    expect(Math.abs(nearestS(t, p.x, p.y) - s)).toBeLessThan(15)
    const left = laneOffset(t, s, -1)
    const right = laneOffset(t, s, 1)
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeCloseTo(2 * LANES.spacing, 0)
  })

  it('detects a checkpoint crossing only in the forward direction and never twice', () => {
    const t = buildTrack(CONTROL, { checkpoints: 4 })
    const cp = t.checkpoints[1]
    expect(crossedCheckpoint(t, cp.s - 5, cp.s + 5)).toBe(true)
    expect(crossedCheckpoint(t, cp.s + 5, cp.s - 5)).toBe(false)      // backwards
    expect(crossedCheckpoint(t, cp.s + 5, cp.s + 20)).toBe(false)
    const last = t.checkpoints[0]
    expect(crossedCheckpoint(t, t.length - 3, 3)).toBe(last.s === 0)   // wrap across the start line
  })
})
