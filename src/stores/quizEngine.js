import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from './auth'

export const useQuizEngineStore = defineStore('quizEngine', {
  state: () => ({
    meta: null,
    session: null,
    answers: {},
    result: null,
    history: [],
    isSubmitting: false,
  }),

  getters: {
    isFinished(state) {
      return Boolean(state.result)
    },
  },

  actions: {
    authUser() {
      const authStore = useAuthStore()
      return authStore.user || null
    },

    async loadMeta(quizId) {
      this.meta = await apiClient.quiz.getMeta(quizId, this.authUser())
      this.history = await apiClient.quiz.getHistory(this.meta.id, this.authUser())
      return this.meta
    },

    async startSession(quizId, { retake = false } = {}) {
      await this.loadMeta(quizId)
      this.session = await apiClient.quiz.startSession(this.meta.id, { retake }, this.authUser())
      this.answers = {}
      this.result = null
      return this.session
    },

    setAnswer(questionId, optionId) {
      this.answers = {
        ...this.answers,
        [questionId]: optionId,
      }
    },

    async submit({ forced = false } = {}) {
      if (!this.session) return null
      this.isSubmitting = true
      try {
        this.result = await apiClient.quiz.submit(
          this.session.quizId,
          {
            sessionId: this.session.sessionId,
            answers: this.answers,
            forced,
          },
          this.authUser(),
        )
        this.history = await apiClient.quiz.getHistory(this.session.quizId, this.authUser())
        return this.result
      } finally {
        this.isSubmitting = false
      }
    },

    reset() {
      this.session = null
      this.answers = {}
      this.result = null
      this.history = []
      this.meta = null
    },
  },
})
