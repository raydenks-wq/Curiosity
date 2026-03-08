const USER_STORAGE_KEY = 'curiosity:lms:user-management:v2'
const PERMISSION_STORAGE_KEY = 'curiosity:lms:permission-matrix:v1'

const defaultUsers = [
  {
    id: 'u-001',
    name: 'Indra Permana',
    email: 'indra@curiosity.app',
    role: 'admin',
    status: 'active',
    lastLogin: '2026-03-09 08:20',
  },
  {
    id: 'u-002',
    name: 'Ayu Pratama',
    email: 'ayu@curiosity.app',
    role: 'instructor',
    status: 'active',
    lastLogin: '2026-03-08 21:17',
  },
  {
    id: 'u-003',
    name: 'Raka Wijaya',
    email: 'raka@curiosity.app',
    role: 'student',
    status: 'active',
    lastLogin: '2026-03-08 19:44',
  },
  {
    id: 'u-004',
    name: 'Nadia Putri',
    email: 'nadia@curiosity.app',
    role: 'student',
    status: 'suspended',
    lastLogin: '2026-03-03 11:08',
  },
]

export const accessLevels = [
  {
    id: 'admin',
    label: 'Admin',
    description: 'Akses penuh termasuk manajemen user, role, dan konfigurasi platform.',
  },
  {
    id: 'instructor',
    label: 'Instructor',
    description: 'Kelola course, quiz, materi, dan melihat progres kelas yang diajar.',
  },
  {
    id: 'student',
    label: 'Student',
    description: 'Akses belajar, submit quiz/tugas, dan melihat progres pribadi.',
  },
]

export const permissionLabels = {
  viewDashboard: 'View Dashboard',
  manageCourse: 'Manage Courses',
  manageQuiz: 'Manage Quizzes',
  manageUsers: 'Manage Users',
}

const defaultPermissionMatrix = {
  admin: {
    viewDashboard: true,
    manageCourse: true,
    manageQuiz: true,
    manageUsers: true,
  },
  instructor: {
    viewDashboard: true,
    manageCourse: true,
    manageQuiz: true,
    manageUsers: false,
  },
  student: {
    viewDashboard: true,
    manageCourse: false,
    manageQuiz: false,
    manageUsers: false,
  },
}

const clone = (obj) => JSON.parse(JSON.stringify(obj))

const readJson = (key, fallback) => {
  if (typeof localStorage === 'undefined') return clone(fallback)
  const raw = localStorage.getItem(key)
  if (!raw) return clone(fallback)

  try {
    return JSON.parse(raw)
  } catch {
    return clone(fallback)
  }
}

const writeJson = (key, value) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

const readUsers = () => readJson(USER_STORAGE_KEY, defaultUsers)
const writeUsers = (users) => writeJson(USER_STORAGE_KEY, users)

const readPermissionMatrix = () => {
  const current = readJson(PERMISSION_STORAGE_KEY, defaultPermissionMatrix)
  return {
    ...clone(defaultPermissionMatrix),
    ...current,
    admin: {
      ...clone(defaultPermissionMatrix).admin,
      ...(current.admin || {}),
    },
    instructor: {
      ...clone(defaultPermissionMatrix).instructor,
      ...(current.instructor || {}),
    },
    student: {
      ...clone(defaultPermissionMatrix).student,
      ...(current.student || {}),
    },
  }
}

const writePermissionMatrix = (matrix) => writeJson(PERMISSION_STORAGE_KEY, matrix)

const delay = (ms = 240) => new Promise((resolve) => setTimeout(resolve, ms))

const nowStamp = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export const userAccountService = {
  async loadUsers() {
    await delay(170)
    return readUsers()
  },

  async loadPermissionMatrix() {
    await delay(100)
    return readPermissionMatrix()
  },

  async savePermissionMatrix(matrix) {
    await delay(170)
    writePermissionMatrix(matrix)
    return matrix
  },

  async saveUser(payload) {
    await delay(220)
    const users = readUsers()

    if (payload.id) {
      const next = users.map((user) => (user.id === payload.id ? { ...user, ...payload } : user))
      writeUsers(next)
      return next
    }

    const created = {
      ...payload,
      id: `u-${Math.random().toString(36).slice(2, 8)}`,
      lastLogin: payload.status === 'pending' ? '-' : '-',
    }

    const next = [created, ...users]
    writeUsers(next)
    return next
  },

  async inviteUser(payload) {
    await delay(220)
    const users = readUsers()
    const created = {
      id: `u-${Math.random().toString(36).slice(2, 8)}`,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      status: 'pending',
      lastLogin: '-',
    }

    const next = [created, ...users]
    writeUsers(next)
    return next
  },

  async deleteUser(id) {
    await delay(170)
    const next = readUsers().filter((user) => user.id !== id)
    writeUsers(next)
    return next
  },

  async deleteUsers(ids) {
    await delay(190)
    const idSet = new Set(ids)
    const next = readUsers().filter((user) => !idSet.has(user.id))
    writeUsers(next)
    return next
  },

  async bulkUpdateStatus(ids, status) {
    await delay(180)
    const idSet = new Set(ids)
    const next = readUsers().map((user) =>
      idSet.has(user.id)
        ? {
            ...user,
            status,
          }
        : user,
    )
    writeUsers(next)
    return next
  },

  async toggleStatus(id) {
    await delay(180)
    const next = readUsers().map((user) => {
      if (user.id !== id) return user
      const nextStatus = user.status === 'active' ? 'suspended' : 'active'
      return {
        ...user,
        status: nextStatus,
      }
    })
    writeUsers(next)
    return next
  },

  async resetPassword(id) {
    await delay(210)
    const next = readUsers().map((user) => {
      if (user.id !== id) return user
      return {
        ...user,
        lastLogin: nowStamp(),
      }
    })
    writeUsers(next)
    return next
  },
}
