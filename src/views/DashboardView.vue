<template>
  <section v-if="currentTemplate === 'sunrise'" class="dashboard-grid">
    <article class="hero-card dashboard-hero">
      <p class="eyebrow">Continue Learning</p>
      <h2>{{ heroCourse.title }}</h2>
      <p class="hero-meta">
        {{ heroCourse.activeLessonTitle || 'Mulai lesson pertama' }} - {{ heroCourse.completedLessons }}/{{ heroCourse.totalLessons }}
        selesai
      </p>
      <p v-if="heroCourse.nextLockReason" class="hero-lock-hint">{{ heroCourse.nextLockReason }}</p>
      <TemplateHeroArt />
      <div class="hero-actions">
        <RouterLink :to="toCourseRoute(heroCourse)" class="primary-btn">Resume Class</RouterLink>
        <button class="ghost-btn" type="button">Lihat Silabus</button>
      </div>
    </article>

    <article class="card stat-card dashboard-progress">
      <h3>Progress Mingguan</h3>
      <p class="stat-big">{{ weeklyProgress }}%</p>
      <p class="muted">Study {{ weeklyStudyMinutes }} menit · +{{ weeklyGain }}% dibanding periode sebelumnya</p>
      <p class="stat-live"><span></span> Live update</p>
    </article>

    <article class="card stat-card dashboard-deadline">
      <h3>Deadline Terdekat</h3>
      <p class="stat-big">Quiz UI Dasar</p>
      <p class="muted">Selasa, 11 Maret 2026</p>
    </article>

    <article class="card full-width dashboard-courses">
      <div class="section-header">
        <h3>My Courses</h3>
        <span class="muted">{{ displayCourses.length }} course aktif</span>
      </div>
      <div class="course-grid">
        <CourseCard v-for="course in displayCourses" :key="course.id" :course="course" />
      </div>
    </article>

    <article class="card full-width dashboard-activity">
      <div class="section-header">
        <h3>Aktivitas Kelas</h3>
      </div>
      <ul class="activity-list">
        <li>Mentor memberi feedback pada tugas "Landing Page Heuristic".</li>
        <li>Kamu menyelesaikan modul "Wireframing Essentials".</li>
        <li>Diskusi baru: "Best practice design system".</li>
      </ul>
      <div v-if="analyticsWarnings.length" class="warning-list-block">
        <p class="eyebrow">Early Warning</p>
        <ul class="activity-list warning-list">
          <li v-for="item in analyticsWarnings" :key="item.courseId">
            {{ item.title }} · {{ item.progress }}% · {{ item.reason }}
          </li>
        </ul>
      </div>
    </article>

    <TemplateDashboardWidget class="full-width dashboard-template-widget" />
  </section>

  <section v-else class="dashboard-alt aurora-layout">
    <article class="hero-card aurora-hero">
      <p class="eyebrow">Learning Command Center</p>
      <h2>{{ heroCourse.title }}</h2>
      <p class="hero-meta">
        {{ heroCourse.activeLessonTitle || 'Mulai lesson pertama' }} - {{ heroCourse.completedLessons }}/{{ heroCourse.totalLessons }}
        selesai
      </p>
      <TemplateHeroArt />
      <div class="hero-actions">
        <RouterLink :to="toCourseRoute(heroCourse)" class="primary-btn">Resume Class</RouterLink>
        <button class="ghost-btn" type="button">Open Study Plan</button>
      </div>
    </article>

    <article class="card aurora-courses">
      <div class="section-header">
        <h3>Course Pipeline</h3>
        <span class="muted">{{ displayCourses.length }} aktif</span>
      </div>
      <div class="course-strip">
        <RouterLink
          v-for="course in displayCourses"
          :key="course.id"
          :to="toCourseRoute(course)"
          class="course-strip-item"
        >
          <div class="strip-color" :style="{ background: course.gradient }"></div>
          <h4>{{ course.title }}</h4>
          <p>{{ course.description }}</p>
          <p v-if="course.blockedLessons" class="strip-lock-indicator">
            {{ course.blockedLessons }} locked · {{ course.nextLockedLessonTitle || 'lihat detail' }}
          </p>
          <strong>{{ course.progress }}%</strong>
        </RouterLink>
      </div>
    </article>

    <aside class="aurora-side-stack">
      <article class="card aurora-kpi">
        <h3>Progress Radar</h3>
        <div class="aurora-kpi-grid">
          <div class="aurora-kpi-item">
            <p class="muted">Mingguan</p>
            <p class="stat-big">{{ weeklyProgress }}%</p>
          </div>
          <div class="aurora-kpi-item">
            <p class="muted">Growth</p>
            <p class="stat-big">+{{ weeklyGain }}%</p>
          </div>
          <div class="aurora-kpi-item">
            <p class="muted">Study Time</p>
            <p class="stat-big">{{ weeklyStudyMinutes }}m</p>
          </div>
        </div>
      </article>

      <article class="card aurora-timeline">
        <h3>Timeline Hari Ini</h3>
        <ul class="activity-list aurora-timeline-list">
          <li>09:00 - Review feedback mentor</li>
          <li>13:00 - Kerjakan quiz UI Dasar</li>
          <li>20:00 - Sesi diskusi komunitas</li>
        </ul>
      </article>

      <TemplateDashboardWidget class="aurora-widget" />
    </aside>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import CourseCard from '../components/CourseCard.vue'
import TemplateDashboardWidget from '../components/template/TemplateDashboardWidget.vue'
import TemplateHeroArt from '../components/template/TemplateHeroArt.vue'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'
import { useCoursePlayerStore } from '../stores/coursePlayer'
import { useLearningAnalyticsStore } from '../stores/learningAnalytics'
import { useToastStore } from '../stores/toast'

const { currentTemplate } = useTemplateSwitcher()
const coursePlayerStore = useCoursePlayerStore()
const analyticsStore = useLearningAnalyticsStore()
const toastStore = useToastStore()
const { courses, continueLearning } = storeToRefs(coursePlayerStore)
const { data: analyticsData } = storeToRefs(analyticsStore)

const weeklyProgress = ref(0)
const weeklyGain = ref(0)
const weeklyStudyMinutes = ref(0)
const animatedCourseProgress = ref([])
const frameIds = new Set()
const timeoutIds = []

const displayCourses = computed(() =>
  courses.value.map((course, index) => ({
    ...course,
    progress: animatedCourseProgress.value[index] ?? 0,
  })),
)

const heroCourse = computed(() => {
  if (continueLearning.value?.id) {
    const animated = displayCourses.value.find((course) => course.id === continueLearning.value.id)
    return animated || continueLearning.value
  }
  if (displayCourses.value.length) return displayCourses.value[0]
  return {
    id: 'ui-101',
    title: 'UI Design Fundamentals',
    activeLessonId: 'ui-101-l1',
    activeLessonTitle: 'Mulai lesson pertama',
    completedLessons: 0,
    totalLessons: 4,
  }
})

const analyticsWarnings = computed(() => (analyticsData.value?.earlyWarnings || []).slice(0, 3))

const calculateGrowthPercent = () => {
  const byDay = analyticsData.value?.weeklyStudy?.byDay || []
  if (!byDay.length) return 0
  const splitIndex = Math.floor(byDay.length / 2)
  const prev = byDay.slice(0, splitIndex).reduce((sum, row) => sum + Number(row.minutes || 0), 0)
  const recent = byDay.slice(splitIndex).reduce((sum, row) => sum + Number(row.minutes || 0), 0)
  if (prev <= 0) return recent > 0 ? 100 : 0
  return Math.max(0, Math.round(((recent - prev) / prev) * 100))
}

const toCourseRoute = (course) => ({
  name: 'course-detail',
  params: { id: course.id },
  query: course.activeLessonId ? { lesson: course.activeLessonId } : {},
})

const runNumberAnimation = (from, to, duration, onUpdate) => {
  const start = performance.now()
  const delta = to - from

  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1)
    const eased = 1 - (1 - progress) ** 3
    const value = from + delta * eased
    onUpdate(Math.round(value))

    if (progress < 1) {
      const next = requestAnimationFrame(tick)
      frameIds.add(next)
    }
  }

  const first = requestAnimationFrame(tick)
  frameIds.add(first)
}

const animateCourses = () => {
  animatedCourseProgress.value = courses.value.map(() => 0)
  courses.value.forEach((course, index) => {
    const timeoutId = setTimeout(() => {
      runNumberAnimation(0, course.progress, 900 + index * 120, (value) => {
        animatedCourseProgress.value[index] = value
      })
    }, 100 * index)
    timeoutIds.push(timeoutId)
  })
}

onMounted(async () => {
  try {
    await coursePlayerStore.loadCourses()
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Dashboard gagal memuat course',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat data course.',
    })
  }
  try {
    await analyticsStore.load()
  } catch {
    // keep dashboard usable when analytics endpoint is unavailable
  }

  runNumberAnimation(0, Number(analyticsData.value?.completionRateAvg || 0), 1100, (value) => {
    weeklyProgress.value = value
  })

  runNumberAnimation(0, calculateGrowthPercent(), 900, (value) => {
    weeklyGain.value = value
  })

  runNumberAnimation(0, Number(analyticsData.value?.weeklyStudy?.totalMinutes || 0), 900, (value) => {
    weeklyStudyMinutes.value = value
  })

  animateCourses()
})

watch(
  () => courses.value.length,
  () => {
    timeoutIds.forEach((id) => clearTimeout(id))
    timeoutIds.length = 0
    animateCourses()
  },
)

watch(
  () => analyticsData.value?.generatedAt,
  () => {
    runNumberAnimation(weeklyProgress.value, Number(analyticsData.value?.completionRateAvg || 0), 600, (value) => {
      weeklyProgress.value = value
    })
    runNumberAnimation(weeklyGain.value, calculateGrowthPercent(), 600, (value) => {
      weeklyGain.value = value
    })
    runNumberAnimation(weeklyStudyMinutes.value, Number(analyticsData.value?.weeklyStudy?.totalMinutes || 0), 600, (value) => {
      weeklyStudyMinutes.value = value
    })
  },
)

onBeforeUnmount(() => {
  timeoutIds.forEach((id) => clearTimeout(id))
  frameIds.forEach((id) => cancelAnimationFrame(id))
  frameIds.clear()
})
</script>
