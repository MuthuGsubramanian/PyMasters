import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '../../games/__tests__/render.js'
import { QuestionCard } from '../engine/QuestionCard.jsx'

const choice = { id: 'q1', kind: 'choice', topic: 'lists', prompt: { code: 'print([1, 2][-1])' }, choices: ['1', '2', '[2]', 'Error'] }
const bin = { id: 'q2', kind: 'bin', topic: 'ds_sets', prompt: { text: 'Unique tags on a post' }, choices: ['list', 'tuple', 'set', 'dict'] }
const ltc = { id: 'q3', kind: 'line_then_choice', topic: 'lists', prompt: { code: 'a = [1]\nb = a.append(2)\nprint(b)', test: 'assert b == [1, 2]' }, choices: ['b = a + [2]', 'b = a', 'a.append(2); b = a'] }

afterEach(() => { vi.useRealTimers() })

describe('QuestionCard', () => {
  it('renders the code and one button per choice; clicking answers with the index', () => {
    const onAnswer = vi.fn()
    const r = render(<QuestionCard item={choice} onAnswer={onAnswer} timerMs={0} />)
    expect(r.container.textContent).toContain('print([1, 2][-1])')
    const buttons = r.container.querySelectorAll('button[data-choice]')
    expect(buttons.length).toBe(4)
    r.click(buttons[2])
    expect(onAnswer).toHaveBeenCalledWith(2)
    r.unmount()
  })

  it('number keys answer; a second answer is ignored', () => {
    const onAnswer = vi.fn()
    const r = render(<QuestionCard item={choice} onAnswer={onAnswer} timerMs={0} />)
    r.key('2')
    r.key('3')
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith(1)
    r.unmount()
  })

  it('bin items answer with the label', () => {
    const onAnswer = vi.fn()
    const r = render(<QuestionCard item={bin} onAnswer={onAnswer} timerMs={0} />)
    r.click(r.container.querySelector('button[data-choice="2"]'))
    expect(onAnswer).toHaveBeenCalledWith('set')
    r.unmount()
  })

  it('line_then_choice asks for the line, then the fix', () => {
    const onAnswer = vi.fn()
    const r = render(<QuestionCard item={ltc} onAnswer={onAnswer} timerMs={0} />)
    const lines = r.container.querySelectorAll('button[data-line]')
    expect(lines.length).toBe(3)
    r.click(lines[1])
    expect(onAnswer).not.toHaveBeenCalled()
    const fixes = r.container.querySelectorAll('button[data-choice]')
    expect(fixes.length).toBe(3)
    r.click(fixes[0])
    expect(onAnswer).toHaveBeenCalledWith([1, 0])
    r.unmount()
  })

  it('expiry answers null and shows a timer bar', () => {
    vi.useFakeTimers()
    const onAnswer = vi.fn()
    const r = render(<QuestionCard item={choice} onAnswer={onAnswer} timerMs={2000} />)
    expect(r.container.querySelector('[data-timer]')).not.toBeNull()
    r.act(() => { vi.advanceTimersByTime(2100) })
    expect(onAnswer).toHaveBeenCalledWith(null)
    r.unmount()
  })

  it('disabled blocks answers', () => {
    const onAnswer = vi.fn()
    const r = render(<QuestionCard item={choice} onAnswer={onAnswer} timerMs={0} disabled />)
    r.click(r.container.querySelector('button[data-choice="0"]'))
    expect(onAnswer).not.toHaveBeenCalled()
    r.unmount()
  })
})
