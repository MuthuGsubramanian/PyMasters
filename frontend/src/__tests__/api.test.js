/**
 * Phase 8 — frontend test harness (foundation).
 *
 * Covers the API client's auth + error handling, which underlies every
 * authenticated journey (login, playground execute, profile save, admin calls).
 * These are the client-side guarantees that keep a stale/forged session from
 * silently sending requests, and stop a Pydantic 422 payload from crashing React.
 *
 * We drive the real axios instance through a stub adapter so the actual request
 * and response interceptors run.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import api, { getAuthHeaders } from '../api.js'

function setSession(obj) {
  localStorage.setItem('pm_user', JSON.stringify(obj))
}

/** Adapter that captures the outgoing config and returns a 200. */
function captureAdapter(sink) {
  return async (config) => {
    sink.config = config
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
}

/** Adapter that always fails with the given status + data. */
function failAdapter(status, data) {
  return async (config) => {
    const err = new Error(`HTTP ${status}`)
    err.config = config
    err.request = {}
    err.response = { status, data, statusText: '', headers: {}, config }
    throw err
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('request interceptor: auth token', () => {
  it('attaches a Bearer token from the stored session', async () => {
    setSession({ token: 'tok-123' })
    const sink = {}
    api.defaults.adapter = captureAdapter(sink)
    await api.get('/anything')
    expect(sink.config.headers.Authorization).toBe('Bearer tok-123')
  })

  it('sends no Authorization header when logged out', async () => {
    const sink = {}
    api.defaults.adapter = captureAdapter(sink)
    await api.get('/anything')
    expect(sink.config.headers.Authorization).toBeUndefined()
  })

  it('sends no Authorization header when the stored session is corrupt', async () => {
    localStorage.setItem('pm_user', '{not valid json')
    const sink = {}
    api.defaults.adapter = captureAdapter(sink)
    await api.get('/anything')
    expect(sink.config.headers.Authorization).toBeUndefined()
  })
})

describe('getAuthHeaders helper (used by streaming fetch calls)', () => {
  it('returns a Bearer header when logged in', () => {
    setSession({ token: 'abc' })
    expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer abc' })
  })

  it('returns an empty object when logged out', () => {
    expect(getAuthHeaders()).toEqual({})
  })
})

describe('response interceptor', () => {
  it('clears the stored session on 401', async () => {
    setSession({ token: 'stale' })
    api.defaults.adapter = failAdapter(401, {})
    await expect(api.get('/anything')).rejects.toBeTruthy()
    expect(localStorage.getItem('pm_user')).toBeNull()
  })

  it('normalizes a Pydantic 422 array `detail` into a string (no React crash)', async () => {
    api.defaults.adapter = failAdapter(422, {
      detail: [{ type: 'missing', loc: ['body', 'username'], msg: 'field required', input: null }],
    })
    let caught
    await api.get('/anything').catch((e) => { caught = e })
    expect(typeof caught.response.data.detail).toBe('string')
    expect(caught.response.data.detail).toContain('field required')
  })

  it('leaves a plain string detail untouched', async () => {
    api.defaults.adapter = failAdapter(400, { detail: 'This identifier is reserved.' })
    let caught
    await api.get('/anything').catch((e) => { caught = e })
    expect(caught.response.data.detail).toBe('This identifier is reserved.')
  })
})

describe('play API helpers', () => {
  it('hit the /play routes with the documented payload shapes', async () => {
    const { getPlayCatalog, startPlayRound, finishPlayRound, getPlayStats } = await import('../api.js')
    const sink = {}
    api.defaults.adapter = captureAdapter(sink)
    await getPlayCatalog()
    expect(sink.config.url).toBe('/play/catalog')
    await startPlayRound('output_oracle', 2, 'daily')
    expect(sink.config.url).toBe('/play/round/start')
    expect(JSON.parse(sink.config.data)).toEqual({ game_id: 'output_oracle', level: 2, mode: 'daily' })
    await startPlayRound('output_oracle')
    expect(JSON.parse(sink.config.data)).toEqual({ game_id: 'output_oracle' })
    await finishPlayRound('r1', { a: 1 }, { a: 2000 })
    expect(sink.config.url).toBe('/play/round/finish')
    expect(JSON.parse(sink.config.data)).toEqual({ round_id: 'r1', responses: { a: 1 }, item_ms: { a: 2000 } })
    await finishPlayRound('r2', {}, {}, { holes: [] })
    expect(JSON.parse(sink.config.data).sim).toEqual({ holes: [] })
    await getPlayStats()
    expect(sink.config.url).toBe('/play/stats')
  })
})
