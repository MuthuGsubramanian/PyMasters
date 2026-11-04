import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { render } from '../../games/__tests__/render.js'

vi.mock('../../api', () => ({
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
vi.mock('../../components/PythonEditor', () => ({ default: () => <div data-testid="editor" /> }))
import api from '../../api'
import { PracticePhase, FeedbackPhase } from '../Classroom'

const TRACE = { steps: [{ line: 1, event: 'line', func: '<module>', depth: 0, vars: {}, out: '' }, { line: 2, event: 'line', func: '<module>', depth: 0, vars: { x: '1' }, out: '' }], stdout: '', error: null }
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const byText = (root, txt) => [...root.querySelectorAll('button')].find((b) => b.textContent.includes(txt))

beforeEach(() => { api.post.mockReset(); document.body.innerHTML = '' })

describe('Visualize my code', () => {
  it('PracticePhase: button traces the current code and opens the viewer', async () => {
    api.post.mockResolvedValue({ data: TRACE })
    const r = render(<PracticePhase lesson={{ practice_challenges: [] }} language="en" code="x = 1" setCode={() => {}} output="" hintIndex={0} onHint={() => {}} onRun={() => {}} running={false} chatMessages={[]} userId="u1" />)
    const btn = byText(r.container, 'Visualize my code')
    expect(btn).toBeTruthy()
    expect(btn.disabled).toBe(false)
    r.click(btn)
    await flush()
    expect(api.post).toHaveBeenCalledWith('/playground/trace', { user_id: 'u1', code: 'x = 1' })
    const dlg = document.querySelector('[role="dialog"][aria-label="Time-travel visualizer"]')
    expect(dlg).toBeTruthy()
    expect(dlg.textContent).toContain('Step 1 of 2')
    r.unmount()
  })

  it('PracticePhase: disabled when the editor is empty', () => {
    const r = render(<PracticePhase lesson={{ practice_challenges: [] }} language="en" code="  " setCode={() => {}} output="" hintIndex={0} onHint={() => {}} onRun={() => {}} running={false} chatMessages={[]} userId="u1" />)
    expect(byText(r.container, 'Visualize my code').disabled).toBe(true)
    r.unmount()
  })

  it('PracticePhase: a rate-limit shows a friendly inline message, not an alert', async () => {
    api.post.mockRejectedValue({ response: { status: 429, data: { detail: 'Rate limit reached. Try again in 9s.' } } })
    const r = render(<PracticePhase lesson={{ practice_challenges: [] }} language="en" code="x = 1" setCode={() => {}} output="" hintIndex={0} onHint={() => {}} onRun={() => {}} running={false} chatMessages={[]} userId="u1" />)
    r.click(byText(r.container, 'Visualize my code'))
    await flush()
    expect(r.container.querySelector('[role="alert"]').textContent).toContain('Try again in 9s')
    r.unmount()
  })

  it('FeedbackPhase (Not Quite Right): "Step through my code" traces the submitted code', async () => {
    api.post.mockResolvedValue({ data: TRACE })
    const r = render(<FeedbackPhase evalResult={{ passed: false, feedback: 'Close.' }} language="en" onContinue={() => {}} onRetry={() => {}} submittedCode="print(2)" userId="u1" />)
    expect(r.container.textContent).toContain('Not Quite Right')
    r.click(byText(r.container, 'Step through my code'))
    await flush()
    expect(api.post).toHaveBeenCalledWith('/playground/trace', { user_id: 'u1', code: 'print(2)' })
    expect(document.querySelector('[role="dialog"][aria-label="Time-travel visualizer"]')).toBeTruthy()
    r.unmount()
  })

  it('PracticePhase: hidden for lessons that seed sandbox files', () => {
    const r = render(<PracticePhase lesson={{ practice_challenges: [], sandbox_files: { 'a.txt': 'hi' } }} language="en" code="x = 1" setCode={() => {}} output="" hintIndex={0} onHint={() => {}} onRun={() => {}} running={false} chatMessages={[]} userId="u1" />)
    expect(byText(r.container, 'Visualize my code')).toBeFalsy()
    r.unmount()
  })

  it('PracticePhase: stale trace error clears when the code changes', async () => {
    api.post.mockRejectedValue({ response: { status: 429, data: { detail: 'Try again in 9s.' } } })
    const props = { lesson: { practice_challenges: [] }, language: 'en', setCode: () => {}, output: '', hintIndex: 0, onHint: () => {}, onRun: () => {}, running: false, chatMessages: [], userId: 'u1' }
    const r = render(<PracticePhase {...props} code="x = 1" />)
    r.click(byText(r.container, 'Visualize my code'))
    await flush()
    expect(r.container.querySelector('[role="alert"]')).toBeTruthy()
    r.rerender(<PracticePhase {...props} code="x = 12" />)
    expect(r.container.querySelector('[role="alert"]')).toBeFalsy()
    r.unmount()
  })

  it('FeedbackPhase: no "Step through my code" when not traceable', () => {
    const r = render(<FeedbackPhase evalResult={{ passed: false }} language="en" onContinue={() => {}} onRetry={() => {}} submittedCode="print(2)" userId="u1" traceable={false} />)
    expect(byText(r.container, 'Step through my code')).toBeFalsy()
    r.unmount()
  })

  it('both buttons keep a 44px touch target at every size', () => {
    const r = render(<PracticePhase lesson={{ practice_challenges: [] }} language="en" code="x = 1" setCode={() => {}} output="" hintIndex={0} onHint={() => {}} onRun={() => {}} running={false} chatMessages={[]} userId="u1" />)
    const f = render(<FeedbackPhase evalResult={{ passed: false }} language="en" onContinue={() => {}} onRetry={() => {}} submittedCode="print(2)" userId="u1" />)
    for (const b of [byText(r.container, 'Visualize my code'), byText(f.container, 'Step through my code')]) {
      expect(b.className).toContain('min-h-[44px]')
      expect(b.className).not.toContain('sm:min-h-0')
    }
    r.unmount(); f.unmount()
  })
})
