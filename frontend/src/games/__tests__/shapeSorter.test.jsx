import { describe, it, expect, vi } from 'vitest'
import { render } from './render.js'
import Game from '../shape-sorter/Game.jsx'

const item = { id: 's1', level: 1, topic: 'ds_sets', kind: 'bin', prompt: { text: 'Unique tags on a post' }, choices: ['list', 'tuple', 'set', 'dict'] }

describe('Shape Sorter interaction', () => {
  it('shows the requirement card and one bin button per choice; clicking answers with the label', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={item} onAnswer={onAnswer} disabled={false} reducedMotion />)
    expect(r.container.textContent).toContain('Unique tags on a post')
    const bins = r.container.querySelectorAll('button[data-bin]')
    expect(bins.length).toBe(4)
    r.click(bins[2])
    expect(onAnswer).toHaveBeenCalledWith('set')
    r.unmount()
  })

  it('arrow keys move between bins and Enter drops the card; digits also work', () => {
    const onAnswer = vi.fn()
    const r = render(<Game item={item} onAnswer={onAnswer} disabled={false} reducedMotion />)
    r.key('ArrowRight'); r.key('ArrowRight'); r.key('ArrowRight'); r.key('Enter')
    expect(onAnswer).toHaveBeenCalledWith('dict')
    r.unmount()
    const onAnswer2 = vi.fn()
    const r2 = render(<Game item={item} onAnswer={onAnswer2} disabled={false} reducedMotion />)
    r2.key('1')
    expect(onAnswer2).toHaveBeenCalledWith('list')
    r2.unmount()
  })
})
