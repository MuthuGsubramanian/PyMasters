// Review fix pass (2026-10-28): the freezes and gaps a fresh reviewer found in the arcade.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'
import { sessionReducer, initialArcadeSession, shouldPrefetch } from '../engine/useArcadeSession.js'
import { QuestionCard } from '../engine/QuestionCard.jsx'

const mkItems = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, kind: 'choice', topic: 'lists', prompt: { code: `print(${i})` }, choices: ['a', 'b', 'c', 'd'] }))

describe('session prefetch stops when the pool is exhausted', () => {
  it('marks the session exhausted when a batch brings nothing new', () => {
    let s = sessionReducer(sessionReducer(initialArcadeSession, { type: 'LOAD' }), { type: 'STARTED', session: { session_id: 's1', game_id: 'x', items: mkItems('q', 2) } })
    expect(shouldPrefetch(s)).toBe(true)
    s = sessionReducer(s, { type: 'PREFETCHING' })
    s = sessionReducer(s, { type: 'MORE', items: mkItems('q', 2) })      // all already dealt
    expect(s.exhausted).toBe(true)
    expect(shouldPrefetch(s)).toBe(false)
    const fresh = sessionReducer(s, { type: 'MORE', items: mkItems('r', 1) })
    expect(fresh.exhausted).toBe(false)
  })
})

describe('QuestionCard respects pause', () => {
  afterEach(() => { vi.useRealTimers() })
  it('freezes the timer while paused and resumes after', () => {
    vi.useFakeTimers()
    const onAnswer = vi.fn()
    const item = mkItems('q', 1)[0]
    const r = render(<QuestionCard item={item} onAnswer={onAnswer} timerMs={1000} paused />)
    r.act(() => { vi.advanceTimersByTime(3000) })
    expect(onAnswer).not.toHaveBeenCalled()
    r.rerender(<QuestionCard item={item} onAnswer={onAnswer} timerMs={1000} paused={false} />)
    r.act(() => { vi.advanceTimersByTime(1300) })
    expect(onAnswer).toHaveBeenCalledWith(null)
    r.unmount()
  })
})

// ── Snakes & Ladders: Bugsy's sixes must not freeze the game ──────────────────
const sItems = mkItems('q', 12)
vi.mock('../../api', () => ({
  startArcadeSession: vi.fn(async (gameId) => ({ data: { session_id: 's1', game_id: gameId, board: 'variables', items: sItems } })),
  moreArcadeQuestions: vi.fn(async () => ({ data: { items: [] } })),
  answerArcadeItem: vi.fn(async (sid, itemId, response) => ({ data: { id: itemId, correct: response === 0, answer: 0, why: 'why', lesson_id: 'lists' } })),
  finishArcadeSession: vi.fn(async (sid, score) => ({ data: { score, xp: 3, xp_capped: false, answered: 1, correct: 1, best: false, reveal: [] } })),
}))
import SnakesGame from '../snakes-ladders/Game.jsx'
import SnakeGame from '../linked-snake/Game.jsx'
import SlingshotGame from '../code-slingshot/Game.jsx'

async function flush(r) { await r.act(async () => { await Promise.resolve(); await Promise.resolve() }) }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : /Gradient$/.test(k) ? () => ({ addColorStop: () => {} }) : () => {}), set: () => true })
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
})
afterEach(() => { vi.useRealTimers() })

describe('Snakes & Ladders with the rival', () => {
  it('returns the turn to the player after Bugsy rolls sixes', async () => {
    const rolls = [2, 6, 6, 4]          // me: 2 (plain square), Bugsy: 6, 6 (extra turns), 4
    const dice = vi.fn(() => rolls.shift() ?? 1)
    const r = render(<MemoryRouter><SnakesGame board="variables" reducedMotion dice={dice} rng={() => 0.99} onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    r.click(r.container.querySelector('button[data-roll]'))
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(8000) })
    await flush(r)
    expect(r.container.querySelector('[data-turn]').getAttribute('data-turn')).toBe('you')
    expect(r.container.querySelector('button[data-roll]').disabled).toBe(false)
    expect(dice).toHaveBeenCalledTimes(4)
    r.unmount()
  })
})

describe('Linked Snake end conditions and accessible choices', () => {
  it('a wrong answer on a one-node snake ends the run with the end screen', async () => {
    const initial = { snake: [{ x: 5, y: 5, value: '▶' }], dir: 'right', nextDir: 'right' }
    const r = render(<MemoryRouter><SnakeGame reducedMotion initial={initial} onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(60) })
    const wrong = r.container.querySelector('button[data-eat="1"]')      // choice 1 is graded wrong by the mock
    expect(wrong).not.toBeNull()
    r.click(wrong)
    await flush(r); await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(200) })
    await flush(r)
    expect(r.container.querySelector('[data-end-screen]')).not.toBeNull()
    r.unmount()
  })
})

describe('Code Slingshot: a wrong pig does not doom the question', () => {
  it('after a wrong hit, hitting the right pig pops it without a second server grade', async () => {
    const r = render(<MemoryRouter><SlingshotGame reducedMotion onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(60) })
    const api = await import('../../api')
    r.click(r.container.querySelector('button[data-hit="1"]'))            // wrong
    await flush(r); await flush(r)
    expect(r.container.textContent).toContain('Combo ×0')
    r.click(r.container.querySelector('button[data-hit="0"]'))            // right, graded locally from the stored answer
    await flush(r); await flush(r)
    expect(api.answerArcadeItem).toHaveBeenCalledTimes(1)
    expect(r.container.textContent).toContain('Combo ×1')
    r.unmount()
  })
})
