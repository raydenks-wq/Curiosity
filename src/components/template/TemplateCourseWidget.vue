<template>
  <article class="card template-widget detail-template-widget">
    <div class="section-header">
      <h3>Course Companion</h3>
      <span class="pill">{{ currentOption.label }}</span>
    </div>

    <div v-if="currentTemplate === 'ocean'" class="cw-ocean">
      <p class="muted">Learning currents</p>
      <div class="metric-row" v-for="item in oceanMetrics" :key="item.name">
        <span>{{ item.name }}</span>
        <div class="mini-track"><div class="mini-fill" :style="{ width: `${item.value}%` }"></div></div>
      </div>
    </div>

    <div v-else-if="currentTemplate === 'sunrise'" class="cw-sunrise">
      <p class="muted">Mentor spotlight</p>
      <div class="mentor-cards">
        <div v-for="mentor in sunriseMentors" :key="mentor.name" class="mentor-card">
          <strong>{{ mentor.name }}</strong>
          <span>{{ mentor.focus }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="currentTemplate === 'graphite'" class="cw-graphite">
      <p class="muted">Performance panel</p>
      <table class="simple-table">
        <thead>
          <tr><th>Metric</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in graphiteRows" :key="row.label">
            <td>{{ row.label }}</td><td>{{ row.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="currentTemplate === 'neon'" class="cw-neon">
      <p class="muted">Challenge mode</p>
      <div class="challenge-list">
        <div v-for="item in neonChallenges" :key="item" class="challenge-chip">{{ item }}</div>
      </div>
    </div>

    <div v-else class="cw-paper">
      <p class="muted">Lecture notes</p>
      <blockquote>
        "Good research is less about answers, more about better questions."
      </blockquote>
      <ul class="paper-notes">
        <li>Catat insight user per sesi interview.</li>
        <li>Kelompokkan temuan berdasarkan pain point.</li>
      </ul>
    </div>
  </article>
</template>

<script setup>
import { useTemplateSwitcher } from '../../plugins/templateSwitcher'

const { currentTemplate, currentOption } = useTemplateSwitcher()

const oceanMetrics = [
  { name: 'Comprehension', value: 82 },
  { name: 'Practice', value: 61 },
  { name: 'Consistency', value: 74 },
]

const sunriseMentors = [
  { name: 'Ayu', focus: 'UX Strategy' },
  { name: 'Raka', focus: 'Interaction Design' },
]

const graphiteRows = [
  { label: 'Attendance', value: '95%' },
  { label: 'Assignment Score', value: '88/100' },
  { label: 'Completion ETA', value: '6 days' },
]

const neonChallenges = ['2x Daily Quiz', '15m Flash Review', '1 Design Critique']
</script>
