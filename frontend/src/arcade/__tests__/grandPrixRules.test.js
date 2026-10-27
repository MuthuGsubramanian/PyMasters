import { describe, it, expect } from 'vitest'
import { newRace, step, setFork, applyForkResult, LAPS, FORKS_PER_LAP } from '../grand-prix/rules.js'

const item = { id: 'g1', kind: 'choice', prompt: { code: 'Which runs in O(n log n)?' }, choices: ['merge sort', 'bubble sort', 'linear search'] }

function run(state, ms, input = {}) {
  let s = state
  const events = []
  for (let t = 0; t < ms; t += 16) { const r = step(s, 16, input); s = r.state; events.push(...r.events) }
  return { state: s, events }
}

describe('Big-O Grand Prix rules', () => {
  it('starts four karts on the grid with three laps and four forks per lap', () => {
    const s = newRace({ seed: 1 })
    expect(s.karts.length).toBe(4)
    expect(s.karts[0].id).toBe('you')
    expect(s.laps).toBe(LAPS)
    expect(s.track.checkpoints.length).toBe(FORKS_PER_LAP)
    expect(s.karts.every((k) => k.lap === 0 && k.speed === 0)).toBe(true)
  })

  it('throttle accelerates, brake slows, steering changes the lane position', () => {
    let s = newRace({ seed: 1 })
    s = run(s, 1500, { throttle: true }).state
    expect(s.karts[0].speed).toBeGreaterThan(50)
    const d0 = s.karts[0].s
    s = run(s, 500, { throttle: true }).state
    expect(s.karts[0].s).toBeGreaterThan(d0)
    const sp = s.karts[0].speed
    s = run(s, 500, { brake: true }).state
    expect(s.karts[0].speed).toBeLessThan(sp)
    const lane0 = s.karts[0].lane
    s = run(s, 300, { throttle: true, steer: 1 }).state
    expect(s.karts[0].lane).toBeGreaterThan(lane0)
    expect(Math.abs(s.karts[0].lane)).toBeLessThanOrEqual(1)
  })

  it('a fork labels three lanes; crossing it reports the lane chosen', () => {
    let s = setFork(newRace({ seed: 1 }), item, () => 0.2)
    expect(s.fork.lanes.length).toBe(3)
    expect(new Set(s.fork.lanes.map((l) => l.choiceIndex)).size).toBe(3)
    const cp = s.track.checkpoints[s.fork.checkpoint]
    s = { ...s, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, s: cp.s - 10, speed: 200, lane: 1 } : k)) }
    const r = run(s, 200, { throttle: true })
    const ev = r.events.find((e) => e.type === 'fork')
    expect(ev).toBeTruthy()
    expect(ev.choiceIndex).toBe(s.fork.lanes.find((l) => l.lane === 1).choiceIndex)
    expect(r.state.fork.answered).toBe(true)
  })

  it('a right fork boosts, a wrong one spins out; AI karts answer by probability', () => {
    const s = setFork(newRace({ seed: 1 }), item, () => 0.2)
    const ok = applyForkResult(s, 'you', true)
    expect(ok.state.karts[0].boostT).toBeGreaterThan(0)
    expect(ok.events.map((e) => e.type)).toContain('boost')
    expect(ok.state.score).toBeGreaterThan(0)
    const bad = applyForkResult(s, 'you', false)
    expect(bad.state.karts[0].spinT).toBeGreaterThan(0)
    expect(bad.events.map((e) => e.type)).toContain('oil')
    let ai = setFork(newRace({ seed: 1 }), item, () => 0.2)
    const cp = ai.track.checkpoints[ai.fork.checkpoint]
    ai = { ...ai, karts: ai.karts.map((k) => (k.id === 'ai1' ? { ...k, s: cp.s - 10, speed: 200 } : k)) }
    const r = run(ai, 200, { rng: () => 0.0 })
    const aiKart = r.state.karts.find((k) => k.id === 'ai1')
    expect(aiKart.boostT > 0 || aiKart.spinT > 0).toBe(true)
  })

  it('laps count only forward across the start line and the race ends after three laps with positions', () => {
    let s = newRace({ seed: 1 })
    s = { ...s, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, s: s.track.length - 5, speed: 300, lap: 0 } : k)) }
    s = run(s, 200, { throttle: true }).state
    expect(s.karts[0].lap).toBe(1)
    s = { ...s, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, s: 10, speed: -200, lap: 1 } : k)) }
    s = run(s, 120, {}).state
    expect(s.karts[0].lap).toBe(1)
    let f = newRace({ seed: 1 })
    f = { ...f, karts: f.karts.map((k) => (k.id === 'you' ? { ...k, s: f.track.length - 5, speed: 300, lap: LAPS - 1 } : k)) }
    const r = run(f, 300, { throttle: true })
    expect(r.events.map((e) => e.type)).toContain('finish')
    expect(r.state.finished).toBe(true)
    expect(r.state.positions[0]).toBe('you')
  })
})
