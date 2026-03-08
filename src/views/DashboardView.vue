<template>
  <section v-if="currentTemplate === 'sunrise'" class="dashboard-grid">
    <article class="hero-card dashboard-hero">
      <p class="eyebrow">Continue Learning</p>
      <h2>UX Research Essentials</h2>
      <p class="hero-meta">Lesson 4 dari 8 - User interview framework</p>
      <TemplateHeroArt />
      <div class="hero-actions">
        <RouterLink to="/courses/ui-101" class="primary-btn">Resume Class</RouterLink>
        <button class="ghost-btn" type="button">Lihat Silabus</button>
      </div>
    </article>

    <article class="card stat-card dashboard-progress">
      <h3>Progress Mingguan</h3>
      <p class="stat-big">{{ weeklyProgress }}%</p>
      <p class="muted">+{{ weeklyGain }}% dibanding minggu lalu</p>
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
        <span class="muted">3 course aktif</span>
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
    </article>

    <TemplateDashboardWidget class="full-width dashboard-template-widget" />
  </section>

  <section v-else class="dashboard-alt aurora-layout">
    <article class="hero-card aurora-hero">
      <p class="eyebrow">Learning Command Center</p>
      <h2>UX Research Essentials</h2>
      <p class="hero-meta">Lesson 4 dari 8 - User interview framework</p>
      <TemplateHeroArt />
      <div class="hero-actions">
        <RouterLink to="/courses/ui-101" class="primary-btn">Resume Class</RouterLink>
        <button class="ghost-btn" type="button">Open Study Plan</button>
      </div>
    </article>

    <article class="card aurora-kpi">
      <h3>Progress Radar</h3>
      <div class="aurora-kpi-grid">
        <div>
          <p class="muted">Mingguan</p>
          <p class="stat-big">{{ weeklyProgress }}%</p>
        </div>
        <div>
          <p class="muted">Growth</p>
          <p class="stat-big">+{{ weeklyGain }}%</p>
        </div>
      </div>
    </article>

    <article class="card aurora-timeline">
      <h3>Timeline Hari Ini</h3>
      <ul class="activity-list">
        <li>09:00 - Review feedback mentor</li>
        <li>13:00 - Kerjakan quiz UI Dasar</li>
        <li>20:00 - Sesi diskusi komunitas</li>
      </ul>
    </article>

    <article class="card aurora-courses">
      <div class="section-header">
        <h3>Course Pipeline</h3>
        <span class="muted">3 aktif</span>
      </div>
      <div class="course-strip">
        <RouterLink
          v-for="course in displayCourses"
          :key="course.id"
          :to="`/courses/${course.id}`"
          class="course-strip-item"
        >
          <div class="strip-color" :style="{ background: course.gradient }"></div>
          <h4>{{ course.title }}</h4>
          <p>{{ course.description }}</p>
          <strong>{{ course.progress }}%</strong>
        </RouterLink>
      </div>
    </article>

    <TemplateDashboardWidget class="aurora-widget" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CourseCard from '../components/CourseCard.vue'
import TemplateDashboardWidget from '../components/template/TemplateDashboardWidget.vue'
import TemplateHeroArt from '../components/template/TemplateHeroArt.vue'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'

const { currentTemplate } = useTemplateSwitcher()

const courses = [
  {
    id: 'ui-101',
    title: 'UI Design Fundamentals',
    description: 'Dasar komposisi, warna, tipografi, dan hierarchy.',
    progress: 68,
    tag: 'Design',
    gradient: 'linear-gradient(120deg, #0081a7, #00afb9)',
  },
  {
    id: 'fe-101',
    title: 'Frontend for Designer',
    description: 'HTML, CSS, dan Vue komponen untuk prototyping.',
    progress: 42,
    tag: 'Code',
    gradient: 'linear-gradient(120deg, #fb8500, #ffb703)',
  },
  {
    id: 'pm-101',
    title: 'Product Thinking',
    description: 'Menyusun roadmap fitur berbasis kebutuhan user.',
    progress: 83,
    tag: 'Product',
    gradient: 'linear-gradient(120deg, #8338ec, #3a86ff)',
  },
]

const weeklyProgress = ref(0)
const weeklyGain = ref(0)
const animatedCourseProgress = ref(courses.map(() => 0))
const frameIds = new Set()
const timeoutIds = []

const displayCourses = computed(() =>
  courses.map((course, index) => ({
    ...course,
    progress: animatedCourseProgress.value[index] ?? 0,
  })),
)

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

onMounted(() => {
  runNumberAnimation(0, 74, 1100, (value) => {
    weeklyProgress.value = value
  })

  runNumberAnimation(0, 12, 900, (value) => {
    weeklyGain.value = value
  })

  courses.forEach((course, index) => {
    const timeoutId = setTimeout(() => {
      runNumberAnimation(0, course.progress, 1000 + index * 150, (value) => {
        animatedCourseProgress.value[index] = value
      })
    }, 120 * index)
    timeoutIds.push(timeoutId)
  })
})

onBeforeUnmount(() => {
  timeoutIds.forEach((id) => clearTimeout(id))
  frameIds.forEach((id) => cancelAnimationFrame(id))
  frameIds.clear()
})
</script>
