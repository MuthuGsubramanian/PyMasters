import { describe, it, expect } from 'vitest'
import { newRun, spawnPair, addGate, step, speedAt, gateEveryMs, LIVES, LANE, ROBOT_X } from '../loop-runner/rules.js'

const item = { id: 'q1~p1', kind: 'choice', prompt: { expr: 'x % 3', context: { x: '7' }, code: 'x = 7\nx % 3' }, choices: ['1', '2'] }

describe('Loop Runner rules', () => {
  it('spawns a gate pair from a two-choice item with one label per lane, lane order random', () => {
    const a = spawnPair(item, () => 0.1)
    const b = spawnPair(item, () => 0.9)
    expect(new Set([a.upper.label, a.lower.label]).size).toBe(2)
    expect(a.upper.lane).toBe(LANE.UPPER)
    expect(a.lower.lane).toBe(LANE.LOWER)
    expect(a.upper.choiceIndex).not.toBe(b.upper.choiceIndex)
    expect(a.itemId).toBe('q1~p1')
  })

  it('speed ramps from 240 to 520 over 60 gates and the spawn interval shrinks', () => {
    expect(speedAt(0)).toBe(240)
    expect(speedAt(60)).toBe(520)
    expect(speedAt(200)).toBe(520)
    expect(gateEveryMs(0)).toBeGreaterThan(gateEveryMs(40))
  })

  it('jumping takes the upper lane and sliding the lower; both return to the ground', () => {
    let s = step(newRun(), 16, { jump: true }).state
    expect(s.lane).toBe(LANE.UPPER)
    for (let i = 0; i < 60; i++) s = step(s, 16, {}).state
    expect(s.lane).toBe(LANE.GROUND)
    s = step(s, 16, { slide: true }).state
    expect(s.lane).toBe(LANE.LOWER)
  })

  it('reaching a gate reports the lane choice; the ground lane hits the divider', () => {
    let s = addGate(newRun(), { ...spawnPair(item, () => 0.1), x: ROBOT_X + 30 })
    const up = step({ ...s, lane: LANE.UPPER, laneT: 1000 }, 200, {})
    const g = up.events.find((e) => e.type === 'gate')
    expect(g).toBeTruthy()
    expect(g.choiceIndex).toBe(s.gates[0].upper.choiceIndex)
    const ground = step(s, 200, {})
    expect(ground.events.find((e) => e.type === 'gate').choiceIndex).toBeNull()
    expect(ground.events.map((e) => e.type)).toContain('stumble')
  })

  it('a correct verdict passes with combo and score; a wrong one stumbles and costs a life', () => {
    let s = addGate(newRun(), { ...spawnPair(item, () => 0.1), x: ROBOT_X + 30 })
    s = step({ ...s, lane: LANE.UPPER, laneT: 1000 }, 200, {}).state
    const gateId = s.gates[0].id
    const ok = step(s, 0, { verdict: { gateId, correct: true } })
    expect(ok.events.map((e) => e.type)).toContain('pass')
    expect(ok.state.combo).toBe(1)
    expect(ok.state.score).toBeGreaterThan(0)
    const bad = step(s, 0, { verdict: { gateId, correct: false } })
    expect(bad.events.map((e) => e.type)).toContain('stumble')
    expect(bad.state.lives).toBe(LIVES - 1)
    expect(bad.state.combo).toBe(0)
  })

  it('a checkpoint fires every ten passes and the last life ends the game', () => {
    let s = addGate({ ...newRun(), passes: 9 }, { ...spawnPair(item, () => 0.1), x: ROBOT_X + 30 })
    s = step({ ...s, lane: LANE.UPPER, laneT: 1000 }, 200, {}).state
    const r = step(s, 0, { verdict: { gateId: s.gates[0].id, correct: true } })
    expect(r.events.map((e) => e.type)).toContain('checkpoint')
    expect(r.state.scene).toBe(1)
    let d = addGate({ ...newRun(), lives: 1 }, { ...spawnPair(item, () => 0.1), x: ROBOT_X + 30 })
    d = step({ ...d, lane: LANE.UPPER, laneT: 1000 }, 200, {}).state
    const dead = step(d, 0, { verdict: { gateId: d.gates[0].id, correct: false } })
    expect(dead.events.map((e) => e.type)).toContain('game_over')
    expect(dead.state.alive).toBe(false)
  })

  it('gates scroll toward the robot and leave the stage', () => {
    let s = addGate(newRun(), { ...spawnPair(item, () => 0.1), x: 900, resolved: true })
    s = step(s, 1000, {}).state
    expect(s.gates[0].x).toBeLessThan(900)
    for (let i = 0; i < 20; i++) s = step(s, 1000, {}).state
    expect(s.gates.length).toBe(0)
  })
})
