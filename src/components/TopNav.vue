<template>
  <header ref="topnavRoot" class="topnav-wrap">
    <div class="topnav-bar">
      <div class="topnav-left">
        <button class="hamburger-btn" type="button" @click="isMenuOpen = !isMenuOpen" aria-label="Toggle menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="brand">Curiosity<span>LMS</span></div>
      </div>

      <nav class="menu menu-top" :class="{ open: isMenuOpen }">
        <RouterLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="menu-link"
          @click="isMenuOpen = false"
        >
          <span class="menu-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="topnav-right">
        <div class="topnav-chip">
          <p class="topnav-chip-title">Learning Streak</p>
          <p class="topnav-chip-value">12 hari</p>
        </div>

        <button class="icon-btn" type="button" @click="togglePanel('theme')" aria-label="Template themes">
          🎨
        </button>

        <button class="icon-btn" type="button" @click="togglePanel('notif')" aria-label="Notifications">
          🔔
          <span class="badge-dot"></span>
        </button>

        <button class="avatar-btn" type="button" @click="togglePanel('profile')" aria-label="Profile menu">
          {{ initials }}
        </button>
      </div>
    </div>

    <transition name="drop-fade">
      <div v-if="activePanel === 'theme'" class="panel panel-theme">
        <p class="panel-title">Switch Template</p>
        <div class="template-list">
          <button
            v-for="option in templateOptions"
            :key="option.id"
            type="button"
            class="template-item"
            :class="{ active: currentTemplate === option.id }"
            @click="selectTemplate(option.id)"
          >
            <span class="template-item-title">{{ option.label }}</span>
            <span class="template-item-summary">{{ option.summary }}</span>
          </button>
        </div>
      </div>
    </transition>

    <transition name="drop-fade">
      <div v-if="activePanel === 'notif'" class="panel panel-notif">
        <p class="panel-title">Notifications</p>
        <ul>
          <li><strong>Quiz deadline:</strong> UI Dasar due besok 09:00</li>
          <li><strong>Mentor reply:</strong> Feedback untuk tugas wireframe tersedia</li>
          <li><strong>New class:</strong> Motion Design Fundamentals sudah dibuka</li>
        </ul>
      </div>
    </transition>

    <transition name="drop-fade">
      <div v-if="activePanel === 'profile'" class="panel panel-profile">
        <p class="panel-title">Akun Saya</p>
        <button type="button" @click="goToProfileSection('overview')">My Profile</button>
        <button type="button" @click="goToProfileSection('certificates')">Certificates</button>
        <button type="button" @click="goToProfileSection('security')">Settings</button>
        <button type="button" class="danger" @click="signOut">Sign Out</button>
      </div>
    </transition>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'
import { useAuthStore } from '../stores/auth'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const toastStore = useToastStore()
const { profile } = storeToRefs(profileStore)
const topnavRoot = ref(null)
const isMenuOpen = ref(false)
const activePanel = ref(null)

const { templateOptions, currentTemplate, setTemplate } = useTemplateSwitcher()

const navLabels = [
  { label: 'Dashboard', to: '/' },
  { label: 'Course Detail', to: '/courses/ui-101' },
  { label: 'Quiz', to: '/quiz/ui-101' },
  { label: 'Profile', to: '/profile' },
]

const adminOnlyNav = [{ label: 'Users', to: '/users' }]

const iconMap = {
  aurora: ['◉', '◈', '◌', '◎', '◍'],
  sunrise: ['☀', '✦', '✎', '☺', '✿'],
}

const navItems = computed(() => {
  const icons = iconMap[currentTemplate.value] ?? iconMap.sunrise
  const labels =
    profile.value?.accessRole === 'admin' ? [...navLabels, ...adminOnlyNav] : [...navLabels]
  return labels.map((item, index) => ({
    ...item,
    icon: icons[index] ?? '•',
  }))
})

const initials = computed(() => {
  const words = String(profile.value?.name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return 'CU'
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
})

const togglePanel = (panel) => {
  activePanel.value = activePanel.value === panel ? null : panel
}

const selectTemplate = (id) => {
  setTemplate(id)
  activePanel.value = null
}

const goToProfileSection = (tab) => {
  router.push({ name: 'profile', query: { tab } })
  activePanel.value = null
}

const signOut = async () => {
  await authStore.logout()
  activePanel.value = null
  isMenuOpen.value = false
  toastStore.push({
    type: 'info',
    title: 'Signed Out',
    message: 'Kamu berhasil keluar dari sesi.',
  })
  router.replace({ name: 'login' })
}

const onClickOutside = (event) => {
  if (!topnavRoot.value?.contains(event.target)) {
    activePanel.value = null
    isMenuOpen.value = false
  }
}

watch(
  () => route.path,
  () => {
    isMenuOpen.value = false
    activePanel.value = null
  },
)

onMounted(() => {
  profileStore.load()
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>
