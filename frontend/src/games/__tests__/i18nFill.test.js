import { describe, it, expect } from 'vitest'
import { fill } from '../engine/i18n.js'

describe('fill', () => {
  it('replaces known placeholders and leaves unknown ones visible', () => {
    expect(fill('Play level {level}', { level: 3 })).toBe('Play level 3')
    expect(fill('{game} — done', { game: 'Golf' })).toBe('Golf — done')
    expect(fill('keep {x}', {})).toBe('keep {x}')
  })
})
