import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '',
    user: null,
    expiresAt: 0,
    initialized: false,
    isLoading: false,
  }),

  getters: {
    isAuthenticated(state) {
      return Boolean(state.token && state.user && state.expiresAt > Date.now())
    },

    role(state) {
      return state.user?.role || ''
    },
  },

  actions: {
    applySession(session) {
      this.token = session?.token || ''
      this.user = session?.user || null
      this.expiresAt = session?.expiresAt || 0
    },

    async restoreSession() {
      if (this.initialized) return
      this.isLoading = true
      try {
        const session = await apiClient.auth.restoreSession()
        this.applySession(session)
      } finally {
        this.initialized = true
        this.isLoading = false
      }
    },

    async login(payload) {
      this.isLoading = true
      try {
        const session = await apiClient.auth.signIn(payload)
        this.applySession(session)
        this.initialized = true
        return session.user
      } finally {
        this.isLoading = false
      }
    },

    async logout() {
      this.isLoading = true
      try {
        await apiClient.auth.signOut()
      } finally {
        this.applySession(null)
        this.initialized = true
        this.isLoading = false
      }
    },
  },
})
