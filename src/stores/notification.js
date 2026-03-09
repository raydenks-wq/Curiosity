import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from './auth'

const readSeenAt = (key) => {
  if (typeof localStorage === 'undefined') return 0
  return Number(localStorage.getItem(key) || 0)
}

const writeSeenAt = (key, value) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, String(value))
}

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    items: [],
    isLoading: false,
    seenAt: 0,
    storageKey: '',
  }),

  getters: {
    unreadCount(state) {
      return state.items.filter((item) => new Date(item.createdAt).getTime() > state.seenAt).length
    },

    mentionUnreadCount(state) {
      return state.items.filter((item) => item.isMention && new Date(item.createdAt).getTime() > state.seenAt).length
    },
  },

  actions: {
    initSeenAt() {
      const auth = useAuthStore()
      const userKey = auth.user?.id || auth.user?.email || 'guest'
      this.storageKey = `curiosity:lms:notifications:seen:${userKey}`
      this.seenAt = readSeenAt(this.storageKey)
    },

    async load(limit = 30) {
      this.initSeenAt()
      this.isLoading = true
      try {
        const auth = useAuthStore()
        this.items = await apiClient.notifications.list(limit, auth.user)
      } finally {
        this.isLoading = false
      }
    },

    markAllRead() {
      this.initSeenAt()
      this.seenAt = Date.now()
      writeSeenAt(this.storageKey, this.seenAt)
    },

    clear() {
      this.items = []
      this.seenAt = 0
      this.storageKey = ''
    },
  },
})
