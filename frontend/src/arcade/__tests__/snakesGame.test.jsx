import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'
import { BOARD_LAYOUTS } from '../snakes-ladders/board.js'

const items = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, kind: 'choice', topic: 'variables', prompt: { code: `print(${i})` }, choices: ['a', 'b', 'c', 'd'] }))

vi.mock('../../api', () => ({
  startArcadeSession: vi.fn(async () => ({ data: { session_id: 's1', game_id: 'snakes_ladders', board: 'variables', items } })),
  moreArcadeQuestions: vi.fn(async () => ({ data: { items: [] } })),
  answerArcadeItem: vi.fn(async (sid, itemId, response) => ({ data: { id: itemId, correct: response === 1, answer: 1, why: 'because', lesson_id: 'variables_intro' } })),
  finishArcadeSession: vi.fn(async (sid, score) => ({ data: { score, xp: 10, xp_capped: false, answered: 1, correct: 1, best: true, reveal: [] } })),
}))

import Game from '../snakes-ladders/Game.jsx'

const ladderFoot = Number(Object.keys(BOARD_LAYOUTS.variables.ladders)[0])
const ladderHead = BOARD_LAYOUTS.variables.ladders[ladderFoot]

async function flush(r) { await r.act(async () => { await Promise.resolve(); await Promise.resolve() }) }

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => { vi.useRealTimers() })

describe('Snakes & Ladders game', () => {
  it('starts a session, rolls onto a ladder, asks a question, climbs on a correct answer', async () => {
    const dice = vi.fn(() => ladderFoot)   // first roll lands exactly on the first ladder's foot
    const r = render(<MemoryRouter><Game gameId="snakes_ladders" board="variables" reducedMotion dice={dice} rival={false} onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    const roll = r.container.querySelector('button[data-roll]')
    expect(roll).not.toBeNull()
    r.click(roll)
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(3000) })
    expect(r.container.querySelector('[data-token="you"]').getAttribute('data-pos')).toBe(String(ladderFoot))
    const card = r.container.querySelector('[data-question-card]')
    expect(card).not.toBeNull()
    r.click(card.querySelector('button[data-choice="1"]'))
    await flush(r)
    await flush(r)
    expect(r.container.textContent).toContain('because')
    expect(r.container.querySelector('[data-token="you"]').getAttribute('data-pos')).toBe(String(ladderHead))
    await r.act(async () => { vi.advanceTimersByTime(3000) })
    expect(r.container.querySelector('[data-question-card]')).toBeNull()
    r.unmount()
  })

  it('shows the end screen with XP when a player reaches 100', async () => {
    const dice = vi.fn(() => 5)
    const r = render(<MemoryRouter><Game gameId="snakes_ladders" board="variables" reducedMotion dice={dice} rival={false} startPos={97} onQuit={() => {}} /></MemoryRouter>)
    await flush(r)
    r.click(r.container.querySelector('button[data-roll]'))
    await flush(r)
    await r.act(async () => { vi.advanceTimersByTime(20000) })
    await flush(r)
    expect(r.container.querySelector('[data-end-screen]')).not.toBeNull()
    expect(r.container.textContent).toContain('10')
    r.unmount()
  })
})
