import { userAccountService } from './userAccountService'
import { authSession } from './authSession'

const CREDENTIALS_KEY = 'curiosity:lms:auth:credentials:v1'
const SESSION_TTL_MS = 1000 * 60 * 60 * 12

const defaultCredentials = {
  'indra@curiosity.app': 'admin123',
  'ayu@curiosity.app': 'instructor123',
  'raka@curiosity.app': 'student123',
}

const roleLabelMap = {
  admin: 'Admin',
  instructor: 'Instructor',
  student: 'Student',
}

const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms))

const readJson = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const writeJson = (key, value) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

const readCredentials = () => {
  const current = readJson(CREDENTIALS_KEY, {})
  return {
    ...defaultCredentials,
    ...(current || {}),
  }
}

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  roleLabel: roleLabelMap[user.role] || user.role,
})

export const authService = {
  async signIn({ email, password }) {
    await delay()
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedPassword = String(password || '')
    const users = await userAccountService.loadUsersForAuth()
    const matched = users.find((user) => user.email.toLowerCase() === normalizedEmail)

    if (!matched) {
      throw new Error('Email tidak ditemukan.')
    }

    if (matched.status !== 'active') {
      throw new Error('Akun belum aktif atau sedang suspended.')
    }

    const credentials = readCredentials()
    const expectedPassword = credentials[normalizedEmail] || 'changeme123'

    if (normalizedPassword !== expectedPassword) {
      throw new Error('Password tidak sesuai.')
    }

    const session = {
      token: `sess_${Math.random().toString(36).slice(2, 12)}`,
      user: sanitizeUser(matched),
      issuedAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    }

    authSession.write(session)
    return session
  },

  async restoreSession() {
    await delay(80)
    const session = authSession.read()
    if (!session) return null

    if (!session.expiresAt || session.expiresAt < Date.now()) {
      authSession.clear()
      return null
    }

    return session
  },

  async signOut() {
    await delay(60)
    authSession.clear()
  },

  getDemoCredentials() {
    return [
      { role: 'Admin', email: 'indra@curiosity.app', password: 'admin123' },
      { role: 'Instructor', email: 'ayu@curiosity.app', password: 'instructor123' },
      { role: 'Student', email: 'raka@curiosity.app', password: 'student123' },
    ]
  },
}
