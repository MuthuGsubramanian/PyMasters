import { describe, it, expect } from 'vitest'
import { render } from './render.js'
import { Reveal } from '../engine/Reveal.jsx'

describe('Reveal', () => {
  it('describes a simulation answer in words instead of [object Object]', () => {
    const item = { id: 'quad_a1', kind: 'sim', prompt: {} }
    const response = { hole_id: 'quad_a1', seed: 7, swings: [{ lr: 0.5, steps: 10 }] }
    const r = render(<Reveal item={item} revealItem={{ correct: true, answer: 'sink it', why: 'ok ok ok' }} learnerResponse={response} gameTitle="Gradient Golf" onNext={() => {}} />)
    expect(r.container.textContent).not.toContain('[object Object]')
    expect(r.container.textContent).toContain('1 swing, last at rate 0.50 × 10 steps')
    r.unmount()
  })
  it('describes an Overfit Detective answer as degree and lambda', () => {
    const item = { id: 'gentle_cubic', kind: 'sim', prompt: {} }
    const response = { dataset_id: 'gentle_cubic', seed: 7, degree: 4, lam: 0.01 }
    const r = render(<Reveal item={item} revealItem={{ correct: true, answer: 'x', why: 'why why why' }} learnerResponse={response} gameTitle="Overfit Detective" onNext={() => {}} />)
    expect(r.container.textContent).not.toContain('[object Object]')
    expect(r.container.textContent).toContain('degree 4, λ 0.01')
    r.unmount()
  })

  it('shows the right answer only when the learner was wrong', () => {
    const item = { id: 'c1', kind: 'choice', choices: ['3', '4'], prompt: { code: 'print(1)' } }
    const wrong = render(<Reveal item={item} revealItem={{ correct: false, answer: 0, why: 'because so' }} learnerResponse={1} gameTitle="Output Oracle" onNext={() => {}} />)
    expect(wrong.container.textContent).toContain('Answer')
    expect(wrong.container.textContent).toContain('3')
    wrong.unmount()
    const right = render(<Reveal item={item} revealItem={{ correct: true, answer: 0, why: 'because so' }} learnerResponse={0} gameTitle="Output Oracle" onNext={() => {}} />)
    expect(right.container.textContent).not.toContain('Answer')
    right.unmount()
  })
})
