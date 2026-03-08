import { defineStore } from 'pinia'
import { getDefaultProfileState, profileService } from '../services/profileService'

export const useProfileStore = defineStore('profile', {
  state: () => ({
    ...getDefaultProfileState(),
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

    async load() {
      if (this.loaded) return

      this.isLoading = true
      try {
        const data = await profileService.loadProfile()
        this.applyState(data)
        this.loaded = true
      } finally {
        this.isLoading = false
      }
    },

    async saveAccount(payload) {
      this.isSavingAccount = true
      try {
        const data = await profileService.saveAccount(payload)
        this.profile = data.profile
      } finally {
        this.isSavingAccount = false
      }
    },

    async savePreferences(payload) {
      this.isSavingPreferences = true
      try {
        const data = await profileService.savePreferences(payload)
        this.preferences = data.preferences
      } finally {
        this.isSavingPreferences = false
      }
    },

    async updatePassword() {
      this.isUpdatingPassword = true
      try {
        await profileService.updatePassword()
      } finally {
        this.isUpdatingPassword = false
      }
    },

    async resetToDefault() {
      this.isResetting = true
      try {
        const data = await profileService.resetProfile()
        this.applyState(data)
      } finally {
        this.isResetting = false
      }
    },

    async restoreSnapshot(snapshot) {
      await profileService.saveFullState(snapshot)
      this.applyState(snapshot)
    },
  },
})
