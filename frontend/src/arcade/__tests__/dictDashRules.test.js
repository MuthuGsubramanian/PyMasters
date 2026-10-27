import { describe, it, expect } from 'vitest'
import { newGame, setPrompt, step, applyPowerResult, LIVES, PLAYER_STEP_MS, GHOST_STEP_MS } from '../dict-dash/rules.js'
import { isWall } from '../engine/tilemap.js'

const item = { id: 'd1', kind: 'choice', prompt: { code: 'd = {"a": 1}\nd.get("b", 0)' }, choices: ['0', '1', 'None', 'KeyError'] }

function run(state, ms, input = {}) {
  let s = state
  const events = []
  for (let t = 0; t < ms; t += 16) { const r = step(s, 16, input); s = r.state; events.push(...r.events) }
  return { state: s, events }
}

describe('Dict Dash rules', () => {
  it('starts with three lives, a full maze of pellets and four ghosts in the pen', () => {
    const s = newGame()
    expect(s.lives).toBe(LIVES)
    expect(s.pellets.size).toBeGreaterThan(100)
    expect(s.ghosts.length).toBe(4)
    expect(s.ghosts.map((g) => g.name)).toEqual(['KeyError', 'None', 'IndexError', 'TypeError'])
    expect(s.powers.length).toBe(0)
  })

  it('a prompt labels the corner power pellets with the choices', () => {
    const s = setPrompt(newGame(), item)
    expect(s.powers.length).toBe(4)
    expect(s.powers.map((p) => p.label).sort()).toEqual(['0', '1', 'KeyError', 'None'])
    expect(s.prompt.id).toBe('d1')
  })

  it('the player moves cell by cell, queues a turn, and walls block', () => {
    let s = newGame()
    const x0 = s.player.x
    s = run(s, PLAYER_STEP_MS * 2 + 5, { dir: 'left' }).state
    expect(s.player.x).toBeLessThan(x0)
    s = { ...s, player: { ...s.player, dir: 'left', next: 'left' } }
    const before = s.player
    const blocked = run({ ...s, player: { ...before, x: 1, y: 1, dir: 'up', next: 'up', started: true } }, PLAYER_STEP_MS * 3).state
    expect(blocked.player.x).toBe(1)
    expect(blocked.player.y).toBe(1)
    const queued = run({ ...s, player: { ...before, x: 1, y: 1, dir: 'up', next: 'right', started: true } }, PLAYER_STEP_MS * 2 + 5).state
    expect(queued.player.x).toBeGreaterThan(1)
  })

  it('eating a pellet scores; eating a power pellet reports the choice and clears the others', () => {
    let s = setPrompt(newGame(), item)
    const target = s.powers[0]
    s = { ...s, player: { ...s.player, x: target.x + 1, y: target.y, dir: 'left', next: 'left', started: true } }
    const r = run(s, PLAYER_STEP_MS + 5)
    const ev = r.events.find((e) => e.type === 'power')
    expect(ev).toBeTruthy()
    expect(ev.choiceIndex).toBe(target.choiceIndex)
    expect(r.state.powers.length).toBe(0)
    const pel = run({ ...newGame(), player: { ...newGame().player, dir: 'left', next: 'left', started: true } }, PLAYER_STEP_MS * 3)
    expect(pel.state.score).toBeGreaterThan(0)
    expect(pel.events.some((e) => e.type === 'pellet')).toBe(true)
  })

  it('a right power pellet frightens the ghosts, a wrong one hurries them', () => {
    const s = setPrompt(newGame(), item)
    const ok = applyPowerResult(s, true)
    expect(ok.state.frightenedT).toBeGreaterThan(0)
    expect(ok.state.ghosts.every((g) => g.mode === 'frightened')).toBe(true)
    expect(ok.state.prompt).toBeNull()
    const bad = applyPowerResult(s, false)
    expect(bad.state.hurriedT).toBeGreaterThan(0)
    expect(bad.events.map((e) => e.type)).toContain('power_wrong')
  })

  it('touching a frightened ghost eats it; touching a hunting ghost costs a life, the last one ends the game', () => {
    let s = applyPowerResult(setPrompt(newGame(), item), true).state
    const g = s.ghosts[0]
    s = { ...s, ghosts: s.ghosts.map((x, i) => (i === 0 ? { ...x, x: s.player.x, y: s.player.y } : x)) }
    const eat = step(s, 16, {})
    expect(eat.events.map((e) => e.type)).toContain('ghost_eaten')
    expect(eat.state.ghosts[0].mode).toBe('eaten')
    expect(eat.state.score).toBeGreaterThanOrEqual(200)
    let h = newGame()
    h = { ...h, lives: 1, ghosts: h.ghosts.map((x, i) => (i === 0 ? { ...x, x: h.player.x, y: h.player.y, mode: 'chase' } : x)) }
    const die = step(h, 16, {})
    expect(die.events.map((e) => e.type)).toContain('death')
    expect(die.events.map((e) => e.type)).toContain('game_over')
    expect(die.state.alive).toBe(false)
    expect(g.name).toBe('KeyError')
  })

  it('ghosts never enter walls and leave the pen; clearing the pellets advances the level', () => {
    let s = newGame()
    let left = false
    for (let i = 0; i < 400; i++) {
      s = step(s, 16, {}).state
      for (const g of s.ghosts) expect(isWall(s.map, g.x, g.y)).toBe(false)
      left = left || s.ghosts.some((g) => g.y < s.map.ghost.y - 1 || g.x !== s.map.ghost.x)
    }
    expect(left).toBe(true)
    const cleared = step({ ...newGame(), pellets: new Set(['8,3']), player: { ...newGame().player, x: 9, y: 3, dir: 'left', next: 'left', started: true } }, PLAYER_STEP_MS + 5, {})
    const r = run(cleared.state, PLAYER_STEP_MS + 5)
    const all = [...cleared.events, ...r.events]
    expect(all.map((e) => e.type)).toContain('level_clear')
    expect(GHOST_STEP_MS).toBeGreaterThan(0)
  })
})
