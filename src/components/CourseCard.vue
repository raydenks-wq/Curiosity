<template>
  <article class="card course-card">
    <div class="course-thumb" :style="{ background: course.gradient }">
      <span>{{ course.tag }}</span>
    </div>

    <div class="course-body">
      <h3>{{ course.title }}</h3>
      <p>{{ course.description }}</p>
      <p class="course-mini-meta">
        {{ course.activeLessonTitle || 'Mulai lesson pertama' }} · {{ course.completedLessons || 0 }}/{{ course.totalLessons || 0 }}
        lesson
      </p>
      <p v-if="course.blockedLessons" class="course-lock-alert">
        {{ course.blockedLessons }} lesson terkunci
        <span v-if="course.nextLockedLessonTitle">· {{ course.nextLockedLessonTitle }}</span>
      </p>
      <p v-if="course.nextLockReason" class="course-lock-reason">{{ course.nextLockReason }}</p>

      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${course.progress}%` }"></div>
        </div>
        <strong>{{ course.progress }}%</strong>
      </div>

      <RouterLink :to="courseRoute" class="primary-btn">Lanjutkan</RouterLink>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  course: {
    type: Object,
    required: true,
  },
})

const courseRoute = computed(() => ({
  name: 'course-detail',
  params: { id: props.course.id },
  query: props.course.activeLessonId ? { lesson: props.course.activeLessonId } : {},
}))
</script>
