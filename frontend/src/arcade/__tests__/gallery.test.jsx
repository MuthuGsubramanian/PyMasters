import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '../../games/__tests__/render.js'
import { ArcadeGallery } from '../ArcadeGallery.jsx'

const catalog = {
  stage: { completed: 3, next: { game: 'code_slingshot', needed: 3 } },
  games: [
    { id: 'snakes_ladders', title: 'Snakes & Ladders: Python Quest', blurb: 'Race Bugsy', unlocked: true, milestone: 'Unlocked', pool: 80, needs_content: false, next_lesson: null, best: { best: 120, plays: 2 },
      boards: [{ key: 'lists', title: 'Lists', unlocked: true, pool: 60 }, { key: 'big_o', title: 'Big-O & Sorting', unlocked: false, pool: 0 }] },
    { id: 'linked_snake', title: 'Linked Snake', blurb: 'Your snake is a linked list', unlocked: true, milestone: 'Unlocked', pool: 4, needs_content: true, next_lesson: 'for_loops', best: null },
    { id: 'code_slingshot', title: 'Code Slingshot', blurb: 'Pigs hold the answers', unlocked: false, milestone: 'Complete 3 more lessons to unlock', pool: 0, needs_content: false, next_lesson: 'for_loops', best: null },
  ],
}

function mount(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ArcadeGallery', () => {
  it('renders three cards with lock state, milestone text and play links', () => {
    const r = mount(<ArcadeGallery catalog={catalog} />)
    const cards = r.container.querySelectorAll('[data-arcade-card]')
    expect(cards.length).toBe(3)
    const locked = r.container.querySelector('[data-arcade-card="code_slingshot"]')
    expect(locked.textContent).toContain('Complete 3 more lessons to unlock')
    expect(locked.querySelector('a[href*="/dashboard/play/arcade/code_slingshot"]')).toBeNull()
    const open = r.container.querySelector('[data-arcade-card="snakes_ladders"]')
    expect(open.querySelector('a[href="/dashboard/play/arcade/snakes_ladders?board=lists"]')).not.toBeNull()
    r.unmount()
  })

  it('shows board chips for Snakes & Ladders, locked ones without links', () => {
    const r = mount(<ArcadeGallery catalog={catalog} />)
    const chips = r.container.querySelectorAll('[data-board]')
    expect(chips.length).toBe(2)
    expect(r.container.querySelector('[data-board="lists"]').tagName).toBe('A')
    expect(r.container.querySelector('[data-board="big_o"]').tagName).not.toBe('A')
    r.unmount()
  })

  it('a needs_content card links to the next lesson instead of playing', () => {
    const r = mount(<ArcadeGallery catalog={catalog} />)
    const card = r.container.querySelector('[data-arcade-card="linked_snake"]')
    expect(card.querySelector('a[href="/dashboard/classroom/for_loops"]')).not.toBeNull()
    expect(card.querySelector('a[href*="/dashboard/play/arcade/linked_snake"]')).toBeNull()
    r.unmount()
  })

  it('shows the stage line', () => {
    const r = mount(<ArcadeGallery catalog={catalog} />)
    expect(r.container.textContent).toContain('3 lessons done')
    expect(r.container.textContent).toContain('3 more to unlock Code Slingshot')
    r.unmount()
  })
})
