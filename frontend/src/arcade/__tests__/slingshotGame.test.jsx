import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'

const items = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, kind: 'choice', topic: 'variables', prompt: { expr: `x % ${i + 2}`, context: { x: '7' }, code: `x = 7\nx % ${i + 2}` }, choices: ['1', '2', '0', '7'] }))

vi.mock('../../api', () => ({
  startArcadeSession: vi.fn(async () => ({ data: { session_id: 's1', game_id: 'code_slingshot', items } })),
  moreArcadeQuestions: vi.fn(async () => ({ data: { items: [] } })),
  answerArcadeItem: vi.fn(async (sid, itemId, response) => ({ data: { id: itemId, correct: response === 0, answer: 0, why: 'remainder', lesson_id: 'variables_intro' } })),
  finishArcadeSession: vi.fn(async (sid, score) => ({ data: { score, xp: 9, xp_capped: false, answered: 0, correct: 0, best: true, reveal: [] } })),
}))

import Game from '../code-slingshot/Game.jsx'

async function flush(r) { await r.act(async () => { await Promise.resolve(); await Promise.resolve() }) }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : /Gradient$/.test(k) ? () => ({ addColorStop: () => {} }) : () => {}), set: () => true })
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
})
afterEach(() => { vi.useRealTimers() })

describe('Code Slingshot game', () => {
  it('renders the stage, the expression and an accessible list of the pigs', async () => {
    const r = render(<MemoryRouter><Game gameId="code_slingshot" reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(50) })
    expect(r.container.querySelector('canvas')).not.toBeNull()
    expect(r.container.textContent).toContain('x % 2')
    const desc = r.container.querySelector('[data-stage-text]')
    expect(desc.textContent).toContain('7')
    expect(r.container.querySelector('[data-birds]').getAttribute('data-birds')).toBe('3')
    r.unmount()
  })

  it('keyboard aim changes the angle and space launches a bird', async () => {
    const r = render(<MemoryRouter><Game gameId="code_slingshot" reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    const before = Number(r.container.querySelector('[data-angle]').getAttribute('data-angle'))
    r.key('ArrowUp')
    await flush(r)
    const after = Number(r.container.querySelector('[data-angle]').getAttribute('data-angle'))
    expect(after).not.toBe(before)
    r.act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    await r.act(async () => { vi.advanceTimersByTime(300) })
    r.act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })) })
    await flush(r)
    expect(r.container.querySelector('[data-flying]').getAttribute('data-flying')).toBe('1')
    r.unmount()
  })

  it('shows the end screen with XP after the lives run out', async () => {
    const r = render(<MemoryRouter><Game gameId="code_slingshot" reducedMotion lives={1} birdsPerQuestion={1} onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    // a feeble shot straight down: the bird dies without touching a pig
    r.act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    r.act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })) })
    await r.act(async () => { vi.advanceTimersByTime(6000) })
    await flush(r)
    await flush(r)
    expect(r.container.querySelector('[data-end-screen]')).not.toBeNull()
    expect(r.container.textContent).toContain('+9')
    r.unmount()
  })
})
