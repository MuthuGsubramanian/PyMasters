import { describe, it, expect } from 'vitest'
import { sessionReducer, initialSession } from '../engine/useGameSession.js'

const round = { round_id: 'r1', game_id: 'output_oracle', mode: 'practice', level: 2, seed: 9,
  items: [{ id: 'a', kind: 'choice' }, { id: 'b', kind: 'text' }] }

describe('sessionReducer', () => {
  it('goes idle → loading → playing when the round loads', () => {
    let s = sessionReducer(initialSession, { type: 'LOAD' })
    expect(s.state).toBe('loading')
    s = sessionReducer(s, { type: 'ROUND_LOADED', round, now: 1000 })
    expect(s.state).toBe('playing')
    expect(s.round.round_id).toBe('r1')
    expect(s.index).toBe(0)
    expect(s.shownAt).toBe(1000)
  })

  it('records the response and elapsed ms, then reveals', () => {
    let s = sessionReducer(sessionReducer(initialSession, { type: 'LOAD' }), { type: 'ROUND_LOADED', round, now: 1000 })
    s = sessionReducer(s, { type: 'ANSWER', itemId: 'a', response: 2, now: 4200 })
    expect(s.state).toBe('revealing')
    expect(s.responses).toEqual({ a: 2 })
    expect(s.itemMs).toEqual({ a: 3200 })
    // a second answer for the same item while revealing is ignored
    const again = sessionReducer(s, { type: 'ANSWER', itemId: 'a', response: 3, now: 5000 })
    expect(again.responses).toEqual({ a: 2 })
  })

  it('NEXT advances until the last item, then moves to finishing', () => {
    let s = sessionReducer(sessionReducer(initialSession, { type: 'LOAD' }), { type: 'ROUND_LOADED', round, now: 0 })
    s = sessionReducer(s, { type: 'ANSWER', itemId: 'a', response: 1, now: 10 })
    s = sessionReducer(s, { type: 'NEXT', now: 20 })
    expect(s.state).toBe('playing')
    expect(s.index).toBe(1)
    expect(s.shownAt).toBe(20)
    s = sessionReducer(s, { type: 'ANSWER', itemId: 'b', response: '3', now: 30 })
    s = sessionReducer(s, { type: 'NEXT', now: 40 })
    expect(s.state).toBe('finishing')
  })

  it('FINISHED stores the server result; ERROR stores the message and keeps the round', () => {
    let s = sessionReducer(sessionReducer(initialSession, { type: 'LOAD' }), { type: 'ROUND_LOADED', round, now: 0 })
    const done = sessionReducer({ ...s, state: 'finishing' }, { type: 'FINISHED', result: { xp: 15 } })
    expect(done.state).toBe('done')
    expect(done.result.xp).toBe(15)
    const err = sessionReducer({ ...s, state: 'finishing' }, { type: 'ERROR', error: 'boom' })
    expect(err.state).toBe('error')
    expect(err.error).toBe('boom')
    expect(err.round.round_id).toBe('r1')
  })
})
