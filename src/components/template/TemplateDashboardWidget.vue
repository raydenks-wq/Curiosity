<template>
  <article class="card template-widget">
    <div class="section-header">
      <h3>Template Widget</h3>
      <span class="pill">{{ currentOption.label }}</span>
    </div>

    <div v-if="currentTemplate === 'sunrise'" class="tw-sunrise">
      <p class="muted">Creative Focus Mosaic</p>
      <div class="mosaic-grid">
        <div v-for="item in sunriseBlocks" :key="item.title" class="mosaic-item" :class="item.size">
          <strong>{{ item.title }}</strong>
          <small>{{ item.meta }}</small>
        </div>
      </div>
    </div>

    <div v-else class="tw-aurora">
      <p class="muted">Wave Progress Map</p>
      <div class="wave-track">
        <div v-for="step in auroraSteps" :key="step.label" class="wave-step" :class="{ done: step.done }">
          <span>{{ step.label }}</span>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup>
import { useTemplateSwitcher } from '../../plugins/templateSwitcher'

const { currentTemplate, currentOption } = useTemplateSwitcher()

const auroraSteps = [
  { label: 'Research', done: true },
  { label: 'Wireframe', done: true },
  { label: 'Prototype', done: false },
  { label: 'Testing', done: false },
]

const sunriseBlocks = [
  { title: 'Design Drill', meta: '45 min', size: 'wide' },
  { title: 'Peer Review', meta: '20 min', size: 'tall' },
  { title: 'Micro Quiz', meta: '10 Q', size: 'small' },
  { title: 'Reflection', meta: '15 min', size: 'small' },
]
</script>
