import { describe, it, expect } from 'vitest'
import { newRound, newQuestion, applyHitResult, onBirdSpent, BIRDS_PER_QUESTION, LIVES } from '../code-slingshot/rules.js'

const item = { id: 'q1', kind: 'choice', prompt: { expr: 'x % 3', context: { x: '7' }, code: 'x = 7\nx % 3' }, choices: ['1', '2', '0', '7'] }
const rng = (() => { let i = 0; return () => ((i += 0.41) % 1) })()

describe('slingshot rules', () => {
  it('a new question builds one tower and pig per choice with distinct labels', () => {
    const s = newQuestion(newRound(), item, rng)
    expect(s.question.id).toBe('q1')
    expect(s.world.pigs.length).toBe(4)
    expect(new Set(s.world.pigs.map((p) => p.label)).size).toBe(4)
    expect(new Set(s.world.pigs.map((p) => p.choiceIndex)).size).toBe(4)
    expect(s.birdsLeft).toBe(BIRDS_PER_QUESTION)
    expect(s.world.pigs.every((p) => p.x > 400)).toBe(true)
  })

  it('a correct pig pops, scores with the first-shot combo, and clears the question', () => {
    let s = newQuestion(newRound(), item, rng)
    const pig = s.world.pigs.find((p) => p.choiceIndex === 0)
    const r = applyHitResult(s, pig.id, true)
    expect(r.events.map((e) => e.type)).toContain('pop')
    expect(r.state.question).toBeNull()
    expect(r.state.score).toBe(100)
    expect(r.state.combo).toBe(1)
    expect(r.state.questionsDone).toBe(1)
    const again = applyHitResult(newQuestion(r.state, { ...item, id: 'q2' }, rng), 'nope', true)
    expect(again.events).toEqual([])
  })

  it('a wrong pig blows a raspberry, locks its tower for one shot and resets the combo', () => {
    let s = { ...newQuestion(newRound(), item, rng), combo: 3 }
    const pig = s.world.pigs.find((p) => p.choiceIndex === 2)
    const r = applyHitResult(s, pig.id, false)
    expect(r.events.map((e) => e.type)).toContain('raspberry')
    expect(r.state.question.id).toBe('q1')
    expect(r.state.locked[pig.id]).toBe(1)
    expect(r.state.combo).toBe(0)
    expect(r.state.world.pigs.find((p) => p.id === pig.id).locked).toBe(true)
  })

  it('spending all birds costs a life and resets the birds; the third life ends the game', () => {
    let s = newQuestion(newRound(), item, rng)
    for (let i = 0; i < BIRDS_PER_QUESTION - 1; i++) s = onBirdSpent(s).state
    const r = onBirdSpent(s)
    expect(r.events.map((e) => e.type)).toContain('out_of_birds')
    expect(r.state.lives).toBe(LIVES - 1)
    expect(r.state.birdsLeft).toBe(BIRDS_PER_QUESTION)
    expect(r.state.question.id).toBe('q1')
    let t = { ...r.state, lives: 1, birdsLeft: 1 }
    const end = onBirdSpent(t)
    expect(end.events.map((e) => e.type)).toContain('game_over')
    expect(end.state.alive).toBe(false)
  })

  it('every fifth question changes the scene', () => {
    let s = { ...newQuestion(newRound(), item, rng), questionsDone: 4 }
    const pig = s.world.pigs.find((p) => p.choiceIndex === 0)
    const r = applyHitResult(s, pig.id, true)
    expect(r.events.map((e) => e.type)).toContain('scene_change')
    expect(r.state.scene).toBe(1)
  })
})
