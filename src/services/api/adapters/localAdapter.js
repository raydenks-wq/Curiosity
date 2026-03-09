import { authService } from '../../authService'
import { auditLogService } from '../../auditLogService'
import { coursePlayerService } from '../../coursePlayerService'
import { lessonDiscussionService } from '../../lessonDiscussionService'
import { getDefaultProfileState, profileService } from '../../profileService'
import { quizCatalogService } from '../../quizCatalogService'
import { quizEngineService } from '../../quizEngineService'
import { accessLevels, permissionLabels, userAccountService } from '../../userAccountService'

const localQuizSessions = new Map()
const LOCAL_QUIZ_BANK_KEY = 'curiosity:lms:quiz-bank:v1'
const seedQuizIds = ['ui-101', 'ui-101-m1', 'fe-101-m1', 'pm-101-m1']

const readJson = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const writeJson = (key, value) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

const seedQuizBank = () => {
  const seeded = seedQuizIds
    .map((id) => quizCatalogService.getQuizById(id))
    .filter(Boolean)
    .map((quiz) => ({ ...quiz, status: quiz.status || 'published' }))
  return seeded
}

const readQuizBank = () => {
  const fallback = seedQuizBank()
  const value = readJson(LOCAL_QUIZ_BANK_KEY, fallback)
  if (!Array.isArray(value) || !value.length) return fallback
  return value.map((quiz) => ({ ...quiz, status: quiz.status || 'published' }))
}

const writeQuizBank = (quizzes) => {
  writeJson(LOCAL_QUIZ_BANK_KEY, quizzes)
}

const quizMeta = (quiz) => ({
  id: quiz.id,
  courseId: quiz.courseId,
  moduleId: quiz.moduleId,
  title: quiz.title,
  description: quiz.description,
  passingScore: quiz.passingScore,
  maxAttempts: quiz.maxAttempts,
  timeLimitSec: quiz.timeLimitSec,
  status: quiz.status || 'published',
  questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
  updatedAt: quiz.updatedAt || quiz.createdAt || null,
})

const shuffle = (list) => {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = next[i]
    next[i] = next[j]
    next[j] = temp
  }
  return next
}

const getLocalQuiz = (quizId) => readQuizBank().find((item) => item.id === quizId) || null
const canManageQuiz = (user) => user?.role === 'admin' || user?.role === 'instructor'

const createLocalSession = (quiz, attemptNo) => {
  const now = Date.now()
  const questions = shuffle(quiz.questions || []).map((question) => {
    const optionPairs = (question.options || []).map((label, index) => ({ label, index }))
    const shuffledOptions = shuffle(optionPairs)
    return {
      id: question.id,
      title: question.title,
      explanation: question.explanation || '',
      options: shuffledOptions.map((item, optionIndex) => ({
        id: `${question.id}-opt-${optionIndex}`,
        label: item.label,
        sourceIndex: item.index,
      })),
      correctIndex: question.correctIndex,
    }
  })

  return {
    quizId: quiz.id,
    title: quiz.title,
    description: quiz.description,
    passingScore: quiz.passingScore,
    maxAttempts: quiz.maxAttempts,
    attemptNo,
    sessionId: `quizsess-${Math.random().toString(36).slice(2, 12)}`,
    startedAt: now,
    expiresAt: now + quiz.timeLimitSec * 1000,
    questions,
  }
}

export const localAdapter = {
  auth: {
    signIn: (payload) => authService.signIn(payload),
    restoreSession: () => authService.restoreSession(),
    signOut: () => authService.signOut(),
    getDemoCredentials: () => authService.getDemoCredentials(),
  },
  profile: {
    load: () => profileService.loadProfile(),
    saveAccount: (payload) => profileService.saveAccount(payload),
    savePreferences: (payload) => profileService.savePreferences(payload),
    updatePassword: (payload) => profileService.updatePassword(payload),
    reset: () => profileService.resetProfile(),
    saveAll: (payload) => profileService.saveFullState(payload),
    getDefaultState: () => getDefaultProfileState(),
  },
  users: {
    loadUsers: () => userAccountService.loadUsers(),
    loadPermissionMatrix: () => userAccountService.loadPermissionMatrix(),
    savePermissionMatrix: (payload) => userAccountService.savePermissionMatrix(payload),
    saveUser: (payload) => userAccountService.saveUser(payload),
    inviteUser: (payload) => userAccountService.inviteUser(payload),
    deleteUser: (id) => userAccountService.deleteUser(id),
    deleteUsers: (ids) => userAccountService.deleteUsers(ids),
    bulkUpdateStatus: (ids, status) => userAccountService.bulkUpdateStatus(ids, status),
    toggleStatus: (id) => userAccountService.toggleStatus(id),
    resetPassword: (id) => userAccountService.resetPassword(id),
  },
  audit: {
    list: (limit = 120) => Promise.resolve(auditLogService.list(limit)),
  },
  notifications: {
    list: (limit, user) => Promise.resolve(lessonDiscussionService.listActivity(user?.id, limit)),
  },
  courses: {
    listCourses: (userId) => Promise.resolve(coursePlayerService.listCourses(userId)),
    getCourse: (courseId, userId) => Promise.resolve(coursePlayerService.getCourse(courseId, userId)),
    setActiveLesson: (courseId, lessonId, userId) =>
      Promise.resolve(coursePlayerService.setActiveLesson(courseId, lessonId, userId)),
    completeLesson: (courseId, lessonId, userId) =>
      Promise.resolve(coursePlayerService.completeLesson(courseId, lessonId, userId)),
    listDiscussion: (courseId, lessonId) => Promise.resolve(lessonDiscussionService.list(courseId, lessonId)),
    addDiscussion: (courseId, lessonId, payload, user) =>
      Promise.resolve(
        lessonDiscussionService.add({
          courseId,
          lessonId,
          message: payload?.message,
          parentId: payload?.parentId || null,
          authorId: user?.id,
          authorName: user?.name,
        }),
      ),
    updateDiscussion: (courseId, lessonId, discussionId, payload, user) =>
      Promise.resolve(
        lessonDiscussionService.update({
          courseId,
          lessonId,
          discussionId,
          message: payload?.message,
          user,
        }),
      ),
    deleteDiscussion: (courseId, lessonId, discussionId, user) =>
      Promise.resolve(
        lessonDiscussionService.remove({
          courseId,
          lessonId,
          discussionId,
          user,
        }),
      ),
  },
  quiz: {
    list: () => Promise.resolve(readQuizBank().map((quiz) => quizMeta(quiz))),
    getEditor: (quizId) => {
      const quiz = readQuizBank().find((item) => item.id === quizId)
      if (!quiz) {
        const error = new Error('Quiz not found.')
        error.code = 'NOT_FOUND'
        return Promise.reject(error)
      }
      return Promise.resolve(quiz)
    },
    save: (payload) =>
      Promise.resolve().then(() => {
        const quizzes = readQuizBank()
        const quizId = payload.id || `${payload.courseId}-${payload.moduleId}-${Math.random().toString(36).slice(2, 6)}`
        const nowIso = new Date().toISOString()
        const existingQuiz = quizzes.find((item) => item.id === quizId) || null
        const next = {
          ...payload,
          id: quizId,
          status: payload.status || existingQuiz?.status || 'draft',
          updatedAt: nowIso,
          createdAt: existingQuiz?.createdAt || nowIso,
        }
        const updated = quizzes.some((item) => item.id === quizId)
          ? quizzes.map((item) => (item.id === quizId ? next : item))
          : [next, ...quizzes]
        writeQuizBank(updated)
        return next
      }),
    updateStatus: (quizId, status) =>
      Promise.resolve().then(() => {
        const quizzes = readQuizBank()
        const target = quizzes.find((item) => item.id === quizId)
        if (!target) {
          const error = new Error('Quiz not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const next = quizzes.map((item) =>
          item.id === quizId
            ? {
                ...item,
                status: status === 'published' ? 'published' : 'draft',
                updatedAt: new Date().toISOString(),
              }
            : item,
        )
        writeQuizBank(next)
        return quizMeta(next.find((item) => item.id === quizId))
      }),
    bulkUpdateStatus: (ids, status) =>
      Promise.resolve().then(() => {
        const idSet = new Set(ids || [])
        const quizzes = readQuizBank()
        const next = quizzes.map((quiz) =>
          idSet.has(quiz.id)
            ? {
                ...quiz,
                status: status === 'published' ? 'published' : 'draft',
                updatedAt: new Date().toISOString(),
              }
            : quiz,
        )
        writeQuizBank(next)
        return next.filter((quiz) => idSet.has(quiz.id)).map((quiz) => quizMeta(quiz))
      }),
    bulkDelete: (ids) =>
      Promise.resolve().then(() => {
        const idSet = new Set(ids || [])
        const quizzes = readQuizBank()
        const next = quizzes.filter((quiz) => !idSet.has(quiz.id))
        writeQuizBank(next)
        return next.map((quiz) => quizMeta(quiz))
      }),
    remove: (quizId) =>
      Promise.resolve().then(() => {
        const quizzes = readQuizBank()
        const hasQuiz = quizzes.some((item) => item.id === quizId)
        if (!hasQuiz) {
          const error = new Error('Quiz not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        writeQuizBank(quizzes.filter((item) => item.id !== quizId))
        return null
      }),
    getMeta: (quizId, user) =>
      Promise.resolve().then(() => {
        const quiz = getLocalQuiz(quizId) || { ...quizEngineService.getQuizMeta(quizId), status: 'published' }
        if ((quiz.status || 'published') !== 'published' && !canManageQuiz(user)) {
          const error = new Error('Quiz ini belum dipublish.')
          error.code = 'FORBIDDEN'
          throw error
        }
        return quizMeta(quiz)
      }),
    getHistory: (quizId, user) => Promise.resolve(quizEngineService.getHistory(quizId, user?.id)),
    startSession: (quizId, payload, user) => {
      const quiz = getLocalQuiz(quizId) || quizEngineService.getQuizMeta(quizId)
      if ((quiz.status || 'published') !== 'published' && !canManageQuiz(user)) {
        const error = new Error('Quiz ini belum dipublish.')
        error.code = 'FORBIDDEN'
        return Promise.reject(error)
      }
      const history = quizEngineService.getHistory(quiz.id, user?.id)
      if (payload?.retake && history.length >= quiz.maxAttempts) {
        const error = new Error('Batas retake sudah tercapai.')
        error.code = 'MAX_ATTEMPT'
        return Promise.reject(error)
      }
      const session = createLocalSession(quiz, history.length + 1)
      localQuizSessions.set(session.sessionId, session)
      return Promise.resolve(session)
    },
    submit: (quizId, payload, user) =>
      Promise.resolve().then(() => {
        const session = localQuizSessions.get(payload?.sessionId)
        if (!session || session.quizId !== quizId) {
          const error = new Error('Quiz session not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        localQuizSessions.delete(payload?.sessionId)
        return quizEngineService.submit({
          session,
          answers: payload?.answers || {},
          userId: user?.id,
          forced: Boolean(payload?.forced),
        })
      }),
  },
  meta: {
    accessLevels,
    permissionLabels,
  },
}
