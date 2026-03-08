import { defineStore } from 'pinia'

const STORAGE_KEY = 'curiosity:lms:audit-log:v1'

const defaultLogs = [
  {
    id: 'log-001',
    actor: 'System',
    action: 'seed_data',
    target: 'users',
    detail: 'Initial user data created.',
    timestamp: '2026-03-09 08:00',
  },
]

const clone = (obj) => JSON.parse(JSON.stringify(obj))

const readLogs = () => {
  if (typeof localStorage === 'undefined') return clone(defaultLogs)
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return clone(defaultLogs)

  try {
    return JSON.parse(raw)
  } catch {
    return clone(defaultLogs)
  }
}

const writeLogs = (logs) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
}

const nowStamp = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export const useAuditLogStore = defineStore('auditLog', {
  state: () => ({
    logs: [],
    loaded: false,
  }),

  actions: {
    load() {
      if (this.loaded) return
      this.logs = readLogs()
      this.loaded = true
    },

    log({ actor, action, target, detail }) {
      const record = {
        id: `log-${Math.random().toString(36).slice(2, 8)}`,
        actor,
        action,
        target,
        detail,
        timestamp: nowStamp(),
      }

      this.logs = [record, ...this.logs].slice(0, 120)
      writeLogs(this.logs)
    },
  },
})
