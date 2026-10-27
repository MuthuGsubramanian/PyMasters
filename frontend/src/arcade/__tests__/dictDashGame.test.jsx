import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'

const items = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, kind: 'choice', topic: 'ds_dicts', prompt: { code: `d = {"a": ${i}}\nd.get("b", 0)` }, choices: ['0', `${i}`, 'None', 'KeyError'] }))

vi.mock('../../api', () => ({
  startArcadeSession: vi.fn(async () => ({ data: { session_id: 's1', game_id: 'dict_dash', items } })),
  moreArcadeQuestions: vi.fn(async () => ({ data: { items: [] } })),
  answerArcadeItem: vi.fn(async (sid, itemId, response) => ({ data: { id: itemId, correct: response === 0, answer: 0, why: 'get returns the default', lesson_id: 'ds_dicts' } })),
  finishArcadeSession: vi.fn(async (sid, score) => ({ data: { score, xp: 5, xp_capped: false, answered: 1, correct: 0, best: false, reveal: [] } })),
}))

import Game from '../dict-dash/Game.jsx'

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

describe('Dict Dash game', () => {
  it('renders the maze, the prompt and accessible power-pellet buttons', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-power]')
    expect(r.container.querySelector('canvas')).not.toBeNull()
    expect(r.container.textContent).toContain('d.get("b", 0)')
    expect(r.container.querySelectorAll('button[data-power]').length).toBe(4)
    expect(r.container.querySelector('[data-lives]').getAttribute('data-lives')).toBe('3')
    r.unmount()
  })

  it('a wrong power pellet hurries the ghosts and shows the why; a right one frightens them', async () => {
    const r = render(<MemoryRouter><Game reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-power]')
    r.click(r.container.querySelector('button[data-power="2"]'))
    for (let i = 0; i < 4; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(40) }) }
    expect(r.container.querySelector('[data-ghosts]').getAttribute('data-ghosts')).toBe('hurried')
    expect(r.container.textContent).toContain('get returns the default')
    await waitFor(r, 'button[data-power="0"]')
    r.click(r.container.querySelector('button[data-power="0"]'))
    for (let i = 0; i < 4; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(40) }) }
    expect(r.container.querySelector('[data-ghosts]').getAttribute('data-ghosts')).toBe('frightened')
    r.unmount()
  })

  it('losing all lives shows the end screen with XP', async () => {
    const r = render(<MemoryRouter><Game reducedMotion lives={1} debugDeath onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await waitFor(r, 'button[data-power]')
    r.click(r.container.querySelector('button[data-debug-death]'))
    for (let i = 0; i < 8; i++) { await flush(r); await r.act(async () => { vi.advanceTimersByTime(60) }) }
    expect(r.container.querySelector('[data-end-screen]')).not.toBeNull()
    expect(r.container.textContent).toContain('+5')
    r.unmount()
  })
})
