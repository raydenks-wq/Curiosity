import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'

const STATUS_VALUES = ['draft', 'scheduled', 'published', 'archived']
const LESSON_TYPES = ['video', 'article', 'quiz', 'assignment', 'live']
const COMPLETION_MODES = ['lesson', 'module', 'hybrid']
const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced']

const toSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const durationToMinutes = (value) => {
  const text = String(value || '').trim()
  const match = text.match(/^(\d+)/)
  return match ? Number(match[1]) : 10
}

const createDefaultSettings = () => ({
  completionMode: 'lesson',
  completionThresholdPercent: 100,
  certificateEnabled: true,
  certificateTemplate: 'default',
  allowRetake: true,
  maxRetake: 3,
  allowProgressReset: false,
  prerequisiteMode: 'all',
  prerequisiteCourseIds: [],
  enrollmentCap: 0,
  estimatedHours: 0,
})

const createAsset = (index = 1) => ({
  id: `asset-${index}`,
  name: '',
  type: 'file',
  url: '',
  sizeBytes: 0,
  version: 1,
  versions: [],
  updatedAt: new Date().toISOString(),
})

const createLesson = (moduleId, index = 1) => ({
  id: `${moduleId}-l${index}`,
  title: '',
  type: 'video',
  durationMin: 10,
  isPreview: index === 1,
  isLocked: false,
  contentUrl: '',
})

const createModule = (index = 1) => {
  const id = `module-${index}`
  return {
    id,
    title: '',
    description: '',
    lessons: [createLesson(id, 1)],
  }
}

const createBlankCourse = () => ({
  id: '',
  title: '',
  slug: '',
  description: '',
  thumbnail: '',
  category: 'Design',
  level: 'beginner',
  language: 'id',
  visibility: 'public',
  status: 'draft',
  publishAt: '',
  unpublishAt: '',
  modules: [createModule(1)],
  assets: [],
  settings: createDefaultSettings(),
  auditTrail: [],
  createdAt: '',
  updatedAt: '',
})

const normalizeLesson = (lesson, moduleId, index) => {
  const type = LESSON_TYPES.includes(lesson?.type) ? lesson.type : 'video'
  return {
    id: String(lesson?.id || `${moduleId}-l${index + 1}`),
    title: String(lesson?.title || ''),
    type,
    durationMin: Math.max(1, Number(lesson?.durationMin || durationToMinutes(lesson?.duration) || 10)),
    isPreview: Boolean(lesson?.isPreview ?? index === 0),
    isLocked: Boolean(lesson?.isLocked),
    contentUrl: String(lesson?.contentUrl || lesson?.videoUrl || ''),
  }
}

const normalizeModule = (module, index) => {
  const moduleId = String(module?.id || `module-${index + 1}`)
  const lessons = Array.isArray(module?.lessons) ? module.lessons : []
  const normalizedLessons = lessons.length ? lessons.map((lesson, lessonIdx) => normalizeLesson(lesson, moduleId, lessonIdx)) : [createLesson(moduleId, 1)]
  return {
    id: moduleId,
    title: String(module?.title || ''),
    description: String(module?.description || ''),
    lessons: normalizedLessons,
  }
}

const normalizeAsset = (asset, index) => ({
  id: String(asset?.id || `asset-${index + 1}`),
  name: String(asset?.name || ''),
  type: String(asset?.type || 'file'),
  url: String(asset?.url || ''),
  sizeBytes: Math.max(0, Number(asset?.sizeBytes || 0)),
  version: Math.max(1, Number(asset?.version || 1)),
  versions: Array.isArray(asset?.versions) ? asset.versions : [],
  updatedAt: String(asset?.updatedAt || new Date().toISOString()),
})

const normalizeSettings = (settings) => {
  const fallback = createDefaultSettings()
  const completionMode = COMPLETION_MODES.includes(settings?.completionMode) ? settings.completionMode : fallback.completionMode
  const prerequisiteMode = settings?.prerequisiteMode === 'any' ? 'any' : 'all'
  const prerequisiteCourseIds = Array.isArray(settings?.prerequisiteCourseIds)
    ? [...new Set(settings.prerequisiteCourseIds.map((item) => String(item || '').trim()).filter(Boolean))]
    : []
  return {
    completionMode,
    completionThresholdPercent: Math.min(100, Math.max(1, Number(settings?.completionThresholdPercent ?? fallback.completionThresholdPercent))),
    certificateEnabled: Boolean(settings?.certificateEnabled ?? fallback.certificateEnabled),
    certificateTemplate: String(settings?.certificateTemplate || fallback.certificateTemplate),
    allowRetake: Boolean(settings?.allowRetake ?? fallback.allowRetake),
    maxRetake: Math.max(0, Number(settings?.maxRetake ?? fallback.maxRetake)),
    allowProgressReset: Boolean(settings?.allowProgressReset ?? fallback.allowProgressReset),
    prerequisiteMode,
    prerequisiteCourseIds,
    enrollmentCap: Math.max(0, Number(settings?.enrollmentCap ?? fallback.enrollmentCap)),
    estimatedHours: Math.max(0, Number(settings?.estimatedHours ?? fallback.estimatedHours)),
  }
}

const normalizeCourse = (course, index = 0) => {
  const title = String(course?.title || '')
  const id = String(course?.id || toSlug(title) || `course-${index + 1}`)
  const status = STATUS_VALUES.includes(course?.status) ? course.status : 'draft'
  return {
    id,
    title,
    slug: String(course?.slug || toSlug(title) || id),
    description: String(course?.description || ''),
    thumbnail: String(course?.thumbnail || ''),
    category: String(course?.category || course?.tag || 'General'),
    level: String(course?.level || 'beginner'),
    language: String(course?.language || 'id'),
    visibility: String(course?.visibility || 'public'),
    status,
    publishAt: String(course?.publishAt || ''),
    unpublishAt: String(course?.unpublishAt || ''),
    modules: (Array.isArray(course?.modules) ? course.modules : [createModule(1)]).map((module, moduleIdx) => normalizeModule(module, moduleIdx)),
    assets: (Array.isArray(course?.assets) ? course.assets : []).map((asset, assetIdx) => normalizeAsset(asset, assetIdx)),
    settings: normalizeSettings(course?.settings),
    auditTrail: Array.isArray(course?.auditTrail) ? course.auditTrail : [],
    createdAt: String(course?.createdAt || new Date().toISOString()),
    updatedAt: String(course?.updatedAt || new Date().toISOString()),
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value))

const hasDuplicate = (values = []) => {
  const set = new Set()
  for (const raw of values) {
    const value = String(raw || '').trim()
    if (!value) continue
    if (set.has(value)) return true
    set.add(value)
  }
  return false
}

const moveItem = (items, fromIndex, toIndex) => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items
  }
  const next = [...items]
  const [current] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, current)
  return next
}

const ensureUniqueId = (base, existingValues, fallbackPrefix) => {
  const existing = new Set((existingValues || []).map((value) => String(value || '').trim()).filter(Boolean))
  const normalizedBase = String(base || '').trim() || `${fallbackPrefix}-1`
  if (!existing.has(normalizedBase)) {
    return normalizedBase
  }
  let counter = 2
  let candidate = `${normalizedBase}-copy-${counter}`
  while (existing.has(candidate)) {
    counter += 1
    candidate = `${normalizedBase}-copy-${counter}`
  }
  return candidate
}

const applyScheduleTransition = (course, now = Date.now()) => {
  const next = { ...course }
  const publishAtMs = Date.parse(next.publishAt || '')
  const unpublishAtMs = Date.parse(next.unpublishAt || '')

  if (Number.isFinite(publishAtMs) && now >= publishAtMs && (next.status === 'draft' || next.status === 'scheduled')) {
    next.status = 'published'
    next.updatedAt = new Date().toISOString()
  } else if (Number.isFinite(publishAtMs) && now < publishAtMs && next.status === 'draft') {
    next.status = 'scheduled'
    next.updatedAt = new Date().toISOString()
  }

  if (Number.isFinite(unpublishAtMs) && now >= unpublishAtMs && (next.status === 'published' || next.status === 'scheduled')) {
    next.status = 'archived'
    next.updatedAt = new Date().toISOString()
  }

  return next
}

const createAuditEntry = (action, detail = '') => ({
  id: `audit-${Math.random().toString(36).slice(2, 10)}`,
  action,
  detail: String(detail || ''),
  createdAt: new Date().toISOString(),
})

const validateImportedCourseShape = (course) => {
  if (!course || typeof course !== 'object' || Array.isArray(course)) {
    return 'Payload item harus object course.'
  }
  if (!String(course.title || '').trim()) {
    return 'Field "title" wajib diisi.'
  }
  if (course.modules !== undefined && !Array.isArray(course.modules)) {
    return 'Field "modules" harus array.'
  }
  if (Array.isArray(course.modules)) {
    for (let idx = 0; idx < course.modules.length; idx += 1) {
      const module = course.modules[idx]
      if (!module || typeof module !== 'object' || Array.isArray(module)) {
        return `Module index ${idx} tidak valid.`
      }
      if (module.lessons !== undefined && !Array.isArray(module.lessons)) {
        return `Field lessons pada module index ${idx} harus array.`
      }
    }
  }
  return ''
}

const createCourseSummary = (course) => {
  const lessonCount = (course.modules || []).reduce((sum, module) => sum + (module.lessons || []).length, 0)
  const moduleCount = (course.modules || []).length
  const durationTotal = (course.modules || []).reduce(
    (sum, module) => sum + (module.lessons || []).reduce((lessonSum, lesson) => lessonSum + Number(lesson.durationMin || 0), 0),
    0,
  )
  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    description: course.description,
    category: course.category,
    level: course.level,
    language: course.language,
    visibility: course.visibility,
    status: course.status,
    publishAt: course.publishAt,
    unpublishAt: course.unpublishAt,
    moduleCount,
    lessonCount,
    durationTotal,
    assetCount: (course.assets || []).length,
    prerequisiteCount: (course.settings?.prerequisiteCourseIds || []).length,
    updatedAt: course.updatedAt,
  }
}

const toLevelScore = (level) => {
  const index = LEVEL_ORDER.indexOf(String(level || '').toLowerCase())
  return index >= 0 ? index : 0
}

const suggestPrerequisiteIds = (course, allCourses = []) => {
  const currentLevelScore = toLevelScore(course?.level)
  if (currentLevelScore <= 0) return []
  const currentCategory = String(course?.category || '').trim().toLowerCase()
  const candidates = (allCourses || [])
    .filter((item) => item.id !== course?.id)
    .map((item) => ({
      ...item,
      levelScore: toLevelScore(item.level),
      sameCategory: String(item.category || '').trim().toLowerCase() === currentCategory,
      updatedAtMs: Date.parse(item.updatedAt || '') || 0,
    }))
    .filter((item) => item.levelScore < currentLevelScore)
    .sort((a, b) => {
      if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1
      if (a.levelScore !== b.levelScore) return b.levelScore - a.levelScore
      return b.updatedAtMs - a.updatedAtMs
    })

  if (!candidates.length) return []
  const selected = []
  const usedLevel = new Set()
  for (const candidate of candidates) {
    if (usedLevel.has(candidate.levelScore)) continue
    usedLevel.add(candidate.levelScore)
    selected.push(candidate.id)
    if (selected.length >= currentLevelScore) break
  }
  return selected
}

const buildDependencyIndex = (courses = []) => {
  const upstreamById = {}
  const downstreamById = {}
  const courseById = {}
  for (const course of courses) {
    courseById[course.id] = course
    upstreamById[course.id] = normalizeSettings(course.settings).prerequisiteCourseIds || []
    downstreamById[course.id] = []
  }
  for (const [courseId, prerequisiteIds] of Object.entries(upstreamById)) {
    for (const dependencyId of prerequisiteIds) {
      if (!downstreamById[dependencyId]) continue
      downstreamById[dependencyId].push(courseId)
    }
  }
  return { courseById, upstreamById, downstreamById }
}

const findCycleForCourse = (startId, upstreamById = {}) => {
  const visiting = new Set()
  const visited = new Set()
  const path = []

  const dfs = (courseId) => {
    if (visiting.has(courseId)) {
      const startIndex = path.indexOf(courseId)
      if (startIndex >= 0) {
        return [...path.slice(startIndex), courseId]
      }
      return [courseId, courseId]
    }
    if (visited.has(courseId)) return null
    visiting.add(courseId)
    path.push(courseId)
    const dependencies = upstreamById[courseId] || []
    for (const dependencyId of dependencies) {
      const cycle = dfs(dependencyId)
      if (cycle) return cycle
    }
    path.pop()
    visiting.delete(courseId)
    visited.add(courseId)
    return null
  }

  const cyclePath = dfs(startId)
  if (!cyclePath) return []
  return cyclePath.includes(startId) ? cyclePath : []
}

export const useCourseManagementStore = defineStore('courseManagement', {
  state: () => ({
    courses: [],
    editor: createBlankCourse(),
    isLoading: false,
    isSaving: false,
    loaded: false,
  }),

  getters: {
    courseSummaries: (state) => state.courses.map((course) => createCourseSummary(course)),
    dependencyGraph: (state) => buildDependencyIndex(state.courses),
    auditLogs: (state) =>
      state.courses
        .flatMap((course) =>
          (course.auditTrail || []).map((entry) => ({
            ...entry,
            courseId: course.id,
            courseTitle: course.title,
          })),
        )
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
  },

  actions: {
    logCourseAction(courseId, action, detail = '') {
      const entry = createAuditEntry(action, detail)
      this.courses = this.courses.map((course) =>
        course.id === courseId
          ? {
              ...course,
              auditTrail: [entry, ...(course.auditTrail || [])].slice(0, 80),
            }
          : course,
      )
      if (this.editor.id === courseId) {
        const target = this.courses.find((course) => course.id === courseId)
        if (target) {
          this.editor = clone(target)
        }
      }
    },

    async load() {
      if (this.loaded) return
      this.isLoading = true
      try {
        const managed = apiClient.courseManagement ? await apiClient.courseManagement.list() : []
        if (Array.isArray(managed) && managed.length) {
          this.courses = this.applyScheduleTransitions(managed.map((course, index) => normalizeCourse(course, index)))
          this.editor = clone(this.courses[0] || createBlankCourse())
          this.loaded = true
          return
        }

        const cards = await apiClient.courses.listCourses()
        const details = await Promise.all((cards || []).map((course) => apiClient.courses.getCourse(course.id)))
        const seeded = details.map((course, index) =>
          normalizeCourse(
            {
              ...course,
              slug: toSlug(course?.title) || course?.id,
              category: course?.tag || 'General',
              level: 'beginner',
              language: 'id',
              visibility: 'public',
              status: 'published',
              publishAt: '',
              unpublishAt: '',
              settings: createDefaultSettings(),
              assets: [],
              auditTrail: [createAuditEntry('seeded', 'Initial seeded from course catalog')],
            },
            index,
          ),
        )

        if (apiClient.courseManagement?.save) {
          await Promise.all(seeded.map((course) => apiClient.courseManagement.save(course)))
        }

        this.courses = this.applyScheduleTransitions(seeded)
        this.editor = clone(this.courses[0] || createBlankCourse())
        this.loaded = true
      } finally {
        this.isLoading = false
      }
    },

    applyScheduleTransitions(courses = this.courses) {
      return courses.map((course) => applyScheduleTransition(course, Date.now()))
    },

    startCreate() {
      this.editor = createBlankCourse()
    },

    editCourse(courseId) {
      const target = this.courses.find((course) => course.id === courseId)
      if (!target) return
      this.editor = clone(target)
    },

    ensureEditorSlug() {
      if (!this.editor.slug && this.editor.title) {
        this.editor.slug = toSlug(this.editor.title)
      }
    },

    addEditorAsset(payload = {}) {
      const nextIndex = (this.editor.assets || []).length + 1
      const next = normalizeAsset(
        {
          ...createAsset(nextIndex),
          ...payload,
          id: payload.id || `asset-${nextIndex}`,
          updatedAt: new Date().toISOString(),
        },
        nextIndex,
      )
      this.editor.assets = [...(this.editor.assets || []), next]
    },

    removeEditorAsset(assetId) {
      this.editor.assets = (this.editor.assets || []).filter((asset) => asset.id !== assetId)
    },

    bumpEditorAssetVersion(assetId, payload = {}) {
      this.editor.assets = (this.editor.assets || []).map((asset) => {
        if (asset.id !== assetId) return asset
        const nextVersion = Number(asset.version || 1) + 1
        return {
          ...asset,
          name: String(payload.name || asset.name || ''),
          url: String(payload.url || asset.url || ''),
          sizeBytes: Math.max(0, Number(payload.sizeBytes ?? asset.sizeBytes ?? 0)),
          version: nextVersion,
          updatedAt: new Date().toISOString(),
          versions: [
            {
              version: nextVersion,
              note: String(payload.note || 'Update content'),
              url: String(payload.url || asset.url || ''),
              updatedAt: new Date().toISOString(),
            },
            ...(asset.versions || []),
          ].slice(0, 20),
        }
      })
    },

    getPublishChecklist(course = this.editor) {
      const modules = Array.isArray(course?.modules) ? course.modules : []
      const lessons = modules.flatMap((module) => module.lessons || [])
      const duplicateModuleIds = hasDuplicate(modules.map((module) => module.id))
      const duplicateLessonIds = hasDuplicate(lessons.map((lesson) => lesson.id))
      const hasPreviewLesson = lessons.some((lesson) => lesson.isPreview)
      const hasValidLessonType = lessons.every((lesson) => LESSON_TYPES.includes(lesson.type))
      const hasDuration = lessons.every((lesson) => Number(lesson.durationMin || 0) > 0)
      const settings = normalizeSettings(course?.settings)
      const dependency = this.getCourseDependencyInsight(course)
      const publishAtMs = Date.parse(course?.publishAt || '')
      const unpublishAtMs = Date.parse(course?.unpublishAt || '')
      const scheduleOk =
        !Number.isFinite(unpublishAtMs) || !Number.isFinite(publishAtMs) || publishAtMs < unpublishAtMs

      return [
        { id: 'title', label: 'Course title diisi', passed: Boolean(String(course?.title || '').trim()) },
        { id: 'slug', label: 'Slug valid', passed: Boolean(toSlug(course?.slug || '')) },
        { id: 'description', label: 'Deskripsi minimal 30 karakter', passed: String(course?.description || '').trim().length >= 30 },
        { id: 'thumbnail', label: 'Thumbnail URL tersedia', passed: Boolean(String(course?.thumbnail || '').trim()) },
        { id: 'module', label: 'Minimal 1 module', passed: modules.length > 0 },
        { id: 'lesson', label: 'Setiap module punya lesson', passed: modules.length > 0 && modules.every((module) => (module.lessons || []).length > 0) },
        { id: 'preview', label: 'Minimal 1 lesson preview', passed: hasPreviewLesson },
        { id: 'lesson-type', label: 'Semua lesson type valid', passed: hasValidLessonType },
        { id: 'duration', label: 'Durasi lesson valid', passed: hasDuration },
        { id: 'module-id', label: 'Module ID unik', passed: !duplicateModuleIds },
        { id: 'lesson-id', label: 'Lesson ID unik', passed: !duplicateLessonIds },
        { id: 'settings', label: 'Course settings valid', passed: settings.maxRetake >= 0 && settings.completionThresholdPercent > 0 },
        { id: 'prerequisite', label: 'Prerequisite course valid', passed: dependency.invalidRefs.length === 0 && !dependency.selfReference },
        { id: 'prerequisite-cycle', label: 'Tidak ada cycle dependency', passed: dependency.cyclePath.length === 0 },
        { id: 'schedule', label: 'Publish/unpublish schedule valid', passed: scheduleOk },
      ]
    },

    getCourseDependencyInsight(course = this.editor) {
      const index = buildDependencyIndex(this.courses)
      const courseId = String(course?.id || '')
      const settings = normalizeSettings(course?.settings)
      const prerequisiteIds = settings.prerequisiteCourseIds || []
      const invalidRefs = prerequisiteIds.filter((id) => !index.courseById[id] && id !== courseId)
      const selfReference = prerequisiteIds.includes(courseId)
      const upstream = prerequisiteIds
      const downstream = index.downstreamById[courseId] || []
      const nextUpstreamById = { ...index.upstreamById, [courseId]: prerequisiteIds }
      const cyclePath = courseId ? findCycleForCourse(courseId, nextUpstreamById) : []
      return {
        courseId,
        upstream,
        downstream,
        invalidRefs,
        selfReference,
        cyclePath,
      }
    },

    validateEditor(course = this.editor) {
      const checks = this.getPublishChecklist(course)
      const failed = checks.filter((item) => !item.passed)
      const sameSlug = this.courses.some((item) => item.id !== course.id && toSlug(item.slug) === toSlug(course.slug))
      const messages = failed.map((item) => item.label)
      if (sameSlug) {
        messages.push('Slug sudah dipakai course lain.')
      }
      return {
        isValid: failed.length === 0 && !sameSlug,
        messages,
      }
    },

    addModule() {
      const nextIndex = this.editor.modules.length + 1
      this.editor.modules = [...this.editor.modules, createModule(nextIndex)]
    },

    duplicateModule(moduleIndex) {
      const source = this.editor.modules[moduleIndex]
      if (!source) return
      const nextModule = clone(source)
      const existingModuleIds = this.editor.modules.map((module) => module.id)
      const duplicatedModuleId = ensureUniqueId(nextModule.id, existingModuleIds, 'module')
      nextModule.id = duplicatedModuleId
      nextModule.title = `${nextModule.title || `Module ${moduleIndex + 1}`} (Copy)`
      const existingLessonIds = this.editor.modules.flatMap((module) => (module.lessons || []).map((lesson) => lesson.id))
      nextModule.lessons = (nextModule.lessons || []).map((lesson, lessonIndex) => {
        const lessonId = ensureUniqueId(lesson.id || `${duplicatedModuleId}-l${lessonIndex + 1}`, existingLessonIds, `${duplicatedModuleId}-l`)
        existingLessonIds.push(lessonId)
        return normalizeLesson({ ...lesson, id: lessonId, isPreview: false }, duplicatedModuleId, lessonIndex)
      })
      const insertAt = moduleIndex + 1
      this.editor.modules = [...this.editor.modules.slice(0, insertAt), nextModule, ...this.editor.modules.slice(insertAt)]
    },

    removeModule(moduleIndex) {
      if (this.editor.modules.length <= 1) return
      this.editor.modules = this.editor.modules.filter((_, index) => index !== moduleIndex)
    },

    moveModule(moduleIndex, direction) {
      this.editor.modules = moveItem(this.editor.modules, moduleIndex, moduleIndex + direction)
    },

    reorderModule(fromIndex, toIndex) {
      this.editor.modules = moveItem(this.editor.modules, fromIndex, toIndex)
    },

    addLesson(moduleIndex) {
      const module = this.editor.modules[moduleIndex]
      if (!module) return
      const nextIndex = (module.lessons || []).length + 1
      const nextLesson = createLesson(module.id || `module-${moduleIndex + 1}`, nextIndex)
      this.editor.modules = this.editor.modules.map((item, index) =>
        index === moduleIndex
          ? {
              ...item,
              lessons: [...(item.lessons || []), nextLesson],
            }
          : item,
      )
    },

    duplicateLesson(moduleIndex, lessonIndex) {
      const module = this.editor.modules[moduleIndex]
      if (!module) return
      const source = (module.lessons || [])[lessonIndex]
      if (!source) return
      const existingLessonIds = this.editor.modules.flatMap((item) => (item.lessons || []).map((lesson) => lesson.id))
      const duplicatedLessonId = ensureUniqueId(source.id, existingLessonIds, `${module.id}-l`)
      const nextLesson = normalizeLesson(
        {
          ...clone(source),
          id: duplicatedLessonId,
          title: `${source.title || `Lesson ${lessonIndex + 1}`} (Copy)`,
          isPreview: false,
        },
        module.id,
        lessonIndex + 1,
      )
      const insertAt = lessonIndex + 1
      this.editor.modules = this.editor.modules.map((item, index) =>
        index === moduleIndex
          ? {
              ...item,
              lessons: [...(item.lessons || []).slice(0, insertAt), nextLesson, ...(item.lessons || []).slice(insertAt)],
            }
          : item,
      )
    },

    removeLesson(moduleIndex, lessonIndex) {
      const module = this.editor.modules[moduleIndex]
      if (!module || (module.lessons || []).length <= 1) return
      this.editor.modules = this.editor.modules.map((item, index) =>
        index === moduleIndex
          ? {
              ...item,
              lessons: (item.lessons || []).filter((_, currentLessonIndex) => currentLessonIndex !== lessonIndex),
            }
          : item,
      )
    },

    moveLesson(moduleIndex, lessonIndex, direction) {
      const module = this.editor.modules[moduleIndex]
      if (!module) return
      this.editor.modules = this.editor.modules.map((item, index) =>
        index === moduleIndex
          ? {
              ...item,
              lessons: moveItem(item.lessons || [], lessonIndex, lessonIndex + direction),
            }
          : item,
      )
    },

    reorderLesson(moduleIndex, fromIndex, toIndex) {
      this.editor.modules = this.editor.modules.map((item, index) =>
        index === moduleIndex
          ? {
              ...item,
              lessons: moveItem(item.lessons || [], fromIndex, toIndex),
            }
          : item,
      )
    },

    async saveEditor() {
      this.ensureEditorSlug()
      const normalized = normalizeCourse(this.editor, 0)
      const validation = this.validateEditor(normalized)
      if (!validation.isValid) {
        const error = new Error('Form course belum valid.')
        error.code = 'INVALID_COURSE'
        error.messages = validation.messages
        throw error
      }

      this.isSaving = true
      try {
        const nowIso = new Date().toISOString()
        const existing = this.courses.find((item) => item.id === normalized.id || item.slug === normalized.slug)
        const resolvedId = existing?.id || normalized.id || normalized.slug || `course-${Math.random().toString(36).slice(2, 8)}`
        const nextCourse = {
          ...normalized,
          id: resolvedId,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
          auditTrail: [createAuditEntry('saved', 'Course saved from editor'), ...(normalized.auditTrail || [])].slice(0, 80),
        }

        const savedRaw = apiClient.courseManagement?.save ? await apiClient.courseManagement.save(nextCourse) : nextCourse
        const saved = normalizeCourse(savedRaw, 0)

        this.courses = this.courses.some((item) => item.id === saved.id)
          ? this.courses.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...this.courses]
        this.courses = this.applyScheduleTransitions(this.courses)
        this.editor = clone(this.courses.find((item) => item.id === saved.id) || saved)
        return this.editor
      } finally {
        this.isSaving = false
      }
    },

    async saveDraftEditor() {
      this.ensureEditorSlug()
      this.isSaving = true
      try {
        const nowIso = new Date().toISOString()
        const baseTitle = String(this.editor.title || '').trim() || 'Untitled Course'
        const fallbackSlug = toSlug(this.editor.slug || this.editor.title || '') || `course-${Math.random().toString(36).slice(2, 8)}`
        const existing = this.courses.find((item) => item.id === this.editor.id || item.slug === fallbackSlug)
        const resolvedId = existing?.id || this.editor.id || fallbackSlug
        const nextCourse = normalizeCourse(
          {
            ...this.editor,
            id: resolvedId,
            title: baseTitle,
            slug: fallbackSlug,
            status: STATUS_VALUES.includes(this.editor.status) ? this.editor.status : 'draft',
            createdAt: existing?.createdAt || nowIso,
            updatedAt: nowIso,
            auditTrail: [createAuditEntry('autosave', 'Draft autosave'), ...(this.editor.auditTrail || [])].slice(0, 80),
          },
          0,
        )
        const savedRaw = apiClient.courseManagement?.save ? await apiClient.courseManagement.save(nextCourse) : nextCourse
        const saved = normalizeCourse(savedRaw, 0)
        this.courses = this.courses.some((item) => item.id === saved.id)
          ? this.courses.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...this.courses]
        this.courses = this.applyScheduleTransitions(this.courses)
        this.editor = clone(this.courses.find((item) => item.id === saved.id) || saved)
        return this.editor
      } finally {
        this.isSaving = false
      }
    },

    async deleteCourse(courseId) {
      const removed = this.courses.find((course) => course.id === courseId)
      this.courses = this.courses.filter((course) => course.id !== courseId)
      if (apiClient.courseManagement?.remove) {
        await apiClient.courseManagement.remove(courseId)
      }
      if (this.editor.id === courseId) {
        this.editor = clone(this.courses[0] || createBlankCourse())
      }
      return removed ? clone(removed) : null
    },

    async restoreCourse(course) {
      if (!course) return null
      const normalized = normalizeCourse(
        {
          ...course,
          auditTrail: [createAuditEntry('restored', 'Course restored from undo'), ...(course.auditTrail || [])],
        },
        0,
      )
      const savedRaw = apiClient.courseManagement?.save ? await apiClient.courseManagement.save(normalized) : normalized
      const saved = normalizeCourse(savedRaw, 0)
      this.courses = this.courses.some((item) => item.id === saved.id)
        ? this.courses.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...this.courses]
      return saved
    },

    async duplicateCourse(courseId) {
      if (apiClient.courseManagement?.duplicate) {
        const duplicatedRaw = await apiClient.courseManagement.duplicate(courseId)
        const duplicated = normalizeCourse(
          {
            ...duplicatedRaw,
            auditTrail: [createAuditEntry('duplicated', `Duplicated from ${courseId}`), ...(duplicatedRaw.auditTrail || [])],
          },
          0,
        )
        this.courses = [duplicated, ...this.courses.filter((course) => course.id !== duplicated.id)]
        return duplicated
      }
      const source = this.courses.find((course) => course.id === courseId)
      if (!source) return null
      const duplicated = normalizeCourse(
        {
          ...clone(source),
          id: `course-${Math.random().toString(36).slice(2, 8)}`,
          title: `${source.title} (Copy)`,
          slug: `${toSlug(source.slug || source.title)}-copy`,
          status: 'draft',
          publishAt: '',
          unpublishAt: '',
          auditTrail: [createAuditEntry('duplicated', `Duplicated from ${source.id}`)],
        },
        0,
      )
      this.courses = [duplicated, ...this.courses]
      return duplicated
    },

    setEditorStatus(status) {
      if (!STATUS_VALUES.includes(status)) return
      this.editor.status = status
    },

    async persistEditorStatus(status) {
      this.setEditorStatus(status)
      if (!this.editor.id) return
      const nowIso = new Date().toISOString()
      const nextCourse = normalizeCourse(
        {
          ...this.editor,
          status,
          updatedAt: nowIso,
          auditTrail: [createAuditEntry('status_changed', `Status -> ${status}`), ...(this.editor.auditTrail || [])].slice(0, 80),
        },
        0,
      )
      const savedRaw = apiClient.courseManagement?.save ? await apiClient.courseManagement.save(nextCourse) : nextCourse
      const saved = normalizeCourse(savedRaw, 0)
      this.courses = this.courses.some((course) => course.id === saved.id)
        ? this.courses.map((course) => (course.id === saved.id ? saved : course))
        : [saved, ...this.courses]
      this.editor = clone(saved)
    },

    scheduleEditor({ publishAt, unpublishAt }) {
      this.editor.publishAt = String(publishAt || '')
      this.editor.unpublishAt = String(unpublishAt || '')
      const publishMs = Date.parse(this.editor.publishAt || '')
      if (Number.isFinite(publishMs) && publishMs > Date.now() && this.editor.status === 'draft') {
        this.editor.status = 'scheduled'
      }
    },

    suggestEditorPrerequisites() {
      const suggestion = suggestPrerequisiteIds(this.editor, this.courses)
      this.editor.settings = {
        ...normalizeSettings(this.editor.settings),
        prerequisiteCourseIds: suggestion,
      }
      return suggestion
    },

    async bulkSetPrerequisites(ids, prerequisiteIds = [], mode = 'replace', options = {}) {
      const idSet = new Set(ids || [])
      const targets = this.courses.filter((course) => idSet.has(course.id))
      const total = targets.length
      const shouldContinue = typeof options.shouldContinue === 'function' ? options.shouldContinue : () => true
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
      const inputIds = [...new Set((prerequisiteIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
      const updated = []
      let processed = 0

      for (const course of targets) {
        if (!shouldContinue()) break
        const current = normalizeSettings(course.settings).prerequisiteCourseIds || []
        const nextIds =
          mode === 'append'
            ? [...new Set([...current, ...inputIds])].filter((id) => id !== course.id)
            : mode === 'remove'
              ? current.filter((id) => !inputIds.includes(id))
              : inputIds.filter((id) => id !== course.id)

        const next = normalizeCourse(
          {
            ...course,
            settings: {
              ...normalizeSettings(course.settings),
              prerequisiteCourseIds: nextIds,
            },
            updatedAt: new Date().toISOString(),
            auditTrail: [createAuditEntry('bulk_prerequisite', `Bulk prerequisite (${mode}) -> ${nextIds.length} item`), ...(course.auditTrail || [])].slice(0, 80),
          },
          0,
        )
        const savedRaw = apiClient.courseManagement?.save ? await apiClient.courseManagement.save(next) : next
        updated.push(normalizeCourse(savedRaw, 0))
        processed += 1
        if (onProgress) onProgress({ processed, total, id: course.id })
      }

      const updatedMap = new Map(updated.map((item) => [item.id, item]))
      this.courses = this.courses.map((course) => updatedMap.get(course.id) || course)
      if (this.editor.id && updatedMap.has(this.editor.id)) {
        this.editor = clone(updatedMap.get(this.editor.id))
      }
      return { updated, processed, total, cancelled: processed < total }
    },

    async bulkAutoSuggestPrerequisites(ids, options = {}) {
      const idSet = new Set(ids || [])
      const targets = this.courses.filter((course) => idSet.has(course.id))
      const total = targets.length
      const shouldContinue = typeof options.shouldContinue === 'function' ? options.shouldContinue : () => true
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
      const updated = []
      let processed = 0

      for (const course of targets) {
        if (!shouldContinue()) break
        const suggestedIds = suggestPrerequisiteIds(course, this.courses)
        const next = normalizeCourse(
          {
            ...course,
            settings: {
              ...normalizeSettings(course.settings),
              prerequisiteCourseIds: suggestedIds,
            },
            updatedAt: new Date().toISOString(),
            auditTrail: [createAuditEntry('bulk_prerequisite_suggest', `Auto suggested prerequisite -> ${suggestedIds.length} item`), ...(course.auditTrail || [])].slice(0, 80),
          },
          0,
        )
        const savedRaw = apiClient.courseManagement?.save ? await apiClient.courseManagement.save(next) : next
        updated.push(normalizeCourse(savedRaw, 0))
        processed += 1
        if (onProgress) onProgress({ processed, total, id: course.id })
      }

      const updatedMap = new Map(updated.map((item) => [item.id, item]))
      this.courses = this.courses.map((course) => updatedMap.get(course.id) || course)
      if (this.editor.id && updatedMap.has(this.editor.id)) {
        this.editor = clone(updatedMap.get(this.editor.id))
      }
      return { updated, processed, total, cancelled: processed < total }
    },

    async bulkSetStatus(ids, status, options = {}) {
      const idSet = new Set(ids || [])
      const updated = []
      const targets = this.courses.filter((course) => idSet.has(course.id))
      const total = targets.length
      const shouldContinue = typeof options.shouldContinue === 'function' ? options.shouldContinue : () => true
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
      let processed = 0
      for (const course of targets) {
        if (!shouldContinue()) break
        const next = normalizeCourse(
          {
            ...course,
            status,
            updatedAt: new Date().toISOString(),
            auditTrail: [createAuditEntry('bulk_status', `Bulk status -> ${status}`), ...(course.auditTrail || [])].slice(0, 80),
          },
          0,
        )
        const savedRaw = apiClient.courseManagement?.save ? await apiClient.courseManagement.save(next) : next
        updated.push(normalizeCourse(savedRaw, 0))
        processed += 1
        if (onProgress) {
          onProgress({ processed, total, id: course.id })
        }
      }
      const map = new Map(updated.map((item) => [item.id, item]))
      this.courses = this.courses.map((course) => map.get(course.id) || course)
      if (this.editor.id && map.has(this.editor.id)) {
        this.editor = clone(map.get(this.editor.id))
      }
      return { updated, cancelled: processed < total, processed, total }
    },

    async bulkDelete(ids, options = {}) {
      const idSet = new Set(ids || [])
      const targets = [...idSet]
      const total = targets.length
      const shouldContinue = typeof options.shouldContinue === 'function' ? options.shouldContinue : () => true
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
      let processed = 0
      const deletedIds = []
      for (const id of targets) {
        if (!shouldContinue()) break
        if (apiClient.courseManagement?.remove) {
          await apiClient.courseManagement.remove(id)
        }
        deletedIds.push(id)
        processed += 1
        if (onProgress) {
          onProgress({ processed, total, id })
        }
      }
      const deletedSet = new Set(deletedIds)
      this.courses = this.courses.filter((course) => !deletedSet.has(course.id))
      if (deletedSet.has(this.editor.id)) {
        this.editor = clone(this.courses[0] || createBlankCourse())
      }
      return { remaining: this.courses, deletedIds, cancelled: processed < total, processed, total }
    },

    exportCourses(ids = []) {
      const idSet = new Set(ids)
      const items = ids.length ? this.courses.filter((course) => idSet.has(course.id)) : this.courses
      return clone(items)
    },

    async importCourses(payload = [], options = {}) {
      const incoming = Array.isArray(payload) ? payload : []
      const merged = [...this.courses]
      const summary = {
        importedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        errorCount: 0,
        cancelled: false,
        processed: 0,
        total: incoming.length,
        items: [],
      }
      const shouldContinue = typeof options.shouldContinue === 'function' ? options.shouldContinue : () => true
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null

      for (let index = 0; index < incoming.length; index += 1) {
        if (!shouldContinue()) {
          summary.cancelled = true
          break
        }
        try {
          const raw = incoming[index]
          const shapeError = validateImportedCourseShape(raw)
          if (shapeError) {
            throw new Error(`[row ${index + 1}] ${shapeError}`)
          }
          const course = normalizeCourse(raw, index)
          const existingIndex = merged.findIndex((item) => item.id === course.id)
          const withAudit = normalizeCourse(
            {
              ...course,
              auditTrail: [createAuditEntry('imported', 'Imported from JSON'), ...(course.auditTrail || [])],
            },
            0,
          )
          if (existingIndex >= 0) {
            merged[existingIndex] = withAudit
            summary.updatedCount += 1
          } else {
            merged.unshift(withAudit)
            summary.createdCount += 1
          }
          if (apiClient.courseManagement?.save) {
            await apiClient.courseManagement.save(withAudit)
          }
          summary.importedCount += 1
          summary.items.push({
            status: existingIndex >= 0 ? 'updated' : 'created',
            id: withAudit.id,
            slug: withAudit.slug,
            message: withAudit.title || withAudit.id,
          })
        } catch (error) {
          summary.errorCount += 1
          summary.items.push({
            status: 'error',
            id: incoming[index]?.id || '',
            slug: incoming[index]?.slug || '',
            message: error?.message || 'Unknown import error',
          })
        } finally {
          summary.processed += 1
          if (onProgress) {
            onProgress({
              processed: summary.processed,
              total: summary.total,
              index,
            })
          }
        }
      }

      this.courses = merged
      return summary
    },
  },
})
