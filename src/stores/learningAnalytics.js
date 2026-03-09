import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from './auth'

const defaultState = () => ({
  generatedAt: '',
  completionRateAvg: 0,
  weeklyStudy: {
    totalMinutes: 0,
    byDay: [],
  },
  courses: [],
  earlyWarnings: [],
})

export const useLearningAnalyticsStore = defineStore('learningAnalytics', {
  state: () => ({
    isLoading: false,
    data: defaultState(),
  }),

  actions: {
    authUser() {
      const authStore = useAuthStore()
      return authStore.user || null
    },

    async load() {
      this.isLoading = true
      try {
        this.data = await apiClient.analytics.getLearning(undefined, this.authUser())
        return this.data
      } finally {
        this.isLoading = false
      }
    },

    reset() {
      this.data = defaultState()
    },
  },
})
