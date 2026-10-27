import { describe, it, expect, vi } from 'vitest'
import { render } from './render.js'
import Game from '../big-o-sprint/Game.jsx'

const LABELS = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)']
const item = { id: 'b1', level: 1, topic: 'big_o_complexity', kind: 'choice', prompt: { code: 'def total(nums):\n    s = 0\n    for x in nums:\n        s += x\n    return s' }, choices: LABELS }

describe('Big-O Sprint', () => {
  it('offers the six classes and answers with the index via key 3', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={item} onAnswer={onAnswer} disabled={false} reducedMotion />)
    expect(r.container.querySelectorAll('button[data-choice]').length).toBe(6)
    r.key('3')
    expect(onAnswer).toHaveBeenCalledWith(2)
    r.unmount()
  })

  it('shows the measured count race only once the reveal arrives', () => {
    const r = render(<Game item={item} onAnswer={() => {}} disabled reducedMotion />)
    expect(r.container.querySelector('figure')).toBeNull()
    r.rerender(<Game item={item} onAnswer={() => {}} disabled reducedMotion reveal={{ correct: true, counts: { 10: 30, 100: 300, 1000: 3000 } }} />)
    const fig = r.container.querySelector('figure')
    expect(fig).toBeTruthy()
    expect(fig.textContent).toContain('3,000')
    r.unmount()
  })
})
