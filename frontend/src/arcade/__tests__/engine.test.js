import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStepper } from '../engine/useGameLoop.js'
import { keyToAction, swipeToDir } from '../engine/useInput.js'
import { createPool, burst, step as stepParticles, draw as drawParticles } from '../engine/particles.js'
import { isSoundOn, setSoundOn, play } from '../engine/sfx.js'

describe('createStepper (fixed timestep)', () => {
  it('runs one update per 1000/60 ms and reports the count', () => {
    const update = vi.fn()
    const s = createStepper(update)
    s.resume(0)
    expect(s.step(50)).toBe(3)
    expect(s.step(100)).toBe(3)
    expect(update).toHaveBeenCalledTimes(6)
    expect(update.mock.calls[0][0]).toBeCloseTo(1000 / 60, 3)
  })

  it('never runs more than 5 catch-up steps after a long gap (hidden tab)', () => {
    const update = vi.fn()
    const s = createStepper(update)
    s.resume(0)
    expect(s.step(5000)).toBe(5)
    expect(update).toHaveBeenCalledTimes(5)
  })

  it('pause drops the accumulator; resume restarts cleanly', () => {
    const update = vi.fn()
    const s = createStepper(update)
    s.resume(0)
    s.step(10)
    s.pause()
    expect(s.step(3000)).toBe(0)
    s.resume(3000)
    expect(s.step(3017)).toBe(1)
  })
})

describe('input mapping', () => {
  it('maps keys to actions', () => {
    expect(keyToAction('ArrowUp')).toBe('up')
    expect(keyToAction('w')).toBe('up')
    expect(keyToAction('ArrowDown')).toBe('down')
    expect(keyToAction('ArrowLeft')).toBe('left')
    expect(keyToAction('d')).toBe('right')
    expect(keyToAction(' ')).toBe('jump')
    expect(keyToAction('Enter')).toBe('tap')
    expect(keyToAction('x')).toBeNull()
  })
  it('turns a swipe into a direction once it is long enough', () => {
    expect(swipeToDir(40, 5)).toBe('right')
    expect(swipeToDir(-40, 5)).toBe('left')
    expect(swipeToDir(3, 50)).toBe('down')
    expect(swipeToDir(3, -50)).toBe('up')
    expect(swipeToDir(10, 10)).toBeNull()
  })
})

describe('particles', () => {
  it('bursts, ages out and draws without throwing', () => {
    const pool = createPool(50)
    burst(pool, 10, 10, { count: 20, color: '#fff', speed: 100 })
    expect(pool.alive).toBe(20)
    for (let i = 0; i < 200; i++) stepParticles(pool, 16)
    expect(pool.alive).toBe(0)
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillStyle: '', globalAlpha: 1 }
    burst(pool, 0, 0, { count: 3 })
    drawParticles(pool, ctx)
    expect(ctx.arc).toHaveBeenCalledTimes(3)
  })
  it('never exceeds the pool size', () => {
    const pool = createPool(8)
    burst(pool, 0, 0, { count: 100 })
    expect(pool.alive).toBe(8)
  })
})

describe('sfx', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* ignore */ } })
  it('defaults to on and persists the toggle', () => {
    expect(isSoundOn()).toBe(true)
    setSoundOn(false)
    expect(isSoundOn()).toBe(false)
    expect(localStorage.getItem('pm_arcade_sound')).toBe('0')
  })
  it('is silent (no throw) without AudioContext', () => {
    const saved = globalThis.AudioContext
    globalThis.AudioContext = undefined
    globalThis.webkitAudioContext = undefined
    expect(() => play('dice')).not.toThrow()
    expect(() => play('nonexistent')).not.toThrow()
    globalThis.AudioContext = saved
  })
})
