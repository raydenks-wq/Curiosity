const SESSION_KEY = 'curiosity:lms:auth:session:v1'

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

export const authSession = {
  key: SESSION_KEY,

  read() {
    return readJson(SESSION_KEY, null)
  },

  write(session) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  },

  clear() {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(SESSION_KEY)
  },
}
