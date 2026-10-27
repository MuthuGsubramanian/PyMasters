import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'
import { COLS } from '../linked-snake/rules.js'

const items = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, kind: 'choice', topic: 'lists', prompt: { code: `print(${i} + 1)` }, choices: [`${i + 1}`, 'x', 'y', 'z'] }))

vi.mock('../../api', () => ({
  startArcadeSession: vi.fn(async () => ({ data: { session_id: 's1', game_id: 'linked_snake', items } })),
  moreArcadeQuestions: vi.fn(async () => ({ data: { items: [] } })),
  answerArcadeItem: vi.fn(async (sid, itemId, response) => ({ data: { id: itemId, correct: response === 0, answer: 0, why: 'adds one', lesson_id: 'lists' } })),
  finishArcadeSession: vi.fn(async (sid, score) => ({ data: { score, xp: 7, xp_capped: false, answered: 0, correct: 0, best: true, reveal: [] } })),
}))

import Game from '../linked-snake/Game.jsx'

async function flush(r) { await r.act(async () => { await Promise.resolve(); await Promise.resolve() }) }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : /Gradient$/.test(k) ? () => ({ addColorStop: () => {} }) : () => {}), set: () => true })
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
})
afterEach(() => { vi.useRealTimers() })

describe('Linked Snake game', () => {
  it('renders the field, the HUD prompt and an accessible description of the foods', async () => {
    const r = render(<MemoryRouter><Game gameId="linked_snake" reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(50) })
    expect(r.container.querySelector('canvas')).not.toBeNull()
    expect(r.container.textContent).toContain('print(0 + 1)')
    const desc = r.container.querySelector('[data-field-text]')
    expect(desc.textContent).toContain('1')
    expect(r.container.querySelector('[data-dir]').getAttribute('data-dir')).toBe('right')
    r.unmount()
  })

  it('arrow keys steer', async () => {
    const r = render(<MemoryRouter><Game gameId="linked_snake" reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    r.key('ArrowUp')
    await r.act(async () => { vi.advanceTimersByTime(400) })
    expect(r.container.querySelector('[data-dir]').getAttribute('data-dir')).toBe('up')
    r.unmount()
  })

  it('crashing ends the run and shows the end screen with XP', async () => {
    const initial = { snake: [{ x: COLS - 1, y: 6, value: '▶' }, { x: COLS - 2, y: 6, value: '1' }, { x: COLS - 3, y: 6, value: '2' }], dir: 'right', nextDir: 'right', started: true }
    const r = render(<MemoryRouter><Game gameId="linked_snake" reducedMotion initial={initial} onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(1200) })
    await flush(r)
    await flush(r)
    expect(r.container.querySelector('[data-end-screen]')).not.toBeNull()
    expect(r.container.textContent).toContain('+7')
    r.unmount()
  })
})
