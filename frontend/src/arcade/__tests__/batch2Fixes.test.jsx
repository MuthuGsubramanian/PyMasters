// Batch-2 review fix pass (2026-10-28): the stuck states and unwinnable races a reviewer found.
import { describe, it, expect, vi } from 'vitest'
import { buildTrack, whichCheckpoint } from '../engine/track.js'
import { keyToAction, useInput } from '../engine/useInput.js'
import { render } from '../../games/__tests__/render.js'
import { newRace, step as raceStep, LAPS, CONTROL } from '../grand-prix/rules.js'
import { newGame as newMaze, setPrompt, step as mazeStep, PLAYER_STEP_MS } from '../dict-dash/rules.js'
import { newRun as newSnake, step as snakeStep, turn } from '../linked-snake/rules.js'
import { newRun as newRunner, addGate, spawnPair, step as runnerStep, ROBOT_X, LANE } from '../loop-runner/rules.js'
import { newGame as newInvaders, newWave, step as invStep, hitLine } from '../bug-invaders/rules.js'

function run(stepFn, state, ms, input = {}) {
  let s = state
  const events = []
  for (let t = 0; t < ms; t += 16) { const r = stepFn(s, 16, input); s = r.state; events.push(...r.events) }
  return { state: s, events }
}

describe('Grand Prix laps', () => {
  it('AI karts do not get a free lap from starting behind the line', () => {
    const r = run(raceStep, newRace({ seed: 1 }), 400, {})
    for (const k of r.state.karts.filter((k) => k.id !== 'you')) expect(k.lap).toBeLessThanOrEqual(0)
    expect(r.state.positions.length).toBe(0)
  })

  it('a lap counts only after every checkpoint was crossed in order', () => {
    const t = buildTrack(CONTROL, { checkpoints: 4 })
    let s = newRace({ seed: 1 })
    // park just before the line with no checkpoints done, cross it: no lap yet
    s = { ...s, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, s: t.length - 5, speed: 300, nextCp: 1 } : k)) }
    s = run(raceStep, s, 120, { throttle: true }).state
    expect(s.karts[0].lap).toBe(0)
    // rock back and forth over the line: still no lap
    s = { ...s, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, s: 10, speed: -200 } : k)) }
    s = run(raceStep, s, 120, {}).state
    s = { ...s, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, speed: 300 } : k)) }
    s = run(raceStep, s, 200, { throttle: true }).state
    expect(s.karts[0].lap).toBe(0)
    // drive the whole lap: checkpoints 1, 2, 3 then the line
    s = { ...s, karts: s.karts.map((k) => (k.id === 'you' ? { ...k, s: 20, speed: 350 } : k)) }
    s = run(raceStep, s, 12000, { throttle: true }).state
    expect(s.karts[0].lap).toBeGreaterThanOrEqual(1)
    expect(whichCheckpoint(t, 5, 15)).toBe(-1)
  })
})

describe('Dict Dash', () => {
  it('the player stands still until the first input, so no answer is eaten by accident', () => {
    const s = setPrompt(newMaze(), { id: 'q', choices: ['a', 'b', 'c', 'd'] }, () => 0.3)
    const r = run(mazeStep, s, 3000, {})
    expect(r.state.player.x).toBe(s.player.x)
    expect(r.events.some((e) => e.type === 'power')).toBe(false)
    const moved = run(mazeStep, s, PLAYER_STEP_MS * 2 + 5, { dir: 'left' }).state
    expect(moved.player.x).toBeLessThan(s.player.x)
  })

  it('clearing a level keeps the open question and re-places its power pellets', () => {
    let s = setPrompt(newMaze(), { id: 'q', choices: ['a', 'b', 'c', 'd'] }, () => 0.3)
    s = { ...s, pellets: new Set(['8,3']), player: { ...s.player, x: 9, y: 3, dir: 'left', next: 'left', started: true } }
    const r = run(mazeStep, s, PLAYER_STEP_MS * 2, {})
    expect(r.events.map((e) => e.type)).toContain('level_clear')
    expect(r.state.prompt?.id).toBe('q')
    expect(r.state.powers.length).toBe(4)
  })

  it('a ghost and the player swapping cells still collide', () => {
    let s = newMaze()
    s = { ...s, player: { ...s.player, x: 5, y: 3, dir: 'right', next: 'right', started: true }, ghosts: s.ghosts.map((g, i) => (i === 0 ? { ...g, x: 6, y: 3, dir: 'left', mode: 'chase', releaseAt: 0, acc: PLAYER_STEP_MS } : { ...g, releaseAt: 1e9 })) }
    const r = run(mazeStep, s, PLAYER_STEP_MS + 40, { rng: () => 0 })
    expect(r.events.map((e) => e.type)).toContain('death')
  })
})

describe('Linked Snake start', () => {
  it('does not move until the first steer', () => {
    const r = run(snakeStep, newSnake({ seed: 1 }), 2000, {})
    expect(r.state.alive).toBe(true)
    expect(r.state.snake[0].x).toBe(newSnake({ seed: 1 }).snake[0].x)
    const go = run(snakeStep, turn(newSnake({ seed: 1 }), 'right'), 400, {}).state
    expect(go.snake[0].x).toBeGreaterThan(newSnake({ seed: 1 }).snake[0].x)
  })
})

describe('Loop Runner verdicts', () => {
  it('a missing verdict (network) resolves the gate without a pass or a stumble', () => {
    const item = { id: 'q1~v1', choices: ['1', '2'] }
    let s = addGate(newRunner(), { ...spawnPair(item, () => 0.1), x: ROBOT_X + 30 })
    s = runnerStep({ ...s, lane: LANE.UPPER, laneT: 1000 }, 200, {}).state
    const r = runnerStep(s, 0, { verdict: { gateId: s.gates[0].id, correct: null } })
    expect(r.events.map((e) => e.type)).not.toContain('pass')
    expect(r.events.map((e) => e.type)).not.toContain('stumble')
    expect(r.state.lives).toBe(3)
    expect(r.state.gates[0].resolved).toBe(true)
  })
})

describe('Bug Invaders pacing', () => {
  it('descent is capped and frozen during the fix phase; ships start on screen', () => {
    const item = { id: 'b', prompt: { code: 'a\nb\nc', test: 'assert x' }, choices: ['f1', 'f2', 'f3'] }
    const late = newWave({ ...newInvaders(), wave: 20 }, item, () => 0.3)
    expect(late.descentSpeed).toBeLessThanOrEqual(28)
    let s = hitLine(newWave(newInvaders(), item, () => 0.3), 1).state
    const y0 = s.invaders[0].y
    s = run(invStep, s, 1000, {}).state
    expect(s.invaders[0].y).toBe(y0)
    expect(s.ships.every((sh) => sh.x > -200)).toBe(true)
  })
})

describe('input', () => {
  it('keyToAction still maps, but keys on a focused button are left alone by the hook', () => {
    expect(keyToAction('Enter')).toBe('tap')
    const handler = vi.fn()
    function Probe() { useInput({ onAction: handler }); return <button type="button" id="probe">x</button> }
    const r = render(<Probe />)
    const btn = r.container.querySelector('#probe')
    r.act(() => { btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(handler).not.toHaveBeenCalled()
    r.key('ArrowUp')
    expect(handler).toHaveBeenCalledWith('up', expect.anything())
    r.unmount()
  })
})
