<template>
  <section class="quiz-layout">
    <article class="card full-width quiz-header-card">
      <div class="section-header">
        <h2>Quiz: UI Design Fundamentals</h2>
        <span class="pill">10 pertanyaan</span>
      </div>
      <p class="muted">Pilih jawaban terbaik untuk setiap pertanyaan di bawah.</p>
    </article>

    <article class="card question-card quiz-question-card" v-for="(question, index) in questions" :key="question.id">
      <p class="eyebrow">Question {{ index + 1 }}</p>
      <h3>{{ question.title }}</h3>
      <div class="options">
        <label v-for="option in question.options" :key="option" class="option-row">
          <input type="radio" :name="question.id" />
          <span>{{ option }}</span>
        </label>
      </div>
    </article>

    <article class="card full-width actions-row quiz-actions-card">
      <button class="ghost-btn" type="button">Simpan Draft</button>
      <button class="primary-btn" type="button">Submit Quiz</button>
    </article>

    <TemplateQuizWidget class="full-width" />
  </section>
</template>

<script setup>
import TemplateQuizWidget from '../components/template/TemplateQuizWidget.vue'

const questions = [
  {
    id: 'q1',
    title: 'Apa fungsi utama visual hierarchy pada halaman dashboard?',
    options: [
      'Membuat elemen tampak penuh warna',
      'Mengatur prioritas informasi agar mudah dipindai',
      'Memastikan semua teks berukuran sama',
    ],
  },
  {
    id: 'q2',
    title: 'Komponen mana yang paling tepat untuk menampilkan progres belajar?',
    options: ['Modal dialog', 'Progress bar', 'Tooltip'],
  },
]
</script>
