const STORAGE_KEY = 'curiosity:lms:profile:v1'

const defaultProfileState = {
  profile: {
    name: 'Indra Permana',
    email: 'indra@curiosity.app',
    role: 'Product Designer',
    accessRole: 'admin',
    timezone: 'Asia/Jakarta',
    avatarDataUrl: '',
    bio: 'Belajar design systems dan frontend untuk membangun pengalaman belajar yang menarik.',
  },
  preferences: {
    deadlineNotif: true,
    discussionNotif: true,
    productUpdateNotif: false,
    language: 'id',
    themeId: 'aurora',
  },
  stats: {
    streakDays: 12,
    coursesCompleted: 7,
    learningHours: 146,
  },
  certificates: [
    { title: 'UI Design Fundamentals', issuedAt: '12 Feb 2026' },
    { title: 'UX Research Essentials', issuedAt: '18 Jan 2026' },
  ],
  badges: ['Streak 12 Days', 'Quiz Master', 'Mentor Choice'],
  progressMetrics: [
    { label: 'Design Track', value: 78 },
    { label: 'Frontend Track', value: 62 },
    { label: 'Product Track', value: 83 },
  ],
}

const cloneDefaultState = () => JSON.parse(JSON.stringify(defaultProfileState))

const readFromStorage = () => {
  if (typeof localStorage === 'undefined') return cloneDefaultState()

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return cloneDefaultState()

  try {
    const parsed = JSON.parse(raw)
    const defaults = cloneDefaultState()
    return {
      ...defaults,
      ...parsed,
      profile: {
        ...defaults.profile,
        ...(parsed.profile || {}),
      },
      preferences: {
        ...defaults.preferences,
        ...(parsed.preferences || {}),
      },
      stats: {
        ...defaults.stats,
        ...(parsed.stats || {}),
      },
      certificates: parsed.certificates || defaults.certificates,
      badges: parsed.badges || defaults.badges,
      progressMetrics: parsed.progressMetrics || defaults.progressMetrics,
    }
  } catch {
    return cloneDefaultState()
  }
}

const writeToStorage = (payload) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

const delay = (ms = 320) => new Promise((resolve) => setTimeout(resolve, ms))

export const profileService = {
  async loadProfile() {
    await delay(220)
    return readFromStorage()
  },

  async saveAccount(profile) {
    await delay(260)
    const current = readFromStorage()
    const next = { ...current, profile: { ...current.profile, ...profile } }
    writeToStorage(next)
    return next
  },

  async savePreferences(preferences) {
    await delay(260)
    const current = readFromStorage()
    const next = {
      ...current,
      preferences: { ...current.preferences, ...preferences },
    }
    writeToStorage(next)
    return next
  },

  async updatePassword() {
    await delay(320)
    return { ok: true }
  },

  async resetProfile() {
    await delay(260)
    const next = cloneDefaultState()
    writeToStorage(next)
    return next
  },

  async saveFullState(payload) {
    await delay(200)
    writeToStorage(payload)
    return payload
  },
}

export const getDefaultProfileState = () => cloneDefaultState()
