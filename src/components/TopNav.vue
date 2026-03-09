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
          <span v-if="notificationStore.unreadCount" class="badge-dot">{{ notificationStore.unreadCount > 9 ? '9+' : notificationStore.unreadCount }}</span>
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
        <div class="panel-title-row">
          <p class="panel-title">Notifications</p>
          <div class="panel-title-actions">
            <span v-if="notificationStore.mentionUnreadCount" class="mention-counter">
              {{ notificationStore.mentionUnreadCount }} mention
            </span>
            <button type="button" class="ghost-btn panel-action-btn" @click="markAllRead">Mark all read</button>
          </div>
        </div>
        <p v-if="notificationStore.isLoading" class="muted">Memuat notifikasi...</p>
        <ul v-else-if="notificationStore.items.length" class="notif-list">
          <li v-for="item in notificationStore.items" :key="item.id">
            <RouterLink
              class="notif-item"
              :class="{ mention: item.isMention }"
              :to="{
                name: 'course-detail',
                params: { id: item.courseId },
                query: { lesson: item.lessonId, tab: 'discussion', focusDiscussion: item.id },
              }"
              @click="activePanel = null"
            >
              <strong>{{ item.authorName }} <span v-if="item.isMention" class="notif-mention-tag">@mention</span></strong>
              <span>{{ item.message }}</span>
              <small>{{ formatNotificationTime(item.createdAt) }}</small>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="muted">Belum ada notifikasi baru.</p>
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
import { useNotificationStore } from '../stores/notification'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const notificationStore = useNotificationStore()
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

const instructorNav = [{ label: 'Quiz Admin', to: '/quiz-admin' }]
const adminOnlyNav = [{ label: 'Users', to: '/users' }]

const iconMap = {
  aurora: ['◉', '◈', '◌', '◎', '◍'],
  sunrise: ['☀', '✦', '✎', '☺', '✿'],
}

const navItems = computed(() => {
  const icons = iconMap[currentTemplate.value] ?? iconMap.sunrise
  const role = profile.value?.accessRole
  const labels = [
    ...navLabels,
    ...(role === 'admin' || role === 'instructor' ? instructorNav : []),
    ...(role === 'admin' ? adminOnlyNav : []),
  ]
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
  if (activePanel.value === 'notif') {
    notificationStore.load()
  }
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
  notificationStore.clear()
  activePanel.value = null
  isMenuOpen.value = false
  toastStore.push({
    type: 'info',
    title: 'Signed Out',
    message: 'Kamu berhasil keluar dari sesi.',
  })
  router.replace({ name: 'login' })
}

const formatNotificationTime = (value) => {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

const markAllRead = () => {
  notificationStore.markAllRead()
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
  notificationStore.load()
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>
