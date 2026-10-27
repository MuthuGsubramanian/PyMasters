import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'

const items = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, kind: 'line_then_choice', topic: 'lists', prompt: { code: `total = 0\nfor n in [1, 2, ${i}]:\n    total == n\nprint(total)`, test: `assert total == ${3 + i}` }, choices: ['total += n', 'total = n', 'print(n)'] }))

vi.mock('../../api', () => ({
  startArcadeSession: vi.fn(async () => ({ data: { session_id: 's1', game_id: 'bug_invaders', items } })),
  moreArcadeQuestions: vi.fn(async () => ({ data: { items: [] } })),
  answerArcadeItem: vi.fn(async (sid, itemId, response) => {
    const line = Number(response[0]) === 2 ? 1 : 0
    const fix = Number(response[1]) === 0 ? 2 : 0
    return { data: { id: itemId, correct: line + fix === 3, score: line + fix, max: 3, answer: [2, 0], why: 'use +=', lesson_id: 'lists' } }
  }),
  finishArcadeSession: vi.fn(async (sid, score) => ({ data: { score, xp: 8, xp_capped: false, answered: 1, correct: 0, best: false, reveal: [] } })),
}))

import Game from '../bug-invaders/Game.jsx'

async function flush(r) { await r.act(async () => { await Promise.resolve(); await Promise.resolve() }) }
async function waitFor(r, selector, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const el = r.container.querySelector(selector)
    if (el) return el
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(50) })
  }
  return r.container.querySelector(selector)
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : /Gradient$/.test(k) ? () => ({ addColorStop: () => {} }) : () => {}), set: () => true })
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
})
afterEach(() => { vi.useRealTimers() })

describe('Bug Invaders game', () => {
  it('renders the stage, the failing test and accessible line buttons', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-line]')
    expect(r.container.querySelector('canvas')).not.toBeNull()
    expect(r.container.textContent).toContain('assert total == 3')
    expect(r.container.querySelectorAll('button[data-line]').length).toBe(4)
    expect(r.container.querySelector('[data-shields]').getAttribute('data-shields')).toBe('3')
    r.unmount()
  })

  it('line then fix through the accessible buttons clears the wave when both are right', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-line]')
    r.click(r.container.querySelector('button[data-line="2"]'))
    await waitFor(r, 'button[data-fix]')
    expect(r.container.querySelectorAll('button[data-fix]').length).toBe(3)
    r.click(r.container.querySelector('button[data-fix="0"]'))
    for (let i = 0; i < 6; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(60) }) }
    expect(r.container.querySelector('[data-wave]').getAttribute('data-wave')).toBe('2')
    expect(r.container.querySelector('[data-shields]').getAttribute('data-shields')).toBe('3')
    r.unmount()
  })

  it('a wrong fix costs a shield and shows the why', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-line]')
    r.click(r.container.querySelector('button[data-line="2"]'))
    await waitFor(r, 'button[data-fix]')
    r.click(r.container.querySelector('button[data-fix="1"]'))
    for (let i = 0; i < 6; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(60) }) }
    expect(r.container.querySelector('[data-shields]').getAttribute('data-shields')).toBe('2')
    expect(r.container.textContent).toContain('use +=')
    r.unmount()
  })
})
