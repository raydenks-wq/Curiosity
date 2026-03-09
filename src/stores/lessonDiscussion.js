import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from './auth'

export const useLessonDiscussionStore = defineStore('lessonDiscussion', {
  state: () => ({
    items: [],
    isLoading: false,
    isSubmitting: false,
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
      const scope = this.scope(courseId, lessonId)
      try {
        this.items = await apiClient.courses.listDiscussion(courseId, lessonId)
        this.currentScope = scope
      } finally {
        this.isLoading = false
      }
    },

    async add(courseId, lessonId, message, parentId = null) {
      this.isSubmitting = true
      try {
        this.items = await apiClient.courses.addDiscussion(courseId, lessonId, { message, parentId }, this.authUser())
        this.currentScope = this.scope(courseId, lessonId)
      } finally {
        this.isSubmitting = false
      }
    },

    async update(courseId, lessonId, discussionId, message) {
      this.isSubmitting = true
      try {
        this.items = await apiClient.courses.updateDiscussion(courseId, lessonId, discussionId, { message }, this.authUser())
        this.currentScope = this.scope(courseId, lessonId)
      } finally {
        this.isSubmitting = false
      }
    },

    async remove(courseId, lessonId, discussionId) {
      this.isSubmitting = true
      try {
        this.items = await apiClient.courses.deleteDiscussion(courseId, lessonId, discussionId, this.authUser())
        this.currentScope = this.scope(courseId, lessonId)
      } finally {
        this.isSubmitting = false
      }
    },

    clear() {
      this.items = []
      this.currentScope = ''
    },
  },
})
