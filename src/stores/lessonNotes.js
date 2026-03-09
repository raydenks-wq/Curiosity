import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from './auth'

export const useLessonNotesStore = defineStore('lessonNotes', {
  state: () => ({
    items: [],
    currentScope: '',
    isLoading: false,
    isSubmitting: false,
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
        this.items = await apiClient.courses.listLessonNotes(courseId, lessonId, this.authUser())
        this.currentScope = this.scope(courseId, lessonId)
      } finally {
        this.isLoading = false
      }
    },

    async add(courseId, lessonId, payload) {
      this.isSubmitting = true
      try {
        this.items = await apiClient.courses.addLessonNote(courseId, lessonId, payload, this.authUser())
        this.currentScope = this.scope(courseId, lessonId)
      } finally {
        this.isSubmitting = false
      }
    },

    async update(courseId, lessonId, noteId, payload) {
      this.isSubmitting = true
      try {
        this.items = await apiClient.courses.updateLessonNote(courseId, lessonId, noteId, payload, this.authUser())
        this.currentScope = this.scope(courseId, lessonId)
      } finally {
        this.isSubmitting = false
      }
    },

    async remove(courseId, lessonId, noteId) {
      this.isSubmitting = true
      try {
        this.items = await apiClient.courses.deleteLessonNote(courseId, lessonId, noteId, this.authUser())
        this.currentScope = this.scope(courseId, lessonId)
      } finally {
        this.isSubmitting = false
      }
    },

    clear() {
      this.items = []
      this.currentScope = ''
      this.isLoading = false
      this.isSubmitting = false
    },
  },
})
