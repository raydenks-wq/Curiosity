import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from './auth'

export const useCoursePlayerStore = defineStore('coursePlayer', {
  state: () => ({
    courses: [],
    currentCourse: null,
    isLoadingList: false,
    isLoadingCourse: false,
  }),

  actions: {
    getUserScopeId() {
      const authStore = useAuthStore()
      return authStore.user?.id || authStore.user?.email || 'guest'
    },

    async loadCourses() {
      this.isLoadingList = true
      try {
        this.courses = await apiClient.courses.listCourses(this.getUserScopeId())
      } finally {
        this.isLoadingList = false
      }
    },

    async loadCourse(courseId) {
      this.isLoadingCourse = true
      try {
        this.currentCourse = await apiClient.courses.getCourse(courseId, this.getUserScopeId())
        return this.currentCourse
      } finally {
        this.isLoadingCourse = false
      }
    },

    async setActiveLesson(courseId, lessonId) {
      this.currentCourse = await apiClient.courses.setActiveLesson(courseId, lessonId, this.getUserScopeId())
      this.upsertCourseCard(this.currentCourse)
      return this.currentCourse
    },

    async completeLesson(courseId, lessonId) {
      this.currentCourse = await apiClient.courses.completeLesson(courseId, lessonId, this.getUserScopeId())
      this.upsertCourseCard(this.currentCourse)
      return this.currentCourse
    },

    upsertCourseCard(course) {
      const card = {
        id: course.id,
        title: course.title,
        description: course.description,
        progress: course.progress,
        tag: course.tag,
        gradient: course.gradient,
        activeLessonId: course.activeLesson?.id || '',
        activeLessonTitle: course.activeLesson?.title || '',
        totalLessons: course.totalLessons,
        completedLessons: course.completedLessons,
      }

      const idx = this.courses.findIndex((item) => item.id === card.id)
      if (idx < 0) {
        this.courses = [card, ...this.courses]
        return
      }
      this.courses[idx] = card
    },
  },
})
