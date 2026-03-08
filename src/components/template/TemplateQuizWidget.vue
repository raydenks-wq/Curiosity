<template>
  <article class="card template-widget quiz-template-widget">
    <div class="section-header">
      <h3>Quiz Assistant</h3>
      <span class="pill">{{ currentOption.label }}</span>
    </div>

    <div v-if="currentTemplate === 'sunrise'" class="qw-sunrise">
      <p class="muted">Hint cards</p>
      <div class="hint-cards">
        <div v-for="hint in sunriseHints" :key="hint" class="hint-card">{{ hint }}</div>
      </div>
    </div>

    <div v-else class="qw-aurora">
      <p class="muted">Confidence tracker</p>
      <div class="metric-row" v-for="item in auroraConfidence" :key="item.label">
        <span>{{ item.label }}</span>
        <div class="mini-track"><div class="mini-fill" :style="{ width: `${item.value}%` }"></div></div>
      </div>
    </div>
  </article>
</template>

<script setup>
import { useTemplateSwitcher } from '../../plugins/templateSwitcher'

const { currentTemplate, currentOption } = useTemplateSwitcher()

const auroraConfidence = [
  { label: 'Hierarchy', value: 80 },
  { label: 'Spacing', value: 67 },
  { label: 'Accessibility', value: 58 },
]

const sunriseHints = ['Prioritaskan readability', 'Cari pola, bukan hafalan', 'Eliminasi jawaban ekstrem']
</script>
