import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest'
import { act } from 'react'
import { render } from '../games/__tests__/render.js'
import ALIAS from './fixtures/heapTraceAlias.json'

vi.mock('../api', () => ({
  default: { post: vi.fn(), get: vi.fn() },
  getAuthHeaders: vi.fn(() => ({})),
  requestModule: vi.fn(),
  getCompletions: vi.fn(),
  recordSignal: vi.fn(),
  sendVaathiyaarFeedback: vi.fn(),
  getPodcastManifest: vi.fn(),
  generateExplain: vi.fn(),
  API_URL: '/api',
}))
vi.mock('../components/PythonEditor', () => ({ default: () => <div data-testid="editor" /> }))
import api from '../api'
import { IntroPhase, PracticePhase } from '../pages/Classroom'
import TraceViewer from '../components/TraceViewer'

// Lesson heap trace as GET /classroom/lesson/{id}/under-the-hood returns it: the trace plus `code`.
const ALIAS_CODE = 'a = [1, 2]\nb = a\nb.append(3)\nprint(a)\n'
const LESSON_UTH = { ...ALIAS, code: ALIAS_CODE }
const STEPS_TRACE = {
  steps: [
    { line: 1, event: 'line', func: '<module>', depth: 0, vars: {}, out: 0 },
    { line: 2, event: 'line', func: '<module>', depth: 0, vars: { x: '1' }, out: 0 },
  ],
  stdout: '',
  error: null,
}

const flush = () => act(async () => { for (let k = 0; k < 5; k++) await Promise.resolve() })
const buttons = (root) => [...root.querySelectorAll('button')]
const byText = (root, txt) => buttons(root).find((b) => b.textContent.includes(txt))
const uthButton = (root) => byText(root, 'Under the hood')
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail: 'nope' } } })

const LESSON = {
  id: 'lists_alias',
  title: 'Lists',
  story_variants: { en: 'A story without section headings.' },
  animation_sequence: [{ type: 'VariableBox', variable: 'a', value: '[1, 2]', data_type: 'list' }],
}

let saved
beforeAll(() => {
  saved = window.matchMedia
  window.matchMedia = (query) => ({
    matches: false, media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  })
  localStorage.setItem('pm_reduce_motion', '1')
})
afterAll(() => { window.matchMedia = saved; localStorage.removeItem('pm_reduce_motion') })
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); document.body.innerHTML = '' })
afterEach(() => { document.body.innerHTML = '' })

describe('Lesson intro: Under the hood', () => {
  it('shows an "Under the hood" button next to "Watch It Run" when the lesson has a heap trace', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    await flush()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/classroom/lesson/lists_alias/under-the-hood')
    expect(byText(r.container, 'Watch It Run')).toBeTruthy()
    const btn = uthButton(r.container)
    expect(btn).toBeTruthy()
    expect(btn).not.toBe(byText(r.container, 'Watch It Run'))
    expect(btn.className).toMatch(/min-h-\[44px\]/)
    r.unmount()
  })

  it('does not block the page: the lesson renders before the trace arrives', async () => {
    let resolve
    api.get.mockReturnValue(new Promise((res) => { resolve = res }))
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    expect(byText(r.container, 'Start Practice')).toBeTruthy()
    expect(uthButton(r.container)).toBeFalsy()
    await act(async () => { resolve({ data: LESSON_UTH }) })
    await flush()
    expect(uthButton(r.container)).toBeTruthy()
    r.unmount()
  })

  it.each([404, 403, 429])('hides the button when the API answers %i', async (status) => {
    api.get.mockRejectedValue(httpError(status))
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    await flush()
    expect(uthButton(r.container)).toBeFalsy()
    expect(byText(r.container, 'Start Practice')).toBeTruthy()
    r.unmount()
  })

  it('fetches once per lesson, even across re-renders', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    await flush()
    r.rerender(<IntroPhase lesson={{ ...LESSON }} language="en" onComplete={() => {}} />)
    await flush()
    expect(api.get).toHaveBeenCalledTimes(1)
    api.get.mockRejectedValue(httpError(404))
    r.rerender(<IntroPhase lesson={{ ...LESSON, id: 'other' }} language="en" onComplete={() => {}} />)
    await flush()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenLastCalledWith('/classroom/lesson/other/under-the-hood')
    // The previous lesson's trace is not shown for the new lesson.
    expect(uthButton(r.container)).toBeFalsy()
    r.unmount()
  })

  it('shows the button even for a lesson without Watch It Run visuals', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={{ ...LESSON, animation_sequence: [] }} language="en" onComplete={() => {}} />)
    await flush()
    expect(byText(r.container, 'Watch It Run')).toBeFalsy()
    expect(uthButton(r.container)).toBeTruthy()
    r.unmount()
  })

  it('opens a dark popup with the Under the hood view; Escape closes it and focus returns to the button', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    await flush()
    const btn = uthButton(r.container)
    btn.focus()
    r.click(btn)
    const dlg = document.querySelector('[role="dialog"][aria-label="Under the hood"]')
    expect(dlg).toBeTruthy()
    expect(dlg.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    // The UnderTheHood view, with the lesson's code and its step controls.
    expect(dlg.querySelector('section[aria-label="Under the hood"]')).toBeTruthy()
    expect(dlg.querySelector('[data-uth="code"]').textContent).toContain('b.append(3)')
    expect(dlg.querySelector('[aria-label="Next step"]')).toBeTruthy()
    // The popup scrolls inside itself, not the page.
    expect(dlg.innerHTML).toMatch(/overflow-y-auto/)
    expect(dlg.className).toMatch(/max-h-/)
    expect(dlg.innerHTML).not.toMatch(/text-\[(9|10|11)px\]/)
    r.key('Escape')
    await flush()
    expect(document.querySelector('[role="dialog"][aria-label="Under the hood"]')).toBeFalsy()
    expect(document.activeElement).toBe(uthButton(r.container))
    r.unmount()
  })

  it('the close button closes the popup and returns focus to the button', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    await flush()
    r.click(uthButton(r.container))
    const dlg = document.querySelector('[role="dialog"][aria-label="Under the hood"]')
    const close = dlg.querySelector('button[aria-label="Close"]')
    expect(close).toBeTruthy()
    expect(close.className).toMatch(/min-h-\[44px\]|h-11/)
    r.click(close)
    await flush()
    expect(document.querySelector('[role="dialog"][aria-label="Under the hood"]')).toBeFalsy()
    expect(document.activeElement).toBe(uthButton(r.container))
    r.unmount()
  })

  it('uses the learner language for the view (Tamil title)', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="ta" onComplete={() => {}} />)
    await flush()
    const btn = uthButton(r.container) || byText(r.container, 'உள்ளே என்ன நடக்கிறது')
    expect(btn).toBeTruthy()
    r.click(btn)
    expect(document.querySelector('section[aria-label="உள்ளே என்ன நடக்கிறது"]')).toBeTruthy()
    r.unmount()
  })
})

describe('TraceViewer: Steps | Under the hood tabs', () => {
  const tabs = () => [...document.querySelectorAll('[role="tab"]')]
  const tab = (name) => tabs().find((t) => t.textContent.includes(name))

  it('has the two tabs, Steps selected, and does not fetch the heap trace until the tab opens', async () => {
    const loadHeap = vi.fn().mockResolvedValue(ALIAS)
    const r = render(<TraceViewer code={ALIAS_CODE} trace={STEPS_TRACE} onClose={() => {}} loadHeap={loadHeap} language="en" />)
    expect(tabs().map((t) => t.textContent.trim())).toEqual(['Steps', 'Under the hood'])
    expect(tab('Steps').getAttribute('aria-selected')).toBe('true')
    expect(document.body.textContent).toContain('Step 1 of 2')
    expect(loadHeap).not.toHaveBeenCalled()
    for (const t of tabs()) expect(t.className).toMatch(/min-h-\[44px\]/)
    r.unmount()
  })

  it('opening Under the hood fetches once, renders the view, and re-opening reuses it', async () => {
    const loadHeap = vi.fn().mockResolvedValue(ALIAS)
    const r = render(<TraceViewer code={ALIAS_CODE} trace={STEPS_TRACE} onClose={() => {}} loadHeap={loadHeap} language="en" />)
    r.click(tab('Under the hood'))
    await flush()
    expect(loadHeap).toHaveBeenCalledTimes(1)
    expect(tab('Under the hood').getAttribute('aria-selected')).toBe('true')
    const view = document.querySelector('section[aria-label="Under the hood"]')
    expect(view).toBeTruthy()
    // UnderTheHood uses colour tokens: it must sit in a .dark scope on this dark surface.
    expect(view.closest('.dark')).toBeTruthy()
    r.click(tab('Steps'))
    expect(document.querySelector('section[aria-label="Under the hood"]')).toBeFalsy()
    r.click(tab('Under the hood'))
    await flush()
    expect(loadHeap).toHaveBeenCalledTimes(1)
    expect(document.querySelector('section[aria-label="Under the hood"]')).toBeTruthy()
    r.unmount()
  })

  it('a heap fetch failure shows a friendly message', async () => {
    const loadHeap = vi.fn().mockRejectedValue(httpError(429))
    const r = render(<TraceViewer code={ALIAS_CODE} trace={STEPS_TRACE} onClose={() => {}} loadHeap={loadHeap} language="en" />)
    r.click(tab('Under the hood'))
    await flush()
    const alert = document.querySelector('[role="dialog"] [role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert.textContent).toMatch(/too fast/i)
    r.unmount()
  })

  it('Escape still closes the viewer from the Under the hood tab', async () => {
    const onClose = vi.fn()
    const r = render(<TraceViewer code={ALIAS_CODE} trace={STEPS_TRACE} onClose={onClose} loadHeap={vi.fn().mockResolvedValue(ALIAS)} language="en" />)
    r.click(tab('Under the hood'))
    await flush()
    r.key('Escape')
    expect(onClose).toHaveBeenCalled()
    r.unmount()
  })
})

describe('Visualize my code: the Under the hood tab posts mode "heap" for the learner code', () => {
  it('steps first (default mode), then heap once when the tab opens', async () => {
    api.post.mockImplementation((url, body) => Promise.resolve({ data: body.mode === 'heap' ? ALIAS : STEPS_TRACE }))
    const r = render(<PracticePhase lesson={{ practice_challenges: [] }} language="en" code="x = 1" setCode={() => {}} output="" hintIndex={0} onHint={() => {}} onRun={() => {}} running={false} chatMessages={[]} userId="u1" />)
    r.click(byText(r.container, 'Visualize my code'))
    await flush()
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenLastCalledWith('/playground/trace', { user_id: 'u1', code: 'x = 1' })
    const heapTab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes('Under the hood'))
    r.click(heapTab)
    await flush()
    expect(api.post).toHaveBeenCalledTimes(2)
    expect(api.post).toHaveBeenLastCalledWith('/playground/trace', { user_id: 'u1', code: 'x = 1', mode: 'heap' })
    expect(document.querySelector('section[aria-label="Under the hood"]')).toBeTruthy()
    r.unmount()
  })
})
