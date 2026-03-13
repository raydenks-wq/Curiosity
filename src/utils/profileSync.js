const PROFILE_REFRESH_EVENT = 'curiosity:profile-refresh'
const PROFILE_REFRESH_STORAGE_KEY = 'curiosity:lms:profile-refresh:ping'

export const broadcastProfileRefresh = (payload = {}) => {
  if (typeof window === 'undefined') return
  const detail = {
    source: String(payload?.source || 'app'),
    reason: String(payload?.reason || 'manual'),
    at: Date.now(),
  }
  window.dispatchEvent(new CustomEvent(PROFILE_REFRESH_EVENT, { detail }))
  try {
    localStorage.setItem(PROFILE_REFRESH_STORAGE_KEY, JSON.stringify(detail))
  } catch {
    // ignore storage quota errors for refresh ping
  }
}

export const listenProfileRefresh = (onRefresh) => {
  if (typeof window === 'undefined') return () => {}
  const callback = typeof onRefresh === 'function' ? onRefresh : () => {}
  const eventHandler = () => callback()
  const storageHandler = (event) => {
    if (event.key !== PROFILE_REFRESH_STORAGE_KEY || !event.newValue) return
    callback()
  }
  window.addEventListener(PROFILE_REFRESH_EVENT, eventHandler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(PROFILE_REFRESH_EVENT, eventHandler)
    window.removeEventListener('storage', storageHandler)
  }
}
