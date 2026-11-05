import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { act } from 'react'
import { render } from '../games/__tests__/render.js'
import TopicUnderTheHood from '../components/animations/TopicUnderTheHood'
import { PrimitiveView } from '../components/animations/AnimationRenderer'

const BODY = (n) => `Body of step ${n}: Python keeps the \`list\` object in memory and the name points to it.`

const CONTENT = {
  summary: { en: 'Names point to objects; objects live in memory.', ta: 'பெயர்கள் பொருட்களைச் சுட்டுகின்றன.' },
  steps: [
    {
      title: { en: 'Objects', ta: 'பொருட்கள்' },
      body: BODY(1),
      visual: { type: 'TerminalOutput', props: { title: 'In the REPL', lines: ['>>> a is b', 'True'] } },
    },
    { title: 'Names', body: { en: BODY(2) } },
    {
      title: 'is vs ==',
      body: BODY(3),
      visual: { type: 'ConceptMap', props: { nodes: [{ label: 'object', children: ['identity', 'type', 'value'] }] } },
    },
    { title: 'Refcounts', body: BODY(4) },
  ],
  takeaway: { en: 'Names are labels, not boxes.', ta: 'பெயர்கள் லேபிள்கள், பெட்டிகள் அல்ல.' },
}

const q = (sel) => document.querySelector(sel)
const btn = (name) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name)
const title = () => q('[data-uth-topic="title"]').textContent
const counter = () => q('[data-uth-topic="counter"]').textContent

let saved
beforeAll(() => {
  saved = window.matchMedia
  window.matchMedia = (query) => ({
    matches: false, media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  })
})
afterAll(() => { window.matchMedia = saved })
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers() })

describe('TopicUnderTheHood', () => {
  it('shows the summary, then the first step with its visual and caption', () => {
    localStorage.setItem('pm_reduce_motion', '1')       // the terminal shows its lines at once
    const r = render(<TopicUnderTheHood content={CONTENT} language="en" />)
    localStorage.removeItem('pm_reduce_motion')
    expect(q('section[aria-label="How it works"]')).toBeTruthy()
    expect(q('[data-uth-topic="summary"]').textContent).toBe('Names point to objects; objects live in memory.')
    expect(title()).toBe('Objects')
    expect(counter()).toBe('Step 1 of 4')
    expect(q('[data-uth-topic="body"] code').textContent).toBe('list')
    const visual = q('[data-uth-topic="visual"]')
    expect(visual.textContent).toContain('In the REPL')
    expect(visual.textContent).toContain('>>> a is b')
    expect(q('[data-uth-topic="takeaway"]')).toBeFalsy()
    r.unmount()
  })

  it('steps with Next and Back; the takeaway appears only on the last step', () => {
    const r = render(<TopicUnderTheHood content={CONTENT} language="en" />)
    expect(btn('Back').disabled).toBe(true)
    r.click(btn('Next'))
    expect(title()).toBe('Names')
    expect(counter()).toBe('Step 2 of 4')
    expect(q('[data-uth-topic="visual"]')).toBeFalsy()
    r.click(btn('Next'))
    r.click(btn('Next'))
    expect(title()).toBe('Refcounts')
    expect(btn('Next').disabled).toBe(true)
    expect(q('[data-uth-topic="takeaway"]').textContent).toContain('Names are labels, not boxes.')
    r.click(btn('Back'))
    expect(title()).toBe('is vs ==')
    expect(q('[data-uth-topic="takeaway"]')).toBeFalsy()
    r.unmount()
  })

  it('steps with the arrow keys', () => {
    const r = render(<TopicUnderTheHood content={CONTENT} language="en" />)
    const stepper = q('[data-uth-topic="stepper"]')
    r.key('ArrowRight', stepper)
    r.key('ArrowRight', stepper)
    expect(title()).toBe('is vs ==')
    r.key('ArrowLeft', stepper)
    expect(title()).toBe('Names')
    r.unmount()
  })

  it('never autoplays', () => {
    vi.useFakeTimers()
    const r = render(<TopicUnderTheHood content={CONTENT} language="en" />)
    act(() => { vi.advanceTimersByTime(60000) })
    expect(counter()).toBe('Step 1 of 4')
    r.unmount()
  })

  it('uses Tamil where given and falls back to English', () => {
    const r = render(<TopicUnderTheHood content={CONTENT} language="ta" />)
    expect(q('[data-uth-topic="summary"]').textContent).toBe('பெயர்கள் பொருட்களைச் சுட்டுகின்றன.')
    expect(title()).toBe('பொருட்கள்')
    expect(q('[data-uth-topic="body"]').textContent).toBe(BODY(1).replace(/`/g, ''))
    const next = [...document.querySelectorAll('[data-uth-topic="stepper"] button')].at(-1)
    r.click(next)
    expect(title()).toBe('Names')                       // plain string
    expect(q('[data-uth-topic="body"]').textContent).toContain('Body of step 2')   // {en} only
    expect(q('section').getAttribute('aria-label')).not.toBe('How it works')
    r.unmount()
  })

  it('has 44 px controls, no text under 12 px, and visuals scroll inside their box', () => {
    const r = render(<TopicUnderTheHood content={CONTENT} language="en" />)
    for (const name of ['Back', 'Next']) {
      expect(btn(name).className).toMatch(/\bmin-h-\[44px\]/)
      expect(btn(name).className).toMatch(/\bmin-w-\[44px\]/)
    }
    expect(q('section').outerHTML).not.toMatch(/text-\[(\d|10|11)px\]/)
    // The explainer's own chrome (the primitives keep their existing look).
    const chrome = q('section').cloneNode(true)
    chrome.querySelector('[data-uth-topic="visual"]').remove()
    expect(chrome.outerHTML).not.toMatch(/gradient/)
    expect(q('[data-uth-topic="visual"]').className).toMatch(/overflow-x-auto/)
    expect(q('[data-uth-topic="visual"]').className).toMatch(/min-w-0/)
    r.unmount()
  })

  it('renders nothing broken for empty content', () => {
    const r = render(<TopicUnderTheHood content={{ summary: 'x', steps: [], takeaway: 'y' }} language="en" />)
    expect(q('[data-uth-topic="summary"]').textContent).toBe('x')
    expect(q('[data-uth-topic="stepper"]')).toBeFalsy()
    r.unmount()
  })
})

describe('PrimitiveView', () => {
  it('draws one primitive with its caption', () => {
    localStorage.setItem('pm_reduce_motion', '1')
    const r = render(<PrimitiveView type="TerminalOutput" props={{ lines: ['hello'], title: 'T', description: { en: 'D', ta: 'த' } }} language="ta" />)
    localStorage.removeItem('pm_reduce_motion')
    expect(r.container.textContent).toContain('hello')
    expect(r.container.textContent).toContain('T')
    expect(r.container.textContent).toContain('த')
    r.unmount()
  })

  it('renders nothing for an unknown type', () => {
    const r = render(<PrimitiveView type="Nope" props={{}} language="en" />)
    expect(r.container.innerHTML).toBe('')
    r.unmount()
  })
})
