<template>
  <article class="card template-widget detail-template-widget">
    <div class="section-header">
      <h3>Course Companion</h3>
      <span class="pill">{{ currentOption.label }}</span>
    </div>

    <div v-if="currentTemplate === 'sunrise'" class="cw-sunrise">
      <p class="muted">Mentor spotlight</p>
      <div class="mentor-cards">
        <div v-for="mentor in sunriseMentors" :key="mentor.name" class="mentor-card">
          <strong>{{ mentor.name }}</strong>
          <span>{{ mentor.focus }}</span>
        </div>
      </div>
    </div>

    <div v-else class="cw-aurora">
      <p class="muted">Learning currents</p>
      <div class="metric-row" v-for="item in auroraMetrics" :key="item.name">
        <span>{{ item.name }}</span>
        <div class="mini-track"><div class="mini-fill" :style="{ width: `${item.value}%` }"></div></div>
      </div>
    </div>
  </article>
</template>

<script setup>
import { useTemplateSwitcher } from '../../plugins/templateSwitcher'

const { currentTemplate, currentOption } = useTemplateSwitcher()

const auroraMetrics = [
  { name: 'Comprehension', value: 82 },
  { name: 'Practice', value: 61 },
  { name: 'Consistency', value: 74 },
]

const sunriseMentors = [
  { name: 'Ayu', focus: 'UX Strategy' },
  { name: 'Raka', focus: 'Interaction Design' },
]
</script>
