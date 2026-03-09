import { authSession } from '../authSession'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const joinUrl = (base, path) => {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

const buildErrorMessage = async (response) => {
  try {
    const data = await response.json()
    return data?.message || data?.error || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

const parseResponse = async (response) => {
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

export const httpClient = {
  async request(path, { method = 'GET', body, headers = {}, auth = false } = {}) {
    const authHeader = {}
    if (auth) {
      const session = authSession.read()
      if (!session?.token) {
        const error = new Error('Sesi login tidak ditemukan.')
        error.code = 'AUTH_REQUIRED'
        throw error
      }
      authHeader.Authorization = `Bearer ${session.token}`
    }

    const requestHeaders = {
      ...authHeader,
      ...headers,
    }

    let requestBody = body
    if (body && !(body instanceof FormData)) {
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json'
      requestBody = JSON.stringify(body)
    }

    const response = await fetch(joinUrl(API_BASE_URL, path), {
      method,
      headers: requestHeaders,
      body: requestBody,
    })

    if (!response.ok) {
      const message = await buildErrorMessage(response)
      const error = new Error(message)
      error.code = response.status === 401 ? 'AUTH_REQUIRED' : response.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR'
      error.status = response.status
      throw error
    }

    return parseResponse(response)
  },
}
