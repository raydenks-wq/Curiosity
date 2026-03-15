import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'

const createBlankQuestion = (index = 1) => ({
  id: `q-${index}`,
  title: '',
  options: ['', ''],
  correctIndex: 0,
  explanation: '',
})

const createBlankQuiz = () => ({
  id: '',
  courseId: 'ui-101',
  moduleId: 'ui-101-m1',
  title: '',
  description: '',
  status: 'draft',
  passingScore: 70,
  maxAttempts: 3,
  timeLimitSec: 6 * 60,
  questions: [createBlankQuestion(1)],
})

const normalizeIdCandidate = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const createUniqueQuizId = (existingIds, preferredId) => {
  const base = normalizeIdCandidate(preferredId) || `quiz-${Math.random().toString(36).slice(2, 6)}`
  if (!existingIds.has(base)) return base
  let index = 2
  while (existingIds.has(`${base}-${index}`)) {
    index += 1
  }
  return `${base}-${index}`
}

export const useQuizManagementStore = defineStore('quizManagement', {
  state: () => ({
    quizzes: [],
    courses: [],
    modulesByCourse: {},
    editor: createBlankQuiz(),
    isLoading: false,
    isSaving: false,
    loaded: false,
  }),

  actions: {
    async load(force = false) {
      if (this.loaded && !force) return
      this.isLoading = true
      try {
        const [quizzes, courseCards] = await Promise.all([apiClient.quiz.list(), apiClient.courses.listCourses()])
        this.quizzes = quizzes
        this.courses = Array.isArray(courseCards) ? courseCards : []
        await Promise.all(
          this.courses.map(async (course) => {
            const detail = await apiClient.courses.getCourse(course.id)
            this.modulesByCourse = {
              ...this.modulesByCourse,
              [course.id]: Array.isArray(detail.modules) ? detail.modules.map((module) => ({ id: module.id, title: module.title })) : [],
            }
          }),
        )
        this.loaded = true
      } finally {
        this.isLoading = false
      }
    },

    async refreshQuizzes() {
      const list = await apiClient.quiz.list()
      this.quizzes = Array.isArray(list) ? list : []
      this.loaded = true
      return this.quizzes
    },

    resetEditor() {
      this.editor = createBlankQuiz()
    },

    async editQuiz(quizId) {
      this.isLoading = true
      try {
        const detail = await apiClient.quiz.getEditor(quizId)
        this.editor = {
          id: detail.id,
          courseId: detail.courseId,
          moduleId: detail.moduleId,
          title: detail.title,
          description: detail.description,
          status: detail.status || 'draft',
          passingScore: detail.passingScore,
          maxAttempts: detail.maxAttempts,
          timeLimitSec: detail.timeLimitSec,
          questions: (detail.questions || []).map((question, idx) => ({
            id: question.id || `q-${idx + 1}`,
            title: question.title || '',
            options: Array.isArray(question.options) && question.options.length ? [...question.options] : ['', ''],
            correctIndex: Number.isInteger(question.correctIndex) ? question.correctIndex : 0,
            explanation: question.explanation || '',
          })),
        }
      } finally {
        this.isLoading = false
      }
    },

    duplicateCurrentEditor() {
      const source = this.editor
      this.editor = {
        ...createBlankQuiz(),
        ...source,
        id: '',
        title: `${source.title} (Copy)`,
        status: 'draft',
        questions: (source.questions || []).map((question, idx) => ({
          ...question,
          id: question.id || `q-${idx + 1}`,
          options: [...(question.options || [])],
        })),
      }
    },

    importEditor(payload) {
      const existingIds = new Set(this.quizzes.map((quiz) => quiz.id))
      const importedId = payload.id ? String(payload.id) : ''
      const hasConflict = importedId && existingIds.has(importedId)
      const resolvedId = hasConflict ? createUniqueQuizId(existingIds, importedId) : importedId
      this.editor = {
        id: resolvedId || '',
        courseId: payload.courseId || this.editor.courseId || 'ui-101',
        moduleId: payload.moduleId || this.editor.moduleId || 'ui-101-m1',
        title: payload.title || '',
        description: payload.description || '',
        status: payload.status === 'published' ? 'published' : 'draft',
        passingScore: Number(payload.passingScore ?? 70),
        maxAttempts: Number(payload.maxAttempts ?? 3),
        timeLimitSec: Number(payload.timeLimitSec ?? 360),
        questions: Array.isArray(payload.questions) && payload.questions.length
          ? payload.questions.map((question, idx) => ({
              id: question.id || `q-${idx + 1}`,
              title: question.title || '',
              options: Array.isArray(question.options) && question.options.length ? [...question.options] : ['', ''],
              correctIndex: Number.isInteger(question.correctIndex) ? question.correctIndex : 0,
              explanation: question.explanation || '',
            }))
          : [createBlankQuestion(1)],
      }
      return {
        hasIdConflict: Boolean(hasConflict),
        resolvedId,
      }
    },

    addQuestion() {
      const nextIndex = this.editor.questions.length + 1
      this.editor.questions = [...this.editor.questions, createBlankQuestion(nextIndex)]
    },

    removeQuestion(questionId) {
      if (this.editor.questions.length <= 1) return
      this.editor.questions = this.editor.questions.filter((question) => question.id !== questionId)
    },

    addOption(questionId) {
      this.editor.questions = this.editor.questions.map((question) => {
        if (question.id !== questionId || question.options.length >= 6) return question
        return { ...question, options: [...question.options, ''] }
      })
    },

    removeOption(questionId, optionIndex) {
      this.editor.questions = this.editor.questions.map((question) => {
        if (question.id !== questionId || question.options.length <= 2) return question
        const nextOptions = question.options.filter((_, idx) => idx !== optionIndex)
        const nextCorrect = question.correctIndex >= nextOptions.length ? nextOptions.length - 1 : question.correctIndex
        return {
          ...question,
          options: nextOptions,
          correctIndex: Math.max(0, nextCorrect),
        }
      })
    },

    async saveEditor() {
      const payload = {
        ...this.editor,
        id: this.editor.id || undefined,
        status: this.editor.status === 'published' ? 'published' : 'draft',
        questions: this.editor.questions.map((question, idx) => ({
          id: question.id || `q-${idx + 1}`,
          title: String(question.title || '').trim(),
          options: question.options.map((option) => String(option || '').trim()).filter(Boolean),
          correctIndex: question.correctIndex,
          explanation: String(question.explanation || '').trim(),
        })),
      }

      if (payload.questions.some((question) => question.options.length < 2 || question.correctIndex >= question.options.length)) {
        const error = new Error('Beberapa soal belum valid. Pastikan opsi minimal 2 dan jawaban benar dipilih.')
        error.code = 'INVALID_QUESTION'
        throw error
      }

      this.isSaving = true
      try {
        const saved = await apiClient.quiz.save(payload)
        const meta = await apiClient.quiz.getMeta(saved.id)
        this.quizzes = this.quizzes.some((quiz) => quiz.id === meta.id)
          ? this.quizzes.map((quiz) => (quiz.id === meta.id ? { ...quiz, ...meta } : quiz))
          : [meta, ...this.quizzes]
        this.editor.id = saved.id
        this.loaded = true
        return saved
      } finally {
        this.isSaving = false
      }
    },

    async deleteQuiz(quizId) {
      await apiClient.quiz.remove(quizId)
      await this.refreshQuizzes()
      if (this.editor.id === quizId) {
        this.resetEditor()
      }
    },

    async setQuizStatus(quizId, status) {
      const updated = await apiClient.quiz.updateStatus(quizId, status)
      await this.refreshQuizzes()
      if (this.editor.id === updated.id) {
        this.editor.status = updated.status
      }
      return updated
    },

    async bulkSetStatus(ids, status) {
      const updatedList = await apiClient.quiz.bulkUpdateStatus(ids, status)
      await this.refreshQuizzes()
      const updatedMap = Object.fromEntries((updatedList || []).map((item) => [item.id, item]))
      if (this.editor.id && updatedMap[this.editor.id]) {
        this.editor.status = updatedMap[this.editor.id].status
      }
      return updatedList
    },

    async bulkDelete(ids) {
      await apiClient.quiz.bulkDelete(ids)
      await this.refreshQuizzes()

      if (ids.includes(this.editor.id)) {
        this.resetEditor()
      }
    },
  },
})
