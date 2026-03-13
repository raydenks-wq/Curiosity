import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'

export const useProfileStore = defineStore('profile', {
  state: () => ({
    ...apiClient.profile.getDefaultState(),
    isLoading: false,
    isSavingAccount: false,
    isSavingPreferences: false,
    isUpdatingPassword: false,
    isResetting: false,
    loaded: false,
  }),

  actions: {
    getSnapshot() {
      return JSON.parse(
        JSON.stringify({
          profile: this.profile,
          preferences: this.preferences,
          stats: this.stats,
          certificates: this.certificates,
          badges: this.badges,
          progressMetrics: this.progressMetrics,
        }),
      )
    },

    applyState(data) {
      this.profile = data.profile
      this.preferences = data.preferences
      this.stats = data.stats
      this.certificates = data.certificates
      this.badges = data.badges
      this.progressMetrics = data.progressMetrics
    },

    async load(force = false) {
      if (this.loaded && !force) return

      this.isLoading = true
      try {
        const data = await apiClient.profile.load()
        this.applyState(data)
        this.loaded = true
      } finally {
        this.isLoading = false
      }
    },

    async refresh() {
      await this.load(true)
    },

    async saveAccount(payload) {
      this.isSavingAccount = true
      try {
        const data = await apiClient.profile.saveAccount(payload)
        this.profile = data.profile
      } finally {
        this.isSavingAccount = false
      }
    },

    async savePreferences(payload) {
      this.isSavingPreferences = true
      try {
        const data = await apiClient.profile.savePreferences(payload)
        this.preferences = data.preferences
      } finally {
        this.isSavingPreferences = false
      }
    },

    async updatePassword(payload) {
      this.isUpdatingPassword = true
      try {
        await apiClient.profile.updatePassword(payload)
      } finally {
        this.isUpdatingPassword = false
      }
    },

    async resetToDefault() {
      this.isResetting = true
      try {
        const data = await apiClient.profile.reset()
        this.applyState(data)
      } finally {
        this.isResetting = false
      }
    },

    async restoreSnapshot(snapshot) {
      await apiClient.profile.saveAll(snapshot)
      this.applyState(snapshot)
    },

    syncFromAuthUser(user) {
      if (!user) return
      this.profile = {
        ...this.profile,
        name: user.name || this.profile.name,
        email: user.email || this.profile.email,
        accessRole: user.role || this.profile.accessRole,
        role: user.roleLabel || this.profile.role,
      }
    },
  },
})
