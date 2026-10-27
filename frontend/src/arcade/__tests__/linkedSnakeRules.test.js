import { describe, it, expect } from 'vitest'
import { newRun, turn, step, placeFoods, applyEatResult, speedFor, COLS, ROWS } from '../linked-snake/rules.js'

const item = { id: 'q1', kind: 'choice', prompt: { code: 'print(len([1, [2, 3]]))' }, choices: ['2', '3', 'Error', '1'] }
const rng = (() => { let i = 0; return () => ((i += 0.37) % 1) })()

function run(over = {}) {
  return { ...newRun({ seed: 1 }), started: true, ...over }
}

describe('Linked Snake rules', () => {
  it('starts in the middle heading right with three nodes', () => {
    const s = newRun({ seed: 1 })
    expect(s.snake.length).toBe(3)
    expect(s.dir).toBe('right')
    expect(s.snake[0].x).toBeGreaterThan(s.snake[1].x)
    expect(s.alive).toBe(true)
  })

  it('moves one cell per step and ignores reversing into itself', () => {
    let s = run()
    const hx = s.snake[0].x
    s = step(s).state
    expect(s.snake[0].x).toBe(hx + 1)
    expect(s.snake.length).toBe(3)
    s = turn(s, 'left')
    expect(s.nextDir).toBe('right')
    s = turn(s, 'up')
    s = step(s).state
    expect(s.dir).toBe('up')
  })

  it('crashes into walls and into itself', () => {
    let s = run({ snake: [{ x: COLS - 1, y: 5, value: '▶' }, { x: COLS - 2, y: 5, value: '1' }], dir: 'right', nextDir: 'right' })
    const r = step(s)
    expect(r.events.map((e) => e.type)).toContain('crash')
    expect(r.state.alive).toBe(false)
    const body = [{ x: 5, y: 5, value: '▶' }, { x: 5, y: 6, value: 'a' }, { x: 4, y: 6, value: 'b' }, { x: 4, y: 5, value: 'c' }, { x: 4, y: 4, value: 'd' }]
    s = run({ snake: body, dir: 'left', nextDir: 'left' })
    expect(step(s).events.map((e) => e.type)).toContain('crash')
  })

  it('places one food per choice on free cells, never on the snake', () => {
    const s = placeFoods(run(), item, rng)
    expect(s.foods.length).toBe(4)
    const cells = new Set(s.foods.map((f) => `${f.x},${f.y}`))
    expect(cells.size).toBe(4)
    for (const f of s.foods) {
      expect(s.snake.some((n) => n.x === f.x && n.y === f.y)).toBe(false)
      expect(f.x >= 0 && f.x < COLS && f.y >= 0 && f.y < ROWS).toBe(true)
    }
    expect(s.foods.map((f) => f.choiceIndex).sort()).toEqual([0, 1, 2, 3])
    expect(s.prompt.id).toBe('q1')
  })

  it('eating emits eat; a correct result appends a node, a wrong one pops the tail', () => {
    let s = placeFoods(run(), item, rng)
    const head = s.snake[0]
    s = { ...s, foods: [{ x: head.x + 1, y: head.y, choiceIndex: 1, label: '3' }], dir: 'right', nextDir: 'right' }
    const r = step(s)
    expect(r.events.map((e) => e.type)).toContain('eat')
    expect(r.state.foods.length).toBe(0)
    const grown = applyEatResult(r.state, true, '3')
    expect(grown.state.snake.length).toBe(4)
    expect(grown.state.snake[grown.state.snake.length - 1].value).toBe('3')
    expect(grown.state.lastOp).toContain('append')
    expect(grown.events.map((e) => e.type)).toContain('grow')
    const shrunk = applyEatResult(r.state, false, '3')
    expect(shrunk.state.snake.length).toBe(2)
    expect(shrunk.state.lastOp).toContain('popleft')
    expect(shrunk.events.map((e) => e.type)).toContain('shrink')
  })

  it('shrinking a one-node snake crashes', () => {
    const s = run({ snake: [{ x: 5, y: 5, value: '▶' }] })
    const r = applyEatResult(s, false, 'x')
    expect(r.events.map((e) => e.type)).toContain('crash')
    expect(r.state.alive).toBe(false)
  })

  it('levels up every 8 correct answers and speeds up', () => {
    let s = run({ correct: 7 })
    const r = applyEatResult(s, true, 'v')
    expect(r.events.map((e) => e.type)).toContain('level_up')
    expect(r.state.level).toBe(2)
    expect(speedFor(1)).toBe(160)
    expect(speedFor(2)).toBe(152)
    expect(speedFor(40)).toBe(70)
  })
})
