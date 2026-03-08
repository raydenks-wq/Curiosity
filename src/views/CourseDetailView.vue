<template>
  <section v-if="currentTemplate === 'sunrise'" class="course-detail-layout">
    <article class="card player-card detail-player">
      <div class="video-placeholder">
        <p>Lesson Video Placeholder</p>
        <h2>UX Research Essentials - Session 04</h2>
      </div>
      <div class="tab-strip">
        <button class="tab active" type="button">Materi</button>
        <button class="tab" type="button">Quiz</button>
        <button class="tab" type="button">Diskusi</button>
        <button class="tab" type="button">Resources</button>
      </div>
    </article>

    <article class="card module-card detail-module">
      <div class="section-header">
        <h3>Modul Progress</h3>
        <span class="muted">5/8 selesai</span>
      </div>
      <ul class="checklist">
        <li class="done">Intro to UX Research</li>
        <li class="done">Research Scope</li>
        <li class="done">Interview Preparation</li>
        <li>Conducting User Interview</li>
        <li>Synthesis & Insight Mapping</li>
      </ul>
      <div class="hero-actions">
        <button class="ghost-btn" type="button">Mark as Complete</button>
        <RouterLink class="primary-btn" to="/quiz/ui-101">Next: Quiz</RouterLink>
      </div>
    </article>

    <TemplateCourseWidget />
  </section>

  <section v-else class="course-detail-alt aurora-detail">
    <article class="card aurora-outline">
      <h3>Roadmap</h3>
      <ul class="checklist">
        <li v-for="module in modules" :key="module.title" :class="{ done: module.done }">{{ module.title }}</li>
      </ul>
    </article>

    <article class="card player-card aurora-player">
      <div class="video-placeholder">
        <p>Live Session</p>
        <h2>UX Research Essentials - Session 04</h2>
      </div>
      <div class="tab-strip">
        <button class="tab active" type="button">Overview</button>
        <button class="tab" type="button">Exercise</button>
        <button class="tab" type="button">Discuss</button>
      </div>
    </article>

    <TemplateCourseWidget class="aurora-course-widget" />
  </section>
</template>

<script setup>
import TemplateCourseWidget from '../components/template/TemplateCourseWidget.vue'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'

const { currentTemplate } = useTemplateSwitcher()

const modules = [
  { title: 'Intro to UX Research', done: true },
  { title: 'Research Scope', done: true },
  { title: 'Interview Preparation', done: true },
  { title: 'Conducting User Interview', done: false },
  { title: 'Synthesis & Insight Mapping', done: false },
]
</script>
