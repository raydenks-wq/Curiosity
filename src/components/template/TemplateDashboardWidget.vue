<template>
  <article class="card template-widget">
    <div class="section-header">
      <h3>Template Widget</h3>
      <span class="pill">{{ currentOption.label }}</span>
    </div>

    <div v-if="currentTemplate === 'ocean'" class="tw-ocean">
      <p class="muted">Wave Progress Map</p>
      <div class="wave-track">
        <div v-for="step in oceanSteps" :key="step.label" class="wave-step" :class="{ done: step.done }">
          <span>{{ step.label }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="currentTemplate === 'sunrise'" class="tw-sunrise">
      <p class="muted">Creative Focus Mosaic</p>
      <div class="mosaic-grid">
        <div v-for="item in sunriseBlocks" :key="item.title" class="mosaic-item" :class="item.size">
          <strong>{{ item.title }}</strong>
          <small>{{ item.meta }}</small>
        </div>
      </div>
    </div>

    <div v-else-if="currentTemplate === 'graphite'" class="tw-graphite">
      <p class="muted">Sprint Board</p>
      <div class="kanban-grid">
        <div v-for="lane in graphiteBoard" :key="lane.name" class="kanban-lane">
          <h4>{{ lane.name }}</h4>
          <ul>
            <li v-for="task in lane.tasks" :key="task">{{ task }}</li>
          </ul>
        </div>
      </div>
    </div>

    <div v-else-if="currentTemplate === 'neon'" class="tw-neon">
      <p class="muted">Streak Matrix</p>
      <div class="streak-grid">
        <div v-for="(value, i) in neonMatrix" :key="i" class="streak-dot" :class="`lvl-${value}`"></div>
      </div>
    </div>

    <div v-else class="tw-paper">
      <p class="muted">Study Planner</p>
      <ol class="paper-plan">
        <li v-for="plan in paperPlans" :key="plan.title">
          <strong>{{ plan.title }}</strong>
          <span>{{ plan.time }}</span>
        </li>
      </ol>
    </div>
  </article>
</template>

<script setup>
import { useTemplateSwitcher } from '../../plugins/templateSwitcher'

const { currentTemplate, currentOption } = useTemplateSwitcher()

const oceanSteps = [
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

const graphiteBoard = [
  { name: 'Backlog', tasks: ['Refine rubric', 'Review assets'] },
  { name: 'In Progress', tasks: ['Polish dashboard copy', 'Record video'] },
  { name: 'Done', tasks: ['Sync mentor notes'] },
]

const neonMatrix = [3, 2, 1, 0, 1, 3, 2, 3, 2, 1, 1, 0, 2, 3]

const paperPlans = [
  { title: 'Reading chapter 4', time: '08:00 - 09:00' },
  { title: 'Case study notes', time: '10:00 - 10:45' },
  { title: 'Self assessment', time: '14:00 - 14:30' },
]
</script>
