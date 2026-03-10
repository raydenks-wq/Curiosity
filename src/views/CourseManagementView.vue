<template>
  <section class="user-mgmt-layout">
    <article class="card full-width">
      <div class="section-header">
        <h2>Course Management</h2>
        <button class="primary-btn" type="button">New Course</button>
      </div>
      <p class="muted">Kelola publish status, struktur modul, dan visibilitas course.</p>
    </article>

    <article class="card full-width">
      <div class="user-filter-row">
        <input v-model="keyword" class="search-input" type="search" placeholder="Search title/tag..." />
        <select v-model="statusFilter">
          <option value="all">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select v-model="sortBy">
          <option value="updated">Sort: Updated</option>
          <option value="title">Sort: Title</option>
          <option value="progress">Sort: Progress</option>
        </select>
        <select v-model="sortDir">
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>

      <div class="course-admin-grid">
        <article v-for="course in filteredCourses" :key="course.id" class="course-admin-item">
          <div class="course-admin-item-head">
            <div>
              <h3>{{ course.title }}</h3>
              <p class="muted">{{ course.id }} · {{ course.tag }}</p>
            </div>
            <span class="status-pill" :class="course.published ? 'status-active' : 'status-pending'">
              {{ course.published ? 'published' : 'draft' }}
            </span>
          </div>
          <p class="muted">{{ course.description }}</p>
          <p class="course-mini-meta">
            {{ course.totalLessons || 0 }} lessons · {{ course.completedLessons || 0 }} completed · {{ course.progress || 0 }}%
          </p>
          <div class="table-actions">
            <button class="ghost-btn" type="button">Edit Structure</button>
            <button class="ghost-btn" type="button">{{ course.published ? 'Unpublish' : 'Publish' }}</button>
            <RouterLink class="ghost-btn" :to="{ name: 'course-detail', params: { id: course.id } }">Open Course</RouterLink>
          </div>
        </article>
      </div>

      <p v-if="!filteredCourses.length" class="muted">Tidak ada course yang cocok dengan filter.</p>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useCoursePlayerStore } from '../stores/coursePlayer'

const courseStore = useCoursePlayerStore()
const { courses } = storeToRefs(courseStore)

const keyword = ref('')
const statusFilter = ref('all')
const sortBy = ref('updated')
const sortDir = ref('desc')

const normalizedCourses = computed(() =>
  (courses.value || []).map((course, index) => ({
    ...course,
    published: course.progress > 0,
    updatedAt: Date.now() - index * 3_600_000,
  })),
)

const filteredCourses = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const base = normalizedCourses.value.filter((course) => {
    if (statusFilter.value !== 'all') {
      const status = course.published ? 'published' : 'draft'
      if (status !== statusFilter.value) return false
    }
    if (!q) return true
    return [course.title, course.id, course.tag, course.description].some((field) => String(field || '').toLowerCase().includes(q))
  })

  const sorted = [...base].sort((a, b) => {
    if (sortBy.value === 'title') return String(a.title || '').localeCompare(String(b.title || ''))
    if (sortBy.value === 'progress') return Number(a.progress || 0) - Number(b.progress || 0)
    return Number(a.updatedAt || 0) - Number(b.updatedAt || 0)
  })

  return sortDir.value === 'asc' ? sorted : sorted.reverse()
})

onMounted(async () => {
  await courseStore.loadCourses()
})
</script>
