import { afterEach, describe, expect, it, vi } from 'vitest'
import { app, createCorsOriginValidator, handleAppError, start } from './index.js'

describe('server helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows all origins when wildcard is configured', () => {
    const validateOrigin = createCorsOriginValidator('*')
    const callback = vi.fn()

    validateOrigin('https://example.com', callback)

    expect(callback).toHaveBeenCalledWith(null, true)
  })

  it('allows configured origin and blocks unknown origin', () => {
    const validateOrigin = createCorsOriginValidator(['https://allowed.com'])
    const ok = vi.fn()
    const denied = vi.fn()

    validateOrigin('https://allowed.com', ok)
    validateOrigin('https://denied.com', denied)

    expect(ok).toHaveBeenCalledWith(null, true)
    expect(denied).toHaveBeenCalledTimes(1)
    expect(denied.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(denied.mock.calls[0][0].message).toContain('CORS origin denied')
  })

  it('returns cors denied response for cors errors', () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }

    handleAppError(new Error('CORS origin denied'), {}, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ message: 'CORS origin denied.' })
  })

  it('returns 500 for non-cors errors', () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }

    handleAppError(new Error('boom'), {}, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error.' })
  })

  it('starts server and returns listener instance', async () => {
    const fakeServer = { close: vi.fn() }
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const listenSpy = vi.spyOn(app, 'listen').mockImplementation((_, callback) => {
      if (typeof callback === 'function') callback()
      return fakeServer
    })

    const server = await start()

    expect(listenSpy).toHaveBeenCalledTimes(1)
    expect(server).toBe(fakeServer)
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})
