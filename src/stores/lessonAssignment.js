import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from './auth'

export const useLessonAssignmentStore = defineStore('lessonAssignment', {
  state: () => ({
    assignment: null,
    windowStatus: null,
    serverTime: '',
    overviewByLesson: {},
    mySubmission: null,
    submissions: [],
    isLoading: false,
    isLoadingOverview: false,
    isSubmitting: false,
    isReviewing: false,
    isSavingPolicy: false,
    isSavingBulkPolicy: false,
    currentScope: '',
  }),

  actions: {
    scope(courseId, lessonId) {
      return `${courseId}:${lessonId}`
    },

    authUser() {
      const auth = useAuthStore()
      return auth.user || null
    },

    async load(courseId, lessonId) {
      this.isLoading = true
      try {
        const data = await apiClient.courses.getAssignment(courseId, lessonId, this.authUser())
        this.assignment = data?.assignment || null
        this.windowStatus = data?.windowStatus || null
        this.serverTime = data?.serverTime || ''
        this.mySubmission = data?.mySubmission || null
        this.submissions = Array.isArray(data?.submissions) ? data.submissions : []
        this.currentScope = this.scope(courseId, lessonId)
      } finally {
        this.isLoading = false
      }
    },

    async loadOverview(courseId, lessonIds = []) {
      const normalized = Array.from(new Set((lessonIds || []).map((id) => String(id || '')).filter(Boolean)))
      if (!normalized.length) {
        this.overviewByLesson = {}
        return
      }
      this.isLoadingOverview = true
      try {
        const results = await Promise.all(
          normalized.map((lessonId) => apiClient.courses.getAssignment(courseId, lessonId, this.authUser())),
        )
        this.overviewByLesson = Object.fromEntries(
          results.map((payload, idx) => [
            normalized[idx],
            {
              dueAt: payload?.assignment?.dueAt || null,
              graceMinutes: Number(payload?.assignment?.graceMinutes || 0),
              windowStatus: payload?.windowStatus || null,
            },
          ]),
        )
      } finally {
        this.isLoadingOverview = false
      }
    },

    async submit(courseId, lessonId, payload) {
      this.isSubmitting = true
      try {
        await apiClient.courses.submitAssignment(courseId, lessonId, payload, this.authUser())
        await this.load(courseId, lessonId)
      } finally {
        this.isSubmitting = false
      }
    },

    async review(courseId, lessonId, submissionId, payload) {
      this.isReviewing = true
      try {
        await apiClient.courses.reviewSubmission(courseId, lessonId, submissionId, payload, this.authUser())
        await this.load(courseId, lessonId)
      } finally {
        this.isReviewing = false
      }
    },

    async updateConfig(courseId, lessonId, payload) {
      this.isSavingPolicy = true
      try {
        await apiClient.courses.updateAssignmentConfig(courseId, lessonId, payload, this.authUser())
        await this.load(courseId, lessonId)
      } finally {
        this.isSavingPolicy = false
      }
    },

    async updateConfigBulk(courseId, lessonIds, payload) {
      const normalized = Array.from(new Set((lessonIds || []).map((id) => String(id || '')).filter(Boolean)))
      if (!normalized.length) return
      this.isSavingBulkPolicy = true
      try {
        await Promise.all(
          normalized.map((lessonId) =>
            apiClient.courses.updateAssignmentConfig(courseId, lessonId, payload, this.authUser()),
          ),
        )
      } finally {
        this.isSavingBulkPolicy = false
      }
    },

    async getAttachmentData(uploadId) {
      const payload = await apiClient.courses.getAttachmentData(uploadId, this.authUser())
      return payload?.dataUrl || ''
    },

    async getAttachmentUrl(uploadId) {
      const payload = await apiClient.courses.getAttachmentUrl(uploadId, this.authUser())
      return {
        url: payload?.url || '',
        requiresAuth: Boolean(payload?.requiresAuth),
      }
    },

    clear() {
      this.assignment = null
      this.windowStatus = null
      this.serverTime = ''
      this.overviewByLesson = {}
      this.mySubmission = null
      this.submissions = []
      this.isLoadingOverview = false
      this.isSavingPolicy = false
      this.isSavingBulkPolicy = false
      this.currentScope = ''
    },
  },
})
