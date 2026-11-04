import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { render } from '../../games/__tests__/render.js'

vi.mock('../../api', () => ({ default: { post: vi.fn() } }))
import api from '../../api'
import useCodeTrace from '../useCodeTrace'

let current
function Probe({ userId }) {
  current = useCodeTrace(userId)
  return null
}

beforeEach(() => { api.post.mockReset(); current = undefined })

describe('useCodeTrace', () => {
  it('posts the code with the user id and stores the trace', async () => {
    const data = { steps: [{ line: 1 }, { line: 2 }], stdout: '', error: null }
    let resolve
    api.post.mockReturnValue(new Promise((r) => { resolve = r }))
    const r = render(<Probe userId="u1" />)
    let p
    act(() => { p = current.visualize('x = 1\ny = 2') })
    expect(api.post).toHaveBeenCalledWith('/playground/trace', { user_id: 'u1', code: 'x = 1\ny = 2' })
    expect(current.loading).toBe(true)
    await act(async () => { resolve({ data }); await p })
    expect(current.loading).toBe(false)
    expect(current.trace).toEqual(data)
    expect(current.error).toBe('')
    act(() => current.close())
    expect(current.trace).toBe(null)
    r.unmount()
  })

  it('maps a 429 to a friendly message with the retry hint', async () => {
    api.post.mockRejectedValue({ response: { status: 429, data: { detail: 'Rate limit reached. Try again in 12s.' } } })
    const r = render(<Probe userId="u1" />)
    await act(async () => { await current.visualize('print(1)') })
    expect(current.trace).toBe(null)
    expect(current.error).toMatch(/too fast|slow down|a moment/i)
    expect(current.error).toContain('Try again in 12s')
    r.unmount()
  })

  it('shows a short message for other errors', async () => {
    api.post.mockRejectedValue({ response: { status: 500, data: { detail: 'boom' } } })
    const r = render(<Probe userId="u1" />)
    await act(async () => { await current.visualize('print(1)') })
    expect(current.error).toContain('boom')
    r.unmount()
  })

  it('does not call the API for empty code', async () => {
    const r = render(<Probe userId="u1" />)
    await act(async () => { await current.visualize('   \n') })
    expect(api.post).not.toHaveBeenCalled()
    expect(current.loading).toBe(false)
    r.unmount()
  })
})
