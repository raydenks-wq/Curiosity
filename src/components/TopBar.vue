<template>
  <header class="topbar">
    <div>
      <p class="eyebrow">Welcome back</p>
      <h1 class="headline">Platform Pembelajaran Interaktif</h1>
    </div>

    <div class="topbar-actions">
      <input type="search" placeholder="Cari course, modul, atau topik..." class="search-input" />
      <div class="range-switch" role="tablist" aria-label="Learning range">
        <button
          v-for="item in ranges"
          :key="item"
          type="button"
          class="range-btn"
          :class="{ active: selectedRange === item }"
          @click="selectedRange = item"
        >
          {{ item }}
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'

const ranges = ['Today', 'Week', 'Month']
const selectedRange = ref('Week')
</script>
