<template>
  <article class="card template-widget quiz-template-widget">
    <div class="section-header">
      <h3>Quiz Assistant</h3>
      <span class="pill">{{ currentOption.label }}</span>
    </div>

    <div v-if="currentTemplate === 'ocean'" class="qw-ocean">
      <p class="muted">Confidence tracker</p>
      <div class="metric-row" v-for="item in oceanConfidence" :key="item.label">
        <span>{{ item.label }}</span>
        <div class="mini-track"><div class="mini-fill" :style="{ width: `${item.value}%` }"></div></div>
      </div>
    </div>

    <div v-else-if="currentTemplate === 'sunrise'" class="qw-sunrise">
      <p class="muted">Hint cards</p>
      <div class="hint-cards">
        <div v-for="hint in sunriseHints" :key="hint" class="hint-card">{{ hint }}</div>
      </div>
    </div>

    <div v-else-if="currentTemplate === 'graphite'" class="qw-graphite">
      <p class="muted">Scoring rubric</p>
      <ul class="rubric-list">
        <li v-for="item in graphiteRubric" :key="item.name">
          <strong>{{ item.name }}</strong>
          <span>{{ item.weight }}</span>
        </li>
      </ul>
    </div>

    <div v-else-if="currentTemplate === 'neon'" class="qw-neon">
      <p class="muted">Lightning round</p>
      <div class="neon-timer">07:30</div>
      <small>Selesaikan 3 soal bonus sebelum timer habis.</small>
    </div>

    <div v-else class="qw-paper">
      <p class="muted">Exam checklist</p>
      <ol class="paper-plan">
        <li v-for="step in paperChecklist" :key="step">{{ step }}</li>
      </ol>
    </div>
  </article>
</template>

<script setup>
import { useTemplateSwitcher } from '../../plugins/templateSwitcher'

const { currentTemplate, currentOption } = useTemplateSwitcher()

const oceanConfidence = [
  { label: 'Hierarchy', value: 80 },
  { label: 'Spacing', value: 67 },
  { label: 'Accessibility', value: 58 },
]

const sunriseHints = ['Prioritaskan readability', 'Cari pola, bukan hafalan', 'Eliminasi jawaban ekstrem']

const graphiteRubric = [
  { name: 'Accuracy', weight: '50%' },
  { name: 'Reasoning', weight: '30%' },
  { name: 'Completion', weight: '20%' },
]

const paperChecklist = [
  'Baca pertanyaan sampai tuntas',
  'Tandai soal yang ragu',
  'Review semua jawaban sebelum submit',
]
</script>
