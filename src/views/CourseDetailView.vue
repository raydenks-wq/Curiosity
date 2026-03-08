<template>
  <section class="course-detail-layout">
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
</template>

<script setup>
import TemplateCourseWidget from '../components/template/TemplateCourseWidget.vue'
</script>
