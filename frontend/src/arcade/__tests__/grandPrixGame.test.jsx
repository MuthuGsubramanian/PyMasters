import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'

const items = Array.from({ length: 16 }, (_, i) => ({ id: `g${i}`, kind: 'choice', topic: 'big_o_complexity', prompt: { code: `Which is O(n log n)? #${i}` }, choices: ['merge sort', 'bubble sort', 'linear search'] }))

vi.mock('../../api', () => ({
  startArcadeSession: vi.fn(async () => ({ data: { session_id: 's1', game_id: 'big_o_grand_prix', items } })),
  moreArcadeQuestions: vi.fn(async () => ({ data: { items: [] } })),
  answerArcadeItem: vi.fn(async (sid, itemId, response) => ({ data: { id: itemId, correct: response === 0, answer: 0, why: 'divide and conquer', lesson_id: 'sorting_basics' } })),
  finishArcadeSession: vi.fn(async (sid, score) => ({ data: { score, xp: 11, xp_capped: false, answered: 1, correct: 1, best: true, reveal: [] } })),
}))

import Game from '../grand-prix/Game.jsx'

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

describe('Big-O Grand Prix game', () => {
  it('renders the track, the fork question and accessible lane buttons', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-lane]')
    expect(r.container.querySelector('canvas')).not.toBeNull()
    expect(r.container.textContent).toContain('Which is O(n log n)? #0')
    expect(r.container.querySelectorAll('button[data-lane]').length).toBe(3)
    expect(r.container.querySelector('[data-lap]').getAttribute('data-lap')).toBe('1')
    r.unmount()
  })

  it('choosing the right lane through the buttons boosts and shows the why; a wrong one spins', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-lane]')
    const buttons = [...r.container.querySelectorAll('button[data-lane]')]
    const right = buttons.find((b) => b.getAttribute('data-choice') === '0')
    r.click(right)
    for (let i = 0; i < 4; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(40) }) }
    expect(r.container.querySelector('[data-kart]').getAttribute('data-kart')).toBe('boost')
    expect(r.container.textContent).toContain('divide and conquer')
    await waitFor(r, 'button[data-lane]')
    const wrong = [...r.container.querySelectorAll('button[data-lane]')].find((b) => b.getAttribute('data-choice') !== '0')
    r.click(wrong)
    for (let i = 0; i < 4; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(40) }) }
    expect(r.container.querySelector('[data-kart]').getAttribute('data-kart')).toBe('spin')
    r.unmount()
  })

  it('finishing the race shows the end screen with position and XP', async () => {
    const r = render(<MemoryRouter><Game reducedMotion laps={1} debugFinish onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-debug-finish]')
    r.click(r.container.querySelector('button[data-debug-finish]'))
    for (let i = 0; i < 10; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(60) }) }
    expect(r.container.querySelector('[data-end-screen]')).not.toBeNull()
    expect(r.container.textContent).toContain('+11')
    r.unmount()
  })
})
