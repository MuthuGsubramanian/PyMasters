import { describe, it, expect } from 'vitest'
import { newGame, newWave, step, SHIELDS, STAGE, CANNON_Y } from '../bug-invaders/rules.js'

const item = { id: 'b1', kind: 'line_then_choice', prompt: { code: 'total = 0\nfor n in [1, 2, 3]:\n    total == n\nprint(total)', test: 'assert total == 6' }, choices: ['total += n', 'total = n', 'print(n)'] }

function run(state, ms, input = {}) {
  let s = state
  const events = []
  for (let t = 0; t < ms; t += 16) { const r = step(s, 16, input); s = r.state; events.push(...r.events) }
  return { state: s, events }
}

describe('Bug Invaders rules', () => {
  it('a wave has one invader per program line in rows of at most four, phase line', () => {
    const s = newWave(newGame(), item, () => 0.3)
    expect(s.invaders.length).toBe(4)
    expect(s.invaders.map((i) => i.text)).toEqual(item.prompt.code.split('\n'))
    expect(Math.max(...s.invaders.map((i) => i.col))).toBeLessThanOrEqual(3)
    expect(s.phase).toBe('line')
    expect(s.ships).toEqual([])
    expect(s.shields).toBe(SHIELDS)
  })

  it('the cannon moves and clamps to the stage; the formation sways and descends', () => {
    let s = newWave(newGame(), item, () => 0.3)
    const x0 = s.cannonX
    s = run(s, 500, { move: 1 }).state
    expect(s.cannonX).toBeGreaterThan(x0)
    s = run(s, 20000, { move: 1 }).state
    expect(s.cannonX).toBeLessThanOrEqual(STAGE.w - 30)
    const y0 = s.invaders[0].y
    s = run(s, 2000).state
    expect(s.invaders[0].y).toBeGreaterThan(y0)
  })

  it('shooting a line invader records the line and opens the fix phase with one ship per fix', () => {
    let s = newWave(newGame(), item, () => 0.3)
    const target = s.invaders[2]
    s = { ...s, cannonX: target.x }
    const r = run(s, 1500, { fire: true })
    expect(r.events.map((e) => e.type)).toContain('line_hit')
    expect(r.state.lineHit).toBe(2)
    expect(r.state.phase).toBe('fix')
    expect(r.state.ships.length).toBe(3)
    expect(r.state.ships.map((sh) => sh.fixIndex).sort()).toEqual([0, 1, 2])
  })

  it('shooting a fix ship submits [line, fix]; a full-score verdict clears the wave, less costs a shield', () => {
    let s = newWave(newGame(), item, () => 0.3)
    s = { ...s, phase: 'fix', lineHit: 2, ships: [{ id: 'sh0', fixIndex: 0, label: 'total += n', x: s.cannonX, y: 120, vx: 0, alive: true }] }
    const r = run(s, 800, { fire: true })
    const sub = r.events.find((e) => e.type === 'submit')
    expect(sub).toBeTruthy()
    expect(sub.answer).toEqual([2, 0])
    expect(r.state.phase).toBe('grading')
    const clear = step(r.state, 0, { verdict: { score: 3, max: 3 } })
    expect(clear.events.map((e) => e.type)).toContain('wave_clear')
    expect(clear.state.score).toBeGreaterThan(0)
    expect(clear.state.phase).toBe('idle')
    const partial = step(r.state, 0, { verdict: { score: 1, max: 3 } })
    expect(partial.events.map((e) => e.type)).toContain('wave_fail')
    expect(partial.state.shields).toBe(SHIELDS - 1)
    expect(partial.events.find((e) => e.type === 'wave_fail').lineRight).toBe(true)
  })

  it('invaders reaching the cannon line cost a shield and fail the wave; the last shield ends the game', () => {
    let s = newWave({ ...newGame(), shields: 1 }, item, () => 0.3)
    s = { ...s, invaders: s.invaders.map((i) => ({ ...i, y: CANNON_Y - 10 })) }
    const r = run(s, 600)
    expect(r.events.map((e) => e.type)).toContain('invaded')
    expect(r.events.map((e) => e.type)).toContain('game_over')
    expect(r.state.alive).toBe(false)
  })

  it('every third wave is a boss wave that descends faster', () => {
    const a = newWave({ ...newGame(), wave: 1 }, item, () => 0.3)
    const b = newWave({ ...newGame(), wave: 2 }, item, () => 0.3)
    expect(a.boss).toBe(false)
    expect(b.boss).toBe(true)
    expect(b.descentSpeed).toBeGreaterThan(a.descentSpeed)
  })
})
