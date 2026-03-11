import { authService } from '../../authService'
import { authSession } from '../../authSession'
import { auditLogService } from '../../auditLogService'
import { coursePlayerService } from '../../coursePlayerService'
import { lessonDiscussionService } from '../../lessonDiscussionService'
import { getDefaultProfileState, profileService } from '../../profileService'
import { quizCatalogService } from '../../quizCatalogService'
import { quizEngineService } from '../../quizEngineService'
import { accessLevels, permissionLabels, userAccountService } from '../../userAccountService'

const localQuizSessions = new Map()
const LOCAL_QUIZ_BANK_KEY = 'curiosity:lms:quiz-bank:v1'
const LOCAL_COURSE_MGMT_KEY = 'curiosity:lms:course-management:v1'
const LOCAL_COURSE_MGMT_PERMISSION_KEY = 'curiosity:lms:course-management:permissions:v1'
const LOCAL_TELEMETRY_KEY = 'curiosity:lms:telemetry:v1'
const LOCAL_COURSE_MGMT_JOBS_KEY = 'curiosity:lms:course-management:jobs:v1'
const LOCAL_COURSE_MGMT_DLQ_KEY = 'curiosity:lms:course-management:dlq:v1'
const LOCAL_NOTIFICATION_CHANNELS_KEY = 'curiosity:lms:notification-channels:v1'
const LOCAL_NOTIFICATION_DELIVERY_LOGS_KEY = 'curiosity:lms:notification-delivery-logs:v1'
const seedQuizIds = ['ui-101', 'ui-101-m1', 'fe-101-m1', 'pm-101-m1']
const courseManagementPermissionDefault = {
  admin: {
    view: true,
    create: true,
    edit: true,
    delete: true,
    publish: true,
    schedule: true,
    bulk: true,
    importExport: true,
    history: true,
    duplicate: true,
    restoreRevision: true,
    managePermissions: true,
  },
  instructor: {
    view: true,
    create: true,
    edit: true,
    delete: false,
    publish: true,
    schedule: true,
    bulk: true,
    importExport: true,
    history: true,
    duplicate: true,
    restoreRevision: false,
    managePermissions: false,
  },
  student: {
    view: false,
    create: false,
    edit: false,
    delete: false,
    publish: false,
    schedule: false,
    bulk: false,
    importExport: false,
    history: false,
    duplicate: false,
    restoreRevision: false,
    managePermissions: false,
  },
}

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

const readManagedCourses = () => {
  const value = readJson(LOCAL_COURSE_MGMT_KEY, [])
  return Array.isArray(value) ? value : []
}

const writeManagedCourses = (courses) => {
  writeJson(LOCAL_COURSE_MGMT_KEY, Array.isArray(courses) ? courses : [])
}
const readCourseManagementPermissionMatrix = () => {
  const value = readJson(LOCAL_COURSE_MGMT_PERMISSION_KEY, courseManagementPermissionDefault)
  return value && typeof value === 'object' ? value : courseManagementPermissionDefault
}
const writeCourseManagementPermissionMatrix = (matrix) => {
  writeJson(LOCAL_COURSE_MGMT_PERMISSION_KEY, matrix)
}
const getCurrentLocalRole = () => {
  const session = authSession.read()
  return session?.user?.role || 'student'
}
const getCurrentLocalUser = () => {
  const session = authSession.read()
  return session?.user || null
}
const readTelemetryEvents = () => {
  const value = readJson(LOCAL_TELEMETRY_KEY, [])
  return Array.isArray(value) ? value : []
}
const writeTelemetryEvents = (events) => {
  writeJson(LOCAL_TELEMETRY_KEY, Array.isArray(events) ? events : [])
}
const readCourseManagementJobs = () => {
  const value = readJson(LOCAL_COURSE_MGMT_JOBS_KEY, [])
  return Array.isArray(value) ? value : []
}
const writeCourseManagementJobs = (jobs) => {
  writeJson(LOCAL_COURSE_MGMT_JOBS_KEY, Array.isArray(jobs) ? jobs : [])
}
const readCourseManagementDlq = () => {
  const value = readJson(LOCAL_COURSE_MGMT_DLQ_KEY, [])
  return Array.isArray(value) ? value : []
}
const writeCourseManagementDlq = (items) => {
  writeJson(LOCAL_COURSE_MGMT_DLQ_KEY, Array.isArray(items) ? items : [])
}
const localLevelScore = (level) => {
  const order = ['beginner', 'intermediate', 'advanced']
  const index = order.indexOf(String(level || '').toLowerCase())
  return index >= 0 ? index : 0
}
const suggestLocalPrerequisites = (course, allCourses = []) => {
  const currentLevelScore = localLevelScore(course?.level)
  if (currentLevelScore <= 0) return []
  const currentCategory = String(course?.category || '').trim().toLowerCase()
  const candidates = allCourses
    .filter((item) => item.id !== course?.id)
    .filter((item) => localLevelScore(item.level) < currentLevelScore)
    .sort((a, b) => {
      const aSame = String(a.category || '').trim().toLowerCase() === currentCategory
      const bSame = String(b.category || '').trim().toLowerCase() === currentCategory
      if (aSame !== bSame) return aSame ? -1 : 1
      return localLevelScore(b.level) - localLevelScore(a.level)
    })
  return [...new Set(candidates.slice(0, currentLevelScore).map((item) => item.id))]
}
const executeLocalCourseJob = (courses, job) => {
  const ids = Array.isArray(job?.ids) ? job.ids : []
  let processed = 0
  const errors = []
  let nextCourses = [...courses]
  for (const id of ids) {
    const target = nextCourses.find((item) => item.id === id)
    if (!target) continue
    try {
      if (job.type === 'bulk-delete') {
        nextCourses = nextCourses.filter((item) => item.id !== id)
        processed += 1
        continue
      }
      const updatedAt = new Date().toISOString()
      const version = Math.max(1, Number(target.version || 1)) + 1
      if (job.type === 'bulk-status') {
        const status = String(job.statusValue || 'draft')
        nextCourses = nextCourses.map((item) => (item.id === id ? { ...item, status, version, updatedAt } : item))
        processed += 1
        continue
      }
      if (job.type === 'bulk-auto-prerequisite') {
        const suggested = suggestLocalPrerequisites(target, nextCourses)
        nextCourses = nextCourses.map((item) =>
          item.id === id
            ? {
                ...item,
                settings: {
                  ...(item.settings || {}),
                  prerequisiteCourseIds: suggested,
                },
                version,
                updatedAt,
              }
            : item,
        )
        processed += 1
        continue
      }
      if (job.type === 'bulk-clear-prerequisite') {
        nextCourses = nextCourses.map((item) =>
          item.id === id
            ? {
                ...item,
                settings: {
                  ...(item.settings || {}),
                  prerequisiteCourseIds: [],
                },
                version,
                updatedAt,
              }
            : item,
        )
        processed += 1
        continue
      }
      throw new Error('Unknown local job type.')
    } catch (error) {
      errors.push({
        id,
        message: error?.message || 'Local job failed.',
      })
    }
  }
  return {
    courses: nextCourses,
    processed,
    total: ids.length,
    errorCount: errors.length,
    errors,
    status: errors.length > 0 && processed > 0 ? 'partial' : errors.length > 0 ? 'failed' : 'completed',
  }
}
const defaultNotificationChannels = {
  webhookEnabled: false,
  webhookUrl: '',
  emailEnabled: false,
  emailFrom: 'no-reply@curiosity.app',
}
const readNotificationChannels = () => {
  const value = readJson(LOCAL_NOTIFICATION_CHANNELS_KEY, defaultNotificationChannels)
  return value && typeof value === 'object' ? { ...defaultNotificationChannels, ...value } : { ...defaultNotificationChannels }
}
const writeNotificationChannels = (channels) => {
  writeJson(LOCAL_NOTIFICATION_CHANNELS_KEY, { ...defaultNotificationChannels, ...(channels || {}) })
}
const readNotificationDeliveryLogs = () => {
  const value = readJson(LOCAL_NOTIFICATION_DELIVERY_LOGS_KEY, [])
  return Array.isArray(value) ? value : []
}
const writeNotificationDeliveryLogs = (logs) => {
  writeJson(LOCAL_NOTIFICATION_DELIVERY_LOGS_KEY, Array.isArray(logs) ? logs : [])
}
const buildImmutableAuditChain = (items = []) => {
  const sorted = [...items].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
  let prevHash = 'genesis'
  return sorted.map((item) => {
    const seed = JSON.stringify({
      actor: item.actor || '',
      action: item.action || '',
      target: item.target || '',
      detail: item.detail || '',
      timestamp: item.timestamp || '',
      prevHash,
    })
    let hash = 0
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(index)
      hash |= 0
    }
    const entry = {
      id: item.id || `audit-local-${Math.random().toString(36).slice(2, 10)}`,
      actor: item.actor || '',
      action: item.action || '',
      target: item.target || '',
      detail: item.detail || '',
      timestamp: item.timestamp || '',
      prevHash,
      hash: `local-${Math.abs(hash)}`,
    }
    prevHash = entry.hash
    return entry
  })
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
    listImmutable: (limit = 120) =>
      Promise.resolve().then(() => buildImmutableAuditChain(auditLogService.list(limit)).slice(0, Math.max(1, Number(limit || 120)))),
    verifyImmutable: () =>
      Promise.resolve().then(() => {
        const chain = buildImmutableAuditChain(auditLogService.list(500))
        const isValid = chain.every((item, index) => index === 0 || item.prevHash === chain[index - 1].hash)
        return {
          ok: isValid,
          total: chain.length,
          brokenAt: isValid ? -1 : chain.findIndex((item, index) => index > 0 && item.prevHash !== chain[index - 1].hash),
          lastHash: chain[0]?.hash || '',
        }
      }),
  },
  notifications: {
    list: (limit, user) => Promise.resolve(lessonDiscussionService.listActivity(user?.id, limit)),
    getChannels: (_payload, user) =>
      Promise.resolve().then(() => {
        const actor = user || getCurrentLocalUser() || {}
        if (actor?.role !== 'admin') {
          const error = new Error('Forbidden')
          error.code = 'FORBIDDEN'
          throw error
        }
        return readNotificationChannels()
      }),
    saveChannels: (payload, user) =>
      Promise.resolve().then(() => {
        const actor = user || getCurrentLocalUser() || {}
        if (actor?.role !== 'admin') {
          const error = new Error('Forbidden')
          error.code = 'FORBIDDEN'
          throw error
        }
        const next = {
          webhookEnabled: Boolean(payload?.webhookEnabled),
          webhookUrl: String(payload?.webhookUrl || ''),
          emailEnabled: Boolean(payload?.emailEnabled),
          emailFrom: String(payload?.emailFrom || 'no-reply@curiosity.app'),
        }
        writeNotificationChannels(next)
        return next
      }),
    listDeliveryLogs: (limit = 100, user) =>
      Promise.resolve().then(() => {
        const actor = user || getCurrentLocalUser() || {}
        if (actor?.role !== 'admin') {
          const error = new Error('Forbidden')
          error.code = 'FORBIDDEN'
          throw error
        }
        return readNotificationDeliveryLogs().slice(0, Math.max(1, Math.min(Number(limit || 100), 500)))
      }),
    testDelivery: (payload, user) =>
      Promise.resolve().then(() => {
        const actor = user || getCurrentLocalUser() || {}
        if (actor?.role !== 'admin') {
          const error = new Error('Forbidden')
          error.code = 'FORBIDDEN'
          throw error
        }
        const channels = readNotificationChannels()
        const channel = payload?.channel === 'email' ? 'email' : 'webhook'
        const enabled = channel === 'webhook' ? channels.webhookEnabled && channels.webhookUrl : channels.emailEnabled
        const status = enabled ? (channel === 'webhook' ? 'delivered' : 'queued') : 'skipped'
        const item = {
          id: `delivery-local-${Math.random().toString(36).slice(2, 10)}`,
          channel,
          status,
          target: channel === 'webhook' ? channels.webhookUrl : channels.emailFrom,
          message: String(payload?.message || 'Test delivery'),
          createdAt: new Date().toISOString(),
          actorEmail: actor?.email || '',
        }
        const next = [item, ...readNotificationDeliveryLogs()].slice(0, 500)
        writeNotificationDeliveryLogs(next)
        return item
      }),
  },
  analytics: {
    getLearning: (_payload, user) => Promise.resolve(coursePlayerService.getLearningAnalytics(user?.id)),
  },
  observability: {
    track: (payload, user) =>
      Promise.resolve().then(() => {
        const actor = user || getCurrentLocalUser() || {}
        const nowIso = new Date().toISOString()
        const events = readTelemetryEvents()
        const next = [
          {
            id: `evt-local-${Math.random().toString(36).slice(2, 10)}`,
            domain: String(payload?.domain || 'app'),
            action: String(payload?.action || 'unknown'),
            severity: String(payload?.severity || 'info'),
            message: String(payload?.message || ''),
            context: payload?.context && typeof payload.context === 'object' ? payload.context : {},
            meta: payload?.meta && typeof payload.meta === 'object' ? payload.meta : {},
            actorId: actor?.id || '',
            actorEmail: actor?.email || '',
            createdAt: nowIso,
          },
          ...events,
        ].slice(0, 1000)
        writeTelemetryEvents(next)
        return { ok: true }
      }),
    list: (limit = 100, user) =>
      Promise.resolve().then(() => {
        const actor = user || getCurrentLocalUser() || {}
        if (actor?.role !== 'admin') {
          const error = new Error('Forbidden')
          error.code = 'FORBIDDEN'
          throw error
        }
        return readTelemetryEvents().slice(0, Math.max(1, Math.min(Number(limit || 100), 500)))
      }),
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
  courseManagement: {
    getPermissions: () =>
      Promise.resolve().then(() => {
        const matrix = readCourseManagementPermissionMatrix()
        const role = getCurrentLocalRole()
        return matrix[role] || matrix.student
      }),
    getPermissionMatrix: () =>
      Promise.resolve().then(() => {
        const role = getCurrentLocalRole()
        const matrix = readCourseManagementPermissionMatrix()
        if (!matrix?.[role]?.managePermissions) {
          const error = new Error('Forbidden')
          error.code = 'FORBIDDEN'
          throw error
        }
        return matrix
      }),
    savePermissionMatrix: (payload) =>
      Promise.resolve().then(() => {
        const role = getCurrentLocalRole()
        const current = readCourseManagementPermissionMatrix()
        if (!current?.[role]?.managePermissions) {
          const error = new Error('Forbidden')
          error.code = 'FORBIDDEN'
          throw error
        }
        writeCourseManagementPermissionMatrix(payload)
        return payload
      }),
    list: () => Promise.resolve(readManagedCourses()),
    save: (payload) =>
      Promise.resolve().then(() => {
        const courses = readManagedCourses()
        const id = String(payload?.id || `course-${Math.random().toString(36).slice(2, 8)}`)
        const existing = courses.find((course) => course.id === id) || null
        if (existing) {
          const incomingVersion = Number(payload?.version || 0)
          const currentVersion = Number(existing?.version || 1)
          if (!Number.isFinite(incomingVersion) || incomingVersion !== currentVersion) {
            const error = new Error('Course has changed on server. Refresh data first.')
            error.code = 'CONFLICT'
            error.status = 409
            error.data = { latest: existing }
            throw error
          }
        }
        const next = {
          ...payload,
          id,
          version: existing ? Number(existing?.version || 1) + 1 : 1,
          updatedAt: payload?.updatedAt || new Date().toISOString(),
          createdAt: existing?.createdAt || payload?.createdAt || new Date().toISOString(),
          revisions: existing
            ? [
                {
                  id: `rev-${Math.random().toString(36).slice(2, 10)}`,
                  action: 'updated',
                  actor: 'local-user',
                  createdAt: new Date().toISOString(),
                  version: Number(existing?.version || 1),
                  snapshot: { ...existing, revisions: [] },
                },
                ...(Array.isArray(existing?.revisions) ? existing.revisions : []),
              ].slice(0, 40)
            : [
                {
                  id: `rev-${Math.random().toString(36).slice(2, 10)}`,
                  action: 'created',
                  actor: 'local-user',
                  createdAt: new Date().toISOString(),
                  version: 1,
                  snapshot: { ...payload, id, revisions: [] },
                },
              ],
        }
        const updated = courses.some((course) => course.id === id)
          ? courses.map((course) => (course.id === id ? next : course))
          : [next, ...courses]
        writeManagedCourses(updated)
        return next
      }),
    remove: (courseId) =>
      Promise.resolve().then(() => {
        const courses = readManagedCourses()
        const next = courses.filter((course) => course.id !== courseId)
        writeManagedCourses(next)
        return next
      }),
    duplicate: (courseId) =>
      Promise.resolve().then(() => {
        const courses = readManagedCourses()
        const source = courses.find((course) => course.id === courseId)
        if (!source) {
          const error = new Error('Course not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const nowIso = new Date().toISOString()
        const duplicated = {
          ...source,
          id: `course-${Math.random().toString(36).slice(2, 8)}`,
          title: `${source.title || source.id} (Copy)`,
          status: 'draft',
          publishAt: '',
          unpublishAt: '',
          version: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
          revisions: [
            {
              id: `rev-${Math.random().toString(36).slice(2, 10)}`,
              action: 'duplicated',
              actor: 'local-user',
              createdAt: nowIso,
              version: 1,
              snapshot: { ...source, revisions: [] },
            },
          ],
        }
        const next = [duplicated, ...courses]
        writeManagedCourses(next)
        return duplicated
      }),
    listRevisions: (courseId) =>
      Promise.resolve().then(() => {
        const courses = readManagedCourses()
        const target = courses.find((course) => course.id === courseId)
        if (!target) {
          const error = new Error('Course not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        return Array.isArray(target.revisions) ? target.revisions : []
      }),
    restoreRevision: (courseId, revisionId) =>
      Promise.resolve().then(() => {
        const courses = readManagedCourses()
        const target = courses.find((course) => course.id === courseId)
        if (!target) {
          const error = new Error('Course not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const revision = (target.revisions || []).find((item) => item.id === revisionId)
        if (!revision?.snapshot) {
          const error = new Error('Revision not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const nextCourse = {
          ...revision.snapshot,
          id: target.id,
          version: Number(target.version || 1) + 1,
          updatedAt: new Date().toISOString(),
          createdAt: target.createdAt || revision.snapshot.createdAt || new Date().toISOString(),
          revisions: [
            {
              id: `rev-${Math.random().toString(36).slice(2, 10)}`,
              action: `restore:${revision.id}`,
              actor: 'local-user',
              createdAt: new Date().toISOString(),
              version: Number(target.version || 1),
              snapshot: { ...target, revisions: [] },
            },
            ...(Array.isArray(target.revisions) ? target.revisions : []),
          ].slice(0, 40),
        }
        const next = courses.map((course) => (course.id === courseId ? nextCourse : course))
        writeManagedCourses(next)
        return nextCourse
      }),
    updateStatus: (courseId, status, version) =>
      Promise.resolve().then(() => {
        const courses = readManagedCourses()
        const target = courses.find((course) => course.id === courseId)
        if (!target) {
          const error = new Error('Course not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const incomingVersion = Number(version || 0)
        const currentVersion = Number(target?.version || 1)
        if (!Number.isFinite(incomingVersion) || incomingVersion !== currentVersion) {
          const error = new Error('Course has changed on server. Refresh data first.')
          error.code = 'CONFLICT'
          error.status = 409
          error.data = { latest: target }
          throw error
        }
        const next = courses.map((course) =>
          course.id === courseId
            ? {
                ...course,
                status,
                version: currentVersion + 1,
                updatedAt: new Date().toISOString(),
                revisions: [
                  {
                    id: `rev-${Math.random().toString(36).slice(2, 10)}`,
                    action: `status:${status}`,
                    actor: 'local-user',
                    createdAt: new Date().toISOString(),
                    version: currentVersion,
                    snapshot: { ...target, revisions: [] },
                  },
                  ...(Array.isArray(course?.revisions) ? course.revisions : []),
                ].slice(0, 40),
              }
            : course,
        )
        writeManagedCourses(next)
        return next.find((course) => course.id === courseId)
      }),
    listJobs: (limit = 120) =>
      Promise.resolve().then(() => readCourseManagementJobs().slice(0, Math.max(1, Math.min(Number(limit || 120), 500)))),
    enqueueJob: (payload) =>
      Promise.resolve().then(() => {
        const ids = [...new Set((payload?.ids || []).map((id) => String(id || '').trim()).filter(Boolean))]
        const job = {
          id: `cmjob-local-${Math.random().toString(36).slice(2, 10)}`,
          type: String(payload?.type || ''),
          ids,
          statusValue: String(payload?.statusValue || ''),
          status: 'pending',
          attempts: 0,
          processed: 0,
          total: ids.length,
          errorCount: 0,
          errors: [],
          createdBy: getCurrentLocalUser()?.email || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastRunAt: '',
          nextRunAt: '',
          finishedAt: '',
        }
        const next = [job, ...readCourseManagementJobs()].slice(0, 1000)
        writeCourseManagementJobs(next)
        return job
      }),
    processDueJobs: () =>
      Promise.resolve().then(() => {
        const jobs = readCourseManagementJobs()
        const dlq = readCourseManagementDlq()
        const due = jobs.filter((job) => ['pending', 'retrying'].includes(job.status)).slice(0, 5)
        const results = []
        let courses = readManagedCourses()
        for (const job of due) {
          job.status = 'running'
          job.lastRunAt = new Date().toISOString()
          job.updatedAt = job.lastRunAt
          const execution = executeLocalCourseJob(courses, job)
          courses = execution.courses
          job.processed = execution.processed
          job.total = execution.total
          job.errorCount = execution.errorCount
          job.errors = execution.errors
          job.attempts = Number(job.attempts || 0) + 1
          if (execution.status === 'failed' && job.attempts < 3) {
            job.status = 'retrying'
            job.nextRunAt = new Date(Date.now() + job.attempts * 5000).toISOString()
          } else {
            job.status = execution.status
            job.finishedAt = new Date().toISOString()
            job.nextRunAt = ''
            if (execution.errorCount > 0) {
              dlq.unshift({
                id: `dlq-local-${Math.random().toString(36).slice(2, 10)}`,
                sourceJobId: String(job.id || ''),
                reason: execution.status === 'partial' ? 'partial-failure' : 'max-retry-reached',
                status: 'open',
                createdAt: new Date().toISOString(),
                redrivenAt: '',
                redriveCount: 0,
                snapshot: {
                  id: String(job.id || ''),
                  type: String(job.type || ''),
                  ids: Array.isArray(job.ids) ? job.ids : [],
                  statusValue: String(job.statusValue || ''),
                  attempts: Number(job.attempts || 0),
                  processed: Number(job.processed || 0),
                  total: Number(job.total || 0),
                  errorCount: Number(job.errorCount || 0),
                  errors: Array.isArray(job.errors) ? job.errors : [],
                },
              })
            }
          }
          job.updatedAt = new Date().toISOString()
          results.push({
            id: job.id,
            status: job.status,
            processed: job.processed,
            total: job.total,
            errorCount: job.errorCount,
          })
        }
        writeManagedCourses(courses)
        writeCourseManagementJobs(jobs)
        writeCourseManagementDlq(dlq.slice(0, 1000))
        return { processedJobs: results.length, results }
      }),
    runJob: (jobId) =>
      Promise.resolve().then(async () => {
        const jobs = readCourseManagementJobs()
        const target = jobs.find((job) => job.id === jobId)
        if (!target) {
          const error = new Error('Job not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        target.status = 'pending'
        target.nextRunAt = ''
        writeCourseManagementJobs(jobs)
        const result = await localAdapter.courseManagement.processDueJobs()
        return result.results?.[0] || { id: target.id, status: target.status }
      }),
    removeJob: (jobId) =>
      Promise.resolve().then(() => {
        const jobs = readCourseManagementJobs()
        const exists = jobs.some((job) => job.id === jobId)
        if (!exists) {
          const error = new Error('Job not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        writeCourseManagementJobs(jobs.filter((job) => job.id !== jobId))
        return null
      }),
    listDlq: (limit = 120) =>
      Promise.resolve().then(() => readCourseManagementDlq().slice(0, Math.max(1, Math.min(Number(limit || 120), 500)))),
    redriveDlq: (dlqId) =>
      Promise.resolve().then(() => {
        const dlqItems = readCourseManagementDlq()
        const target = dlqItems.find((item) => item.id === dlqId)
        if (!target) {
          const error = new Error('DLQ item not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const job = {
          id: `cmjob-local-${Math.random().toString(36).slice(2, 10)}`,
          type: String(target?.snapshot?.type || ''),
          ids: Array.isArray(target?.snapshot?.ids) ? target.snapshot.ids : [],
          statusValue: String(target?.snapshot?.statusValue || ''),
          status: 'pending',
          attempts: 0,
          processed: 0,
          total: Array.isArray(target?.snapshot?.ids) ? target.snapshot.ids.length : 0,
          errorCount: 0,
          errors: [],
          createdBy: getCurrentLocalUser()?.email || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastRunAt: '',
          nextRunAt: '',
          finishedAt: '',
        }
        const nextJobs = [job, ...readCourseManagementJobs()].slice(0, 1000)
        writeCourseManagementJobs(nextJobs)
        const nextDlq = dlqItems.map((item) =>
          item.id === dlqId
            ? {
                ...item,
                status: 'redriven',
                redriveCount: Number(item.redriveCount || 0) + 1,
                redrivenAt: new Date().toISOString(),
              }
            : item,
        )
        writeCourseManagementDlq(nextDlq)
        return { queued: job, dlq: nextDlq.find((item) => item.id === dlqId) }
      }),
    getWorkerLease: () => Promise.resolve(null),
    exportComplianceBundle: (courseId) =>
      Promise.resolve().then(() => {
        const courses = readManagedCourses()
        const target = courses.find((item) => item.id === courseId)
        if (!target) {
          const error = new Error('Course not found.')
          error.code = 'NOT_FOUND'
          throw error
        }
        const audits = auditLogService.list(1000).filter((item) => String(item.target || '').includes(courseId))
        const jobs = readCourseManagementJobs().filter((item) => Array.isArray(item.ids) && item.ids.includes(courseId))
        const dlq = readCourseManagementDlq().filter((item) => Array.isArray(item?.snapshot?.ids) && item.snapshot.ids.includes(courseId))
        return {
          schemaVersion: '1.0',
          generatedAt: new Date().toISOString(),
          generatedBy: getCurrentLocalUser()?.email || 'local-user',
          course: target,
          revisions: Array.isArray(target.revisions) ? target.revisions : [],
          audit: {
            mutable: audits,
            immutableVerify: {
              ok: true,
              total: audits.length,
              brokenAt: -1,
              lastHash: '',
            },
            immutableSample: buildImmutableAuditChain(audits).slice(0, 120),
          },
          operations: {
            queue: jobs,
            dlq,
            telemetry: readTelemetryEvents().filter((item) => item?.context?.courseId === courseId),
          },
          notifications: {
            channels: readNotificationChannels(),
            deliveryLogs: readNotificationDeliveryLogs().slice(0, 200),
          },
        }
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
