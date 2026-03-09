import { afterEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { app, checkPasswordAndUpgrade, createCorsOriginValidator, handleAppError, start } from './index.js'

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

  it('allows requests without origin header', () => {
    const validateOrigin = createCorsOriginValidator(['https://allowed.com'])
    const callback = vi.fn()

    validateOrigin(undefined, callback)

    expect(callback).toHaveBeenCalledWith(null, true)
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

  it('upgrades plaintext credential hash on successful password check', async () => {
    const db = { credentials: { 'indra@curiosity.app': 'admin123' } }
    const matched = await checkPasswordAndUpgrade(db, 'indra@curiosity.app', 'admin123')

    expect(matched).toBe(true)
    expect(db.credentials['indra@curiosity.app']).toMatch(/^\$2[aby]\$/)
  })

  it('returns false for wrong plaintext password without upgrading hash', async () => {
    const db = { credentials: { 'indra@curiosity.app': 'admin123' } }
    const matched = await checkPasswordAndUpgrade(db, 'indra@curiosity.app', 'wrong')

    expect(matched).toBe(false)
    expect(db.credentials['indra@curiosity.app']).toBe('admin123')
  })

  it('validates bcrypt credentials', async () => {
    const hash = await bcrypt.hash('admin123', 10)
    const db = { credentials: { 'indra@curiosity.app': hash } }

    const matched = await checkPasswordAndUpgrade(db, 'indra@curiosity.app', 'admin123')
    expect(matched).toBe(true)
  })
})
