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

const LOCAL_ASSIGNMENT_SUBMISSION_KEY = 'curiosity:lms:assignment-submissions:v1'
const LOCAL_UPLOAD_STORE_KEY = 'curiosity:lms:uploads:v1'
const LOCAL_ASSIGNMENT_CONFIG_KEY = 'curiosity:lms:assignment-config:v1'
const LOCAL_LESSON_NOTES_KEY = 'curiosity:lms:lesson-notes:v1'
const MAX_ASSIGNMENT_UPLOAD_BYTES = 2 * 1024 * 1024
const MAX_ASSIGNMENT_UPLOAD_TOTAL_BYTES = 20 * 1024 * 1024
const allowedUploadMimePrefix = [
  'data:image/png;base64,',
  'data:image/jpeg;base64,',
  'data:image/jpg;base64,',
  'data:image/webp;base64,',
  'data:image/gif;base64,',
  'data:application/pdf;base64,',
  'data:application/zip;base64,',
  'data:text/plain;base64,',
  'data:application/json;base64,',
]

const assignmentScope = (courseId, lessonId) => `${courseId}:${lessonId}`

const canReviewAssignment = (user) => user?.role === 'admin' || user?.role === 'instructor'

const flattenCourseLessons = (course) =>
  (course?.modules || []).flatMap((module) =>
    (module.lessons || []).map((lesson) => ({
      ...lesson,
      moduleId: module.id,
      moduleTitle: module.title,
    })),
  )

const getCourseLesson = (courseId, lessonId, userId) => {
  const course = coursePlayerService.getCourse(courseId, userId || 'guest')
  const lesson = flattenCourseLessons(course).find((item) => item.id === lessonId) || null
  return { course, lesson }
}

const buildDefaultAssignment = (course, lesson) => ({
  id: `asg-${course.id}-${lesson.id}`,
  title: `Project: ${lesson.title}`,
  instructions: `${lesson.summary} Upload hasil praktik kamu dalam format link atau lampiran.`,
  acceptedFormats: ['link', 'attachment'],
  maxAttachmentMb: 2,
  dueAt: '2026-03-31T16:59:00.000Z',
  graceMinutes: 24 * 60,
  rubric: [
    {
      id: 'problem-understanding',
      label: 'Problem Understanding',
      description: 'Apakah solusi menunjukkan pemahaman konteks dan kebutuhan user.',
      maxScore: 40,
    },
    {
      id: 'execution-quality',
      label: 'Execution Quality',
      description: 'Kualitas struktur, detail visual, atau implementasi teknis.',
      maxScore: 40,
    },
    {
      id: 'communication',
      label: 'Communication',
      description: 'Kejelasan penjelasan proses, keputusan, dan hasil.',
      maxScore: 20,
    },
  ],
})

const getAssignmentDefinition = (course, lesson) => {
  const configStore = readJson(LOCAL_ASSIGNMENT_CONFIG_KEY, {})
  const scopedConfig = configStore[assignmentScope(course.id, lesson.id)] || {}
  const lessonAssignment = lesson?.assignment
  if (!lessonAssignment || typeof lessonAssignment !== 'object') {
    return {
      ...buildDefaultAssignment(course, lesson),
      ...scopedConfig,
    }
  }
  const fallback = buildDefaultAssignment(course, lesson)
  return {
    ...fallback,
    ...lessonAssignment,
    ...scopedConfig,
    rubric: Array.isArray(lessonAssignment.rubric) && lessonAssignment.rubric.length ? lessonAssignment.rubric : fallback.rubric,
  }
}

const readAssignmentStore = () => readJson(LOCAL_ASSIGNMENT_SUBMISSION_KEY, {})

const writeAssignmentStore = (payload) => writeJson(LOCAL_ASSIGNMENT_SUBMISSION_KEY, payload)

const readUploadStore = () => readJson(LOCAL_UPLOAD_STORE_KEY, {})

const writeUploadStore = (payload) => writeJson(LOCAL_UPLOAD_STORE_KEY, payload)

const notesScope = (userId, courseId, lessonId) => `${String(userId || 'guest')}:${courseId}:${lessonId}`
const readNotesStore = () => readJson(LOCAL_LESSON_NOTES_KEY, {})
const writeNotesStore = (payload) => writeJson(LOCAL_LESSON_NOTES_KEY, payload)
const listLessonNotesLocal = (userId, courseId, lessonId) => {
  const store = readNotesStore()
  const scoped = store[notesScope(userId, courseId, lessonId)]
  if (!Array.isArray(scoped)) return []
  return scoped
    .map((item) => ({
      id: String(item.id || ''),
      timestampSec: Math.max(0, Math.floor(Number(item.timestampSec || 0))),
      note: String(item.note || ''),
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || item.createdAt || null,
    }))
    .filter((item) => item.id && item.note)
    .sort((a, b) => a.timestampSec - b.timestampSec)
}
const writeLessonNotesLocal = (userId, courseId, lessonId, notes) => {
  const store = readNotesStore()
  store[notesScope(userId, courseId, lessonId)] = Array.isArray(notes) ? notes : []
  writeNotesStore(store)
}

const readLessonSubmissions = (courseId, lessonId) => {
  const all = readAssignmentStore()
  const scoped = all[assignmentScope(courseId, lessonId)]
  if (!Array.isArray(scoped)) return []
  return scoped.map((item) => ({
    ...item,
    attachmentId: item.attachmentId || '',
    attachmentUrl: item.attachmentUrl || '',
    history: Array.isArray(item.history) ? item.history : [],
    rubricScores: Array.isArray(item.rubricScores) ? item.rubricScores : [],
  }))
}

const writeLessonSubmissions = (courseId, lessonId, items) => {
  const all = readAssignmentStore()
  all[assignmentScope(courseId, lessonId)] = items
  writeAssignmentStore(all)
}

const calcRubricPercent = (assignment, rubricScores = []) => {
  const rubric = Array.isArray(assignment?.rubric) ? assignment.rubric : []
  const max = rubric.reduce((sum, item) => sum + Number(item.maxScore || 0), 0)
  if (!max) return null
  const map = new Map(rubricScores.map((item) => [item.criterionId, Number(item.score || 0)]))
  const total = rubric.reduce((sum, criterion) => sum + Math.max(0, Number(map.get(criterion.id) || 0)), 0)
  return Math.round((total / max) * 100)
}

const getAssignmentWindowStatus = (assignment, now = Date.now()) => {
  const dueAtIso = assignment?.dueAt || null
  const dueAtMs = dueAtIso ? Date.parse(dueAtIso) : Number.NaN
  const graceMinutes = Math.max(0, Number(assignment?.graceMinutes || 0))
  if (!Number.isFinite(dueAtMs)) {
    return {
      hasDeadline: false,
      dueAt: null,
      graceMinutes: 0,
      isLateWindow: false,
      isClosed: false,
      lateByMinutes: 0,
    }
  }
  const graceMs = graceMinutes * 60 * 1000
  const isLateWindow = now > dueAtMs && now <= dueAtMs + graceMs
  const isClosed = now > dueAtMs + graceMs
  const lateByMinutes = now > dueAtMs ? Math.floor((now - dueAtMs) / (60 * 1000)) : 0
  return {
    hasDeadline: true,
    dueAt: new Date(dueAtMs).toISOString(),
    graceMinutes,
    isLateWindow,
    isClosed,
    lateByMinutes,
  }
}

const createLocalUpload = ({ fileName, dataUrl, ownerId, ownerName, ownerEmail }) => {
  if (!dataUrl.startsWith('data:')) throw new Error('Lampiran tidak valid.')
  if (!allowedUploadMimePrefix.some((prefix) => dataUrl.startsWith(prefix))) {
    throw new Error('Unsupported file type.')
  }
  const [, base64Payload = ''] = dataUrl.split(',')
  const sizeBytes = Math.floor((base64Payload.length * 3) / 4)
  if (sizeBytes > MAX_ASSIGNMENT_UPLOAD_BYTES) {
    throw new Error('File size exceeds 2MB limit.')
  }
  const store = readUploadStore()
  const usageBytes = Object.values(store)
    .filter((item) => item && typeof item === 'object' && item.ownerId === ownerId)
    .reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0)
  if (usageBytes + sizeBytes > MAX_ASSIGNMENT_UPLOAD_TOTAL_BYTES) {
    throw new Error('User upload quota exceeded (20MB).')
  }
  const seq = Number(store.__seq || 1)
  const uploadId = `upl-local-${seq}`
  store.__seq = seq + 1
  store[uploadId] = {
    id: uploadId,
    fileName: String(fileName || 'attachment'),
    dataUrl,
    sizeBytes,
    ownerId: ownerId || '',
    ownerName: ownerName || '',
    ownerEmail: ownerEmail || '',
    uploadedAt: new Date().toISOString(),
  }
  writeUploadStore(store)
  return store[uploadId]
}

const toSubmissionHistoryEntry = (submission, action, actor, previousSnapshot = null) => ({
  id: `subhist-${Math.random().toString(36).slice(2, 10)}`,
  action,
  actor: {
    id: actor?.id || '',
    name: actor?.name || actor?.email || 'System',
    email: actor?.email || '',
  },
  createdAt: new Date().toISOString(),
  previousSnapshot: previousSnapshot || null,
  snapshot: {
    status: submission?.status || 'submitted',
    linkUrl: submission?.linkUrl || '',
    notes: submission?.notes || '',
    attachmentName: submission?.attachmentName || '',
    attachmentId: submission?.attachmentId || '',
    attachmentUrl: submission?.attachmentUrl || '',
    feedback: submission?.feedback || '',
    rubricScores: Array.isArray(submission?.rubricScores) ? submission.rubricScores : [],
    scorePercent: submission?.scorePercent ?? null,
    reviewedAt: submission?.reviewedAt || null,
    submissionMode: submission?.submissionMode || 'on-time',
    lateByMinutes: Number(submission?.lateByMinutes || 0),
  },
})

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
  analytics: {
    getLearning: (_payload, user) => Promise.resolve(coursePlayerService.getLearningAnalytics(user?.id)),
  },
  courses: {
    listCourses: (userId) => Promise.resolve(coursePlayerService.listCourses(userId)),
    getContinueLearning: (user) => Promise.resolve(coursePlayerService.getContinueLearning(user?.id)),
    getCourse: (courseId, userId) => Promise.resolve(coursePlayerService.getCourse(courseId, userId)),
    setActiveLesson: (courseId, lessonId, userId) =>
      Promise.resolve(coursePlayerService.setActiveLesson(courseId, lessonId, userId)),
    completeLesson: (courseId, lessonId, userId) =>
      Promise.resolve(coursePlayerService.completeLesson(courseId, lessonId, userId)),
    saveLessonPlayback: (courseId, lessonId, payload, userId) =>
      Promise.resolve(coursePlayerService.updateLessonPlayback(courseId, lessonId, payload, userId)),
    listLessonNotes: (courseId, lessonId, user) =>
      Promise.resolve(listLessonNotesLocal(user?.id, courseId, lessonId)),
    addLessonNote: (courseId, lessonId, payload, user) =>
      Promise.resolve().then(() => {
        const note = String(payload?.note || '').trim()
        if (!note) throw new Error('Catatan tidak boleh kosong.')
        const timestampSec = Math.max(0, Math.floor(Number(payload?.timestampSec || 0)))
        const nowIso = new Date().toISOString()
        const next = [
          ...listLessonNotesLocal(user?.id, courseId, lessonId),
          {
            id: `note-${Math.random().toString(36).slice(2, 10)}`,
            timestampSec,
            note,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ]
        writeLessonNotesLocal(user?.id, courseId, lessonId, next)
        return listLessonNotesLocal(user?.id, courseId, lessonId)
      }),
    updateLessonNote: (courseId, lessonId, noteId, payload, user) =>
      Promise.resolve().then(() => {
        const note = String(payload?.note || '').trim()
        if (!note) throw new Error('Catatan tidak boleh kosong.')
        const current = listLessonNotesLocal(user?.id, courseId, lessonId)
        if (!current.some((item) => item.id === noteId)) {
          const error = new Error('Note not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const next = current.map((item) =>
          item.id === noteId
            ? {
                ...item,
                note,
                updatedAt: new Date().toISOString(),
              }
            : item,
        )
        writeLessonNotesLocal(user?.id, courseId, lessonId, next)
        return listLessonNotesLocal(user?.id, courseId, lessonId)
      }),
    deleteLessonNote: (courseId, lessonId, noteId, user) =>
      Promise.resolve().then(() => {
        const current = listLessonNotesLocal(user?.id, courseId, lessonId)
        const next = current.filter((item) => item.id !== noteId)
        if (next.length === current.length) {
          const error = new Error('Note not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        writeLessonNotesLocal(user?.id, courseId, lessonId, next)
        return listLessonNotesLocal(user?.id, courseId, lessonId)
      }),
    updateModulePrerequisite: (courseId, moduleId, payload, user) =>
      Promise.resolve().then(() => {
        if (!canReviewAssignment(user)) {
          const error = new Error('Instructor/Admin access required.')
          error.code = 'FORBIDDEN'
          throw error
        }
        return coursePlayerService.updateModulePrerequisite(courseId, moduleId, payload, user?.id)
      }),
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
    getAssignment: (courseId, lessonId, user) =>
      Promise.resolve().then(() => {
        const { course, lesson } = getCourseLesson(courseId, lessonId, user?.id)
        if (!course || !lesson) {
          const error = new Error('Lesson tidak ditemukan.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const assignment = getAssignmentDefinition(course, lesson)
        const windowStatus = getAssignmentWindowStatus(assignment, Date.now())
        const submissions = readLessonSubmissions(courseId, lessonId)
          .slice()
          .sort((a, b) => String(b.updatedAt || b.submittedAt).localeCompare(String(a.updatedAt || a.submittedAt)))
        const mySubmission = submissions.find((item) => item.userId === user?.id) || null
        return {
          assignment,
          windowStatus,
          serverTime: new Date().toISOString(),
          mySubmission,
          submissions: canReviewAssignment(user) ? submissions : [],
        }
      }),
    updateAssignmentConfig: (courseId, lessonId, payload, user) =>
      Promise.resolve().then(() => {
        if (!canReviewAssignment(user)) {
          const error = new Error('Instructor/Admin access required.')
          error.code = 'FORBIDDEN'
          throw error
        }
        const { course, lesson } = getCourseLesson(courseId, lessonId, user?.id)
        if (!course || !lesson) throw new Error('Lesson tidak ditemukan.')

        const configStore = readJson(LOCAL_ASSIGNMENT_CONFIG_KEY, {})
        const scope = assignmentScope(courseId, lessonId)
        const current = configStore[scope] || {}
        configStore[scope] = {
          ...current,
          dueAt: payload?.dueAt === null ? null : payload?.dueAt || current?.dueAt || null,
          graceMinutes: Number.isFinite(payload?.graceMinutes)
            ? Math.max(0, Number(payload.graceMinutes))
            : Number(current?.graceMinutes || 24 * 60),
        }
        writeJson(LOCAL_ASSIGNMENT_CONFIG_KEY, configStore)

        const assignment = getAssignmentDefinition(course, lesson)
        return {
          assignment,
          windowStatus: getAssignmentWindowStatus(assignment, Date.now()),
          serverTime: new Date().toISOString(),
        }
      }),
    submitAssignment: (courseId, lessonId, payload, user) =>
      Promise.resolve().then(() => {
        const { course, lesson } = getCourseLesson(courseId, lessonId, user?.id)
        if (!course || !lesson) throw new Error('Lesson tidak ditemukan.')
        if (!user?.id) throw new Error('User tidak valid.')

        const assignment = getAssignmentDefinition(course, lesson)
        const windowStatus = getAssignmentWindowStatus(assignment, Date.now())
        if (windowStatus.isClosed) {
          throw new Error('Submission window is closed.')
        }
        const linkUrl = String(payload?.linkUrl || '').trim()
        const notes = String(payload?.notes || '').trim()
        const attachmentName = String(payload?.attachmentName || '').trim()
        const attachmentDataUrl = String(payload?.attachmentDataUrl || '').trim()
        const attachmentId = String(payload?.attachmentId || '').trim()
        if (!linkUrl && !notes && !attachmentDataUrl && !attachmentId) {
          throw new Error('Isi minimal salah satu: link, catatan, atau lampiran.')
        }
        let uploadMeta = null
        if (attachmentId) {
          const uploadStore = readUploadStore()
          uploadMeta = uploadStore[attachmentId] || null
          if (!uploadMeta) throw new Error('Attachment upload not found.')
        } else if (attachmentDataUrl) {
          uploadMeta = createLocalUpload({
            fileName: attachmentName || 'attachment',
            dataUrl: attachmentDataUrl,
            ownerId: user.id,
            ownerName: user.name,
            ownerEmail: user.email,
          })
        }

        const current = readLessonSubmissions(courseId, lessonId)
        const existing = current.find((item) => item.userId === user.id) || null
        const nowIso = new Date().toISOString()
        const previousSnapshot = existing?.history?.[0]?.snapshot || null
        const nextHistory = existing
          ? [toSubmissionHistoryEntry(existing, 'resubmitted', user, previousSnapshot), ...(existing.history || [])].slice(0, 40)
          : []
        const nextSubmission = {
          id: existing?.id || `sub-${Math.random().toString(36).slice(2, 10)}`,
          courseId,
          lessonId,
          assignmentId: assignment.id,
          userId: user.id,
          userName: user.name || user.email || 'User',
          userEmail: user.email || '',
          status: 'submitted',
          linkUrl,
          notes,
          attachmentId: uploadMeta?.id || '',
          attachmentName: uploadMeta?.fileName || attachmentName,
          attachmentUrl: uploadMeta?.id ? `local://upload/${uploadMeta.id}` : '',
          attachmentSizeBytes: uploadMeta?.sizeBytes || 0,
          attachmentDataUrl: uploadMeta?.id ? '' : attachmentDataUrl,
          submittedAt: existing?.submittedAt || nowIso,
          updatedAt: nowIso,
          submissionMode: windowStatus.isLateWindow ? 'late' : 'on-time',
          lateByMinutes: windowStatus.isLateWindow ? windowStatus.lateByMinutes : 0,
          reviewedAt: null,
          reviewedBy: null,
          feedback: '',
          rubricScores: [],
          scorePercent: null,
          history: nextHistory,
        }

        const updated = existing
          ? current.map((item) => (item.id === existing.id ? nextSubmission : item))
          : [nextSubmission, ...current]
        writeLessonSubmissions(courseId, lessonId, updated)
        return nextSubmission
      }),
    reviewSubmission: (courseId, lessonId, submissionId, payload, user) =>
      Promise.resolve().then(() => {
        if (!canReviewAssignment(user)) {
          const error = new Error('Instructor/Admin access required.')
          error.code = 'FORBIDDEN'
          throw error
        }
        const { course, lesson } = getCourseLesson(courseId, lessonId, user?.id)
        if (!course || !lesson) throw new Error('Lesson tidak ditemukan.')
        const assignment = getAssignmentDefinition(course, lesson)
        const rubricMap = new Map((assignment.rubric || []).map((criterion) => [criterion.id, criterion]))

        const current = readLessonSubmissions(courseId, lessonId)
        const target = current.find((item) => item.id === submissionId)
        if (!target) {
          const error = new Error('Submission tidak ditemukan.')
          error.code = 'NOT_FOUND'
          throw error
        }

        const payloadScores = Array.isArray(payload?.rubricScores) ? payload.rubricScores : target.rubricScores || []
        const normalizedScores = payloadScores.map((item) => {
          const criterion = rubricMap.get(item.criterionId)
          if (!criterion) throw new Error(`Rubric ${item.criterionId} tidak ditemukan.`)
          const maxScore = Number(criterion.maxScore || 0)
          const score = Number(item.score || 0)
          if (score > maxScore) throw new Error(`Skor ${criterion.label} melebihi batas ${maxScore}.`)
          return {
            criterionId: item.criterionId,
            score: Math.max(0, score),
            comment: String(item.comment || '').trim(),
          }
        })

        const nowIso = new Date().toISOString()
        const nextSubmission = {
          ...target,
          status: payload?.status === 'revised' ? 'revised' : 'graded',
          feedback: typeof payload?.feedback === 'string' ? payload.feedback.trim() : String(target.feedback || ''),
          rubricScores: normalizedScores,
          scorePercent: payload?.status === 'graded' ? calcRubricPercent(assignment, normalizedScores) : null,
          reviewedAt: nowIso,
          reviewedBy: {
            id: user?.id || '',
            name: user?.name || user?.email || 'Instructor',
            email: user?.email || '',
          },
          updatedAt: nowIso,
          history: [toSubmissionHistoryEntry(target, 'reviewed', user, target?.history?.[0]?.snapshot || null), ...(target.history || [])].slice(0, 40),
        }

        writeLessonSubmissions(
          courseId,
          lessonId,
          current.map((item) => (item.id === submissionId ? nextSubmission : item)),
        )
        return nextSubmission
      }),
    getAttachmentData: (uploadId) =>
      Promise.resolve().then(() => {
        const store = readUploadStore()
        const upload = store[String(uploadId || '')]
        if (!upload) {
          const error = new Error('Upload not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        return {
          id: upload.id,
          fileName: upload.fileName,
          sizeBytes: upload.sizeBytes,
          dataUrl: upload.dataUrl,
        }
      }),
    getAttachmentUrl: () =>
      Promise.resolve({
        url: '',
        requiresAuth: true,
      }),
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
