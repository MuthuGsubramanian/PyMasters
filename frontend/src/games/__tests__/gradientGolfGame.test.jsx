import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render } from './render.js'
import Game from '../gradient-golf/Game.jsx'
import { holeById } from '../gradient-golf/levels.js'

beforeAll(() => {
  // jsdom has no canvas: hand back a no-op 2D context.
  const noop = () => {}
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_t, prop) => (prop === 'canvas' ? {} : prop === 'measureText' ? () => ({ width: 0 }) : noop),
    set: () => true,
  })
})

const item = { id: 'quad_a1', level: 1, topic: 'gradient_descent', kind: 'sim', seed: 7, hole: holeById('quad_a1') }

describe('Gradient Golf game', () => {
  it('records a swing with the chosen learning rate and answers once the ball is sunk', () => {
    vi.useFakeTimers()
    const onAnswer = vi.fn()
    const r = render(<Game item={item} onAnswer={onAnswer} disabled={false} reducedMotion />)
    const lr = r.container.querySelector('input[name="lr"]')
    expect(lr).toBeTruthy()
    r.type(lr, '0.5')
    const swing = [...r.container.querySelectorAll('button')].find((b) => /swing/i.test(b.textContent))
    expect(swing).toBeTruthy()
    r.click(swing)
    // each stepped frame schedules the next one from an effect, so advance in slices
    for (let i = 0; i < 12; i++) r.act(() => { vi.advanceTimersByTime(200) })
    expect(onAnswer).toHaveBeenCalledTimes(1)
    const payload = onAnswer.mock.calls[0][0]
    expect(payload.hole_id).toBe('quad_a1')
    expect(payload.seed).toBe(7)
    expect(payload.swings).toHaveLength(1)
    expect(payload.swings[0].lr).toBeCloseTo(0.5, 6)
    expect(r.container.textContent).toMatch(/sunk|in the hole/i)
    vi.useRealTimers()
    r.unmount()
  })

  it('hides momentum and decay controls when the hole forbids them, shows them when allowed', () => {
    const r = render(<Game item={item} onAnswer={() => {}} disabled={false} reducedMotion />)
    expect(r.container.querySelector('input[name="momentum"]')).toBeNull()
    r.unmount()
    const shelf = { ...item, id: 'plateau', hole: holeById('plateau') }
    const r2 = render(<Game item={shelf} onAnswer={() => {}} disabled={false} reducedMotion />)
    expect(r2.container.querySelector('input[name="momentum"]')).toBeTruthy()
    expect(r2.container.querySelector('input[name="decay"]')).toBeTruthy()
    r2.unmount()
  })
})
