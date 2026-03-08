<template>
  <article class="card course-card">
    <div class="course-thumb" :style="{ background: course.gradient }">
      <span>{{ course.tag }}</span>
    </div>

    <div class="course-body">
      <h3>{{ course.title }}</h3>
      <p>{{ course.description }}</p>

      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${course.progress}%` }"></div>
        </div>
        <strong>{{ course.progress }}%</strong>
      </div>

      <RouterLink :to="`/courses/${course.id}`" class="primary-btn">Lanjutkan</RouterLink>
    </div>
  </article>
</template>

<script setup>
defineProps({
  course: {
    type: Object,
    required: true,
  },
})
</script>
