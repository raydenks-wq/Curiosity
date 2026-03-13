<template>
  <header class="topbar">
    <div>
      <p class="eyebrow">
        Welcome back<span v-if="displayName">, <span class="topbar-user-name-inline">{{ displayName }}</span></span>
      </p>
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
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useProfileStore } from '../stores/profile'

const ranges = ['Today', 'Week', 'Month']
const selectedRange = ref('Week')
const authStore = useAuthStore()
const profileStore = useProfileStore()
const { profile } = storeToRefs(profileStore)

const displayName = computed(() => {
  const authName = String(authStore.user?.name || '').trim()
  if (authName) return authName
  return String(profile.value?.name || '').trim()
})

onMounted(() => {
  profileStore.load().catch(() => {})
  profileStore.syncFromAuthUser(authStore.user)
})
</script>
