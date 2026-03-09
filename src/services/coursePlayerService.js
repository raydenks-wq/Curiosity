import { quizCatalogService } from './quizCatalogService'
import { quizEngineService } from './quizEngineService'

const COURSE_PROGRESS_KEY = 'curiosity:lms:course-progress:v1'
const COURSE_MODULE_PREREQ_KEY = 'curiosity:lms:course-module-prereq:v1'
const VIDEO_COMPLETION_THRESHOLD_PERCENT = 90
const MAX_WATCH_STEP_SEC = 20
const ANALYTICS_WINDOW_DAYS = 7

const demoVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'

const toBase64 = (content) => {
  const normalized = unescape(encodeURIComponent(content))
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(normalized)
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized, 'binary').toString('base64')
  }
  throw new Error('Base64 encoder is unavailable in this environment.')
}

const toDataUrl = (mimeType, content) => `data:${mimeType};base64,${toBase64(content)}`

const textResource = ({ id, title, fileName, content }) => ({
  id,
  title,
  fileName,
  mimeType: 'text/plain',
  sizeBytes: new TextEncoder().encode(content).length,
  dataUrl: toDataUrl('text/plain', content),
})

const defaultCatalog = [
  {
    id: 'ui-101',
    title: 'UI Design Fundamentals',
    description: 'Dasar komposisi, warna, tipografi, dan hierarchy.',
    tag: 'Design',
    gradient: 'linear-gradient(120deg, #0081a7, #00afb9)',
    instructor: 'Ayu Pratama',
    modules: [
      {
        id: 'ui-101-m1',
        title: 'Foundations',
        lessons: [
          {
            id: 'ui-101-l1',
            title: 'Intro to Visual Hierarchy',
            duration: '12m',
            type: 'video',
            videoUrl: demoVideoUrl,
            summary: 'Memahami prinsip hierarchy untuk layout yang mudah dipahami.',
            transcript: [
              { atSec: 8, text: 'Visual hierarchy membantu user menangkap informasi paling penting lebih dulu.' },
              { atSec: 36, text: 'Gunakan skala ukuran, kontras, dan posisi untuk memandu scanning pattern.' },
              { atSec: 74, text: 'Judul, subjudul, dan CTA harus punya prioritas visual yang jelas.' },
              { atSec: 108, text: 'Hierarchy yang baik menurunkan cognitive load di halaman dashboard.' },
            ],
            resources: [
              textResource({
                id: 'ui-101-l1-r1',
                title: 'Hierarchy Checklist',
                fileName: 'hierarchy-checklist.txt',
                content: 'Checklist:\n1. Prioritas judul\n2. Kontras visual\n3. Grouping konten\n4. CTA jelas\n',
              }),
              textResource({
                id: 'ui-101-l1-r2',
                title: 'Reference Board Notes',
                fileName: 'reference-board-notes.txt',
                content: 'Moodboard notes: gunakan scale 8pt, heading strong, dan spacing konsisten.',
              }),
            ],
          },
          {
            id: 'ui-101-l2',
            title: 'Typography Pairing',
            duration: '16m',
            type: 'video',
            videoUrl: demoVideoUrl,
            summary: 'Kombinasi font headline-body untuk readability.',
            transcript: [
              { atSec: 12, text: 'Mulai dari satu font netral untuk body text yang mudah dibaca.' },
              { atSec: 48, text: 'Pasangkan display font seperlunya untuk heading, bukan untuk paragraf panjang.' },
              { atSec: 86, text: 'Pastikan rasio ukuran heading ke body konsisten di semua halaman.' },
              { atSec: 124, text: 'Gunakan line-height 1.4 sampai 1.6 untuk meningkatkan readability.' },
            ],
            resources: [
              textResource({
                id: 'ui-101-l2-r1',
                title: 'Type Scale Guide',
                fileName: 'type-scale-guide.txt',
                content: 'Scale rekomendasi: 14, 16, 20, 24, 32. Gunakan line-height 1.4-1.6.',
              }),
            ],
          },
        ],
      },
      {
        id: 'ui-101-m2',
        title: 'Color & Layout',
        lessons: [
          {
            id: 'ui-101-l3',
            title: 'Color Contrast in UI',
            duration: '14m',
            type: 'video',
            videoUrl: demoVideoUrl,
            summary: 'Praktik kontras warna agar aksesibel dan konsisten brand.',
            transcript: [
              { atSec: 10, text: 'Kontras bukan hanya soal estetika, tapi juga aksesibilitas.' },
              { atSec: 42, text: 'Untuk teks normal, targetkan rasio minimal 4.5 banding 1.' },
              { atSec: 79, text: 'State hover dan disabled juga perlu kontras yang tetap terbaca.' },
              { atSec: 112, text: 'Uji kombinasi warna pada latar terang dan gelap sebelum publish.' },
            ],
            resources: [
              textResource({
                id: 'ui-101-l3-r1',
                title: 'WCAG Contrast Card',
                fileName: 'wcag-contrast-card.txt',
                content: 'AA normal text: 4.5:1\nAA large text: 3:1\nUI icon minimum: 3:1',
              }),
            ],
          },
          {
            id: 'ui-101-l4',
            title: 'Grid and Spacing System',
            duration: '18m',
            type: 'workshop',
            summary: 'Membuat 8pt grid untuk desain yang rapi dan scalable.',
            resources: [
              textResource({
                id: 'ui-101-l4-r1',
                title: '8pt Grid Template Spec',
                fileName: '8pt-grid-spec.txt',
                content: 'Grid: 12 columns\nGutter: 24\nMargin: 32 desktop, 16 mobile\nBase spacing: 8pt',
              }),
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'fe-101',
    title: 'Frontend for Designer',
    description: 'HTML, CSS, dan Vue komponen untuk prototyping.',
    tag: 'Code',
    gradient: 'linear-gradient(120deg, #fb8500, #ffb703)',
    instructor: 'Rafi Nugraha',
    modules: [
      {
        id: 'fe-101-m1',
        title: 'HTML/CSS Core',
        lessons: [
          {
            id: 'fe-101-l1',
            title: 'Semantic HTML Basics',
            duration: '10m',
            type: 'video',
            videoUrl: demoVideoUrl,
            summary: 'Struktur HTML yang benar untuk SEO dan aksesibilitas.',
            transcript: [
              { atSec: 9, text: 'Tag semantik membantu browser dan screen reader memahami struktur konten.' },
              { atSec: 34, text: 'Gunakan main hanya sekali, lalu susun section dan article sesuai konteks.' },
              { atSec: 61, text: 'Label pada input form wajib terhubung agar aksesibel.' },
              { atSec: 92, text: 'Semantic HTML mempermudah maintenance dan testing komponen.' },
            ],
            resources: [
              textResource({
                id: 'fe-101-l1-r1',
                title: 'Semantic Tag Cheat Sheet',
                fileName: 'semantic-tag-cheatsheet.txt',
                content: 'Gunakan: header, nav, main, section, article, aside, footer, button, form, label.',
              }),
            ],
          },
          {
            id: 'fe-101-l2',
            title: 'Responsive Layout with CSS Grid',
            duration: '20m',
            type: 'video',
            videoUrl: demoVideoUrl,
            summary: 'Membangun layout adaptif untuk desktop dan mobile.',
            transcript: [
              { atSec: 15, text: 'Mulai dari grid 12 kolom agar fleksibel untuk banyak skenario layout.' },
              { atSec: 58, text: 'Gunakan minmax dan auto-fit untuk komponen card yang responsif.' },
              { atSec: 104, text: 'Breakpoint harus mengikuti konten, bukan sekadar ukuran device populer.' },
              { atSec: 151, text: 'Gabungkan grid dan container query untuk komponen modular.' },
            ],
            resources: [
              textResource({
                id: 'fe-101-l2-r1',
                title: 'Grid Playground Starter',
                fileName: 'grid-playground-starter.txt',
                content: '.layout { display:grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }',
              }),
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'pm-101',
    title: 'Product Thinking',
    description: 'Menyusun roadmap fitur berbasis kebutuhan user.',
    tag: 'Product',
    gradient: 'linear-gradient(120deg, #8338ec, #3a86ff)',
    instructor: 'Nadia Putri',
    modules: [
      {
        id: 'pm-101-m1',
        title: 'Discovery',
        lessons: [
          {
            id: 'pm-101-l1',
            title: 'Problem Framing',
            duration: '11m',
            type: 'video',
            videoUrl: demoVideoUrl,
            summary: 'Teknik menyusun problem statement berbasis user impact.',
            transcript: [
              { atSec: 11, text: 'Problem framing dimulai dari user pain yang nyata dan terukur.' },
              { atSec: 41, text: 'Pisahkan gejala dari akar masalah sebelum menentukan solusi.' },
              { atSec: 73, text: 'Tulis problem statement dengan format siapa, hambatan, dan dampaknya.' },
              { atSec: 98, text: 'Validasi framing lewat data perilaku user dan feedback lapangan.' },
            ],
            resources: [
              textResource({
                id: 'pm-101-l1-r1',
                title: 'Problem Framing Canvas',
                fileName: 'problem-framing-canvas.txt',
                content: 'User, pain point, trigger, expected outcome, success metric.',
              }),
            ],
          },
          {
            id: 'pm-101-l2',
            title: 'Prioritization Matrix',
            duration: '15m',
            type: 'workshop',
            summary: 'Skoring impact vs effort untuk memilih prioritas fitur.',
            resources: [
              textResource({
                id: 'pm-101-l2-r1',
                title: 'Prioritization Matrix Template',
                fileName: 'prioritization-matrix-template.txt',
                content: 'Columns: Feature, Impact(1-5), Effort(1-5), Priority Score.',
              }),
            ],
          },
        ],
      },
    ],
  },
]

const safeJsonRead = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const safeJsonWrite = (key, value) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

const flattenLessons = (course) =>
  course.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id, moduleTitle: module.title })))

const readModulePrerequisiteOverrides = () => safeJsonRead(COURSE_MODULE_PREREQ_KEY, {})

const writeModulePrerequisiteOverrides = (payload) => safeJsonWrite(COURSE_MODULE_PREREQ_KEY, payload || {})

const getModulePrerequisiteOverride = (courseId, moduleId) => {
  const map = readModulePrerequisiteOverrides()
  return map?.[`${courseId}:${moduleId}`] || null
}

const getProgressState = (userKey, course) => {
  const allProgress = safeJsonRead(COURSE_PROGRESS_KEY, {})
  const scope = allProgress[userKey] || {}
  const courseState = scope[course.id] || {}
  const allLessons = flattenLessons(course)
  const firstLesson = allLessons[0]?.id || ''

  return {
    completedLessonIds: Array.isArray(courseState.completedLessonIds) ? courseState.completedLessonIds : [],
    activeLessonId: courseState.activeLessonId || firstLesson,
    lessonPlayback: courseState.lessonPlayback && typeof courseState.lessonPlayback === 'object' ? courseState.lessonPlayback : {},
    studyEvents: Array.isArray(courseState.studyEvents) ? courseState.studyEvents : [],
    lastTouchedAt: courseState.lastTouchedAt || null,
  }
}

const saveProgressState = (userKey, courseId, nextState) => {
  const allProgress = safeJsonRead(COURSE_PROGRESS_KEY, {})
  const scope = allProgress[userKey] || {}
  allProgress[userKey] = {
    ...scope,
    [courseId]: {
      completedLessonIds: nextState.completedLessonIds,
      activeLessonId: nextState.activeLessonId,
      lessonPlayback: nextState.lessonPlayback && typeof nextState.lessonPlayback === 'object' ? nextState.lessonPlayback : {},
      studyEvents: Array.isArray(nextState.studyEvents) ? nextState.studyEvents : [],
      lastTouchedAt: nextState.lastTouchedAt || null,
    },
  }
  safeJsonWrite(COURSE_PROGRESS_KEY, allProgress)
}

const toLessonResourceList = (resources = []) =>
  resources
    .map((resource, index) => {
      if (typeof resource === 'string') {
        const content = `Lesson resource: ${resource}\n`
        const fileName = resource.toLowerCase().replace(/\s+/g, '-')
        return {
          id: `legacy-${index + 1}`,
          title: resource,
          fileName,
          mimeType: 'text/plain',
          sizeBytes: content.length,
          dataUrl: toDataUrl('text/plain', content),
        }
      }
      return {
        id: resource.id || `res-${index + 1}`,
        title: resource.title || resource.fileName || `Resource ${index + 1}`,
        fileName: resource.fileName || `${resource.id || `resource-${index + 1}`}.txt`,
        mimeType: resource.mimeType || 'text/plain',
        sizeBytes: Number(resource.sizeBytes || 0),
        dataUrl: resource.dataUrl || '',
      }
    })
    .filter((item) => item.id)

const getLessonCompletionGate = (lesson, playback = {}) => {
  if (lesson.type !== 'video') {
    return {
      canComplete: true,
      requiredProgressPercent: 0,
      reason: '',
    }
  }
  const progressPercent = Math.max(0, Math.min(100, Math.round(Number(playback.progressPercent || 0))))
  const canComplete = progressPercent >= VIDEO_COMPLETION_THRESHOLD_PERCENT || Boolean(playback.completedVideoAt)
  return {
    canComplete,
    requiredProgressPercent: VIDEO_COMPLETION_THRESHOLD_PERCENT,
    reason: canComplete ? '' : `Tonton video minimal ${VIDEO_COMPLETION_THRESHOLD_PERCENT}% untuk melanjutkan.`,
  }
}

const normalizeRanges = (ranges = [], durationSec = 0) => {
  const max = Math.max(0, Math.floor(Number(durationSec || 0)))
  const normalized = (Array.isArray(ranges) ? ranges : [])
    .map((row) => {
      const start = Math.max(0, Math.floor(Number(row?.start ?? row?.from ?? 0)))
      const end = Math.max(0, Math.floor(Number(row?.end ?? row?.to ?? 0)))
      const safeEnd = max > 0 ? Math.min(end, max) : end
      const safeStart = max > 0 ? Math.min(start, max) : start
      if (safeEnd <= safeStart) return null
      return { start: safeStart, end: safeEnd }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  const merged = []
  normalized.forEach((range) => {
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) {
      merged.push({ ...range })
      return
    }
    last.end = Math.max(last.end, range.end)
  })
  return merged
}

const sumRangeDuration = (ranges = []) =>
  normalizeRanges(ranges).reduce((sum, row) => sum + Math.max(0, row.end - row.start), 0)

const appendWatchedRange = (ranges = [], fromSec, toSec, durationSec) => {
  const start = Math.max(0, Math.floor(Number(fromSec || 0)))
  const end = Math.max(0, Math.floor(Number(toSec || 0)))
  if (end <= start) return normalizeRanges(ranges, durationSec)
  return normalizeRanges([...(Array.isArray(ranges) ? ranges : []), { start, end }], durationSec)
}

const evaluatePrerequisiteRules = ({ mode = 'all', rules = [] }, context) => {
  const normalizedRules = Array.isArray(rules) ? rules : []
  if (!normalizedRules.length) {
    return { blocked: false, reason: '' }
  }
  const results = normalizedRules.map((rule) => {
    const type = String(rule?.type || '')
    if (type === 'module-complete') {
      const module = context.moduleById[rule.moduleId]
      const passed = Boolean(module) && module.lessons.every((lesson) => context.completedSet.has(lesson.id))
      return {
        passed,
        reason: `Selesaikan module ${module?.title || rule.moduleId}.`,
      }
    }
    if (type === 'module-quiz-pass') {
      const gate = context.moduleQuizGateByModuleId[rule.moduleId]
      const passed = !gate?.required || Boolean(gate?.passed)
      return {
        passed,
        reason: `Lulus ${gate?.quizTitle || 'quiz module'} terlebih dahulu.`,
      }
    }
    if (type === 'lesson-complete') {
      const passed = context.completedSet.has(rule.lessonId)
      return {
        passed,
        reason: `Selesaikan lesson ${rule.lessonId}.`,
      }
    }
    return { passed: true, reason: '' }
  })

  if (String(mode || 'all') === 'any') {
    const anyPassed = results.some((row) => row.passed)
    return {
      blocked: !anyPassed,
      reason: anyPassed ? '' : results.map((row) => row.reason).find(Boolean) || 'Prerequisite belum terpenuhi.',
    }
  }

  const unmet = results.find((row) => !row.passed)
  return {
    blocked: Boolean(unmet),
    reason: unmet?.reason || '',
  }
}

const getModuleQuizGateByModuleId = (course, userId) =>
  Object.fromEntries(
    (course.modules || []).map((module) => {
      const quiz =
        quizCatalogService.getQuizById(module.id) ||
        quizCatalogService.getQuizForModule(course.id, module.id) ||
        null
      if (!quiz) {
        return [
          module.id,
          {
            required: false,
            passed: true,
            quizId: '',
            quizTitle: '',
          },
        ]
      }
      const history = quizEngineService.getHistory(quiz.id, userId)
      const passed = history.some((attempt) => Boolean(attempt?.passed))
      return [
        module.id,
        {
          required: true,
          passed,
          quizId: quiz.id,
          quizTitle: quiz.title || 'Module Quiz',
        },
      ]
    }),
  )

const buildCourseView = (course, state) => {
  const moduleQuizGateByModuleId = getModuleQuizGateByModuleId(course, state.userScopeId || 'guest')
  const allLessons = flattenLessons(course)
  const completedSet = new Set(state.completedLessonIds)
  const lessonIds = allLessons.map((lesson) => lesson.id)
  const moduleById = Object.fromEntries((course.modules || []).map((module) => [module.id, module]))
  const firstLessonIdByModule = Object.fromEntries(
    (course.modules || []).map((module) => [module.id, module.lessons?.[0]?.id || '']),
  )
  const isModuleCompleted = (module) =>
    (module?.lessons || []).every((lesson) => completedSet.has(lesson.id))

  const lessonMetaById = Object.fromEntries(
    lessonIds.map((lessonId, index) => {
      const prevLessonId = lessonIds[index - 1]
      let isLocked = index > 0 && !completedSet.has(prevLessonId)
      let lockReason = isLocked ? 'Selesaikan lesson sebelumnya terlebih dahulu.' : ''

      if (!isLocked) {
        const currentModuleIndex = (course.modules || []).findIndex((module) => (module.lessons || []).some((lesson) => lesson.id === lessonId))
        if (currentModuleIndex > 0) {
          const currentModule = course.modules[currentModuleIndex]
          const prevModule = course.modules[currentModuleIndex - 1]
          const isFirstLessonInModule = firstLessonIdByModule[currentModule.id] === lessonId
          if (isFirstLessonInModule) {
            const prerequisite = getModulePrerequisiteOverride(course.id, currentModule.id) || currentModule?.prerequisite || {
              mode: 'all',
              rules: [
                { type: 'module-complete', moduleId: prevModule?.id },
                ...(moduleQuizGateByModuleId[prevModule?.id]?.required ? [{ type: 'module-quiz-pass', moduleId: prevModule?.id }] : []),
              ].filter((row) => row.moduleId),
            }
            const evalResult = evaluatePrerequisiteRules(prerequisite, {
              moduleById,
              completedSet,
              moduleQuizGateByModuleId,
            })
            if (evalResult.blocked) {
              isLocked = true
              lockReason = evalResult.reason || 'Prerequisite module belum terpenuhi.'
            }
          }
        }
      }

      return [lessonId, { index, isLocked, lockReason }]
    }),
  )

  const activeLessonId = lessonMetaById[state.activeLessonId]?.isLocked ? lessonIds[0] : state.activeLessonId

  const modules = course.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson) => {
      const meta = lessonMetaById[lesson.id]
      const playback = {
        positionSec: Math.max(0, Math.floor(Number(state.lessonPlayback?.[lesson.id]?.positionSec || 0))),
        durationSec: Math.max(0, Math.floor(Number(state.lessonPlayback?.[lesson.id]?.durationSec || 0))),
        watchedRanges: normalizeRanges(state.lessonPlayback?.[lesson.id]?.watchedRanges || [], state.lessonPlayback?.[lesson.id]?.durationSec || 0),
        watchedSec: Math.max(
          0,
          Math.floor(
            Number(
              state.lessonPlayback?.[lesson.id]?.watchedSec ||
                sumRangeDuration(state.lessonPlayback?.[lesson.id]?.watchedRanges || []),
            ),
          ),
        ),
        progressPercent: Math.max(
          0,
          Math.min(100, Math.round(Number(state.lessonPlayback?.[lesson.id]?.progressPercent || 0))),
        ),
        completedVideoAt: state.lessonPlayback?.[lesson.id]?.completedVideoAt || null,
      }
      const completionGate = getLessonCompletionGate(lesson, playback)
      return {
        ...lesson,
        videoUrl: lesson.videoUrl || (lesson.type === 'video' ? demoVideoUrl : ''),
        resources: toLessonResourceList(lesson.resources),
        transcript: (
          Array.isArray(lesson.transcript) && lesson.transcript.length
            ? lesson.transcript
            : lesson.summary
              ? [{ atSec: 0, text: lesson.summary }]
              : []
        )
          .map((row, index) => ({
            id: `${lesson.id}-tr-${index + 1}`,
            atSec: Math.max(0, Math.floor(Number(row?.atSec ?? 0))),
            text: String(row?.text || ''),
          }))
          .filter((row) => row.text),
        isCompleted: completedSet.has(lesson.id),
        isLocked: Boolean(meta?.isLocked),
        lockReason: meta?.lockReason || '',
        isActive: lesson.id === activeLessonId,
        playback,
        canComplete: completionGate.canComplete,
        completionRequiredPercent: completionGate.requiredProgressPercent,
        completionGateReason: completionGate.reason,
      }
    }),
  }))

  const lessonViews = modules.flatMap((module) => module.lessons)
  const completedLessons = lessonViews.filter((lesson) => lesson.isCompleted).length
  const totalLessons = allLessons.length
  const progress = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
  const activeLesson = lessonViews.find((lesson) => lesson.id === activeLessonId) || lessonViews[0] || null
  const activeIndex = activeLesson ? lessonViews.findIndex((lesson) => lesson.id === activeLesson.id) : -1
  const previousLesson = activeIndex > 0 ? lessonViews[activeIndex - 1] : null
  const nextLesson = activeIndex >= 0 && activeIndex < lessonViews.length - 1 ? lessonViews[activeIndex + 1] : null

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    tag: course.tag,
    gradient: course.gradient,
    instructor: course.instructor,
    modules,
    activeLesson,
    previousLesson,
    nextLesson,
    progress,
    completedLessons,
    totalLessons,
    lastTouchedAt: state.lastTouchedAt || null,
  }
}

const toCourseCard = (courseView) => ({
  id: courseView.id,
  title: courseView.title,
  description: courseView.description,
  progress: courseView.progress,
  tag: courseView.tag,
  gradient: courseView.gradient,
  activeLessonId: courseView.activeLesson?.id || '',
  activeLessonTitle: courseView.activeLesson?.title || '',
  totalLessons: courseView.totalLessons,
  completedLessons: courseView.completedLessons,
  blockedLessons: (courseView.modules || []).flatMap((module) => module.lessons || []).filter((lesson) => lesson.isLocked).length,
  nextLockedLessonTitle:
    (courseView.modules || [])
      .flatMap((module) => module.lessons || [])
      .find((lesson) => lesson.isLocked)?.title || '',
  nextLockReason:
    (courseView.modules || [])
      .flatMap((module) => module.lessons || [])
      .find((lesson) => lesson.isLocked)?.lockReason || '',
  lastTouchedAt: courseView.lastTouchedAt || null,
})

const getCourseById = (courseId) => defaultCatalog.find((course) => course.id === courseId)

const userScopeKey = (userId) => String(userId || 'guest')

const buildLearningAnalytics = (userId) => {
  const key = userScopeKey(userId)
  const nowMs = Date.now()
  const sinceMs = nowMs - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const dayBuckets = Array.from({ length: ANALYTICS_WINDOW_DAYS }).map((_, index) => {
    const day = new Date(nowMs - (ANALYTICS_WINDOW_DAYS - 1 - index) * 24 * 60 * 60 * 1000)
    return {
      date: day.toISOString().slice(0, 10),
      minutes: 0,
    }
  })
  const bucketByDate = Object.fromEntries(dayBuckets.map((row) => [row.date, row]))

  const courses = defaultCatalog.map((course) => {
    const state = getProgressState(key, course)
    state.userScopeId = userId || 'guest'
    const view = buildCourseView(course, state)
    const studyEvents = Array.isArray(state.studyEvents) ? state.studyEvents : []
    const weeklySeconds = studyEvents
      .filter((event) => Date.parse(event.at || '') >= sinceMs)
      .reduce((sum, event) => sum + Math.max(0, Number(event.seconds || 0)), 0)
    studyEvents.forEach((event) => {
      const eventMs = Date.parse(event.at || '')
      if (!Number.isFinite(eventMs) || eventMs < sinceMs) return
      const keyDate = new Date(eventMs).toISOString().slice(0, 10)
      if (bucketByDate[keyDate]) {
        bucketByDate[keyDate].minutes += Math.max(0, Number(event.seconds || 0)) / 60
      }
    })
    const lastStudiedAt = studyEvents[0]?.at || null
    const atRisk = view.progress < 40 && (!lastStudiedAt || nowMs - Date.parse(lastStudiedAt) > 3 * 24 * 60 * 60 * 1000)
    return {
      courseId: view.id,
      title: view.title,
      progress: view.progress,
      completionRate: view.progress,
      completedLessons: view.completedLessons,
      totalLessons: view.totalLessons,
      weeklyStudyMinutes: Math.round(weeklySeconds / 60),
      lastStudiedAt,
      atRisk,
    }
  })

  const weeklyTotalMinutes = Math.round(dayBuckets.reduce((sum, row) => sum + row.minutes, 0))
  const completionRateAvg = courses.length ? Math.round(courses.reduce((sum, row) => sum + row.completionRate, 0) / courses.length) : 0
  const earlyWarnings = courses
    .filter((row) => row.atRisk)
    .map((row) => ({
      courseId: row.courseId,
      title: row.title,
      progress: row.progress,
      lastStudiedAt: row.lastStudiedAt,
      reason: row.lastStudiedAt
        ? 'Progress masih rendah dan aktivitas belajar menurun.'
        : 'Belum ada aktivitas belajar untuk course ini.',
    }))
    .slice(0, 6)

  return {
    generatedAt: new Date().toISOString(),
    completionRateAvg,
    weeklyStudy: {
      totalMinutes: weeklyTotalMinutes,
      byDay: dayBuckets.map((row) => ({
        date: row.date,
        minutes: Math.round(row.minutes),
      })),
    },
    courses,
    earlyWarnings,
  }
}

const getContinueLearning = (userId) => {
  const cards = coursePlayerService.listCourses(userId)
  if (!cards.length) return null
  const sorted = cards
    .slice()
    .sort((a, b) => Date.parse(b.lastTouchedAt || 0) - Date.parse(a.lastTouchedAt || 0))
  if (sorted[0]?.lastTouchedAt) return sorted[0]
  return cards.find((item) => Number(item.progress || 0) < 100) || cards[0]
}

export const coursePlayerService = {
  listCourses(userId) {
    const key = userScopeKey(userId)
    return defaultCatalog.map((course) => {
      const state = getProgressState(key, course)
      state.userScopeId = userId || 'guest'
      return toCourseCard(buildCourseView(course, state))
    })
  },

  getCourse(courseId, userId) {
    const course = getCourseById(courseId)
    if (!course) throw new Error('Course tidak ditemukan.')
    const key = userScopeKey(userId)
    const state = getProgressState(key, course)
    state.userScopeId = userId || 'guest'
    return buildCourseView(course, state)
  },

  setActiveLesson(courseId, lessonId, userId) {
    const course = getCourseById(courseId)
    if (!course) throw new Error('Course tidak ditemukan.')
    const key = userScopeKey(userId)
    const state = getProgressState(key, course)
    state.userScopeId = userId || 'guest'
    const view = buildCourseView(course, state)
    const lesson = view.modules.flatMap((module) => module.lessons).find((item) => item.id === lessonId)

    if (!lesson) throw new Error('Lesson tidak ditemukan.')
    if (lesson.isLocked) throw new Error('Lesson masih terkunci.')

    const nextState = {
      ...state,
      activeLessonId: lessonId,
      lastTouchedAt: new Date().toISOString(),
    }
    saveProgressState(key, courseId, nextState)
    return buildCourseView(course, nextState)
  },

  completeLesson(courseId, lessonId, userId) {
    const course = getCourseById(courseId)
    if (!course) throw new Error('Course tidak ditemukan.')
    const key = userScopeKey(userId)
    const state = getProgressState(key, course)
    state.userScopeId = userId || 'guest'
    const view = buildCourseView(course, state)
    const lessons = view.modules.flatMap((module) => module.lessons)
    const lesson = lessons.find((item) => item.id === lessonId)

    if (!lesson) throw new Error('Lesson tidak ditemukan.')
    if (lesson.isLocked) throw new Error('Lesson masih terkunci.')
    if (!lesson.canComplete) throw new Error(lesson.completionGateReason || 'Selesaikan progress lesson terlebih dahulu.')

    const completedSet = new Set(state.completedLessonIds)
    completedSet.add(lessonId)
    const currentIndex = lessons.findIndex((item) => item.id === lessonId)
    const nextLesson = currentIndex >= 0 ? lessons[currentIndex + 1] : null

    const nextState = {
      completedLessonIds: Array.from(completedSet),
      activeLessonId: nextLesson?.id || lessonId,
      lessonPlayback: state.lessonPlayback || {},
      studyEvents: Array.isArray(state.studyEvents) ? state.studyEvents : [],
      lastTouchedAt: new Date().toISOString(),
      userScopeId: userId || 'guest',
    }

    saveProgressState(key, courseId, nextState)
    return buildCourseView(course, nextState)
  },

  updateLessonPlayback(courseId, lessonId, payload, userId) {
    const course = getCourseById(courseId)
    if (!course) throw new Error('Course tidak ditemukan.')
    const key = userScopeKey(userId)
    const state = getProgressState(key, course)
    state.userScopeId = userId || 'guest'
    const view = buildCourseView(course, state)
    const lesson = view.modules.flatMap((module) => module.lessons).find((item) => item.id === lessonId)
    if (!lesson) throw new Error('Lesson tidak ditemukan.')
    if (lesson.isLocked) throw new Error('Lesson masih terkunci.')

    const durationSec = Math.max(0, Math.floor(Number(payload?.durationSec || lesson.playback.durationSec || 0)))
    const nextPosition = Math.max(0, Math.floor(Number(payload?.positionSec ?? 0)))
    const positionSec = durationSec > 0 ? Math.min(nextPosition, durationSec) : nextPosition
    const existing = state.lessonPlayback?.[lessonId] || {}
    const prevPosition = Math.max(0, Math.floor(Number(existing.positionSec || 0)))
    const step = Math.max(0, positionSec - prevPosition)
    const treatAsContinuousWatch = step > 0 && step <= MAX_WATCH_STEP_SEC
    const watchedRanges = treatAsContinuousWatch
      ? appendWatchedRange(existing.watchedRanges || [], prevPosition, positionSec, durationSec)
      : normalizeRanges(existing.watchedRanges || [], durationSec)
    const watchedSec = sumRangeDuration(watchedRanges)
    const progressPercent = durationSec > 0 ? Math.round((watchedSec / durationSec) * 100) : 0
    const isCompletedVideo = Boolean(payload?.markCompleted) || progressPercent >= VIDEO_COMPLETION_THRESHOLD_PERCENT
    const completedVideoAt = isCompletedVideo ? existing.completedVideoAt || new Date().toISOString() : existing.completedVideoAt || null

    const nextPlayback = {
      ...(state.lessonPlayback || {}),
      [lessonId]: {
        positionSec,
        durationSec,
        watchedSec,
        watchedRanges,
        progressPercent: Math.max(0, Math.min(100, progressPercent)),
        completedVideoAt,
      },
    }

    const watchedDeltaSec = Math.max(0, watchedSec - Math.floor(Number(existing.watchedSec || 0)))
    const nextEvents = watchedDeltaSec
      ? [
          {
            at: new Date().toISOString(),
            lessonId,
            seconds: watchedDeltaSec,
          },
          ...(Array.isArray(state.studyEvents) ? state.studyEvents : []),
        ].slice(0, 800)
      : Array.isArray(state.studyEvents)
        ? state.studyEvents
        : []

    const nextState = {
      ...state,
      lessonPlayback: nextPlayback,
      studyEvents: nextEvents,
      lastTouchedAt: new Date().toISOString(),
    }
    saveProgressState(key, courseId, nextState)
    const completionGate = getLessonCompletionGate(lesson, nextPlayback[lessonId])
    return {
      ...nextPlayback[lessonId],
      canComplete: completionGate.canComplete,
      completionRequiredPercent: completionGate.requiredProgressPercent,
      completionGateReason: completionGate.reason,
    }
  },

  updateModulePrerequisite(courseId, moduleId, payload = {}, userId) {
    const course = getCourseById(courseId)
    if (!course) throw new Error('Course tidak ditemukan.')
    const module = (course.modules || []).find((item) => item.id === moduleId)
    if (!module) throw new Error('Module tidak ditemukan.')

    const rules = (Array.isArray(payload.rules) ? payload.rules : [])
      .filter((rule) =>
        rule?.type === 'lesson-complete'
          ? Boolean(rule.lessonId)
          : rule?.type === 'module-complete' || rule?.type === 'module-quiz-pass'
            ? Boolean(rule.moduleId)
            : false,
      )
      .map((rule) => ({
        type: rule.type,
        moduleId: rule.moduleId || undefined,
        lessonId: rule.lessonId || undefined,
      }))

    const map = readModulePrerequisiteOverrides()
    map[`${courseId}:${moduleId}`] = {
      mode: payload.mode === 'any' ? 'any' : 'all',
      rules,
    }
    writeModulePrerequisiteOverrides(map)
    return this.getCourse(courseId, userId)
  },

  getLearningAnalytics(userId) {
    return buildLearningAnalytics(userId)
  },

  getContinueLearning(userId) {
    return getContinueLearning(userId)
  },
}
