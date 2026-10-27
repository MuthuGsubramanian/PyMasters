import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render } from './render.js'
import Game from '../overfit-detective/Game.jsx'
import { datasetById } from '../overfit-detective/levels.js'

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (_t, p) => (p === 'measureText' ? () => ({ width: 0 }) : () => {}), set: () => true })
})

const item = { id: 'gentle_cubic', level: 1, topic: 'linear_regression', kind: 'sim', seed: 7, dataset: datasetById('gentle_cubic') }

describe('Overfit Detective game', () => {
  it('lets the learner pick a degree, commit, and answers with {dataset_id, seed, degree, lam}', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={item} onAnswer={onAnswer} disabled={false} reducedMotion />)
    expect(r.container.textContent).toContain('test points hidden')
    r.type(r.container.querySelector('input[name="degree"]'), '5')
    const commit = [...r.container.querySelectorAll('button')].find((b) => /commit/i.test(b.textContent))
    r.click(commit)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer.mock.calls[0][0]).toEqual({ dataset_id: 'gentle_cubic', seed: 7, degree: 5, lam: 0 })
    expect(r.container.textContent).toMatch(/Test error/)
    r.unmount()
  })

  it('shows the λ slider only when the dataset allows regularisation', () => {
    const r = render(<Game item={item} onAnswer={() => {}} disabled={false} reducedMotion />)
    expect(r.container.querySelector('input[name="lam"]')).toBeNull()
    r.unmount()
    const q = { ...item, id: 'quintic', dataset: datasetById('quintic') }
    const r2 = render(<Game item={q} onAnswer={() => {}} disabled={false} reducedMotion />)
    expect(r2.container.querySelector('input[name="lam"]')).toBeTruthy()
    r2.unmount()
  })
})
