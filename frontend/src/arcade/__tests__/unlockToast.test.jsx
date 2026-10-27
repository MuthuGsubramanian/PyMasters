import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'
import { UnlockToast } from '../UnlockToast.jsx'
import { labelForKey } from '../unlocks.js'

afterEach(() => { vi.useRealTimers() })

describe('labelForKey', () => {
  it('names games and boards', () => {
    expect(labelForKey('game:linked_snake')).toEqual({ kind: 'game', title: 'Linked Snake' })
    expect(labelForKey('board:lists')).toEqual({ kind: 'board', title: 'Lists' })
    expect(labelForKey('board:big_o')).toEqual({ kind: 'board', title: 'Big-O & Sorting' })
  })
})

describe('UnlockToast', () => {
  it('appears on the unlock event with the game name and a link, then hides', () => {
    vi.useFakeTimers()
    const r = render(<MemoryRouter><UnlockToast /></MemoryRouter>)
    expect(r.container.querySelector('[data-unlock-toast]')).toBeNull()
    r.act(() => { window.dispatchEvent(new CustomEvent('pm:arcade-unlocked', { detail: ['game:linked_snake'] })) })
    const toast = r.container.querySelector('[data-unlock-toast]')
    expect(toast).not.toBeNull()
    expect(toast.textContent).toContain('New game unlocked')
    expect(toast.textContent).toContain('Linked Snake')
    expect(toast.querySelector('a[href="/dashboard/play#arcade"]')).not.toBeNull()
    r.act(() => { vi.advanceTimersByTime(6500) })
    expect(r.container.querySelector('[data-unlock-toast]')).toBeNull()
    r.unmount()
  })

  it('lists several unlocks together and can be dismissed', () => {
    const r = render(<MemoryRouter><UnlockToast /></MemoryRouter>)
    r.act(() => { window.dispatchEvent(new CustomEvent('pm:arcade-unlocked', { detail: ['game:snakes_ladders', 'board:lists'] })) })
    const toast = r.container.querySelector('[data-unlock-toast]')
    expect(toast.textContent).toContain('Snakes & Ladders')
    expect(toast.textContent).toContain('Lists')
    r.click(toast.querySelector('button[data-dismiss]'))
    expect(r.container.querySelector('[data-unlock-toast]')).toBeNull()
    r.unmount()
  })
})
