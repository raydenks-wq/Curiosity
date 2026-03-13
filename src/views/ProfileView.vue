<template>
  <section class="profile-layout">
    <article class="card profile-hero" :id="sectionIds.overview">
      <div class="profile-avatar" :class="{ 'has-image': Boolean(profileForm.avatarDataUrl) }">
        <img v-if="profileForm.avatarDataUrl" :src="profileForm.avatarDataUrl" alt="Profile avatar" />
        <span v-else>{{ initials }}</span>
      </div>
      <div>
        <p class="eyebrow">Student Profile</p>
        <h2>{{ profileForm.name }}</h2>
        <p class="muted">{{ profileForm.role }} · {{ accessRoleLabel }} · {{ profileForm.bio }}</p>
        <div class="form-actions">
          <label class="ghost-btn avatar-upload-btn">
            <input type="file" accept="image/*" @change="onAvatarFileChange" />
            Upload Photo
          </label>
          <button class="ghost-btn" type="button" :disabled="!profileForm.avatarDataUrl" @click="clearAvatar">
            Remove
          </button>
        </div>
      </div>
      <div class="profile-hero-stats">
        <div>
          <strong>{{ stats.streakDays }}</strong>
          <span>Streak</span>
        </div>
        <div>
          <strong>{{ stats.coursesCompleted }}</strong>
          <span>Course Completed</span>
        </div>
        <div>
          <strong>{{ stats.learningHours }}h</strong>
          <span>Learning Hours</span>
        </div>
      </div>
    </article>

    <article class="card profile-card" :id="sectionIds.account" :class="{ focused: activeTab === 'account' }">
      <div class="section-header">
        <h3>Account Settings</h3>
      </div>
      <form class="form-grid" @submit.prevent="saveAccount">
        <label>
          Full Name
          <input v-model="profileForm.name" type="text" required />
        </label>
        <label>
          Email
          <input v-model="profileForm.email" type="email" required />
        </label>
        <label>
          Role
          <input v-model="profileForm.role" type="text" />
        </label>
        <label>
          Access Level
          <select v-model="profileForm.accessRole">
            <option v-for="level in accessLevels" :key="level.id" :value="level.id">{{ level.label }}</option>
          </select>
        </label>
        <label>
          Timezone
          <select v-model="profileForm.timezone">
            <option value="Asia/Jakarta">Asia/Jakarta</option>
            <option value="UTC">UTC</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
          </select>
        </label>
        <label class="full">
          Bio
          <textarea v-model="profileForm.bio" rows="3"></textarea>
        </label>
        <div class="form-actions full">
          <button class="primary-btn" type="submit" :disabled="isSavingAccount">{{ isSavingAccount ? 'Saving...' : 'Save Account' }}</button>
          <button class="ghost-btn" type="button" :disabled="isResetting" @click="isResetConfirmOpen = true">
            {{ isResetting ? 'Resetting...' : 'Reset to Default' }}
          </button>
          <span class="save-badge" v-if="accountSaved">Saved</span>
        </div>
      </form>
    </article>

    <article class="card profile-card" :id="sectionIds.preferences" :class="{ focused: activeTab === 'preferences' }">
      <div class="section-header">
        <h3>Learning Preferences</h3>
      </div>
      <div class="toggle-list">
        <label class="toggle-row">
          <input v-model="preferencesForm.deadlineNotif" type="checkbox" />
          <span>Deadline Notifications</span>
        </label>
        <label class="toggle-row">
          <input v-model="preferencesForm.discussionNotif" type="checkbox" />
          <span>Discussion Replies</span>
        </label>
        <label class="toggle-row">
          <input v-model="preferencesForm.productUpdateNotif" type="checkbox" />
          <span>Product Updates</span>
        </label>
      </div>
      <div class="form-grid compact">
        <label>
          Preferred Language
          <select v-model="preferencesForm.language">
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          Theme Style
          <select v-model="preferencesForm.themeId">
            <option v-for="option in templateOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
        </label>
      </div>
      <div class="form-actions">
        <button class="primary-btn" type="button" :disabled="isSavingPreferences" @click="savePreferences">
          {{ isSavingPreferences ? 'Saving...' : 'Save Preferences' }}
        </button>
        <span class="save-badge" v-if="preferencesSaved">Saved</span>
      </div>
    </article>

    <article class="card profile-card" :id="sectionIds.security" :class="{ focused: activeTab === 'security' }">
      <div class="section-header">
        <h3>Security</h3>
      </div>
      <form class="form-grid compact" @submit.prevent="saveSecurity">
        <label>
          Current Password
          <input v-model="security.currentPassword" type="password" required />
        </label>
        <label>
          New Password
          <input v-model="security.newPassword" type="password" required minlength="8" />
        </label>
        <label>
          Confirm Password
          <input v-model="security.confirmPassword" type="password" required minlength="8" />
        </label>
        <div class="full form-actions">
          <button class="primary-btn" type="submit" :disabled="isUpdatingPassword">
            {{ isUpdatingPassword ? 'Updating...' : 'Update Password' }}
          </button>
          <span class="save-badge" v-if="securitySaved">Updated</span>
          <span class="error-badge" v-if="securityError">{{ securityError }}</span>
        </div>
      </form>
    </article>

    <article class="card profile-card" :id="sectionIds.certificates" :class="{ focused: activeTab === 'certificates' }">
      <div class="section-header">
        <h3>Certificates & Achievements</h3>
      </div>
      <div class="cert-grid">
        <article v-for="item in certificates" :key="item.certificateNo || `${item.title}-${item.issuedAt}`" class="cert-card">
          <h4>{{ item.title }}</h4>
          <p class="muted">Issued: {{ item.issuedAt }}</p>
          <p v-if="item.certificateNo" class="muted">No: {{ item.certificateNo }}</p>
          <p v-if="item.status" class="muted">Status: {{ item.status }}</p>
          <button v-if="item.verificationCode" class="ghost-btn" type="button" @click="openCertificateVerification(item.verificationCode)">
            Verify
          </button>
          <button v-else class="ghost-btn" type="button">Download</button>
        </article>
      </div>
      <div class="badge-row">
        <span v-for="badge in badges" :key="badge" class="pill">{{ badge }}</span>
      </div>
    </article>

    <article class="card profile-card profile-progress-card">
      <div class="section-header">
        <h3>Progress Snapshot</h3>
      </div>
      <div class="metric-row" v-for="item in progressMetrics" :key="item.label">
        <span>{{ item.label }}</span>
        <div class="mini-track"><div class="mini-fill" :style="{ width: `${item.value}%` }"></div></div>
        <strong>{{ item.value }}%</strong>
      </div>
    </article>

    <article v-if="isLoading" class="card full-width profile-loading-card">
      <p class="muted">Loading profile data...</p>
    </article>

    <Teleport to="body">
      <div v-if="isResetConfirmOpen" class="modal-overlay" @click.self="isResetConfirmOpen = false">
        <article class="modal-card">
          <h3>Reset Profile?</h3>
          <p class="muted">
            Semua perubahan profile dan preferences akan kembali ke default. Kamu masih bisa Undo dalam 5 detik.
          </p>
          <div class="reset-preview">
            <p class="reset-preview-title">Data Yang Akan Di-reset</p>
            <ul v-if="resetPreviewItems.length" class="reset-preview-list">
              <li v-for="item in resetPreviewItems" :key="item.label">
                <strong>{{ item.label }}</strong>
                <span>{{ item.current }} -> {{ item.defaultValue }}</span>
              </li>
            </ul>
            <p v-else class="muted">Tidak ada perubahan dari nilai default saat ini.</p>
          </div>
          <div class="form-actions">
            <button class="ghost-btn" type="button" @click="isResetConfirmOpen = false">Cancel</button>
            <button class="primary-btn" type="button" :disabled="isResetting" @click="confirmResetProfile">
              {{ isResetting ? 'Resetting...' : 'Yes, Reset' }}
            </button>
          </div>
        </article>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="isAvatarModalOpen" class="modal-overlay" @click.self="cancelAvatarCrop">
        <article class="modal-card">
          <h3>Crop Profile Photo</h3>
          <div
            class="avatar-crop-preview"
            :class="{ dragging: isDraggingCrop }"
            @pointerdown="onCropPointerDown"
            @dblclick="resetCropPosition"
          >
            <img v-if="cropPreviewDataUrl" :src="cropPreviewDataUrl" alt="Avatar crop preview" />
          </div>
          <p class="muted">Drag foto untuk menggeser posisi.</p>
          <div class="form-grid">
            <label>
              Zoom
              <input v-model.number="cropState.zoom" type="range" min="1" max="3" step="0.05" />
            </label>
          </div>
          <div class="form-actions">
            <button class="ghost-btn" type="button" @click="cancelAvatarCrop">Cancel</button>
            <button class="primary-btn" type="button" @click="applyAvatarCrop">Use Photo</button>
          </div>
        </article>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'
import { apiClient } from '../services/api/client'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const router = useRouter()
const { templateOptions, currentTemplate, setTemplate } = useTemplateSwitcher()

const profileStore = useProfileStore()
const toastStore = useToastStore()
const {
  profile,
  preferences,
  stats,
  certificates,
  badges,
  progressMetrics,
  isLoading,
  isSavingAccount,
  isSavingPreferences,
  isUpdatingPassword,
  isResetting,
} = storeToRefs(profileStore)

const sectionIds = {
  overview: 'profile-overview',
  account: 'profile-account',
  preferences: 'profile-preferences',
  security: 'profile-security',
  certificates: 'profile-certificates',
}

const activeTab = computed(() => String(route.query.tab || 'overview'))

const profileForm = reactive({
  name: '',
  email: '',
  role: '',
  accessRole: 'student',
  timezone: 'Asia/Jakarta',
  avatarDataUrl: '',
  bio: '',
})

const preferencesForm = reactive({
  deadlineNotif: true,
  discussionNotif: true,
  productUpdateNotif: false,
  language: 'id',
  themeId: currentTemplate.value,
})

const security = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const accountSaved = ref(false)
const preferencesSaved = ref(false)
const securitySaved = ref(false)
const securityError = ref('')
const isResetConfirmOpen = ref(false)
const lastSnapshot = ref(null)
const defaultState = apiClient.profile.getDefaultState()
const accessLevels = apiClient.meta.accessLevels
const isAvatarModalOpen = ref(false)
const avatarSourceDataUrl = ref('')
const cropPreviewDataUrl = ref('')
const avatarImage = ref(null)
const isDraggingCrop = ref(false)
const dragState = reactive({
  startX: 0,
  startY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
})
const cropState = reactive({
  zoom: 1.25,
  offsetX: 0,
  offsetY: 0,
})

const initials = computed(() => {
  const words = profileForm.name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'IP'
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('')
})

const accessRoleLabel = computed(
  () => accessLevels.find((level) => level.id === profileForm.accessRole)?.label || profileForm.accessRole,
)

const resetPreviewItems = computed(() => {
  const rows = [
    {
      label: 'Full Name',
      current: profileForm.name,
      defaultValue: defaultState.profile.name,
    },
    {
      label: 'Email',
      current: profileForm.email,
      defaultValue: defaultState.profile.email,
    },
    {
      label: 'Role',
      current: profileForm.role,
      defaultValue: defaultState.profile.role,
    },
    {
      label: 'Timezone',
      current: profileForm.timezone,
      defaultValue: defaultState.profile.timezone,
    },
    {
      label: 'Access Level',
      current: accessRoleLabel.value,
      defaultValue:
        accessLevels.find((level) => level.id === defaultState.profile.accessRole)?.label ||
        defaultState.profile.accessRole,
    },
    {
      label: 'Language',
      current: preferencesForm.language,
      defaultValue: defaultState.preferences.language,
    },
    {
      label: 'Theme Style',
      current: preferencesForm.themeId,
      defaultValue: defaultState.preferences.themeId,
    },
    {
      label: 'Deadline Notification',
      current: preferencesForm.deadlineNotif ? 'On' : 'Off',
      defaultValue: defaultState.preferences.deadlineNotif ? 'On' : 'Off',
    },
    {
      label: 'Discussion Notification',
      current: preferencesForm.discussionNotif ? 'On' : 'Off',
      defaultValue: defaultState.preferences.discussionNotif ? 'On' : 'Off',
    },
    {
      label: 'Product Updates',
      current: preferencesForm.productUpdateNotif ? 'On' : 'Off',
      defaultValue: defaultState.preferences.productUpdateNotif ? 'On' : 'Off',
    },
  ]

  return rows.filter((item) => item.current !== item.defaultValue)
})

const renderCroppedAvatar = (size, circular = false) => {
  const image = avatarImage.value
  if (!image) return ''

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const baseScale = Math.max(size / image.width, size / image.height)
  const scale = baseScale * cropState.zoom
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale

  const maxOffsetX = Math.max(0, (drawWidth - size) / 2)
  const maxOffsetY = Math.max(0, (drawHeight - size) / 2)
  const offsetPxX = (cropState.offsetX / 100) * maxOffsetX
  const offsetPxY = (cropState.offsetY / 100) * maxOffsetY

  const x = (size - drawWidth) / 2 + offsetPxX
  const y = (size - drawHeight) / 2 + offsetPxY

  ctx.clearRect(0, 0, size, size)

  if (circular) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
  }

  ctx.drawImage(image, x, y, drawWidth, drawHeight)

  if (circular) {
    ctx.restore()
  }

  return circular ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92)
}

const getCropBounds = (size) => {
  const image = avatarImage.value
  if (!image) return { maxOffsetX: 0, maxOffsetY: 0 }

  const baseScale = Math.max(size / image.width, size / image.height)
  const scale = baseScale * cropState.zoom
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale

  return {
    maxOffsetX: Math.max(0, (drawWidth - size) / 2),
    maxOffsetY: Math.max(0, (drawHeight - size) / 2),
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const updateCropPreview = () => {
  cropPreviewDataUrl.value = renderCroppedAvatar(320, true)
}

const triggerSaved = (target) => {
  target.value = true
  setTimeout(() => {
    target.value = false
  }, 1400)
}

const hydrateForms = () => {
  Object.assign(profileForm, profile.value)
  Object.assign(preferencesForm, preferences.value)
}

const saveAccount = async () => {
  await profileStore.saveAccount({ ...profileForm })
  triggerSaved(accountSaved)
  toastStore.push({
    type: 'success',
    title: 'Account Saved',
    message: 'Perubahan profil berhasil disimpan.',
  })
}

const savePreferences = async () => {
  await profileStore.savePreferences({ ...preferencesForm })
  setTemplate(preferencesForm.themeId)
  triggerSaved(preferencesSaved)
  toastStore.push({
    type: 'success',
    title: 'Preferences Updated',
    message: 'Preferensi belajar dan tema berhasil diperbarui.',
  })
}

const saveSecurity = async () => {
  securityError.value = ''

  if (security.newPassword !== security.confirmPassword) {
    securityError.value = 'Password confirmation tidak cocok.'
    toastStore.push({
      type: 'error',
      title: 'Update Password Failed',
      message: 'Konfirmasi password tidak sama.',
    })
    return
  }

  await profileStore.updatePassword({
    currentPassword: security.currentPassword,
    newPassword: security.newPassword,
  })
  triggerSaved(securitySaved)
  security.currentPassword = ''
  security.newPassword = ''
  security.confirmPassword = ''
  toastStore.push({
    type: 'success',
    title: 'Password Updated',
    message: 'Password akun berhasil diperbarui.',
  })
}

const confirmResetProfile = async () => {
  lastSnapshot.value = profileStore.getSnapshot()
  await profileStore.resetToDefault()
  hydrateForms()
  setTemplate(preferences.value.themeId)
  isResetConfirmOpen.value = false
  toastStore.push({
    type: 'info',
    title: 'Profile Reset',
    message: 'Data profile kembali ke pengaturan default.',
    timeout: 5000,
    actionLabel: 'Undo',
    onAction: async () => {
      if (!lastSnapshot.value) return
      await profileStore.restoreSnapshot(lastSnapshot.value)
      hydrateForms()
      setTemplate(preferences.value.themeId)
      toastStore.push({
        type: 'success',
        title: 'Reset Undone',
        message: 'Data profile berhasil dikembalikan.',
      })
      lastSnapshot.value = null
    },
  })
}

const onAvatarFileChange = (event) => {
  const [file] = event.target.files || []
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    avatarSourceDataUrl.value = String(reader.result || '')
    const image = new Image()
    image.onload = () => {
      avatarImage.value = image
      cropState.zoom = 1.25
      cropState.offsetX = 0
      cropState.offsetY = 0
      updateCropPreview()
      isAvatarModalOpen.value = true
    }
    image.src = avatarSourceDataUrl.value
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

const cancelAvatarCrop = () => {
  isDraggingCrop.value = false
  window.removeEventListener('pointermove', onCropPointerMove)
  window.removeEventListener('pointerup', onCropPointerUp)
  isAvatarModalOpen.value = false
  avatarSourceDataUrl.value = ''
  cropPreviewDataUrl.value = ''
  avatarImage.value = null
}

const applyAvatarCrop = () => {
  if (!avatarImage.value) return
  profileForm.avatarDataUrl = renderCroppedAvatar(256, true)
  isAvatarModalOpen.value = false
  avatarSourceDataUrl.value = ''
  cropPreviewDataUrl.value = ''
  avatarImage.value = null

  toastStore.push({
    type: 'success',
    title: 'Avatar Updated',
    message: 'Foto profile siap disimpan. Klik Save Account.',
  })
}

const clearAvatar = () => {
  profileForm.avatarDataUrl = ''
  toastStore.push({
    type: 'info',
    title: 'Avatar Removed',
    message: 'Foto profile dihapus. Klik Save Account untuk menyimpan perubahan.',
  })
}

const onCropPointerMove = (event) => {
  if (!isDraggingCrop.value) return

  const deltaX = event.clientX - dragState.startX
  const deltaY = event.clientY - dragState.startY
  const bounds = getCropBounds(320)

  const nextOffsetX = bounds.maxOffsetX
    ? dragState.startOffsetX + (deltaX / bounds.maxOffsetX) * 100
    : 0
  const nextOffsetY = bounds.maxOffsetY
    ? dragState.startOffsetY + (deltaY / bounds.maxOffsetY) * 100
    : 0

  cropState.offsetX = clamp(nextOffsetX, -100, 100)
  cropState.offsetY = clamp(nextOffsetY, -100, 100)
}

const onCropPointerUp = () => {
  isDraggingCrop.value = false
  window.removeEventListener('pointermove', onCropPointerMove)
  window.removeEventListener('pointerup', onCropPointerUp)
}

const onCropPointerDown = (event) => {
  if (!avatarImage.value) return
  event.preventDefault()
  isDraggingCrop.value = true
  dragState.startX = event.clientX
  dragState.startY = event.clientY
  dragState.startOffsetX = cropState.offsetX
  dragState.startOffsetY = cropState.offsetY
  window.addEventListener('pointermove', onCropPointerMove)
  window.addEventListener('pointerup', onCropPointerUp)
}

const resetCropPosition = () => {
  cropState.zoom = 1.25
  cropState.offsetX = 0
  cropState.offsetY = 0
}

const openCertificateVerification = (verificationCode) => {
  const code = String(verificationCode || '').trim()
  if (!code) return
  const target = router.resolve({ name: 'certificate-verify', params: { code } })
  if (typeof window !== 'undefined') {
    window.open(target.href, '_blank', 'noopener')
  }
}

watch(
  activeTab,
  (tab) => {
    const map = {
      overview: sectionIds.overview,
      account: sectionIds.account,
      preferences: sectionIds.preferences,
      security: sectionIds.security,
      certificates: sectionIds.certificates,
    }

    const id = map[tab]
    if (!id) return

    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  },
  { immediate: true },
)

watch(
  () => currentTemplate.value,
  (value) => {
    preferencesForm.themeId = value
  },
)

watch(
  () => profile.value,
  () => {
    hydrateForms()
  },
  { deep: true },
)

watch(
  () => preferences.value,
  () => {
    Object.assign(preferencesForm, preferences.value)
  },
  { deep: true },
)

watch(
  () => [cropState.zoom, cropState.offsetX, cropState.offsetY, isAvatarModalOpen.value],
  () => {
    if (!isAvatarModalOpen.value || !avatarImage.value) return
    updateCropPreview()
  },
)

onMounted(async () => {
  await profileStore.load()
  hydrateForms()
  setTemplate(preferences.value.themeId)
})

onBeforeUnmount(() => {
  onCropPointerUp()
})
</script>
