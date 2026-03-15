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
          v-for="item in primaryNavItems"
          :key="item.label"
          :to="item.to"
          class="menu-link"
          @mouseenter="prefetchNavTarget(item.to)"
          @focus="prefetchNavTarget(item.to)"
          @click="closeMenus"
        >
          <span class="menu-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>

        <div
          v-if="managementNavItems.length"
          class="menu-group"
          :class="{ open: isManagementMenuOpen }"
          @mouseenter="openManagementMenu"
          @mouseleave="closeManagementMenuDesktop"
        >
          <button
            type="button"
            class="menu-link menu-group-btn"
            :class="{ active: isManagementActive }"
            aria-haspopup="menu"
            :aria-expanded="String(isManagementMenuOpen)"
            @mouseenter="openManagementMenu"
            @click="toggleManagementMenu"
          >
            <span class="menu-icon">{{ managementIcon }}</span>
            <span>Management</span>
            <span class="menu-caret">▾</span>
          </button>
          <transition name="drop-fade">
            <div v-if="isManagementMenuOpen" class="menu-submenu" role="menu">
              <RouterLink
                v-for="item in managementNavItems"
                :key="item.label"
                :to="item.to"
                class="menu-submenu-link"
                role="menuitem"
                @mouseenter="prefetchNavTarget(item.to)"
                @focus="prefetchNavTarget(item.to)"
                @click="closeMenus"
              >
                <span class="menu-icon">{{ item.icon }}</span>
                <span>{{ item.label }}</span>
              </RouterLink>
            </div>
          </transition>
        </div>
      </nav>

      <div class="topnav-right">
        <div class="topnav-chip">
          <p class="topnav-chip-inline">Learning Streak · <strong>12 hari</strong></p>
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
              @mouseenter="
                prefetchNavTarget({
                  name: 'course-detail',
                  params: { id: item.courseId },
                  query: { lesson: item.lessonId, tab: 'discussion', focusDiscussion: item.id },
                })
              "
              @focus="
                prefetchNavTarget({
                  name: 'course-detail',
                  params: { id: item.courseId },
                  query: { lesson: item.lessonId, tab: 'discussion', focusDiscussion: item.id },
                })
              "
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
import { prefetchRouteComponents } from '../router'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'
import { coursePlayerService } from '../services/coursePlayerService'
import { useAuthStore } from '../stores/auth'
import { useNotificationStore } from '../stores/notification'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'
import { featureFlags } from '../config/runtimeFlags'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const notificationStore = useNotificationStore()
const toastStore = useToastStore()
const { profile } = storeToRefs(profileStore)
const { initialized: authInitialized } = storeToRefs(authStore)
const topnavRoot = ref(null)
const isMenuOpen = ref(false)
const activePanel = ref(null)

const { templateOptions, currentTemplate, setTemplate } = useTemplateSwitcher()

const getUserScopeId = () => authStore.user?.id || authStore.user?.email || 'guest'
const resolveQuizTarget = () => {
  try {
    const list = coursePlayerService.listCourses(getUserScopeId())
    const firstCourseId = list[0]?.id ? String(list[0].id) : ''
    return {
      quiz: firstCourseId ? { name: 'quiz', params: { id: firstCourseId } } : { name: 'dashboard' },
    }
  } catch {
    return {
      quiz: { name: 'dashboard' },
    }
  }
}

const primaryNavLabels = computed(() => {
  const targets = resolveQuizTarget()
  return [
    { label: 'Dashboard', to: { name: 'dashboard' } },
    { label: 'Course View', to: { name: 'courses' } },
    { label: 'Quiz View', to: targets.quiz },
  ]
})
const managementNavByRole = {
  instructor: [
    { label: 'Manage Quiz', to: '/management/quizzes', name: 'quiz-admin' },
    { label: 'Manage Course', to: '/management/courses', name: 'course-management' },
    ...(featureFlags.certificateManagement ? [{ label: 'Manage Certificate', to: '/management/certificates', name: 'certificate-management' }] : []),
  ],
  admin: [
    { label: 'Manage Quiz', to: '/management/quizzes', name: 'quiz-admin' },
    { label: 'Manage Course', to: '/management/courses', name: 'course-management' },
    ...(featureFlags.certificateManagement ? [{ label: 'Manage Certificate', to: '/management/certificates', name: 'certificate-management' }] : []),
    { label: 'User Management', to: '/management/users', name: 'users' },
  ],
}

const iconMap = {
  aurora: ['◉', '◈', '◌', '◎', '◍'],
  sunrise: ['☀', '✦', '✎', '☺', '✿'],
}

const primaryNavItems = computed(() => {
  const icons = iconMap[currentTemplate.value] ?? iconMap.sunrise
  return primaryNavLabels.value.map((item, index) => ({
    ...item,
    icon: icons[index] ?? '•',
  }))
})

const managementNavItems = computed(() => {
  if (!authInitialized.value) return []
  const role = authStore.role
  const items = managementNavByRole[role] || []
  const icons = iconMap[currentTemplate.value] ?? iconMap.sunrise
  return items.map((item, index) => ({
    ...item,
    icon: icons[index + primaryNavLabels.value.length] ?? '•',
  }))
})

const managementIcon = computed(() => {
  const icons = iconMap[currentTemplate.value] ?? iconMap.sunrise
  return icons[primaryNavLabels.value.length] ?? '•'
})

const isManagementMenuOpen = ref(false)
const managementCloseTimer = ref(null)

const isManagementActive = computed(() => {
  if (!managementNavItems.value.length) return false
  return managementNavItems.value.some((item) => route.name === item.name)
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
  isManagementMenuOpen.value = false
  if (activePanel.value === 'notif') {
    notificationStore.load()
  }
}

const selectTemplate = (id) => {
  setTemplate(id)
  activePanel.value = null
  isManagementMenuOpen.value = false
}

const goToProfileSection = (tab) => {
  router.push({ name: 'profile', query: { tab } })
  activePanel.value = null
  isManagementMenuOpen.value = false
}

const signOut = async () => {
  await authStore.logout()
  notificationStore.clear()
  activePanel.value = null
  isMenuOpen.value = false
  isManagementMenuOpen.value = false
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

const closeMenus = () => {
  isMenuOpen.value = false
  isManagementMenuOpen.value = false
  activePanel.value = null
  clearManagementCloseTimer()
}

const toggleManagementMenu = () => {
  clearManagementCloseTimer()
  isManagementMenuOpen.value = !isManagementMenuOpen.value
  activePanel.value = null
}

const openManagementMenu = () => {
  if (window.innerWidth <= 760) return
  clearManagementCloseTimer()
  isManagementMenuOpen.value = true
}

const closeManagementMenuDesktop = () => {
  if (window.innerWidth <= 760) return
  clearManagementCloseTimer()
  managementCloseTimer.value = window.setTimeout(() => {
    isManagementMenuOpen.value = false
    managementCloseTimer.value = null
  }, 140)
}

const clearManagementCloseTimer = () => {
  if (!managementCloseTimer.value) return
  window.clearTimeout(managementCloseTimer.value)
  managementCloseTimer.value = null
}

const prefetchNavTarget = (to) => {
  prefetchRouteComponents(to).catch(() => {})
}

const runIdlePrefetch = () => {
  const targets = resolveQuizTarget()
  const commonTargets = [
    { name: 'dashboard' },
    { name: 'courses' },
    targets.quiz,
    ...managementNavItems.value.map((item) => item.to),
  ]
  commonTargets.forEach((target) => {
    prefetchNavTarget(target)
  })
}

const onClickOutside = (event) => {
  if (!topnavRoot.value?.contains(event.target)) {
    activePanel.value = null
    isMenuOpen.value = false
    isManagementMenuOpen.value = false
    clearManagementCloseTimer()
  }
}

watch(
  () => route.path,
  () => {
    isMenuOpen.value = false
    activePanel.value = null
    isManagementMenuOpen.value = false
    clearManagementCloseTimer()
  },
)

onMounted(() => {
  profileStore.load()
  notificationStore.load()
  document.addEventListener('click', onClickOutside)
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      runIdlePrefetch()
    }, { timeout: 1500 })
  } else {
    window.setTimeout(() => {
      runIdlePrefetch()
    }, 700)
  }
})

onBeforeUnmount(() => {
  clearManagementCloseTimer()
  document.removeEventListener('click', onClickOutside)
})
</script>
