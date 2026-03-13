import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from './auth'

const PLAYBACK_QUEUE_KEY = 'curiosity:lms:playback-sync-queue:v1'
const MAX_PLAYBACK_RETRY = 5

const readQueue = () => {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(PLAYBACK_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeQueue = (items) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PLAYBACK_QUEUE_KEY, JSON.stringify(Array.isArray(items) ? items : []))
}

const mergePlaybackPayload = (current = {}, next = {}) => {
  const currentPosition = Math.max(0, Math.floor(Number(current?.positionSec || 0)))
  const nextPosition = Math.max(0, Math.floor(Number(next?.positionSec || 0)))
  const currentDuration = Math.max(0, Math.floor(Number(current?.durationSec || 0)))
  const nextDuration = Math.max(0, Math.floor(Number(next?.durationSec || 0)))
  return {
    positionSec: Math.max(currentPosition, nextPosition),
    durationSec: Math.max(currentDuration, nextDuration),
    markCompleted: Boolean(current?.markCompleted) || Boolean(next?.markCompleted),
  }
}

const toRetryDelayMs = (attempts) => {
  const safeAttempts = Math.max(1, Math.floor(Number(attempts || 1)))
  return Math.min(60_000, 1_000 * 2 ** (safeAttempts - 1))
}

export const useCoursePlayerStore = defineStore('coursePlayer', {
  state: () => ({
    courses: [],
    continueLearning: null,
    currentCourse: null,
    isLoadingList: false,
    isLoadingCourse: false,
    playbackSyncQueue: readQueue(),
  }),

  getters: {
    pendingPlaybackSyncCount: (state) => state.playbackSyncQueue.length,
    failedPlaybackSyncCount: (state) => state.playbackSyncQueue.filter((item) => Number(item.attempts || 0) > 0).length,
  },

  actions: {
    getUserScopeId() {
      const authStore = useAuthStore()
      return authStore.user?.id || authStore.user?.email || 'guest'
    },

    getAuthUser() {
      const authStore = useAuthStore()
      return authStore.user || null
    },

    async loadCourses() {
      this.isLoadingList = true
      try {
        await this.flushPlaybackQueue()
        this.courses = await apiClient.courses.listCourses(this.getUserScopeId())
        this.continueLearning = await apiClient.courses.getContinueLearning(this.getAuthUser())
      } catch (error) {
        this.courses = []
        this.continueLearning = null
        throw error
      } finally {
        this.isLoadingList = false
      }
    },

    async loadCourse(courseId) {
      this.isLoadingCourse = true
      try {
        await this.flushPlaybackQueue(courseId)
        this.currentCourse = await apiClient.courses.getCourse(courseId, this.getUserScopeId())
        return this.currentCourse
      } catch (error) {
        this.currentCourse = null
        throw error
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

    applyPlaybackToCourse(lessonId, playback) {
      if (!this.currentCourse?.modules) return playback
      this.currentCourse.modules = this.currentCourse.modules.map((module) => ({
        ...module,
        lessons: (module.lessons || []).map((lesson) =>
          lesson.id === lessonId
            ? {
                ...lesson,
                playback: {
                  ...lesson.playback,
                  ...playback,
                },
              }
            : lesson,
        ),
      }))
      const required = Number(playback?.completionRequiredPercent || 90)
      const progress = Number(playback?.progressPercent || 0)
      const canComplete = typeof playback?.canComplete === 'boolean' ? playback.canComplete : progress >= required
      if (this.currentCourse.activeLesson?.id === lessonId) {
        this.currentCourse.activeLesson = {
          ...this.currentCourse.activeLesson,
          playback: {
            ...this.currentCourse.activeLesson.playback,
            ...playback,
          },
          canComplete,
          completionRequiredPercent: required,
          completionGateReason:
            playback?.completionGateReason ||
            (canComplete ? '' : `Tonton video minimal ${required}% untuk melanjutkan.`),
        }
      }
      this.currentCourse.modules = this.currentCourse.modules.map((module) => ({
        ...module,
        lessons: (module.lessons || []).map((lesson) =>
          lesson.id === lessonId
            ? {
                ...lesson,
                canComplete,
                completionRequiredPercent: required,
                completionGateReason:
                  playback?.completionGateReason ||
                  (canComplete ? '' : `Tonton video minimal ${required}% untuk melanjutkan.`),
              }
            : lesson,
        ),
      }))
      return playback
    },

    async saveLessonPlayback(courseId, lessonId, payload) {
      const userScopeId = this.getUserScopeId()
      try {
        const playback = await apiClient.courses.saveLessonPlayback(courseId, lessonId, payload, userScopeId)
        return this.applyPlaybackToCourse(lessonId, playback)
      } catch {
        this.enqueuePlaybackSync({
          id: `pbq-${Math.random().toString(36).slice(2, 10)}`,
          courseId,
          lessonId,
          payload,
          userScopeId,
          queuedAt: new Date().toISOString(),
        })
        return this.applyPlaybackToCourse(lessonId, {
          positionSec: Math.max(0, Math.floor(Number(payload?.positionSec || 0))),
          durationSec: Math.max(0, Math.floor(Number(payload?.durationSec || 0))),
          queued: true,
        })
      }
    },

    async updateModulePrerequisite(courseId, moduleId, payload) {
      this.currentCourse = await apiClient.courses.updateModulePrerequisite(courseId, moduleId, payload, this.getAuthUser())
      this.upsertCourseCard(this.currentCourse)
      return this.currentCourse
    },

    enqueuePlaybackSync(item) {
      const normalized = {
        id: item?.id || `pbq-${Math.random().toString(36).slice(2, 10)}`,
        courseId: String(item?.courseId || ''),
        lessonId: String(item?.lessonId || ''),
        userScopeId: String(item?.userScopeId || 'guest'),
        payload: mergePlaybackPayload({}, item?.payload || {}),
        queuedAt: item?.queuedAt || new Date().toISOString(),
        attempts: Math.max(0, Number(item?.attempts || 0)),
        nextRetryAt: item?.nextRetryAt || null,
        lastAttemptAt: item?.lastAttemptAt || null,
        lastError: item?.lastError || '',
      }
      const nextQueue = [...this.playbackSyncQueue]
      const existingIdx = nextQueue.findIndex(
        (row) =>
          row?.userScopeId === normalized.userScopeId &&
          row?.courseId === normalized.courseId &&
          row?.lessonId === normalized.lessonId,
      )
      if (existingIdx >= 0) {
        const current = nextQueue[existingIdx]
        nextQueue[existingIdx] = {
          ...current,
          payload: mergePlaybackPayload(current?.payload || {}, normalized.payload || {}),
          queuedAt: current?.queuedAt || normalized.queuedAt,
        }
      } else {
        nextQueue.push(normalized)
      }
      this.playbackSyncQueue = nextQueue.slice(-400)
      writeQueue(this.playbackSyncQueue)
    },

    async flushPlaybackQueue(courseId = null) {
      if (!this.playbackSyncQueue.length) return { flushed: 0, remaining: 0 }
      const userScopeId = this.getUserScopeId()
      const queue = [...this.playbackSyncQueue]
      const retained = []
      let flushed = 0
      let failed = 0
      let dropped = 0
      let skipped = 0
      const nowMs = Date.now()

      for (const item of queue) {
        if (!item || item.userScopeId !== userScopeId) {
          retained.push(item)
          continue
        }
        if (courseId && item.courseId !== courseId) {
          retained.push(item)
          continue
        }
        const retryAtMs = Date.parse(item.nextRetryAt || '')
        if (Number.isFinite(retryAtMs) && retryAtMs > nowMs) {
          retained.push(item)
          skipped += 1
          continue
        }
        try {
          const playback = await apiClient.courses.saveLessonPlayback(item.courseId, item.lessonId, item.payload, userScopeId)
          this.applyPlaybackToCourse(item.lessonId, playback)
          flushed += 1
        } catch (error) {
          const attempts = Math.max(0, Number(item.attempts || 0)) + 1
          if (attempts >= MAX_PLAYBACK_RETRY) {
            dropped += 1
            continue
          }
          failed += 1
          retained.push({
            ...item,
            attempts,
            lastAttemptAt: new Date().toISOString(),
            nextRetryAt: new Date(Date.now() + toRetryDelayMs(attempts)).toISOString(),
            lastError: error instanceof Error ? error.message : 'Playback sync failed.',
          })
        }
      }

      this.playbackSyncQueue = retained
      writeQueue(this.playbackSyncQueue)
      return { flushed, remaining: retained.length, failed, dropped, skipped }
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
        blockedLessons: Number(course.blockedLessons || 0),
        nextLockedLessonTitle: course.nextLockedLessonTitle || '',
        nextLockReason: course.nextLockReason || '',
        lastTouchedAt: course.lastTouchedAt || null,
      }

      const idx = this.courses.findIndex((item) => item.id === card.id)
      if (idx < 0) {
        this.courses = [card, ...this.courses]
      } else {
        this.courses[idx] = card
      }
      const currentTouched = Date.parse(this.continueLearning?.lastTouchedAt || 0)
      const candidateTouched = Date.parse(card.lastTouchedAt || 0)
      if (!this.continueLearning || candidateTouched >= currentTouched) {
        this.continueLearning = card
      }
    },
  },
})
