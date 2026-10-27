import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'

const items = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, kind: 'choice', topic: 'variables', prompt: { expr: `x % ${i + 2}`, context: { x: '7' }, code: `x = 7\nx % ${i + 2}` }, choices: ['1', '2', '0', '7'] }))

vi.mock('../../api', () => ({
  startArcadeSession: vi.fn(async () => ({ data: { session_id: 's1', game_id: 'loop_runner', items } })),
  moreArcadeQuestions: vi.fn(async () => ({ data: { items: [] } })),
  answerArcadeItem: vi.fn(async (sid, itemId, response) => ({ data: { id: itemId, correct: response === 0, answer: 0, why: 'remainder', lesson_id: 'variables_intro' } })),
  finishArcadeSession: vi.fn(async (sid, score) => ({ data: { score, xp: 6, xp_capped: false, answered: 1, correct: 0, best: false, reveal: [] } })),
}))

import Game from '../loop-runner/Game.jsx'

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

describe('Loop Runner game', () => {
  it('renders the stage, the expression and accessible gate buttons', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-gate="upper"]')
    expect(r.container.querySelector('canvas')).not.toBeNull()
    expect(r.container.textContent).toContain('x % 2')
    expect(r.container.querySelector('button[data-gate="upper"]')).not.toBeNull()
    expect(r.container.querySelector('button[data-gate="lower"]')).not.toBeNull()
    expect(r.container.querySelector('[data-lives]').getAttribute('data-lives')).toBe('3')
    r.unmount()
  })

  it('choosing a gate through the accessible buttons grades it; a wrong gate costs a life', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    const upper = await waitFor(r, 'button[data-gate="upper"]')
    const lower = r.container.querySelector('button[data-gate="lower"]')
    const wrong = upper.getAttribute('data-choice') === '0' ? lower : upper
    r.click(wrong)
    for (let i = 0; i < 4; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(40) }) }
    expect(r.container.querySelector('[data-lives]').getAttribute('data-lives')).toBe('2')
    expect(r.container.textContent).toContain('remainder')
    r.unmount()
  })

  it('three wrong gates end the run with the end screen and XP', async () => {
    const r = render(<MemoryRouter><Game reducedMotion lives={1} onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    const upper = await waitFor(r, 'button[data-gate="upper"]')
    const lower = r.container.querySelector('button[data-gate="lower"]')
    r.click(upper.getAttribute('data-choice') === '0' ? lower : upper)
    for (let i = 0; i < 6; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(60) }) }
    expect(r.container.querySelector('[data-end-screen]')).not.toBeNull()
    expect(r.container.textContent).toContain('+6')
    r.unmount()
  })
})
