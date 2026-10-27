import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessionReducer, initialArcadeSession, shouldPrefetch } from '../engine/useArcadeSession.js'

const items = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, kind: 'choice', topic: 'lists', choices: ['a', 'b', 'c', 'd'] }))

describe('arcade session reducer', () => {
  it('loads a session and deals items in order', () => {
    let s = sessionReducer(initialArcadeSession, { type: 'LOAD' })
    expect(s.state).toBe('loading')
    s = sessionReducer(s, { type: 'STARTED', session: { session_id: 's1', game_id: 'linked_snake', items: items('q', 3) } })
    expect(s.state).toBe('ready')
    expect(s.sessionId).toBe('s1')
    expect(s.queue.length).toBe(3)
    s = sessionReducer(s, { type: 'TAKE' })
    expect(s.current.id).toBe('q0')
    expect(s.queue.length).toBe(2)
  })

  it('appends prefetched items without repeating ids', () => {
    let s = sessionReducer(sessionReducer(initialArcadeSession, { type: 'LOAD' }), { type: 'STARTED', session: { session_id: 's1', game_id: 'x', items: items('q', 2) } })
    s = sessionReducer(s, { type: 'MORE', items: [...items('q', 2), ...items('r', 2)] })
    expect(s.queue.map((i) => i.id)).toEqual(['q0', 'q1', 'r0', 'r1'])
  })

  it('records reveals, counts correct answers, and finishes once', () => {
    let s = sessionReducer(sessionReducer(initialArcadeSession, { type: 'LOAD' }), { type: 'STARTED', session: { session_id: 's1', game_id: 'x', items: items('q', 2) } })
    s = sessionReducer(s, { type: 'TAKE' })
    s = sessionReducer(s, { type: 'REVEALED', itemId: 'q0', reveal: { correct: true, why: 'w' } })
    expect(s.answered).toBe(1)
    expect(s.correct).toBe(1)
    s = sessionReducer(s, { type: 'FINISHING' })
    expect(s.state).toBe('finishing')
    s = sessionReducer(s, { type: 'FINISHED', result: { xp: 12 } })
    expect(s.state).toBe('done')
    expect(s.result.xp).toBe(12)
  })

  it('prefetches when five or fewer items remain and none is in flight', () => {
    expect(shouldPrefetch({ queue: items('q', 5), prefetching: false, state: 'ready' })).toBe(true)
    expect(shouldPrefetch({ queue: items('q', 6), prefetching: false, state: 'ready' })).toBe(false)
    expect(shouldPrefetch({ queue: items('q', 2), prefetching: true, state: 'ready' })).toBe(false)
    expect(shouldPrefetch({ queue: items('q', 2), prefetching: false, state: 'done' })).toBe(false)
  })

  it('error state keeps the session id so finish can be retried', () => {
    let s = sessionReducer(sessionReducer(initialArcadeSession, { type: 'LOAD' }), { type: 'STARTED', session: { session_id: 's1', game_id: 'x', items: items('q', 1) } })
    s = sessionReducer(s, { type: 'ERROR', error: 'boom' })
    expect(s.state).toBe('error')
    expect(s.sessionId).toBe('s1')
  })
})

describe('api helpers exist', () => {
  beforeEach(() => { vi.resetModules() })
  it('exports the five arcade calls', async () => {
    const api = await import('../../api.js')
    for (const name of ['getArcadeCatalog', 'startArcadeSession', 'moreArcadeQuestions', 'answerArcadeItem', 'finishArcadeSession']) {
      expect(typeof api[name]).toBe('function')
    }
  })
})
