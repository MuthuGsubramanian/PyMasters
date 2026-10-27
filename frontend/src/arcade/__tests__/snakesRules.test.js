import { describe, it, expect } from 'vitest'
import { BOARD_LAYOUTS, squareToCell, squareToXY, pathBetween, validateLayout } from '../snakes-ladders/board.js'
import { newGame, applyRoll, resolveQuestion, rivalTurn, rivalAnswers, snakeTailFor } from '../snakes-ladders/rules.js'

describe('board geometry', () => {
  it('numbers squares boustrophedon from the bottom-left', () => {
    expect(squareToCell(1)).toEqual({ col: 0, row: 0 })
    expect(squareToCell(10)).toEqual({ col: 9, row: 0 })
    expect(squareToCell(11)).toEqual({ col: 9, row: 1 })
    expect(squareToCell(20)).toEqual({ col: 0, row: 1 })
    expect(squareToCell(100)).toEqual({ col: 0, row: 9 })
    expect(squareToXY(1, 10)).toEqual({ x: 5, y: 95 })
  })
  it('paths step one square at a time in either direction', () => {
    expect(pathBetween(3, 6)).toEqual([4, 5, 6])
    expect(pathBetween(6, 3)).toEqual([5, 4, 3])
  })
  it('every board layout has 8 ladders and 8 snakes and is valid', () => {
    for (const key of ['variables', 'lists', 'dicts', 'loops', 'conditionals', 'functions', 'containers', 'big_o']) {
      const layout = BOARD_LAYOUTS[key]
      expect(Object.keys(layout.ladders).length).toBe(8)
      expect(Object.keys(layout.snakes).length).toBe(8)
      expect(validateLayout(layout)).toEqual([])
    }
  })
})

const ladderFoot = Number(Object.keys(BOARD_LAYOUTS.variables.ladders)[0])
const ladderHead = BOARD_LAYOUTS.variables.ladders[ladderFoot]
const snakeHead = Number(Object.keys(BOARD_LAYOUTS.variables.snakes)[0])
const snakeTail = BOARD_LAYOUTS.variables.snakes[snakeHead]

function at(pos) {
  const g = newGame({ board: 'variables', seed: 1 })
  g.players[0].pos = pos
  return g
}

describe('rules', () => {
  it('a plain roll moves and passes the turn', () => {
    const { state, events } = applyRoll(at(0), 2)
    expect(events.map((e) => e.type)).toEqual(['move'])
    expect(state.players[0].pos).toBe(2)
    expect(state.turn).toBe(1)
  })
  it('a six grants another roll', () => {
    const { state, events } = applyRoll(at(0), 6)
    expect(events.some((e) => e.type === 'extra_turn')).toBe(true)
    expect(state.turn).toBe(0)
  })
  it('landing on a ladder foot asks a question; correct climbs, wrong turns it into a snake', () => {
    const r = applyRoll(at(ladderFoot - 3), 3)
    expect(r.events.map((e) => e.type)).toContain('ladder_question')
    expect(r.state.pending).toEqual({ type: 'ladder', square: ladderFoot })
    const ok = resolveQuestion(r.state, true)
    expect(ok.events.map((e) => e.type)).toContain('climb')
    expect(ok.state.players[0].pos).toBe(ladderHead)
    expect(ok.state.pending).toBeNull()
    const bad = resolveQuestion(r.state, false)
    expect(bad.events.map((e) => e.type)).toContain('slide')
    expect(bad.state.players[0].pos).toBe(snakeTailFor(ladderFoot, ladderHead))
    expect(bad.state.turned[ladderFoot]).toBe(true)
    // a turned ladder is a snake from now on
    const again = applyRoll({ ...bad.state, turn: 0, players: [{ ...bad.state.players[0], pos: ladderFoot - 1 }, bad.state.players[1]] }, 1)
    expect(again.events.map((e) => e.type)).toContain('snake_question')
  })
  it('a snake head asks a rescue question; correct stays, wrong slides', () => {
    const r = applyRoll(at(snakeHead - 2), 2)
    expect(r.events.map((e) => e.type)).toContain('snake_question')
    expect(resolveQuestion(r.state, true).state.players[0].pos).toBe(snakeHead)
    expect(resolveQuestion(r.state, true).events.map((e) => e.type)).toContain('escape')
    const bad = resolveQuestion(r.state, false)
    expect(bad.state.players[0].pos).toBe(snakeTail)
    expect(bad.events.map((e) => e.type)).toContain('bite')
  })
  it('reaching 100 wins without an exact roll', () => {
    const { state, events } = applyRoll(at(98), 5)
    expect(state.players[0].pos).toBe(100)
    expect(events.map((e) => e.type)).toContain('win')
    expect(state.winner).toBe('you')
  })
  it('the rival rolls, moves and answers by probability', () => {
    const g = at(0)
    g.turn = 1
    const r = rivalTurn(g, () => 0.0, () => 3)           // rng → always "correct", die → 3
    expect(r.state.players[1].pos).toBeGreaterThanOrEqual(3)
    expect(r.state.turn).toBe(0)
    expect(rivalAnswers(() => 0.99, 'variables')).toBe(false)
    expect(rivalAnswers(() => 0.5, 'variables')).toBe(true)
    expect(rivalAnswers(() => 0.84, 'big_o')).toBe(true)
  })
})
