import { describe, it, expect, vi } from 'vitest'
import { render } from './render.js'
import Game from '../output-oracle/Game.jsx'

const choiceItem = { id: 'c1', level: 1, topic: 'variables', kind: 'choice', prompt: { code: 'print(7 // 2)' }, choices: ['3', '3.5', '4', '2'] }
const textItem = { id: 't1', level: 3, topic: 'lists', kind: 'text', prompt: { code: 'print([1,2,3][-1])' } }

describe('Output Oracle interaction', () => {
  it('renders four numbered choice buttons and answers with the key 2', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={choiceItem} onAnswer={onAnswer} disabled={false} reducedMotion />)
    const buttons = r.container.querySelectorAll('button[data-choice]')
    expect(buttons.length).toBe(4)
    expect(buttons[1].textContent).toContain('3.5')
    expect(r.container.textContent).toContain('print(7 // 2)')
    r.key('2')
    expect(onAnswer).toHaveBeenCalledWith(1)
    r.unmount()
  })

  it('clicking a choice answers with its index and ignores further clicks when disabled', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={choiceItem} onAnswer={onAnswer} disabled={false} reducedMotion />)
    r.click(r.container.querySelectorAll('button[data-choice]')[2])
    expect(onAnswer).toHaveBeenCalledWith(2)
    r.rerender(<Game item={choiceItem} onAnswer={onAnswer} disabled reducedMotion />)
    r.click(r.container.querySelectorAll('button[data-choice]')[0])
    expect(onAnswer).toHaveBeenCalledTimes(1)
    r.unmount()
  })

  it('text items submit the trimmed textarea value', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={textItem} onAnswer={onAnswer} disabled={false} reducedMotion />)
    const ta = r.container.querySelector('textarea')
    expect(ta).toBeTruthy()
    r.type(ta, '  3 \n')
    r.click(r.container.querySelector('button[type="submit"]'))
    expect(onAnswer).toHaveBeenCalledWith('3')
    r.unmount()
  })

  it('shows a countdown timer and answers null when it expires', () => {
    vi.useFakeTimers()
    const onAnswer = vi.fn()
    const r = render(<Game item={choiceItem} onAnswer={onAnswer} disabled={false} reducedMotion seconds={2} />)
    expect(r.container.querySelector('[role="timer"]').textContent).toMatch(/0:02/)
    r.act(() => { vi.advanceTimersByTime(2100) })
    expect(onAnswer).toHaveBeenCalledWith(null)
    vi.useRealTimers()
    r.unmount()
  })
})
