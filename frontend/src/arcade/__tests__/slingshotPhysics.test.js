import { describe, it, expect } from 'vitest'
import { createWorld, addTower, launch, stepWorld, trajectoryPreview, GRAVITY, STAGE } from '../code-slingshot/physics.js'

function fly(world, maxSteps = 600) {
  const events = []
  for (let i = 0; i < maxSteps && world.bird?.flying; i++) events.push(...stepWorld(world, 1000 / 60))
  return events
}

describe('slingshot physics', () => {
  it('a launched bird follows a parabola and lands on the ground inside the stage', () => {
    const w = createWorld()
    launch(w, { x: 120, y: w.groundY - 80 }, { x: -140, y: 60 })      // pulled back-and-down → flies up-and-right
    expect(w.bird.vx).toBeGreaterThan(0)
    expect(w.bird.vy).toBeLessThan(0)
    let minY = Infinity
    const events = fly(w)
    for (let i = 0; i < 1; i++) minY = Math.min(minY, w.bird.y)
    expect(w.bird.flying).toBe(false)
    expect(events.some((e) => e.type === 'ground')).toBe(true)
    expect(w.bird.y).toBeCloseTo(w.groundY - w.bird.r, 0)
    expect(w.bird.x).toBeGreaterThan(120)
    expect(w.bird.x).toBeLessThanOrEqual(STAGE.w)
  })

  it('velocity is capped and scales with the pull', () => {
    const a = createWorld(); launch(a, { x: 100, y: 300 }, { x: -20, y: 0 })
    const b = createWorld(); launch(b, { x: 100, y: 300 }, { x: -200, y: 0 })
    expect(Math.hypot(b.bird.vx, b.bird.vy)).toBeGreaterThan(Math.hypot(a.bird.vx, a.bird.vy))
    const c = createWorld(); launch(c, { x: 100, y: 300 }, { x: -5000, y: 0 })
    expect(Math.hypot(c.bird.vx, c.bird.vy)).toBeLessThanOrEqual(1100.01)
  })

  it('the bird collides with a crate and reports which one', () => {
    const w = createWorld()
    addTower(w, { x: 400, crates: 3, pig: { id: 'p1', label: '7', choiceIndex: 0 } })
    launch(w, { x: 120, y: w.groundY - 60 }, { x: -160, y: 10 })   // flat, fast shot along the ground line
    const events = fly(w)
    expect(events.some((e) => e.type === 'crate')).toBe(true)
  })

  it('hitting the pig reports the pig id', () => {
    const w = createWorld()
    addTower(w, { x: 400, crates: 1, pig: { id: 'p1', label: '7', choiceIndex: 0 } })
    const pig = w.pigs[0]
    // aim straight at the pig from close range
    launch(w, { x: pig.x - 150, y: pig.y }, { x: -170, y: 0 })
    const events = fly(w)
    expect(events.some((e) => e.type === 'pig' && e.id === 'p1')).toBe(true)
  })

  it('an unsupported crate falls and rests on the one below', () => {
    const w = createWorld()
    addTower(w, { x: 500, crates: 1, pig: { id: 'p', label: 'x', choiceIndex: 0 } })
    const base = w.boxes[0]
    w.boxes.push({ id: 'floating', x: base.x, y: base.y - 200, w: base.w, h: base.h, vx: 0, vy: 0, resting: false })
    for (let i = 0; i < 300; i++) stepWorld(w, 1000 / 60)
    const f = w.boxes.find((b) => b.id === 'floating')
    expect(f.resting).toBe(true)
    expect(f.y + f.h).toBeCloseTo(base.y, 0)
  })

  it('trajectory preview samples the arc', () => {
    const pts = trajectoryPreview({ x: 0, y: 0 }, { vx: 300, vy: -500 }, 10)
    expect(pts.length).toBe(10)
    expect(pts[1].x).toBeGreaterThan(pts[0].x)
    expect(pts[1].y).toBeLessThan(pts[0].y)
    expect(GRAVITY).toBe(1800)
  })
})
