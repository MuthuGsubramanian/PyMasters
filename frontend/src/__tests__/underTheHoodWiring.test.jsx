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
  has_under_the_hood: true,
}
const dialog = () => document.querySelector('[role="dialog"][aria-label="Under the hood"]')
const ofLesson = (id) => `/classroom/lesson/${id}/under-the-hood`

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
  it('shows the button next to "Watch It Run" from the lesson flag, without running anything', async () => {
    // Opening a lesson must not hold the one-at-a-time sandbox (ML examples take up to 25 s to import).
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    await flush()
    expect(api.get).not.toHaveBeenCalled()
    expect(byText(r.container, 'Watch It Run')).toBeTruthy()
    const btn = uthButton(r.container)
    expect(btn).toBeTruthy()
    expect(btn).not.toBe(byText(r.container, 'Watch It Run'))
    expect(btn.className).toMatch(/min-h-\[44px\]/)
    r.unmount()
  })

  it('has no button when the lesson has no example code', async () => {
    const r = render(<IntroPhase lesson={{ ...LESSON, has_under_the_hood: false }} language="en" onComplete={() => {}} />)
    await flush()
    expect(uthButton(r.container)).toBeFalsy()
    expect(byText(r.container, 'Start Practice')).toBeTruthy()
    expect(api.get).not.toHaveBeenCalled()
    r.unmount()
  })

  it('shows the button even for a lesson without Watch It Run visuals', async () => {
    const r = render(<IntroPhase lesson={{ ...LESSON, animation_sequence: [] }} language="en" onComplete={() => {}} />)
    await flush()
    expect(byText(r.container, 'Watch It Run')).toBeFalsy()
    expect(uthButton(r.container)).toBeTruthy()
    r.unmount()
  })

  it('opening runs the example once: a loading message, then the view; reopening reuses it', async () => {
    let resolve
    api.get.mockReturnValue(new Promise((res) => { resolve = res }))
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    expect(api.get).toHaveBeenCalledWith(ofLesson('lists_alias'))
    expect(dialog().querySelector('[role="status"]').textContent).toMatch(/Running the example/)
    await act(async () => { resolve({ data: LESSON_UTH }) })
    await flush()
    expect(dialog().querySelector('[data-uth="code"]').textContent).toContain('b.append(3)')
    r.key('Escape')
    await flush()
    r.click(uthButton(r.container))
    await flush()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(dialog().querySelector('section[aria-label="Under the hood"]')).toBeTruthy()
    r.unmount()
  })

  it.each([429, 500])('a failed run (%i) says so and Try again runs it again', async (status) => {
    api.get.mockRejectedValueOnce(httpError(status)).mockResolvedValueOnce({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    await flush()
    const alert = dialog().querySelector('[role="alert"]')
    expect(alert.textContent).toMatch(/Could not run the example/)
    r.click(byText(alert, 'Try again'))
    await flush()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(dialog().querySelector('section[aria-label="Under the hood"]')).toBeTruthy()
    r.unmount()
  })

  it('a late answer for lesson A is never shown on lesson B', async () => {
    let resolveA
    api.get.mockImplementation((url) => (url === ofLesson('lists_alias')
      ? new Promise((res) => { resolveA = res })
      : new Promise(() => {})))
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    r.rerender(<IntroPhase lesson={{ ...LESSON, id: 'lesson_b' }} language="en" onComplete={() => {}} />)
    await flush()
    expect(dialog()).toBeFalsy()                       // switching lessons closes the popup
    await act(async () => { resolveA({ data: LESSON_UTH }) })
    await flush()
    r.click(uthButton(r.container))
    expect(api.get).toHaveBeenLastCalledWith(ofLesson('lesson_b'))
    expect(dialog().querySelector('[data-uth="code"]')).toBeFalsy()
    expect(dialog().querySelector('[role="status"]')).toBeTruthy()
    r.unmount()
  })

  it('opens a dark popup; Escape closes it and focus returns to the button', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    const btn = uthButton(r.container)
    btn.focus()
    r.click(btn)
    await flush()
    const dlg = dialog()
    expect(dlg.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(dlg.querySelector('[aria-label="Next step"]')).toBeTruthy()
    // The popup scrolls inside itself, not the page.
    expect(dlg.innerHTML).toMatch(/overflow-y-auto/)
    expect(dlg.className).toMatch(/max-h-/)
    expect(dlg.innerHTML).not.toMatch(/text-\[(9|10|11)px\]/)
    r.key('Escape')
    await flush()
    expect(dialog()).toBeFalsy()
    expect(document.activeElement).toBe(uthButton(r.container))
    r.unmount()
  })

  it('the close button closes the popup and returns focus to the button', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    await flush()
    const close = dialog().querySelector('button[aria-label="Close"]')
    expect(close.className).toMatch(/min-h-\[44px\]|h-11/)
    r.click(close)
    await flush()
    expect(dialog()).toBeFalsy()
    expect(document.activeElement).toBe(uthButton(r.container))
    r.unmount()
  })

  it('uses the learner language for the view (Tamil title)', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="ta" onComplete={() => {}} />)
    const btn = uthButton(r.container) || byText(r.container, 'உள்ளே என்ன நடக்கிறது')
    r.click(btn)
    await flush()
    expect(document.querySelector('section[aria-label="உள்ளே என்ன நடக்கிறது"]')).toBeTruthy()
    r.unmount()
  })
})

describe('Lesson intro: Under the hood with topic content (How it works | Python\'s view)', () => {
  const BODY = 'Python builds the list object first, then stores a reference to it under the name.'
  const TOPIC = {
    summary: { en: 'Names point to objects.', ta: 'பெயர்கள் பொருட்களைச் சுட்டுகின்றன.' },
    steps: [
      { title: 'Objects', body: BODY, visual: { type: 'TerminalOutput', props: { lines: ['>>> id(a)'] } } },
      { title: 'Names', body: BODY },
      { title: 'Identity', body: BODY, visual: { type: 'ConceptMap', props: { nodes: ['object'] } } },
      { title: 'Refcounts', body: BODY },
    ],
    takeaway: 'Names are labels, not boxes.',
  }
  const TOPIC_LESSON = { ...LESSON, under_the_hood: TOPIC, has_uth_trace: true }
  const tabs = () => [...dialog().querySelectorAll('[role="tab"]')]
  const tab = (name) => tabs().find((t) => t.textContent.includes(name))

  it('opens on "How it works" without fetching; "Python\'s view" fetches the trace once', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={TOPIC_LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    await flush()
    expect(api.get).not.toHaveBeenCalled()
    expect(tabs().map((t) => t.textContent.trim())).toEqual(['How it works', "Python's view"])
    expect(tab('How it works').getAttribute('aria-selected')).toBe('true')
    for (const t of tabs()) expect(t.className).toMatch(/min-h-\[44px\]/)
    expect(dialog().querySelector('section[aria-label="How it works"]')).toBeTruthy()
    expect(dialog().querySelector('[data-uth-topic="summary"]').textContent).toBe('Names point to objects.')

    r.click(tab("Python's view"))
    await flush()
    expect(api.get).toHaveBeenCalledWith(ofLesson('lists_alias'))
    expect(tab("Python's view").getAttribute('aria-selected')).toBe('true')
    expect(dialog().querySelector('[data-uth="code"]').textContent).toContain('b.append(3)')
    expect(dialog().querySelector('section[aria-label="How it works"]').closest('[hidden]')).toBeTruthy()

    r.click(tab('How it works'))
    expect(dialog().querySelector('section[aria-label="How it works"]').closest('[hidden]')).toBeFalsy()
    expect(dialog().querySelector('[data-uth="code"]')).toBeFalsy()
    r.click(tab("Python's view"))
    await flush()
    expect(api.get).toHaveBeenCalledTimes(1)
    r.unmount()
  })

  it('keeps the "How it works" step when switching tabs and back', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={TOPIC_LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    await flush()
    r.click([...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Next'))
    r.click(tab("Python's view"))
    await flush()
    r.click(tab('How it works'))
    expect(dialog().querySelector('[data-uth-topic="counter"]').textContent).toBe('Step 2 of 4')
    r.unmount()
  })

  it('steps through to the takeaway inside the popup', async () => {
    const r = render(<IntroPhase lesson={TOPIC_LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    await flush()
    const next = () => [...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Next')
    for (let i = 0; i < 3; i++) r.click(next())
    expect(dialog().querySelector('[data-uth-topic="counter"]').textContent).toBe('Step 4 of 4')
    expect(dialog().querySelector('[data-uth-topic="takeaway"]').textContent).toContain('Names are labels, not boxes.')
    r.unmount()
  })

  it('keeps the loading, error and Try again behaviour in "Python\'s view"', async () => {
    api.get.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={TOPIC_LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    r.click(tab("Python's view"))
    expect(dialog().querySelector('[role="status"]').textContent).toMatch(/Running the example/)
    await flush()
    const alert = dialog().querySelector('[role="alert"]')
    expect(alert.textContent).toMatch(/Could not run the example/)
    r.click(byText(alert, 'Try again'))
    await flush()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(dialog().querySelector('section[aria-label="Under the hood"]')).toBeTruthy()
    r.unmount()
  })

  it('reopening starts on "How it works" again', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={TOPIC_LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    r.click(tab("Python's view"))
    await flush()
    r.key('Escape')
    await flush()
    r.click(uthButton(r.container))
    await flush()
    expect(tab('How it works').getAttribute('aria-selected')).toBe('true')
    r.unmount()
  })

  it('has no "Python\'s view" tab when the lesson has no example code to trace', async () => {
    const r = render(<IntroPhase lesson={{ ...TOPIC_LESSON, has_uth_trace: false }} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    await flush()
    expect(dialog().querySelector('[role="tab"]')).toBeFalsy()
    expect(dialog().querySelector('section[aria-label="How it works"]')).toBeTruthy()
    expect(api.get).not.toHaveBeenCalled()
    r.unmount()
  })

  it('shows Tamil tab names and content for a Tamil learner', async () => {
    const r = render(<IntroPhase lesson={TOPIC_LESSON} language="ta" onComplete={() => {}} />)
    r.click(r.container.querySelector('button[aria-haspopup="dialog"]'))
    await flush()
    const names = [...document.querySelectorAll('[role="dialog"] [role="tab"]')].map((t) => t.textContent.trim())
    expect(names).toHaveLength(2)
    expect(names[0]).not.toBe('How it works')
    expect(names[1]).not.toBe("Python's view")
    expect(document.querySelector('[data-uth-topic="summary"]').textContent).toBe('பெயர்கள் பொருட்களைச் சுட்டுகின்றன.')
    expect(document.querySelector('[data-uth-topic="title"]').textContent).toBe('Objects')
    r.unmount()
  })

  it('a lesson without topic content keeps the old single view (no tabs, fetch on open)', async () => {
    api.get.mockResolvedValue({ data: LESSON_UTH })
    const r = render(<IntroPhase lesson={LESSON} language="en" onComplete={() => {}} />)
    r.click(uthButton(r.container))
    expect(api.get).toHaveBeenCalledTimes(1)
    await flush()
    expect(dialog().querySelector('[role="tab"]')).toBeFalsy()
    expect(dialog().querySelector('section[aria-label="How it works"]')).toBeFalsy()
    expect(dialog().querySelector('section[aria-label="Under the hood"]')).toBeTruthy()
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

  it('step controls are 44 px touch targets', () => {
    const r = render(<TraceViewer code={ALIAS_CODE} trace={STEPS_TRACE} onClose={() => {}} loadHeap={vi.fn()} language="en" />)
    for (const label of ['First step', 'Previous step', 'Play', 'Next step', 'Last step']) {
      const b = document.querySelector(`[role="dialog"] button[aria-label="${label}"]`)
      expect(b, label).toBeTruthy()
      expect(b.className, label).toMatch(/\bmin-h-\[44px\]/)
      expect(b.className, label).toMatch(/\bmin-w-\[44px\]/)
    }
    // The slider may shrink so five 44 px buttons still fit a 390 px phone.
    expect(document.querySelector('[role="dialog"] input[aria-label="Step"]').className).toMatch(/\bmin-w-0\b/)
    r.unmount()
  })

  it('closing returns focus to the element that opened the viewer', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Visualize my code'
    document.body.appendChild(opener)
    opener.focus()
    const r = render(<TraceViewer code={ALIAS_CODE} trace={STEPS_TRACE} onClose={() => {}} loadHeap={vi.fn()} language="en" />)
    document.querySelector('[role="dialog"] button[aria-label="Close visualizer"]').focus()
    r.unmount()
    expect(document.activeElement).toBe(opener)
  })

  it('does not try to focus an opener that is gone', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const r = render(<TraceViewer code={ALIAS_CODE} trace={STEPS_TRACE} onClose={() => {}} language="en" />)
    opener.remove()
    const spy = vi.spyOn(opener, 'focus')
    expect(() => r.unmount()).not.toThrow()
    expect(spy).not.toHaveBeenCalled()
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
