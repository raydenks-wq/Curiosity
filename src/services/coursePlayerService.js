const COURSE_PROGRESS_KEY = 'curiosity:lms:course-progress:v1'

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
            summary: 'Memahami prinsip hierarchy untuk layout yang mudah dipahami.',
            resources: ['Hierarchy Checklist.pdf', 'Reference Board.fig'],
          },
          {
            id: 'ui-101-l2',
            title: 'Typography Pairing',
            duration: '16m',
            type: 'video',
            summary: 'Kombinasi font headline-body untuk readability.',
            resources: ['Type Scale Guide.pdf'],
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
            summary: 'Praktik kontras warna agar aksesibel dan konsisten brand.',
            resources: ['WCAG Contrast Card.pdf'],
          },
          {
            id: 'ui-101-l4',
            title: 'Grid and Spacing System',
            duration: '18m',
            type: 'workshop',
            summary: 'Membuat 8pt grid untuk desain yang rapi dan scalable.',
            resources: ['8pt Grid Template.fig'],
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
            summary: 'Struktur HTML yang benar untuk SEO dan aksesibilitas.',
            resources: ['Semantic Tag Cheat Sheet.pdf'],
          },
          {
            id: 'fe-101-l2',
            title: 'Responsive Layout with CSS Grid',
            duration: '20m',
            type: 'video',
            summary: 'Membangun layout adaptif untuk desktop dan mobile.',
            resources: ['Grid Playground.zip'],
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
            summary: 'Teknik menyusun problem statement berbasis user impact.',
            resources: ['Problem Framing Canvas.pdf'],
          },
          {
            id: 'pm-101-l2',
            title: 'Prioritization Matrix',
            duration: '15m',
            type: 'workshop',
            summary: 'Skoring impact vs effort untuk memilih prioritas fitur.',
            resources: ['Prioritization Matrix.xlsx'],
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

const getProgressState = (userKey, course) => {
  const allProgress = safeJsonRead(COURSE_PROGRESS_KEY, {})
  const scope = allProgress[userKey] || {}
  const courseState = scope[course.id] || {}
  const allLessons = flattenLessons(course)
  const firstLesson = allLessons[0]?.id || ''

  return {
    completedLessonIds: Array.isArray(courseState.completedLessonIds) ? courseState.completedLessonIds : [],
    activeLessonId: courseState.activeLessonId || firstLesson,
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
    },
  }
  safeJsonWrite(COURSE_PROGRESS_KEY, allProgress)
}

const buildCourseView = (course, state) => {
  const allLessons = flattenLessons(course)
  const completedSet = new Set(state.completedLessonIds)
  const lessonIds = allLessons.map((lesson) => lesson.id)

  const lessonMetaById = Object.fromEntries(
    lessonIds.map((lessonId, index) => {
      const prevLessonId = lessonIds[index - 1]
      const isLocked = index > 0 && !completedSet.has(prevLessonId)
      return [lessonId, { index, isLocked }]
    }),
  )

  const activeLessonId = lessonMetaById[state.activeLessonId]?.isLocked ? lessonIds[0] : state.activeLessonId

  const modules = course.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson) => {
      const meta = lessonMetaById[lesson.id]
      return {
        ...lesson,
        isCompleted: completedSet.has(lesson.id),
        isLocked: Boolean(meta?.isLocked),
        isActive: lesson.id === activeLessonId,
      }
    }),
  }))

  const completedLessons = allLessons.filter((lesson) => completedSet.has(lesson.id)).length
  const totalLessons = allLessons.length
  const progress = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
  const activeLesson = allLessons.find((lesson) => lesson.id === activeLessonId) || allLessons[0] || null
  const activeIndex = activeLesson ? lessonIds.indexOf(activeLesson.id) : -1
  const previousLesson = activeIndex > 0 ? allLessons[activeIndex - 1] : null
  const nextLesson = activeIndex >= 0 && activeIndex < allLessons.length - 1 ? allLessons[activeIndex + 1] : null

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
})

const getCourseById = (courseId) => defaultCatalog.find((course) => course.id === courseId)

const userScopeKey = (userId) => String(userId || 'guest')

export const coursePlayerService = {
  listCourses(userId) {
    const key = userScopeKey(userId)
    return defaultCatalog.map((course) => {
      const state = getProgressState(key, course)
      return toCourseCard(buildCourseView(course, state))
    })
  },

  getCourse(courseId, userId) {
    const course = getCourseById(courseId)
    if (!course) throw new Error('Course tidak ditemukan.')
    const key = userScopeKey(userId)
    const state = getProgressState(key, course)
    return buildCourseView(course, state)
  },

  setActiveLesson(courseId, lessonId, userId) {
    const course = getCourseById(courseId)
    if (!course) throw new Error('Course tidak ditemukan.')
    const key = userScopeKey(userId)
    const state = getProgressState(key, course)
    const view = buildCourseView(course, state)
    const lesson = view.modules.flatMap((module) => module.lessons).find((item) => item.id === lessonId)

    if (!lesson) throw new Error('Lesson tidak ditemukan.')
    if (lesson.isLocked) throw new Error('Lesson masih terkunci.')

    const nextState = {
      ...state,
      activeLessonId: lessonId,
    }
    saveProgressState(key, courseId, nextState)
    return buildCourseView(course, nextState)
  },

  completeLesson(courseId, lessonId, userId) {
    const course = getCourseById(courseId)
    if (!course) throw new Error('Course tidak ditemukan.')
    const key = userScopeKey(userId)
    const state = getProgressState(key, course)
    const view = buildCourseView(course, state)
    const lessons = view.modules.flatMap((module) => module.lessons)
    const lesson = lessons.find((item) => item.id === lessonId)

    if (!lesson) throw new Error('Lesson tidak ditemukan.')
    if (lesson.isLocked) throw new Error('Lesson masih terkunci.')

    const completedSet = new Set(state.completedLessonIds)
    completedSet.add(lessonId)
    const currentIndex = lessons.findIndex((item) => item.id === lessonId)
    const nextLesson = currentIndex >= 0 ? lessons[currentIndex + 1] : null

    const nextState = {
      completedLessonIds: Array.from(completedSet),
      activeLessonId: nextLesson?.id || lessonId,
    }

    saveProgressState(key, courseId, nextState)
    return buildCourseView(course, nextState)
  },
}
