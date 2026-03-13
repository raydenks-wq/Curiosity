<template>
  <section class="course-catalog-layout">
    <article class="card course-catalog-header">
      <div>
        <p class="eyebrow">Course View</p>
        <h2>Pilih Course</h2>
        <p class="muted">Pilih course yang ingin kamu lanjutkan.</p>
      </div>
      <div class="course-catalog-tools">
        <input
          v-model.trim="query"
          class="assignment-input"
          type="search"
          placeholder="Cari title, tag, atau lesson..."
          aria-label="Cari course"
        />
        <span class="pill">{{ filteredCourses.length }} course</span>
      </div>
    </article>

    <p v-if="coursePlayerStore.isLoadingList" class="muted">Memuat daftar course...</p>
    <p v-else-if="!filteredCourses.length" class="muted">Belum ada course yang tersedia.</p>

    <div v-else class="course-grid course-catalog-grid">
      <CourseCard v-for="course in filteredCourses" :key="course.id" :course="course" />
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import CourseCard from '../components/CourseCard.vue'
import { useCoursePlayerStore } from '../stores/coursePlayer'
import { useToastStore } from '../stores/toast'

const coursePlayerStore = useCoursePlayerStore()
const toastStore = useToastStore()
const { courses } = storeToRefs(coursePlayerStore)

const query = ref('')

const filteredCourses = computed(() => {
  const keyword = String(query.value || '').trim().toLowerCase()
  if (!keyword) return courses.value
  return courses.value.filter((course) => {
    const lessonTitle = String(course.activeLessonTitle || '').toLowerCase()
    return (
      String(course.title || '').toLowerCase().includes(keyword) ||
      String(course.description || '').toLowerCase().includes(keyword) ||
      String(course.tag || '').toLowerCase().includes(keyword) ||
      lessonTitle.includes(keyword)
    )
  })
})

onMounted(async () => {
  try {
    await coursePlayerStore.loadCourses()
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal memuat course',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
})
</script>
