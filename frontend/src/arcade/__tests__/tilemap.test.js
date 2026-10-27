import { describe, it, expect } from 'vitest'
import { parseMap, isWall, neighbors, isJunction, bfsNext, bfsDist } from '../engine/tilemap.js'

const ROWS = [
  '#########',
  '#o..#..o#',
  '#.#.#.#.#',
  ' ...P... ',
  '#.#.#.#.#',
  '#o..G..o#',
  '#########',
]

describe('tilemap', () => {
  it('parses walls, pellets, power pellets and spawns', () => {
    const m = parseMap(ROWS)
    expect(m.cols).toBe(9)
    expect(m.rows).toBe(7)
    expect(isWall(m, 0, 0)).toBe(true)
    expect(isWall(m, 1, 1)).toBe(false)
    expect(m.powers).toEqual([{ x: 1, y: 1 }, { x: 7, y: 1 }, { x: 1, y: 5 }, { x: 7, y: 5 }])
    expect(m.player).toEqual({ x: 4, y: 3 })
    expect(m.ghost).toEqual({ x: 4, y: 5 })
    expect(m.pellets.length).toBeGreaterThan(10)
    expect(m.pellets.some((p) => p.x === 4 && p.y === 3)).toBe(false)
  })

  it('lists open neighbours and wraps through side tunnels', () => {
    const m = parseMap(ROWS)
    const n = neighbors(m, 1, 3).map((c) => `${c.x},${c.y}`)
    expect(n).toContain('2,3')
    expect(n).toContain('0,3')
    const edge = neighbors(m, 0, 3).map((c) => `${c.x},${c.y}`)
    expect(edge).toContain('8,3')          // tunnel wrap
    expect(isJunction(m, 3, 3)).toBe(true)
    expect(isJunction(m, 2, 1)).toBe(false)
  })

  it('bfs finds the next step toward a target and the distance', () => {
    const m = parseMap(ROWS)
    const next = bfsNext(m, { x: 1, y: 1 }, { x: 4, y: 3 })
    expect([{ x: 2, y: 1 }, { x: 1, y: 2 }]).toContainEqual(next)      // two equally short routes
    expect(bfsDist(m, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0)
    expect(bfsDist(m, { x: 1, y: 1 }, { x: 4, y: 3 })).toBe(5)
    expect(bfsNext(m, { x: 1, y: 1 }, { x: 0, y: 0 })).toBeNull()     // wall is unreachable
  })
})
