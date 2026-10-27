import { describe, it, expect, vi } from 'vitest'
import { render } from './render.js'
import Game from '../bug-hunt/Game.jsx'

const item = {
  id: 'b1', level: 1, topic: 'conditionals', kind: 'line_then_choice',
  prompt: { code: 'def label(n):\n    if n = 0:\n        return "match"\n    return "other"', test: 'assert label(0) == "match"' },
  choices: ['    if n == 0:', '    if n == "0":', '    if not n == 0:'],
}

describe('Bug Hunt interaction', () => {
  it('first picks the guilty line, then one of three fixes, and answers [line, choice]', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={item} onAnswer={onAnswer} disabled={false} reducedMotion />)
    const lines = r.container.querySelectorAll('[data-line]')
    expect(lines.length).toBe(4)
    expect(r.container.querySelectorAll('[data-fix]').length).toBe(0)       // fixes hidden until a line is chosen
    r.click(lines[1])
    const fixes = r.container.querySelectorAll('[data-fix]')
    expect(fixes.length).toBe(3)
    r.click(fixes[0])
    expect(onAnswer).toHaveBeenCalledWith([1, 0])
    r.unmount()
  })

  it('supports keyboard: arrows move the line cursor, Enter selects, digits pick the fix', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={item} onAnswer={onAnswer} disabled={false} reducedMotion />)
    r.key('ArrowDown'); r.key('ArrowDown'); r.key('Enter')
    expect(r.container.querySelectorAll('[data-fix]').length).toBe(3)
    r.key('3')
    expect(onAnswer).toHaveBeenCalledWith([2, 2])
    r.unmount()
  })

  it('shows the failing test so the learner knows what "fixed" means', () => {
    const r = render(<Game item={item} onAnswer={() => {}} disabled={false} reducedMotion />)
    expect(r.container.textContent).toContain('assert label(0) == "match"')
    r.unmount()
  })
})
